'use client';

import { useEffect, useState } from 'react';
import { ImagePlus, Trash2, Wrench, X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { localizeApiError } from '@/lib/i18n/translate';
import { resolveClientMediaUrl, validateImageFileForUpload } from '@/lib/media-helpers';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Execute 3-step R2/Local Presign -> PUT -> 4KB Magic Bytes Confirm upload for an accessory photo.
 * Shared across Create (post-create auto upload) and Edit (instant replace) workflows.
 * @param {string} accessoryId
 * @param {File} file
 * @param {object} [options]
 * @param {(stepKey: 'stepPresign'|'stepUpload'|'stepConfirm') => void} [options.onStep]
 * @returns {Promise<{ accessory: object, verifiedMime: string }>}
 */
export async function uploadAccessoryPhotoFile(accessoryId, file, { onStep } = {}) {
  const check = validateImageFileForUpload(file);
  if (!check.valid) {
    throw new Error(check.errorCode);
  }

  onStep?.('stepPresign');
  const presign = await apiRequest(`/api/v1/admin/accessories/${accessoryId}/media/presign`, {
    method: 'POST',
    body: {
      mimeType: check.mimeType,
      sizeBytes: file.size,
      originalFileName: file.name.slice(0, 180),
    },
  });

  onStep?.('stepUpload');
  const putRes = await fetch(presign.uploadUrl, {
    method: presign.method || 'PUT',
    headers: {
      'content-type': check.mimeType,
    },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error(`PUT upload failed with HTTP ${putRes.status}`);
  }

  onStep?.('stepConfirm');
  return apiRequest(`/api/v1/admin/accessories/${accessoryId}/media/confirm`, {
    method: 'POST',
    body: {
      storageKey: presign.storageKey,
      declaredMimeType: check.mimeType,
    },
  });
}

/**
 * Product Photo Uploader for Admin Accessories Modal (supports both Create pending file & Edit replace/delete).
 * @param {object} props
 * @param {object|null} props.accessory
 * @param {boolean} props.isAdmin
 * @param {File|null} props.pendingFile
 * @param {(file: File|null) => void} props.onPendingFileChange
 * @param {(updatedAccessory: object) => Promise<void>|void} props.onPhotoMutated
 * @param {string} [props.externalStepText]
 * @param {string} [props.externalError]
 * @returns {import('react').JSX.Element}
 */
export default function AccessoryPhotoUploader({
  accessory,
  isAdmin,
  pendingFile,
  onPendingFileChange,
  onPhotoMutated,
  externalStepText = '',
  externalError = '',
}) {
  const { locale, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [stepText, setStepText] = useState('');
  const [localError, setLocalError] = useState('');
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState('');
  const [remoteImgBroken, setRemoteImgBroken] = useState(false);

  const remotePhotoUrl = resolveClientMediaUrl(accessory?.imageUrl);

  useEffect(() => {
    setRemoteImgBroken(false);
  }, [remotePhotoUrl, accessory?.id]);

  useEffect(() => {
    if (!pendingFile) {
      setPendingPreviewUrl('');
      return undefined;
    }
    const objUrl = URL.createObjectURL(pendingFile);
    setPendingPreviewUrl(objUrl);
    return () => {
      URL.revokeObjectURL(objUrl);
    };
  }, [pendingFile]);

  const mapValidationMessage = (errorCode) => {
    if (errorCode === 'INVALID_TYPE') return t('media.invalidFileType');
    if (errorCode === 'FILE_TOO_LARGE') return t('media.fileTooLarge');
    return t('media.emptyFile');
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isAdmin) return;

    const check = validateImageFileForUpload(file);
    if (!check.valid) {
      setLocalError(mapValidationMessage(check.errorCode));
      return;
    }

    setLocalError('');

    if (!accessory?.id) {
      onPendingFileChange(file);
      return;
    }

    setBusy(true);
    try {
      const confirmRes = await uploadAccessoryPhotoFile(accessory.id, file, {
        onStep: (stepKey) => setStepText(t(`media.${stepKey}`)),
      });
      setStepText('');
      if (confirmRes?.accessory) {
        await onPhotoMutated(confirmRes.accessory);
      }
    } catch (err) {
      setStepText('');
      setLocalError(localizeApiError(err, locale));
    } finally {
      setBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!accessory?.id || !isAdmin || busy) return;
    if (!window.confirm(t('adminAccessories.confirmRemovePhoto'))) {
      return;
    }
    setBusy(true);
    setLocalError('');
    try {
      const res = await apiRequest(`/api/v1/admin/accessories/${accessory.id}/media`, {
        method: 'DELETE',
      });
      if (res?.accessory) {
        await onPhotoMutated(res.accessory);
      }
    } catch (err) {
      setLocalError(localizeApiError(err, locale));
    } finally {
      setBusy(false);
    }
  };

  const previewSrc = pendingPreviewUrl || (!remoteImgBroken ? remotePhotoUrl : null);
  const displayStep = externalStepText || stepText;
  const displayError = externalError || localError;

  return (
    <div className="space-y-3 rounded-sm border border-line bg-canvas p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase text-ink">
            {t('adminAccessories.photoSectionTitle')}
          </p>
          <p className="text-[11px] text-ink-secondary">{t('adminAccessories.photoSectionHint')}</p>
        </div>
        {!isAdmin && (
          <span className="rounded-sm border border-warning-border bg-warning-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-warning">
            ADMIN ONLY
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="cad-grid-bg relative flex h-28 w-36 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-surface">
          {previewSrc ? (
            <img
              src={previewSrc}
              alt={accessory?.name || 'Accessory preview'}
              onError={() => {
                if (!pendingPreviewUrl) {
                  setRemoteImgBroken(true);
                }
              }}
              className="h-full w-full object-contain p-2"
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-center text-ink-muted">
              <Wrench className="h-5 w-5 text-signal" />
              <span className="font-mono text-[10px] font-semibold">
                {accessory?.sku || 'SKU PHOTO'}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <label
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-semibold ${
                  !busy
                    ? 'bg-ink text-surface hover:bg-signal'
                    : 'cursor-not-allowed bg-surface text-ink-muted'
                }`}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                <span>
                  {displayStep ||
                    (remotePhotoUrl || pendingFile
                      ? t('adminAccessories.uploadReplacePhotoBtn')
                      : t('adminAccessories.selectPhotoBtn'))}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {!accessory && pendingFile && (
                <button
                  type="button"
                  onClick={() => onPendingFileChange(null)}
                  className="inline-flex items-center gap-1 rounded-sm border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink-secondary hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>{t('adminAccessories.clearPendingPhotoBtn')}</span>
                </button>
              )}

              {accessory && remotePhotoUrl && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleRemovePhoto}
                  className="inline-flex items-center gap-1 rounded-sm border border-danger-border bg-danger-soft px-2.5 py-1.5 text-xs font-semibold text-danger hover:opacity-90 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t('adminAccessories.removePhotoBtn')}</span>
                </button>
              )}
            </div>
          )}

          {!accessory && pendingFile && (
            <p className="font-mono text-[11px] text-ink-secondary">
              {pendingFile.name} · {t('adminAccessories.pendingPhotoHint')}
            </p>
          )}

          {displayStep && (
            <p className="font-mono text-[11px] font-semibold text-signal">{displayStep}</p>
          )}
          {displayError && (
            <div className="rounded-sm border border-danger-border bg-danger-soft px-2.5 py-1.5 font-mono text-[11px] text-danger">
              {displayError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
