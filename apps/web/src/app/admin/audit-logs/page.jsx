'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ClipboardList, Eye, RefreshCw, X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { formatDateTime } from '@/lib/formatters';
import { localizeApiError } from '@/lib/i18n/translate';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Admin-only Audit Logs viewer (`/admin/audit-logs`) with Radix JSON Diff Drawer.
 * @returns {import('react').JSX.Element}
 */
export default function AdminAuditLogsPage() {
  const { locale, t } = useI18n();
  const [logs, setLogs] = useState([]);
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, totalItems: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: '25',
      });
      if (actionFilter.trim()) qs.set('action', actionFilter.trim());
      if (entityTypeFilter.trim()) qs.set('entityType', entityTypeFilter.trim());

      const res = await apiRequest(`/api/v1/admin/audit-logs?${qs.toString()}`);
      setLogs(res.data ?? []);
      if (res.meta?.pagination) {
        setPagination(res.meta.pagination);
      }
    } catch (err) {
      setError(localizeApiError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, entityTypeFilter, locale]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
            <ClipboardList className="h-6 w-6 text-signal" />
            {t('adminAudit.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">{t('adminAudit.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-sm border border-line-strong bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-canvas"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </button>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-3">
        <label className="space-y-1 text-xs">
          <span className="font-semibold uppercase tracking-wider text-ink-muted">
            {t('adminAudit.actionFilterLabel')}
          </span>
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => {
              setPage(1);
              setActionFilter(e.target.value);
            }}
            placeholder={t('adminAudit.actionPlaceholder')}
            className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-xs text-ink"
          />
        </label>

        <label className="space-y-1 text-xs">
          <span className="font-semibold uppercase tracking-wider text-ink-muted">
            {t('adminAudit.entityFilterLabel')}
          </span>
          <input
            type="text"
            value={entityTypeFilter}
            onChange={(e) => {
              setPage(1);
              setEntityTypeFilter(e.target.value);
            }}
            placeholder={t('adminAudit.entityPlaceholder')}
            className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-xs text-ink"
          />
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setActionFilter('');
              setEntityTypeFilter('');
            }}
            className="w-full rounded-sm border border-line-strong bg-canvas px-3 py-2 text-xs font-semibold text-ink hover:bg-surface"
          >
            {t('common.resetFilters')}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-sm border border-danger-border bg-danger-soft px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-sm border border-line bg-surface">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line bg-canvas text-[11px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">{t('adminAudit.colTime')}</th>
              <th className="px-4 py-3">{t('adminAudit.colAction')}</th>
              <th className="px-4 py-3">{t('adminAudit.colEntity')}</th>
              <th className="px-4 py-3">{t('adminAudit.colActor')}</th>
              <th className="px-4 py-3">{t('adminAudit.colIpRole')}</th>
              <th className="px-4 py-3 text-right">{t('adminAudit.colDiff')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                  {loading ? t('common.loading') : t('adminAudit.empty')}
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-canvas/50">
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-secondary tabular-telemetry">
                    {formatDateTime(log.createdAt, locale)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-sm border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] font-semibold text-ink">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink">
                    {log.entityType} ·{' '}
                    <span className="text-ink-muted">{String(log.entityId).slice(0, 8)}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">
                    {log.actor?.email || log.actorId || 'SYSTEM'}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-muted">
                    {log.actorRole || '—'} · {log.ipAddress || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      className="inline-flex items-center gap-1 rounded-sm border border-line-strong bg-canvas px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-signal hover:text-signal"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {t('adminAudit.viewDiffBtn')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-ink-secondary">
        <span className="font-mono tabular-telemetry">
          {t('adminAudit.pageSummary', {
            page: pagination.page,
            totalPages: pagination.totalPages,
            totalItems: pagination.totalItems,
          })}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-sm border border-line bg-surface px-3 py-1.5 font-semibold text-ink disabled:opacity-40"
          >
            {t('adminAudit.prev')}
          </button>
          <button
            type="button"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-sm border border-line bg-surface px-3 py-1.5 font-semibold text-ink disabled:opacity-40"
          >
            {t('adminAudit.next')}
          </button>
        </div>
      </div>

      {/* Radix Diff Modal / Drawer */}
      <Dialog.Root
        open={Boolean(selectedLog)}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
          <Dialog.Content className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-line bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <Dialog.Title className="font-mono text-sm font-bold text-ink">
                  {selectedLog?.action} — {selectedLog?.entityType}
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 font-mono text-xs text-ink-muted">
                  ID: {selectedLog?.entityId} · Request: {selectedLog?.requestId || 'N/A'}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-sm border border-line p-1.5 text-ink hover:bg-canvas"
                  aria-label={t('common.close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="font-mono text-[11px] font-bold uppercase text-ink-muted">
                    {t('adminAudit.beforeState')}
                  </p>
                  <pre className="max-h-[460px] overflow-auto rounded-sm border border-line bg-canvas p-3 font-mono text-[11px] text-ink">
                    {JSON.stringify(selectedLog?.beforeState ?? null, null, 2)}
                  </pre>
                </div>
                <div className="space-y-1.5">
                  <p className="font-mono text-[11px] font-bold uppercase text-signal">
                    {t('adminAudit.afterState')}
                  </p>
                  <pre className="max-h-[460px] overflow-auto rounded-sm border border-line bg-canvas p-3 font-mono text-[11px] text-ink">
                    {JSON.stringify(selectedLog?.afterState ?? null, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
