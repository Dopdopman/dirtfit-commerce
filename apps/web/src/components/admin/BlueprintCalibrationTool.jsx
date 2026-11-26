'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
  Upload,
} from 'lucide-react';
import RiderFigureSvg from '@/components/simulator/RiderFigureSvg';
import { apiRequest } from '@/lib/api-client';
import {
  CALIBRATION_ANCHOR_STEPS,
  DEFAULT_CALIBRATION_ANCHORS,
  buildCalibrationPayload,
  clientPointToUv,
  computeLiveCalibrationPreview,
} from '@/lib/calibration-helpers';
import { localizeApiError } from '@/lib/i18n/translate';
import {
  inspectImageFileForUpload,
  readBrowserImageDimensions,
  resolveClientMediaUrl,
} from '@/lib/media-helpers';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Interactive 2D Side-Profile Blueprint Upload (locked strictly to `SIDE_PROFILE_BLUEPRINT`)
 * & 6-Anchor UV Calibration Tool with live pxPerMm/perspective check and 170cm Rider SVG Overlay.
 * @param {object} props
 * @param {object} props.bike
 * @param {boolean} props.isAdmin
 * @param {() => Promise<void>} props.onBikeUpdated
 * @returns {import('react').JSX.Element}
 */
export default function BlueprintCalibrationTool({ bike, isAdmin, onBikeUpdated }) {
  const { locale, t } = useI18n();
  const blueprintList = useMemo(
    () =>
      (bike.media ?? []).filter(
        (m) => m && !m.deletedAt && m.mediaType === 'SIDE_PROFILE_BLUEPRINT'
      ),
    [bike.media]
  );

  const [selectedMediaId, setSelectedMediaId] = useState(
    () => blueprintList.find((m) => m.isPrimary)?.id ?? blueprintList[0]?.id ?? ''
  );

  useEffect(() => {
    if (blueprintList.length === 0) {
      setSelectedMediaId('');
      return;
    }
    if (!blueprintList.some((m) => m.id === selectedMediaId)) {
      setSelectedMediaId(blueprintList.find((m) => m.isPrimary)?.id ?? blueprintList[0].id);
    }
  }, [blueprintList, selectedMediaId]);

  const [localPreviewUrls, setLocalPreviewUrls] = useState({});
  const [uploadIsPrimary, setUploadIsPrimary] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [imgBroken, setImgBroken] = useState(false);

  const selectedMedia = useMemo(
    () => blueprintList.find((m) => m.id === selectedMediaId) ?? blueprintList[0] ?? null,
    [blueprintList, selectedMediaId]
  );

  const [facing, setFacing] = useState('RIGHT');
  const [imageDims, setImageDims] = useState({ widthPx: 1200, heightPx: 800 });
  const [anchorsUv, setAnchorsUv] = useState(DEFAULT_CALIBRATION_ANCHORS);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [showRiderOverlay, setShowRiderOverlay] = useState(true);
  const [draggingKey, setDraggingKey] = useState('');
  const [savingCal, setSavingCal] = useState(false);
  const [calFeedback, setCalFeedback] = useState('');
  const [calError, setCalError] = useState('');

  const canvasBoxRef = useRef(null);

  useEffect(() => {
    if (!selectedMedia) {
      return;
    }
    setImgBroken(false);
    const existing = selectedMedia.calibrationData;
    if (existing?.anchorsUv) {
      setFacing(existing.facing === 'LEFT' ? 'LEFT' : 'RIGHT');
      setImageDims({
        widthPx: existing.imageWidthPx || selectedMedia.widthPx || 1200,
        heightPx: existing.imageHeightPx || selectedMedia.heightPx || 800,
      });
      setAnchorsUv(existing.anchorsUv);
    } else {
      setFacing('RIGHT');
      setImageDims({
        widthPx: selectedMedia.widthPx || 1200,
        heightPx: selectedMedia.heightPx || 800,
      });
      setAnchorsUv(DEFAULT_CALIBRATION_ANCHORS);
    }
    setCalFeedback('');
    setCalError('');
  }, [selectedMedia]);

  const calibrationPayload = useMemo(
    () =>
      buildCalibrationPayload({
        facing,
        imageWidthPx: imageDims.widthPx,
        imageHeightPx: imageDims.heightPx,
        anchorsUv,
      }),
    [facing, imageDims.widthPx, imageDims.heightPx, anchorsUv]
  );

  const livePreview = useMemo(
    () => computeLiveCalibrationPreview(calibrationPayload, bike.geometrySpec),
    [calibrationPayload, bike.geometrySpec]
  );

  const resolvedImageSrc = useMemo(() => {
    if (!selectedMedia) return '';
    if (localPreviewUrls[selectedMedia.id]) {
      return localPreviewUrls[selectedMedia.id];
    }
    return resolveClientMediaUrl(selectedMedia.url) || '';
  }, [selectedMedia, localPreviewUrls]);

  const activeStep = CALIBRATION_ANCHOR_STEPS[activeStepIdx] ?? CALIBRATION_ANCHOR_STEPS[0];

  const applyAnchorAtClientPoint = (clientX, clientY, targetKey, shouldAdvance = false) => {
    if (!canvasBoxRef.current) return;
    const rect = canvasBoxRef.current.getBoundingClientRect();
    const uv = clientPointToUv(clientX, clientY, rect);

    setAnchorsUv((prev) => {
      if (targetKey === 'groundLineV') {
        return { ...prev, groundLineV: uv.v };
      }
      return {
        ...prev,
        [targetKey]: uv,
      };
    });

    if (shouldAdvance && autoAdvance) {
      setActiveStepIdx((idx) => (idx + 1) % CALIBRATION_ANCHOR_STEPS.length);
    }
  };

  const handleCanvasPointerDown = (e) => {
    if (!isAdmin || !selectedMedia) return;
    applyAnchorAtClientPoint(e.clientX, e.clientY, activeStep.key, true);
  };

  const handleAnchorHandlePointerDown = (e, key) => {
    if (!isAdmin) return;
    e.stopPropagation();
    setDraggingKey(key);
    const idx = CALIBRATION_ANCHOR_STEPS.findIndex((step) => step.key === key);
    if (idx >= 0) {
      setActiveStepIdx(idx);
    }
  };

  const handleCanvasPointerMove = (e) => {
    if (!draggingKey || !isAdmin) return;
    applyAnchorAtClientPoint(e.clientX, e.clientY, draggingKey, false);
  };

  const handleCanvasPointerUp = () => {
    if (draggingKey) {
      setDraggingKey('');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;

    const check = await inspectImageFileForUpload(file);
    if (!check.valid) {
      setUploadError(
        check.errorCode === 'UNSUPPORTED_BINARY_FORMAT'
          ? t('media.unsupportedBinaryFormat')
          : check.errorCode === 'INVALID_TYPE'
            ? t('media.invalidFileType')
            : check.errorCode === 'FILE_TOO_LARGE'
              ? t('media.fileTooLarge')
              : t('media.emptyFile')
      );
      e.target.value = '';
      return;
    }

    setUploading(true);
    setUploadError('');
    setUploadStatus(t('media.stepPresign'));

    try {
      const dims = await readBrowserImageDimensions(file);

      const presign = await apiRequest(`/api/v1/admin/bikes/${bike.id}/media/presign`, {
        method: 'POST',
        body: {
          mediaType: 'SIDE_PROFILE_BLUEPRINT',
          mimeType: check.mimeType,
          sizeBytes: file.size,
          originalFileName: check.normalizedFileName,
        },
      });

      setUploadStatus(t('media.stepUpload'));
      const putRes = await fetch(presign.uploadUrl, {
        method: presign.method || 'PUT',
        headers: {
          'Content-Type': check.mimeType,
        },
        body: file,
      });

      if (!putRes.ok) {
        let detail = `PUT upload failed (${putRes.status})`;
        try {
          const errJson = await putRes.json();
          detail = errJson.detail || errJson.message || detail;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }

      setUploadStatus(t('media.stepConfirm'));
      const confirmRes = await apiRequest(`/api/v1/admin/bikes/${bike.id}/media/confirm`, {
        method: 'POST',
        body: {
          storageKey: presign.storageKey,
          declaredMimeType: check.mimeType,
          mediaType: 'SIDE_PROFILE_BLUEPRINT',
          altText: `${bike.name} (SIDE_PROFILE_BLUEPRINT)`,
          widthPx: dims.widthPx,
          heightPx: dims.heightPx,
          isPrimary: uploadIsPrimary,
          sortOrder: blueprintList.length,
        },
      });

      const createdMedia = confirmRes?.media;
      if (createdMedia?.id) {
        setLocalPreviewUrls((prev) => ({
          ...prev,
          [createdMedia.id]: dims.objectUrl,
        }));
        setSelectedMediaId(createdMedia.id);
      } else {
        URL.revokeObjectURL(dims.objectUrl);
      }

      const normNote = check.mimeCorrected
        ? ` · ${t('media.mimeAutoNormalized', {
            detected: check.mimeType,
            declared: check.declaredMime || file.name,
          })}`
        : '';
      setUploadStatus(
        `${confirmRes?.verifiedMime || check.mimeType} · ${dims.widthPx}x${dims.heightPx}px${normNote}`
      );
      await onBikeUpdated();
    } catch (err) {
      setUploadError(localizeApiError(err, locale));
      setUploadStatus('');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSaveCalibration = async () => {
    if (!isAdmin || !selectedMedia) return;
    setSavingCal(true);
    setCalError('');
    setCalFeedback('');

    try {
      const res = await apiRequest(
        `/api/v1/admin/bikes/${bike.id}/media/${selectedMedia.id}/calibration`,
        {
          method: 'PATCH',
          body: calibrationPayload,
        }
      );
      const savedMetrics = res?.metrics;
      setCalFeedback(
        savedMetrics
          ? `pxPerMm=${savedMetrics.pxPerMm} · perspectiveError=${savedMetrics.perspectiveErrorPercent}%`
          : t('common.save')
      );
      await onBikeUpdated();
    } catch (err) {
      setCalError(localizeApiError(err, locale));
    } finally {
      setSavingCal(false);
    }
  };

  const contactTone =
    livePreview.fitResult?.footContact?.contactStatus === 'FLAT_FOOT'
      ? 'flat'
      : livePreview.fitResult?.footContact?.contactStatus === 'BALLS_OF_FEET'
        ? 'balls'
        : livePreview.fitResult?.footContact?.contactStatus === 'TOO_TALL_UNSAFE'
          ? 'unsafe'
          : 'tiptoe';

  return (
    <div className="space-y-6">
      {/* 1. Blueprint Upload Box (Locked strictly to SIDE_PROFILE_BLUEPRINT) */}
      <div className="rounded-sm border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink">
              {t('calibration.uploadTitle')}
            </h3>
            <p className="mt-0.5 text-xs text-ink-secondary">{t('calibration.uploadSubtitle')}</p>
          </div>
          {!isAdmin && (
            <span className="rounded-sm border border-warning-border bg-warning-soft px-2.5 py-1 font-mono text-[11px] font-semibold text-warning">
              {t('calibration.readOnlyBadge')}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-xs font-semibold text-ink">
            {t('calibration.mediaTypes.SIDE_PROFILE_BLUEPRINT')}
          </span>

          <label className="inline-flex items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={uploadIsPrimary}
              onChange={(e) => setUploadIsPrimary(e.target.checked)}
              disabled={!isAdmin || uploading}
              className="accent-signal"
            />
            {t('calibration.setPrimary')}
          </label>

          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-semibold ${
              isAdmin && !uploading
                ? 'bg-ink text-surface hover:bg-signal'
                : 'cursor-not-allowed bg-canvas text-ink-muted'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading
              ? uploadStatus || t('calibration.uploadingBtn')
              : t('calibration.pickFileBtn')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={!isAdmin || uploading}
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        {uploadStatus && <p className="mt-2 font-mono text-xs text-safe">{uploadStatus}</p>}
        {uploadError && (
          <div className="mt-3 rounded-sm border border-danger-border bg-danger-soft px-3 py-2 font-mono text-xs text-danger">
            {uploadError}
          </div>
        )}
      </div>

      {/* 2. Blueprint Selector + Interactive Calibration Workbench */}
      {blueprintList.length === 0 ? (
        <div className="rounded-sm border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-ink-secondary">
          {t('calibration.emptyMedia')}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-12">
          <div className="space-y-3 xl:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink-muted">Blueprint:</span>
                <select
                  value={selectedMedia?.id || ''}
                  onChange={(e) => setSelectedMediaId(e.target.value)}
                  className="rounded-sm border border-line bg-canvas px-2.5 py-1.5 font-mono text-xs text-ink"
                >
                  {blueprintList.map((m, idx) => (
                    <option key={m.id} value={m.id}>
                      #{idx + 1} · {m.mediaType} {m.isPrimary ? '(Primary)' : ''}{' '}
                      {m.calibrationData ? '✓' : ''}
                    </option>
                  ))}
                </select>

                <select
                  value={facing}
                  onChange={(e) => setFacing(e.target.value)}
                  disabled={!isAdmin}
                  className="rounded-sm border border-line bg-canvas px-2.5 py-1.5 font-mono text-xs text-ink"
                >
                  <option value="RIGHT">{t('calibration.facingRight')}</option>
                  <option value="LEFT">{t('calibration.facingLeft')}</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRiderOverlay((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-semibold ${
                    showRiderOverlay
                      ? 'border-signal bg-signal-soft text-signal'
                      : 'border-line bg-canvas text-ink-secondary'
                  }`}
                >
                  {showRiderOverlay ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  {t('calibration.toggleRiderOverlay')}
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setAnchorsUv(DEFAULT_CALIBRATION_ANCHORS);
                      setActiveStepIdx(0);
                    }}
                    className="inline-flex items-center gap-1 rounded-sm border border-line bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-surface"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t('calibration.resetAnchors')}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-signal/40 bg-signal-soft px-3 py-2 text-xs">
              <div className="flex items-center gap-2 font-medium text-ink">
                <Crosshair className="h-4 w-4 text-signal" />
                <span>
                  {t('calibration.activeAnchorBanner', {
                    label: t(activeStep.labelKey),
                    hint: t(activeStep.hintKey),
                  })}
                </span>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-secondary">
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                  className="accent-signal"
                />
                {t('calibration.autoAdvance')}
              </label>
            </div>

            <div
              ref={canvasBoxRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
              className="cad-grid-bg relative select-none overflow-hidden rounded-sm border border-line-strong bg-white"
              style={{
                aspectRatio: `${imageDims.widthPx} / ${imageDims.heightPx}`,
                cursor: isAdmin ? 'crosshair' : 'default',
              }}
            >
              {resolvedImageSrc && !imgBroken ? (
                <img
                  src={resolvedImageSrc}
                  alt={selectedMedia?.altText || bike.name}
                  draggable={false}
                  onError={() => setImgBroken(true)}
                  className="h-full w-full object-fill"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-4 text-center font-mono text-[11px] text-ink-muted">
                  2D UV Calibration Canvas ({selectedMedia?.mediaType || 'SIDE_PROFILE_BLUEPRINT'})
                </div>
              )}

              <svg
                viewBox={livePreview.viewBox}
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                <line
                  x1={0}
                  y1={anchorsUv.groundLineV * imageDims.heightPx}
                  x2={imageDims.widthPx}
                  y2={anchorsUv.groundLineV * imageDims.heightPx}
                  stroke="#15803D"
                  strokeWidth="2.5"
                  strokeDasharray="10 6"
                />
                <line
                  x1={anchorsUv.rearAxle.u * imageDims.widthPx}
                  y1={anchorsUv.rearAxle.v * imageDims.heightPx}
                  x2={anchorsUv.frontAxle.u * imageDims.widthPx}
                  y2={anchorsUv.frontAxle.v * imageDims.heightPx}
                  stroke="#E84C1E"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
                {showRiderOverlay && livePreview.overlayJointsSvg && (
                  <g opacity="0.88">
                    <RiderFigureSvg
                      joints={livePreview.overlayJointsSvg}
                      contactTone={contactTone}
                    />
                  </g>
                )}
              </svg>

              {CALIBRATION_ANCHOR_STEPS.map((step) => {
                if (step.key === 'groundLineV') {
                  return (
                    <div
                      key={step.key}
                      onPointerDown={(e) => handleAnchorHandlePointerDown(e, step.key)}
                      style={{ top: `${anchorsUv.groundLineV * 100}%` }}
                      className="absolute left-2 -translate-y-1/2 cursor-ns-resize rounded-sm border border-safe bg-surface/95 px-2 py-0.5 font-mono text-[10px] font-bold text-safe shadow-sm"
                    >
                      GROUND V={anchorsUv.groundLineV.toFixed(3)}
                    </div>
                  );
                }

                const pt = anchorsUv[step.key];
                const isSelected = activeStep.key === step.key;
                return (
                  <button
                    key={step.key}
                    type="button"
                    onPointerDown={(e) => handleAnchorHandlePointerDown(e, step.key)}
                    title={t(step.labelKey)}
                    style={{
                      left: `${pt.u * 100}%`,
                      top: `${pt.v * 100}%`,
                      borderColor: step.color,
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface p-1.5 shadow transition-transform ${
                      isSelected ? 'z-20 scale-125 ring-2 ring-signal/40' : 'z-10 hover:scale-110'
                    }`}
                  >
                    <span
                      className="block h-2 w-2 rounded-full"
                      style={{ backgroundColor: step.color }}
                    />
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-line bg-surface/95 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink shadow-sm">
                      {step.key}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 xl:col-span-4">
            <div className="space-y-2.5 rounded-sm border border-line bg-surface p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
                {t('calibration.anchorsTitle')}
              </h4>
              <div className="space-y-1.5">
                {CALIBRATION_ANCHOR_STEPS.map((step, idx) => {
                  const isActive = idx === activeStepIdx;
                  const displayVal =
                    step.key === 'groundLineV'
                      ? `v=${anchorsUv.groundLineV.toFixed(3)}`
                      : `u=${anchorsUv[step.key].u.toFixed(3)}, v=${anchorsUv[step.key].v.toFixed(3)}`;

                  return (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => setActiveStepIdx(idx)}
                      className={`flex w-full items-center justify-between rounded-sm border px-3 py-2 text-left text-xs transition-colors ${
                        isActive
                          ? 'border-signal bg-signal-soft text-ink'
                          : 'border-line bg-canvas text-ink-secondary hover:border-line-strong'
                      }`}
                    >
                      <span className="font-medium">{t(step.labelKey)}</span>
                      <span className="font-mono text-[11px] font-semibold tabular-telemetry">
                        {displayVal}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 rounded-sm border border-line bg-surface p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
                {t('calibration.metricsTitle')}
              </h4>

              {!livePreview.isValid ? (
                <div className="space-y-1 rounded-sm border border-danger-border bg-danger-soft p-3 text-xs text-danger">
                  <p className="font-semibold">{t('calibration.invalidAnchors')}</p>
                  {livePreview.validationErrors.map((msg) => (
                    <p key={msg} className="font-mono text-[11px]">
                      • {msg}
                    </p>
                  ))}
                </div>
              ) : livePreview.metrics ? (
                <div className="space-y-2 font-mono text-xs tabular-telemetry">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">pxPerMm:</span>
                    <span className="font-bold text-ink">{livePreview.metrics.pxPerMm} px/mm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Axle Span:</span>
                    <span className="text-ink">{livePreview.metrics.axleSpanPx} px</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Roll:</span>
                    <span className="text-ink">{livePreview.metrics.rollCorrectionDeg}&deg;</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Measured Seat:</span>
                    <span className="text-ink">
                      {livePreview.metrics.measuredSeatHeightMm} mm (Spec:{' '}
                      {bike.geometrySpec?.unladenSeatHeightMm} mm)
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-line pt-2">
                    <span className="text-ink-muted">Perspective Error:</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-bold ${
                        livePreview.metrics.isPerspectiveDistorted
                          ? 'border-warning-border bg-warning-soft text-warning'
                          : 'border-safe-border bg-safe-soft text-safe'
                      }`}
                    >
                      {livePreview.metrics.isPerspectiveDistorted ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      {livePreview.metrics.perspectiveErrorPercent}%
                    </span>
                  </div>
                  {livePreview.fitResult && (
                    <div className="border-t border-line pt-2 text-[11px] text-ink-secondary">
                      {t('calibration.riderPreviewSummary', {
                        status: livePreview.fitResult.footContact.contactStatus,
                        score: livePreview.fitResult.fitScore,
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-ink-muted">{t('calibration.noGeometrySpec')}</p>
              )}

              {calError && (
                <div className="rounded-sm border border-danger-border bg-danger-soft p-2.5 font-mono text-xs text-danger">
                  {calError}
                </div>
              )}
              {calFeedback && (
                <div className="rounded-sm border border-safe-border bg-safe-soft p-2.5 text-xs text-safe">
                  {calFeedback}
                </div>
              )}

              <button
                type="button"
                disabled={!isAdmin || savingCal || !livePreview.isValid}
                onClick={handleSaveCalibration}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-ink px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-surface transition-colors hover:bg-signal disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                {savingCal
                  ? t('calibration.savingCalibration')
                  : t('calibration.saveCalibrationBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
