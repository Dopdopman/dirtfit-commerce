'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { localizeApiError } from '@/lib/i18n/translate';
import {
  isPlaceholderMediaUrl,
  readBrowserImageDimensions,
  resolveClientMediaUrl,
  validateImageFileForUpload,
} from '@/lib/media-helpers';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Compare BikeMedia rows deterministically: primary first, then sortOrder ASC, then createdAt ASC.
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function comparePhotos(a, b) {
  const pDiff = (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0);
  if (pDiff !== 0) return pDiff;
  const sDiff = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);
  if (sDiff !== 0) return sDiff;
  return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
}

/**
 * Admin Real Motorcycle Photos Manager (Card 1 inside `/admin/bikes/[id]` Media tab).
 * Strictly manages `HERO` and `GALLERY` real commercial photos independently from `SIDE_PROFILE_BLUEPRINT`.
 * @param {object} props
 * @param {object} props.bike
 * @param {boolean} props.isAdmin
 * @param {() => Promise<void>} props.onBikeUpdated
 * @returns {import('react').JSX.Element}
 */
export default function BikePhotoManager({ bike, isAdmin, onBikeUpdated }) {
  const { locale, t } = useI18n();
  const [busyAction, setBusyAction] = useState(false);
  const [uploadStepText, setUploadStepText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [brokenIds, setBrokenIds] = useState(() => new Set());
  const [localPreviews, setLocalPreviews] = useState({});

  const commercialPhotos = useMemo(
    () =>
      (bike?.media ?? [])
        .filter((m) => m && !m.deletedAt && (m.mediaType === 'HERO' || m.mediaType === 'GALLERY'))
        .sort(comparePhotos),
    [bike?.media]
  );

  useEffect(() => {
    setBrokenIds(new Set());
  }, [bike?.id, commercialPhotos.length]);

  useEffect(
    () => () => {
      Object.values(localPreviews).forEach((url) => URL.revokeObjectURL(url));
    },
    [localPreviews]
  );

  const mapValidationError = (errorCode) => {
    if (errorCode === 'INVALID_TYPE') return t('media.invalidFileType');
    if (errorCode === 'FILE_TOO_LARGE') return t('media.fileTooLarge');
    return t('media.emptyFile');
  };

  const handleMultiUpload = async (e) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !isAdmin) return;

    for (const file of files) {
      const check = validateImageFileForUpload(file);
      if (!check.valid) {
        setErrorMessage(`${file.name}: ${mapValidationError(check.errorCode)}`);
        e.target.value = '';
        return;
      }
    }

    setBusyAction(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const hasLiveCoverAlready = commercialPhotos.some(
        (m) => m.isPrimary && !isPlaceholderMediaUrl(m.url)
      );

      for (let idx = 0; idx < files.length; idx += 1) {
        const file = files[idx];
        const fileCheck = validateImageFileForUpload(file);
        const dims = await readBrowserImageDimensions(file);
        const isFirstLiveCover = !hasLiveCoverAlready && idx === 0;
        const targetMediaType = isFirstLiveCover ? 'HERO' : 'GALLERY';
        const labelPrefix = files.length > 1 ? `[${idx + 1}/${files.length}] ` : '';

        setUploadStepText(`${labelPrefix}${t('media.stepPresign')}`);
        const presign = await apiRequest(`/api/v1/admin/bikes/${bike.id}/media/presign`, {
          method: 'POST',
          body: {
            mediaType: targetMediaType,
            mimeType: fileCheck.mimeType,
            sizeBytes: file.size,
            originalFileName: file.name.slice(0, 180),
          },
        });

        setUploadStepText(`${labelPrefix}${t('media.stepUpload')}`);
        const putRes = await fetch(presign.uploadUrl, {
          method: presign.method || 'PUT',
          headers: {
            'content-type': fileCheck.mimeType,
          },
          body: file,
        });

        if (!putRes.ok) {
          throw new Error(`Upload PUT failed with HTTP ${putRes.status}`);
        }

        setUploadStepText(`${labelPrefix}${t('media.stepConfirm')}`);
        const confirmRes = await apiRequest(`/api/v1/admin/bikes/${bike.id}/media/confirm`, {
          method: 'POST',
          body: {
            storageKey: presign.storageKey,
            declaredMimeType: fileCheck.mimeType,
            mediaType: targetMediaType,
            altText: `${bike.name} ${targetMediaType === 'HERO' ? 'Cover' : 'Photo'}`,
            widthPx: dims.widthPx,
            heightPx: dims.heightPx,
            isPrimary: isFirstLiveCover,
            sortOrder: commercialPhotos.length + idx,
          },
        });

        if (confirmRes?.media?.id) {
          setLocalPreviews((prev) => ({
            ...prev,
            [confirmRes.media.id]: dims.objectUrl,
          }));
        } else {
          URL.revokeObjectURL(dims.objectUrl);
        }
      }

      setUploadStepText('');
      setStatusMessage(`${t('media.uploadSuccess', { count: files.length })}`);
      await onBikeUpdated();
    } catch (err) {
      setUploadStepText('');
      setErrorMessage(localizeApiError(err, locale));
    } finally {
      setBusyAction(false);
      e.target.value = '';
    }
  };

  const handleSetPrimary = async (mediaId) => {
    if (!isAdmin || busyAction) return;
    setBusyAction(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      await apiRequest(`/api/v1/admin/bikes/${bike.id}/media/${mediaId}/primary`, {
        method: 'PATCH',
        body: {},
      });
      setStatusMessage(t('media.coverUpdated'));
      await onBikeUpdated();
    } catch (err) {
      setErrorMessage(localizeApiError(err, locale));
    } finally {
      setBusyAction(false);
    }
  };

  const handleMove = async (index, direction) => {
    if (!isAdmin || busyAction) return;
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= commercialPhotos.length) return;

    const reordered = [...commercialPhotos];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(swapIndex, 0, moved);

    setBusyAction(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      await apiRequest(`/api/v1/admin/bikes/${bike.id}/media/reorder`, {
        method: 'PATCH',
        body: {
          mediaIds: reordered.map((item) => item.id),
        },
      });
      setStatusMessage(t('media.reorderedToast'));
      await onBikeUpdated();
    } catch (err) {
      setErrorMessage(localizeApiError(err, locale));
    } finally {
      setBusyAction(false);
    }
  };

  const handleDelete = async (item) => {
    if (!isAdmin || busyAction) return;
    if (!window.confirm(t('media.confirmDeletePhoto'))) {
      return;
    }
    setBusyAction(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      await apiRequest(`/api/v1/admin/bikes/${bike.id}/media/${item.id}`, {
        method: 'DELETE',
      });
      setStatusMessage(t('media.deletedPhotoToast'));
      await onBikeUpdated();
    } catch (err) {
      setErrorMessage(localizeApiError(err, locale));
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <section className="rounded-sm border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-ink">
            {t('media.realPhotosTitle')}
          </h3>
          <p className="mt-0.5 text-xs text-ink-secondary">{t('media.realPhotosSubtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          {!isAdmin ? (
            <span className="rounded-sm border border-warning-border bg-warning-soft px-2.5 py-1 font-mono text-[11px] font-semibold text-warning">
              {t('calibration.readOnlyBadge')}
            </span>
          ) : (
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-semibold ${
                !busyAction
                  ? 'bg-ink text-surface hover:bg-signal'
                  : 'cursor-not-allowed bg-canvas text-ink-muted'
              }`}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              <span>{uploadStepText || t('media.uploadPhotosBtn')}</span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                disabled={busyAction}
                onChange={handleMultiUpload}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {uploadStepText && (
        <div className="mt-3 rounded-sm border border-signal/30 bg-signal-soft px-3 py-2 font-mono text-xs text-ink">
          {uploadStepText}
        </div>
      )}
      {statusMessage && (
        <div className="mt-3 rounded-sm border border-safe-border bg-safe-soft px-3 py-2 text-xs text-safe">
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mt-3 rounded-sm border border-danger-border bg-danger-soft px-3 py-2 font-mono text-xs text-danger">
          {errorMessage}
        </div>
      )}

      {commercialPhotos.length === 0 ? (
        <div className="mt-4 rounded-sm border border-dashed border-line-strong bg-canvas p-6 text-center text-xs text-ink-secondary">
          {t('media.noPhotosYet')}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {commercialPhotos.map((item, idx) => {
            const clientUrl = localPreviews[item.id] ?? resolveClientMediaUrl(item.url);
            const isDeadOrBroken = !clientUrl || brokenIds.has(item.id);

            return (
              <div
                key={item.id}
                className={`flex flex-col justify-between rounded-sm border bg-canvas p-3 ${
                  item.isPrimary ? 'border-signal ring-1 ring-signal/40' : 'border-line'
                }`}
              >
                <div>
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-sm border border-line bg-surface">
                    {isDeadOrBroken ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-warning-soft/50 p-3 text-center">
                        <AlertTriangle className="h-5 w-5 text-warning" />
                        <span className="font-mono text-[10px] font-bold uppercase text-warning">
                          {t('media.urlUnreachable')}
                        </span>
                        <span className="max-w-full truncate font-mono text-[9px] text-ink-muted">
                          {item.url}
                        </span>
                      </div>
                    ) : (
                      <img
                        src={clientUrl}
                        alt={item.altText || bike.name}
                        onError={() =>
                          setBrokenIds((prev) => {
                            const next = new Set(prev);
                            next.add(item.id);
                            return next;
                          })
                        }
                        className="h-full w-full object-cover"
                      />
                    )}

                    {item.isPrimary && (
                      <span className="absolute left-2 top-2 rounded-sm bg-signal px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-surface shadow-sm">
                        {t('media.coverPhotoBadge')}
                      </span>
                    )}
                    <span className="absolute right-2 top-2 rounded-sm border border-line bg-surface/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink">
                      #{idx + 1} · {item.mediaType}
                    </span>
                  </div>
                </div>

                {isAdmin && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 border-t border-line pt-2.5 text-[11px]">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={busyAction || idx === 0}
                        onClick={() => handleMove(idx, -1)}
                        title={t('media.moveLeftBtn')}
                        className="rounded-sm border border-line bg-surface p-1 text-ink hover:border-signal hover:text-signal disabled:opacity-40"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busyAction || idx === commercialPhotos.length - 1}
                        onClick={() => handleMove(idx, 1)}
                        title={t('media.moveRightBtn')}
                        className="rounded-sm border border-line bg-surface p-1 text-ink hover:border-signal hover:text-signal disabled:opacity-40"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!item.isPrimary && (
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => handleSetPrimary(item.id)}
                          className="inline-flex items-center gap-1 rounded-sm border border-line-strong bg-surface px-2 py-1 font-semibold text-ink hover:border-signal hover:text-signal disabled:opacity-40"
                        >
                          <Star className="h-3 w-3" />
                          <span>{t('media.setAsCoverBtn')}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => handleDelete(item)}
                        title={t('media.deletePhotoBtn')}
                        className="rounded-sm border border-danger-border bg-danger-soft p-1 text-danger hover:opacity-90 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
