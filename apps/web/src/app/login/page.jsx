'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoginSchema } from '@dirtfit/shared';
import GoogleAuthButton from '@/components/auth/GoogleAuthButton';
import BrandLogo from '@/components/ui/BrandLogo';
import { localizeApiError } from '@/lib/i18n/translate';
import { useAuth } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Login form handling Argon2id API authentication, Google OAuth 2.0, and guest cart merge.
 * @returns {import('react').JSX.Element}
 */
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { locale, t } = useI18n();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const nextPath = searchParams.get('next');
  const safeNext =
    nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/account';
  const oauthError = searchParams.get('oauthError');

  useEffect(() => {
    if (oauthError) {
      setErrorMsg(localizeApiError({ code: oauthError }, locale));
    }
  }, [oauthError, locale]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || t('errors.INVALID_CREDENTIALS'));
      return;
    }

    setSubmitting(true);
    try {
      await login(parsed.data);
      router.push(safeNext);
    } catch (err) {
      setErrorMsg(localizeApiError(err, locale));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <div className="border border-line-strong bg-surface p-8">
        <div className="mb-4">
          <BrandLogo variant="full" size="sm" />
        </div>
        <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
          {t('auth.loginKicker')}
        </div>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-ink">
          {t('auth.loginTitle')}
        </h1>
        <p className="mt-1.5 text-xs text-ink-secondary">{t('auth.loginSubtitle')}</p>

        <div className="mt-6">
          <GoogleAuthButton nextPath={safeNext} />
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-secondary">
              {t('auth.emailLabel')}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="rider@dirtfit.vn"
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-secondary">
              {t('auth.passwordLabel')}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
            />
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="border border-fit-unsafe/40 bg-red-50 px-3 py-2 text-xs text-fit-unsafe"
            >
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-sm bg-signal px-4 py-2.5 text-sm font-bold text-surface hover:bg-signal-hover disabled:opacity-50"
          >
            {submitting ? t('auth.loggingIn') : t('auth.loginBtn')}
          </button>
        </form>

        <div className="mt-6 border-t border-line pt-4 text-center text-xs text-ink-secondary">
          {t('auth.noAccount')}{' '}
          <Link href="/register" className="font-bold text-signal hover:underline">
            {t('auth.goRegister')}
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Login page wrapped cleanly in Suspense.
 * @returns {import('react').JSX.Element}
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-16 text-sm text-ink-secondary sm:px-6">
          Loading...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
