import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ENV_PATH = path.resolve(__dirname, '../../.env');

const BooleanStringSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((val) => val === true || val === 'true' || val === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    HOST: z.string().min(1).default('0.0.0.0'),
    APP_URL: z.string().url().default('http://localhost:3000'),
    API_URL: z.string().url().default('http://localhost:4000'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SWAGGER_ENABLED: BooleanStringSchema.default(true),

    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1).optional(),
    REDIS_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().min(2).default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    REFRESH_TOKEN_PEPPER: z.string().min(32),
    COOKIE_SECRET: z.string().min(32),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_SECURE: BooleanStringSchema.default(false),
    CORS_ALLOWED_ORIGINS: z
      .string()
      .min(1)
      .transform((str) =>
        str
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      ),
    CRON_HMAC_SECRET: z.string().min(32).optional(),
    RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().min(1).default(120),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(10),

    PAYMENT_DEFAULT_PROVIDER: z.enum(['MOCK', 'PAYOS', 'VNPAY', 'STRIPE', 'COD']).default('MOCK'),
    ENABLE_MOCK_PAYMENT: BooleanStringSchema.default(true),

    STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().min(1).default('dirtfit-media'),
    R2_PUBLIC_BASE_URL: z.string().url().default('https://cdn.dirtfit.vn'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.ENABLE_MOCK_PAYMENT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ENABLE_MOCK_PAYMENT'],
        message: 'ENABLE_MOCK_PAYMENT must be false in production',
      });
    }
    if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER === 'local') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STORAGE_DRIVER'],
        message: 'STORAGE_DRIVER must be r2 in production',
      });
    }
    if (env.STORAGE_DRIVER === 'r2') {
      const requiredR2Fields = [
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET_NAME',
      ];
      for (const field of requiredR2Fields) {
        if (!env[field] || String(env[field]).trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required when STORAGE_DRIVER is r2`,
          });
        }
      }
    }
    if (env.COOKIE_SAME_SITE === 'none' && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true when COOKIE_SAME_SITE is none',
      });
    }
    if (env.CORS_ALLOWED_ORIGINS.includes('*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ALLOWED_ORIGINS'],
        message: 'Wildcard (*) is forbidden in CORS_ALLOWED_ORIGINS when credentials are enabled',
      });
    }
  });

/**
 * Load and validate runtime environment configuration using Zod (fail-fast).
 * @param {object} [overrides]
 * @returns {object}
 */
export function loadEnv(overrides = {}) {
  if (!process.env.DATABASE_URL && fs.existsSync(DEFAULT_ENV_PATH)) {
    process.loadEnvFile(DEFAULT_ENV_PATH);
  }

  const rawSource = { ...process.env, ...overrides };
  const candidate = {
    NODE_ENV: rawSource.NODE_ENV,
    PORT: rawSource.PORT,
    HOST: rawSource.HOST,
    APP_URL: rawSource.APP_URL,
    API_URL: rawSource.API_URL,
    LOG_LEVEL: rawSource.LOG_LEVEL,
    SWAGGER_ENABLED: rawSource.SWAGGER_ENABLED,
    DATABASE_URL: rawSource.DATABASE_URL,
    DIRECT_URL: rawSource.DIRECT_URL,
    REDIS_URL: rawSource.REDIS_URL,
    JWT_ACCESS_SECRET: rawSource.JWT_ACCESS_SECRET,
    JWT_ACCESS_TTL: rawSource.JWT_ACCESS_TTL,
    REFRESH_TOKEN_TTL_DAYS: rawSource.REFRESH_TOKEN_TTL_DAYS,
    REFRESH_TOKEN_PEPPER: rawSource.REFRESH_TOKEN_PEPPER,
    COOKIE_SECRET: rawSource.COOKIE_SECRET,
    COOKIE_SAME_SITE: rawSource.COOKIE_SAME_SITE,
    COOKIE_SECURE: rawSource.COOKIE_SECURE,
    CORS_ALLOWED_ORIGINS: rawSource.CORS_ALLOWED_ORIGINS,
    CRON_HMAC_SECRET: rawSource.CRON_HMAC_SECRET,
    RATE_LIMIT_GLOBAL_MAX: rawSource.RATE_LIMIT_GLOBAL_MAX,
    RATE_LIMIT_AUTH_MAX: rawSource.RATE_LIMIT_AUTH_MAX,
    PAYMENT_DEFAULT_PROVIDER: rawSource.PAYMENT_DEFAULT_PROVIDER,
    ENABLE_MOCK_PAYMENT: rawSource.ENABLE_MOCK_PAYMENT,
    STORAGE_DRIVER: rawSource.STORAGE_DRIVER,
    R2_ACCOUNT_ID: rawSource.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: rawSource.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: rawSource.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: rawSource.R2_BUCKET_NAME,
    R2_PUBLIC_BASE_URL: rawSource.R2_PUBLIC_BASE_URL,
  };

  const parsed = EnvSchema.safeParse(candidate);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`[env] Invalid API environment configuration: ${formatted}`);
  }

  return Object.freeze(parsed.data);
}
