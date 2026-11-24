'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RegisterSchema } from '@dirtfit/shared';
import { useAuth } from '@/providers/AppProviders';

/**
 * Customer Registration Page validated with shared Zod RegisterSchema.
 * @returns {import('react').JSX.Element}
 */
export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const payload = {
      fullName,
      email,
      password,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    };
    const parsed = RegisterSchema.safeParse(payload);
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || 'Thông tin đăng ký chưa hợp lệ.');
      return;
    }

    setSubmitting(true);
    try {
      await register(parsed.data);
      router.push('/account');
    } catch (err) {
      setErrorMsg(err?.detail || 'Không thể tạo tài khoản.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <div className="border border-line-strong bg-surface p-8">
        <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
          TẠO TÀI KHOẢN MỚI
        </div>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-ink">Đăng ký DirtFit</h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-secondary">Họ và tên</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-secondary">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-secondary">
              Số điện thoại (tùy chọn)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0901234567"
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm tabular-telemetry"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-secondary">
              Mật khẩu (tối thiểu 10 ký tự)
            </label>
            <input
              type="password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
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
            {submitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
          </button>
        </form>

        <div className="mt-6 border-t border-line pt-4 text-center text-xs text-ink-secondary">
          Đã có tài khoản?{' '}
          <Link href="/login" className="font-bold text-signal hover:underline">
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
