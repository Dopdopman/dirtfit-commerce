'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Edit3, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { ACCESSORY_CATEGORIES, PRODUCT_STATUSES } from '@dirtfit/shared';
import { buildAccessoryErgoImpactFromForm, canAccessAdminOnlyFeature } from '@/lib/admin-helpers';
import { ApiError, apiRequest } from '@/lib/api-client';
import { formatVnd } from '@/lib/formatters';
import { useAuth } from '@/providers/AppProviders';

const INITIAL_ACC_FORM = {
  sku: '',
  name: '',
  slug: '',
  category: 'LOWERING_LINK',
  brandName: 'Zeta Racing',
  priceVnd: 2800000,
  stockQty: 5,
  status: 'ACTIVE',
  loweringLinkMm: '',
  lowSeatMm: '',
  forkDropMm: '',
  barRiserMm: '',
  pegLowerMm: '',
};

/**
 * Admin Accessories CRUD & Ergonomic Impact Configuration page (`/admin/accessories`).
 * @returns {import('react').JSX.Element}
 */
export default function AdminAccessoriesPage() {
  const { user } = useAuth();
  const isAdmin = canAccessAdminOnlyFeature(user?.role);

  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(INITIAL_ACC_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadAccessories = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ limit: '50' });
      if (search.trim()) qs.set('search', search.trim());
      if (categoryFilter) qs.set('category', categoryFilter);

      const res = await apiRequest(`/api/v1/admin/accessories?${qs.toString()}`);
      setItems(res.data ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail || err.message : 'Không thể tải danh sách phụ tùng.'
      );
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter]);

  useEffect(() => {
    loadAccessories();
  }, [loadAccessories]);

  const openCreateModal = () => {
    setEditingItem(null);
    setForm(INITIAL_ACC_FORM);
    setModalOpen(true);
  };

  const openEditModal = (acc) => {
    const ergo = acc.ergoImpactJson || {};
    setEditingItem(acc);
    setForm({
      sku: acc.sku,
      name: acc.name,
      slug: acc.slug,
      category: acc.category,
      brandName: acc.brandName || '',
      priceVnd: acc.priceVnd,
      stockQty: acc.stockQty,
      status: acc.status,
      loweringLinkMm: ergo.loweringLinkMm ?? '',
      lowSeatMm: ergo.lowSeatMm ?? '',
      forkDropMm: ergo.forkDropMm ?? '',
      barRiserMm: ergo.barRiserMm ?? '',
      pegLowerMm: ergo.pegLowerMm ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setFeedback('');

    try {
      const ergoImpactJson = buildAccessoryErgoImpactFromForm(form);
      if (editingItem) {
        const body = isAdmin
          ? {
              name: form.name.trim(),
              category: form.category,
              brandName: form.brandName.trim() || null,
              priceVnd: Number(form.priceVnd),
              stockQty: Number(form.stockQty),
              status: form.status,
              ergoImpactJson,
              version: editingItem.version,
            }
          : {
              stockQty: Number(form.stockQty),
              status: form.status,
              version: editingItem.version,
            };

        await apiRequest(`/api/v1/admin/accessories/${editingItem.id}`, {
          method: 'PATCH',
          body,
        });
        setFeedback(`Đã cập nhật phụ tùng "${form.name}".`);
      } else {
        await apiRequest('/api/v1/admin/accessories', {
          method: 'POST',
          body: {
            sku: form.sku.trim(),
            name: form.name.trim(),
            slug: form.slug.trim(),
            category: form.category,
            brandName: form.brandName.trim() || null,
            priceVnd: Number(form.priceVnd),
            stockQty: Number(form.stockQty),
            status: form.status,
            ergoImpactJson,
          },
        });
        setFeedback(`Đã tạo phụ tùng mới "${form.name}".`);
      }

      setModalOpen(false);
      await loadAccessories();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `[${err.code}] ${err.detail || err.message}`
          : 'Thao tác thất bại.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (acc) => {
    if (!isAdmin) return;
    if (!window.confirm(`Xác nhận ẩn/soft-delete phụ tùng "${acc.name}"?`)) {
      return;
    }
    setError('');
    setFeedback('');
    try {
      await apiRequest(`/api/v1/admin/accessories/${acc.id}`, {
        method: 'DELETE',
      });
      setFeedback(`Đã xóa mềm "${acc.name}".`);
      await loadAccessories();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.message : 'Không thể xóa mềm phụ tùng.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Quản lý Phụ tùng &amp; Thông số Ergonomic
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Quản lý kho phụ kiện và mức tác động hình học (`loweringLinkMm`, `lowSeatMm`,
            `barRiserMm`...) dùng trong Simulator.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAccessories}
            className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-canvas"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-sm bg-ink px-3.5 py-2 text-xs font-semibold text-surface hover:bg-signal"
            >
              <Plus className="h-4 w-4" />
              Thêm phụ tùng
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên hoặc SKU..."
          className="rounded-sm border border-line bg-canvas px-3 py-2 text-xs text-ink"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-sm border border-line bg-canvas px-3 py-2 text-xs text-ink"
        >
          <option value="">Tất cả loại phụ tùng</option>
          {Object.values(ACCESSORY_CATEGORIES).map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setSearch('');
            setCategoryFilter('');
          }}
          className="rounded-sm border border-line-strong bg-canvas px-3 py-2 text-xs font-semibold text-ink hover:bg-surface"
        >
          Xóa bộ lọc
        </button>
      </div>

      {error && (
        <div className="rounded-sm border border-danger-border bg-danger-soft px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}
      {feedback && (
        <div className="rounded-sm border border-safe-border bg-safe-soft px-4 py-3 text-xs text-safe">
          {feedback}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-sm border border-line bg-surface">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line bg-canvas text-[11px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">SKU / Tên phụ tùng</th>
              <th className="px-4 py-3">Loại</th>
              <th className="px-4 py-3">Tác động Ergo</th>
              <th className="px-4 py-3 text-right">Giá bán</th>
              <th className="px-4 py-3 text-right">Khả dụng / Kho</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  {loading ? 'Đang tải...' : 'Không có phụ tùng phù hợp.'}
                </td>
              </tr>
            ) : (
              items.map((acc) => (
                <tr key={acc.id} className="hover:bg-canvas/50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{acc.name}</p>
                    <p className="font-mono text-[11px] text-ink-muted">
                      {acc.sku} · {acc.brandName || 'OEM'}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-secondary">
                    {acc.category}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-signal">
                    {acc.ergoImpactJson ? JSON.stringify(acc.ergoImpactJson) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-telemetry">
                    {formatVnd(acc.priceVnd)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-telemetry">
                    <span className="font-bold text-ink">{acc.availableQty ?? acc.stockQty}</span> /{' '}
                    <span className="text-ink-muted">{acc.stockQty}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-sm border border-line bg-canvas px-2 py-0.5 font-mono text-[10px] font-semibold text-ink">
                      {acc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(acc)}
                        className="inline-flex items-center gap-1 rounded-sm border border-line-strong bg-canvas px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-signal hover:text-signal"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Sửa
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDelete(acc)}
                          className="rounded-sm border border-danger-border bg-danger-soft p-1.5 text-danger"
                          title="Xóa mềm"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[95vw] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-sm border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <Dialog.Title className="text-lg font-bold text-ink">
                {editingItem ? `Cập nhật: ${editingItem.name}` : 'Thêm Phụ tùng mới'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="rounded-sm border border-line p-1.5 text-ink">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                {!editingItem && (
                  <>
                    <label className="space-y-1">
                      <span className="font-semibold text-ink-secondary">SKU</span>
                      <input
                        required
                        value={form.sku}
                        onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))}
                        className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="font-semibold text-ink-secondary">Slug URL</span>
                      <input
                        required
                        value={form.slug}
                        onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                        className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink"
                      />
                    </label>
                  </>
                )}

                <label className="space-y-1 sm:col-span-2">
                  <span className="font-semibold text-ink-secondary">Tên phụ tùng</span>
                  <input
                    required
                    disabled={Boolean(editingItem && !isAdmin)}
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink disabled:opacity-60"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">Loại phụ tùng</span>
                  <select
                    disabled={Boolean(editingItem && !isAdmin)}
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink disabled:opacity-60"
                  >
                    {Object.values(ACCESSORY_CATEGORIES).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">Thương hiệu</span>
                  <input
                    disabled={Boolean(editingItem && !isAdmin)}
                    value={form.brandName}
                    onChange={(e) => setForm((p) => ({ ...p, brandName: e.target.value }))}
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink disabled:opacity-60"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">Giá bán (VND)</span>
                  <input
                    type="number"
                    required
                    disabled={Boolean(editingItem && !isAdmin)}
                    value={form.priceVnd}
                    onChange={(e) => setForm((p) => ({ ...p, priceVnd: e.target.value }))}
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink disabled:opacity-60"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">Tồn kho</span>
                  <input
                    type="number"
                    min={0}
                    required
                    value={form.stockQty}
                    onChange={(e) => setForm((p) => ({ ...p, stockQty: e.target.value }))}
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink"
                  />
                </label>

                <label className="space-y-1 sm:col-span-2">
                  <span className="font-semibold text-ink-secondary">Trạng thái</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink"
                  >
                    {Object.values(PRODUCT_STATUSES).map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rounded-sm border border-line bg-canvas p-3 space-y-2">
                <p className="font-mono text-[11px] font-bold uppercase text-ink-muted">
                  Tác động Ergonomics (`ergoImpactJson`, mm)
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    ['loweringLinkMm', 'Link hạ phuộc (mm)'],
                    ['lowSeatMm', 'Yên thấp (mm)'],
                    ['forkDropMm', 'Hạ chảng ba (mm)'],
                    ['barRiserMm', 'Nâng ghi-đông (mm)'],
                    ['pegLowerMm', 'Hạ gác chân (mm)'],
                  ].map(([key, label]) => (
                    <label key={key} className="space-y-1">
                      <span className="text-[11px] text-ink-secondary">{label}</span>
                      <input
                        type="number"
                        min={0}
                        disabled={Boolean(editingItem && !isAdmin)}
                        value={form[key]}
                        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                        className="w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-ink disabled:opacity-60"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-sm border border-line-strong px-4 py-2 font-semibold text-ink"
                  >
                    Hủy
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-sm bg-ink px-4 py-2 font-semibold text-surface hover:bg-signal disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : editingItem ? 'Lưu cập nhật' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
