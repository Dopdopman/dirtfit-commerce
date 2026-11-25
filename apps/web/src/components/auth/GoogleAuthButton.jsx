'use client';

import { useEffect, useState } from 'react';
import { apiRequest, getPublicApiBaseUrl } from '@/lib/api-client';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Validate relative next path safely on client before initiating top-level OAuth redirect.
 * @param {string|null|undefined} nextPath
 * @returns {string}
 */
function toSafeNextPath(nextPath) {
  if (typeof nextPath === 'string' && nextPath.startsWith('/') && !nextPath.startsWith('//')) {
    return nextPath;
  }
  return '/account';
}

/**
 * Industrial Motorsport Google OAuth 2.0 trigger button.
 * Performs top-level browser navigation to Fastify OAuth start endpoint.
 * @param {object} props
 * @param {string} [props.nextPath]
 * @returns {import('react').JSX.Element|null}
 */
export default function GoogleAuthButton({ nextPath = '/account' }) {
  const { t } = useI18n();
  const [googleEnabled, setGoogleEnabled] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest('/api/v1/auth/providers', { skipAuthRetry: true })
      .then((data) => {
        if (active && typeof data?.googleEnabled === 'boolean') {
          setGoogleEnabled(data.googleEnabled);
        }
      })
      .catch(() => {
        // Keep button visible if API is still waking up
      });
    return () => {
      active = false;
    };
  }, []);

  if (!googleEnabled) {
    return null;
  }

  const handleContinueWithGoogle = () => {
    setRedirecting(true);
    const safeNext = toSafeNextPath(nextPath);
    const startUrl = `${getPublicApiBaseUrl()}/api/v1/auth/google?next=${encodeURIComponent(safeNext)}`;
    window.location.assign(startUrl);
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleContinueWithGoogle}
        disabled={redirecting}
        data-testid="google-oauth-btn"
        className="flex w-full items-center justify-center gap-2.5 rounded-sm border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-canvas disabled:opacity-60"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
          />
        </svg>
        <span>{redirecting ? t('auth.redirectingGoogle') : t('auth.continueWithGoogle')}</span>
      </button>

      <div className="relative flex items-center py-1">
        <div className="flex-grow border-t border-line" />
        <span className="mx-3 shrink-0 font-mono text-[10px] font-bold uppercase tracking-widest text-ink-muted">
          {t('auth.orDivider')}
        </span>
        <div className="flex-grow border-t border-line" />
      </div>
    </div>
  );
}
