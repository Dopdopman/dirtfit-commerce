import { AppError, ERROR_CODES, OAUTH_PROVIDERS, USER_ROLES } from '@dirtfit/shared';
import { recordAuditLog } from '../../audit/audit.service.js';
import { hashPassword } from '../auth.crypto.js';
import {
  findOAuthAccount,
  findUserByEmail,
  findUserByIdWithAuth,
  linkOAuthAccountAndVerifyUser,
  touchOAuthAccountLastUsed,
  touchUserLastLogin,
  upsertOAuthUser,
} from '../auth.repository.js';
import { issueSessionTokens, sanitizeUser } from '../auth.service.js';
import { resolveGoogleOAuthAdapter } from './oauth.adapter.js';
import {
  constantTimeEqual,
  decryptOAuthTxPayload,
  encryptOAuthTxPayload,
  generateOAuthNonce,
  generateOAuthState,
  generateOneTimeTicket,
  generatePkcePair,
  hashOneTimeTicket,
  resolveOAuthStateSecret,
  sanitizeReturnTo,
} from './oauth.crypto.js';

export const OAUTH_TX_COOKIE_NAME = 'df_oauth_tx';
export const OAUTH_TX_TTL_SECONDS = 300;
export const OAUTH_TICKET_TTL_SECONDS = 60;
const OAUTH_TICKET_KEY_PREFIX = 'df:oauth:ticket:';

/**
 * Step 1 of Google OAuth 2.0 flow: create PKCE + state + nonce, encrypt in df_oauth_tx cookie,
 * and build provider authorization URL without touching Redis.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} query
 * @returns {{ authorizationUrl: string, encryptedTxCookie: string, returnTo: string }}
 */
export function startGoogleOAuth(app, query = {}) {
  const adapter = resolveGoogleOAuthAdapter(app.env);
  const returnTo = sanitizeReturnTo(query.next ?? query.returnTo, '/account');
  const state = generateOAuthState();
  const nonce = generateOAuthNonce();
  const pkce = generatePkcePair();

  const txSecret = resolveOAuthStateSecret(app.env);
  const encryptedTxCookie = encryptOAuthTxPayload(
    {
      state,
      nonce,
      codeVerifier: pkce.codeVerifier,
      returnTo,
    },
    txSecret
  );

  const authorizationUrl = adapter.buildAuthorizationUrl({
    state,
    nonce,
    codeChallenge: pkce.codeChallenge,
    persona: query.persona,
    email: query.email,
    name: query.name,
    sub: query.sub,
  });

  return {
    authorizationUrl,
    encryptedTxCookie,
    returnTo,
  };
}

/**
 * Step 2 of Google OAuth 2.0 flow: validate cookie tx state, verify OIDC ID token,
 * execute Account Linking (Cases A–F), record AuditLog, and issue a 60s One-Time Ticket.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} query
 * @param {string|undefined} encryptedTxCookie
 * @param {object} context
 * @returns {Promise<{ ticket: string, returnTo: string, userId: string }>}
 */
export async function handleGoogleOAuthCallback(app, query, encryptedTxCookie, context) {
  const adapter = resolveGoogleOAuthAdapter(app.env);

  if (query?.error) {
    throw new AppError({
      code: ERROR_CODES.OAUTH_ACCESS_DENIED,
      status: 400,
      title: 'Google sign-in cancelled',
      detail: 'Google sign-in permission was declined or cancelled.',
    });
  }

  const txSecret = resolveOAuthStateSecret(app.env);
  const tx = decryptOAuthTxPayload(encryptedTxCookie, txSecret);
  if (!tx) {
    throw new AppError({
      code: ERROR_CODES.OAUTH_STATE_INVALID,
      status: 400,
      title: 'Invalid or expired OAuth state',
      detail: 'OAuth transaction cookie is missing, invalid, or expired. Please try again.',
    });
  }

  if (!constantTimeEqual(query?.state, tx.state)) {
    throw new AppError({
      code: ERROR_CODES.OAUTH_STATE_INVALID,
      status: 400,
      title: 'OAuth state mismatch',
      detail: 'OAuth CSRF state parameter mismatch.',
    });
  }

  if (typeof query?.code !== 'string' || query.code.trim().length === 0) {
    throw new AppError({
      code: ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
      status: 400,
      title: 'Missing authorization code',
      detail: 'Google callback did not contain an authorization code.',
    });
  }

  const profile = await adapter.exchangeCodeAndVerify({
    code: query.code,
    codeVerifier: tx.codeVerifier,
    expectedNonce: tx.nonce,
  });

  if (!profile.emailVerified) {
    throw new AppError({
      code: ERROR_CODES.OAUTH_EMAIL_UNVERIFIED,
      status: 403,
      title: 'Google email not verified',
      detail: 'Your Google account email must be verified before signing in.',
    });
  }

  const linkedUser = await app.prisma.$transaction(async (txPrisma) => {
    const existingOAuth = await findOAuthAccount(
      txPrisma,
      OAUTH_PROVIDERS.GOOGLE,
      profile.providerAccountId
    );

    if (existingOAuth) {
      if (!existingOAuth.user || existingOAuth.user.deletedAt || !existingOAuth.user.isActive) {
        throw new AppError({
          code: ERROR_CODES.ACCOUNT_DISABLED,
          status: 403,
          title: 'Account disabled',
          detail: 'This account is inactive or unavailable.',
        });
      }

      await touchOAuthAccountLastUsed(txPrisma, existingOAuth.id, {
        providerEmail: profile.email,
        avatarUrl: profile.avatarUrl,
      });

      await recordAuditLog(txPrisma, {
        actorId: existingOAuth.user.id,
        actorRole: existingOAuth.user.role,
        action: 'AUTH_OAUTH_LOGIN',
        entityType: 'OAuthAccount',
        entityId: existingOAuth.id,
        afterState: { provider: OAUTH_PROVIDERS.GOOGLE, providerEmail: profile.email },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      });

      return existingOAuth.user;
    }

    // Fallback match by verified email (Case B: safe Account Linking preserving existing role)
    const existingUser = await findUserByEmail(txPrisma, profile.email, { includeDeleted: true });
    if (existingUser) {
      if (existingUser.deletedAt || !existingUser.isActive) {
        throw new AppError({
          code: ERROR_CODES.ACCOUNT_DISABLED,
          status: 403,
          title: 'Account disabled',
          detail: 'This account is inactive or unavailable.',
        });
      }

      const { user, oauthAccount } = await linkOAuthAccountAndVerifyUser(txPrisma, {
        userId: existingUser.id,
        provider: OAUTH_PROVIDERS.GOOGLE,
        providerAccountId: profile.providerAccountId,
        providerEmail: profile.email,
        avatarUrl: existingUser.avatarUrl ?? profile.avatarUrl,
      });

      await recordAuditLog(txPrisma, {
        actorId: user.id,
        actorRole: user.role,
        action: 'AUTH_OAUTH_LINKED',
        entityType: 'OAuthAccount',
        entityId: oauthAccount.id,
        beforeState: { isEmailVerified: existingUser.isEmailVerified, linkedGoogle: false },
        afterState: {
          isEmailVerified: true,
          linkedGoogle: true,
          preservedRole: user.role,
          providerEmail: profile.email,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      });

      return user;
    }

    // Case A: brand-new customer via Google OAuth
    const { user, oauthAccount } = await upsertOAuthUser(txPrisma, {
      email: profile.email,
      fullName: profile.fullName,
      avatarUrl: profile.avatarUrl,
      role: USER_ROLES.CUSTOMER,
      provider: OAUTH_PROVIDERS.GOOGLE,
      providerAccountId: profile.providerAccountId,
      providerEmail: profile.email,
    });

    await recordAuditLog(txPrisma, {
      actorId: user.id,
      actorRole: user.role,
      action: 'AUTH_OAUTH_REGISTERED',
      entityType: 'User',
      entityId: user.id,
      afterState: {
        provider: OAUTH_PROVIDERS.GOOGLE,
        oauthAccountId: oauthAccount.id,
        role: user.role,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });

    return user;
  });

  const rawTicket = generateOneTimeTicket();
  const ticketHash = hashOneTimeTicket(rawTicket, app.env.REFRESH_TOKEN_PEPPER);
  const ticketPayload = JSON.stringify({
    userId: linkedUser.id,
    returnTo: sanitizeReturnTo(tx.returnTo, '/account'),
  });

  await app.redis.set(
    `${OAUTH_TICKET_KEY_PREFIX}${ticketHash}`,
    ticketPayload,
    'EX',
    OAUTH_TICKET_TTL_SECONDS
  );

  return {
    ticket: rawTicket,
    returnTo: sanitizeReturnTo(tx.returnTo, '/account'),
    userId: linkedUser.id,
  };
}

/**
 * Step 3 of Google OAuth 2.0 flow: atomically consume the 60s One-Time Ticket (GETDEL),
 * verify user active status, and mint standard JWT Access Token + Refresh Token Rotation cookie.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} rawTicket
 * @param {object} context
 * @returns {Promise<{ user: object, accessToken: string, rawRefreshToken: string, returnTo: string }>}
 */
export async function exchangeOAuthTicket(app, rawTicket, context) {
  const ticketHash = hashOneTimeTicket(rawTicket, app.env.REFRESH_TOKEN_PEPPER);
  const redisKey = `${OAUTH_TICKET_KEY_PREFIX}${ticketHash}`;

  const rawPayload = await app.redis.getdel(redisKey);
  if (!rawPayload) {
    throw new AppError({
      code: ERROR_CODES.OAUTH_TICKET_INVALID,
      status: 401,
      title: 'Invalid or expired OAuth ticket',
      detail: 'Authorization ticket is invalid, expired, or has already been consumed.',
    });
  }

  let parsedTicket;
  try {
    parsedTicket = JSON.parse(rawPayload);
  } catch {
    throw new AppError({
      code: ERROR_CODES.OAUTH_TICKET_INVALID,
      status: 401,
      title: 'Invalid OAuth ticket payload',
      detail: 'Authorization ticket payload could not be parsed.',
    });
  }

  const user = await findUserByIdWithAuth(app.prisma, parsedTicket.userId);
  if (!user || user.deletedAt || !user.isActive) {
    throw new AppError({
      code: ERROR_CODES.ACCOUNT_DISABLED,
      status: 403,
      title: 'Account unavailable',
      detail: 'User account is disabled or unavailable.',
    });
  }

  const updatedUser = await touchUserLastLogin(app.prisma, user.id);
  const hydratedUser = {
    ...updatedUser,
    bodyProfiles: user.bodyProfiles,
    oauthAccounts: user.oauthAccounts,
  };
  const session = await issueSessionTokens(app, hydratedUser, context);

  return {
    user: sanitizeUser(hydratedUser),
    accessToken: session.accessToken,
    rawRefreshToken: session.rawRefreshToken,
    returnTo: sanitizeReturnTo(parsedTicket.returnTo, '/account'),
  };
}

/**
 * Allow a passwordless OAuth user (Case D) to configure a local Argon2id password.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} userId
 * @param {string} newPassword
 * @param {object} context
 * @returns {Promise<object>}
 */
export async function setLocalPassword(app, userId, newPassword, context) {
  const user = await findUserByIdWithAuth(app.prisma, userId);
  if (!user || !user.isActive || user.deletedAt) {
    throw new AppError({
      code: ERROR_CODES.UNAUTHORIZED,
      status: 401,
      title: 'Account unavailable',
      detail: 'Authenticated user does not exist or is inactive.',
    });
  }

  if (user.passwordHash) {
    throw new AppError({
      code: ERROR_CODES.PASSWORD_ALREADY_SET,
      status: 409,
      title: 'Password already configured',
      detail: 'This account already has a local password configured.',
    });
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await app.prisma.$transaction(async (tx) => {
    const saved = await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
      include: {
        bodyProfiles: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
        oauthAccounts: {
          orderBy: { linkedAt: 'asc' },
        },
      },
    });

    await recordAuditLog(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: 'AUTH_LOCAL_PASSWORD_SET',
      entityType: 'User',
      entityId: user.id,
      beforeState: { hasPassword: false },
      afterState: { hasPassword: true },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });

    return saved;
  });

  return sanitizeUser(updated);
}
