'use client';

import { useEffect, useState } from 'react';
import { subscribeColdStartNotice } from '@/lib/api-client';

/**
 * Non-blocking banner displayed only when an API call takes >3s (Render cold start).
 * @returns {import('react').JSX.Element|null}
 */
export default function ColdStartNotice() {
  const [isWaking, setIsWaking] = useState(false);

  useEffect(() => {
    return subscribeColdStartNotice((waking) => {
      setIsWaking(waking);
    });
  }, []);

  if (!isWaking) {
    return null;
  }

  return (
    <div
      role="status"
      className="border-b border-signal/30 bg-orange-50 px-4 py-2 text-center text-xs font-medium text-ink"
    >
      Đang khởi động máy chủ dữ liệu (Cold Start), vui lòng đợi trong giây lát...
    </div>
  );
}
