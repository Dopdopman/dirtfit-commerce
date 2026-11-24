'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoginSchema } from '@dirtfit/shared';
import { useAuth } from '@/providers/AppProviders';

/**
 * Login form handling Argon2id API authentication and guest cart merge.
 * @returns {import('react').JSX.Element}
 */
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || 'Email hoặc mật khẩu không hợp lệ.');
      return;
    }

    setSubmitting(true);
    try {
      await login(parsed.data);
      const nextPath = searchParams.get('next');
      const safeNext = nextPath && nextPath.startsWith('/') ? nextPath : '/account';
      router.push(safeNext);
    } catch (err) {
      setErrorMsg(err?.detail || 'Email hoặc mật khẩu không đúng.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="border border-line-strong bg-surface p-8">
        <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
          DIRTFIT ACCOUNT
        </div>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-ink">Đăng nhập</h1>
        <p className="mt-1.5 text-xs text-ink-secondary">
          Lưu hồ sơ thể trạng, theo dõi cọc giữ xe và đặt lịch lái thử tại showroom.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-secondary">Email</label>
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
            <label className="block text-xs font-medium text-ink-secondary">Mật khẩu</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
            />
          </div>

          {errorMsg && (
            <div className="border border-fit-unsafe/40 bg-red-50 px-3 py-2 text-xs text-fit-unsafe">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-sm bg-signal px-4 py-2.5 text-sm font-bold text-surface hover:bg-signal-hover disabled:opacity-50"
          >
            {submitting ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="mt-6 border-t border-line pt-4 text-center text-xs text-ink-secondary">
          Chưa có tài khoản?{' '}
          <Link href="/register" className="font-bold text-signal hover:underline">
            Đăng ký thành viên mới
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
          Đang tải trang đăng nhập...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
