'use client';

import { useEffect, useState } from 'react';
import { subscribeColdStartNotice } from '@/lib/api-client';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Non-blocking banner displayed only when an API call takes >3s (Render cold start).
 * @returns {import('react').JSX.Element|null}
 */
export default function ColdStartNotice() {
  const { t } = useI18n();
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
      {t('coldStart.waking')}
    </div>
  );
}
