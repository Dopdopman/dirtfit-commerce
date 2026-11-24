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
import { ApiError, apiRequest } from '@/lib/api-client';
import {
  CALIBRATION_ANCHOR_STEPS,
  DEFAULT_CALIBRATION_ANCHORS,
  buildCalibrationPayload,
  clientPointToUv,
  computeLiveCalibrationPreview,
} from '@/lib/calibration-helpers';

/**
 * Interactive 2D Blueprint Upload (3-step Presign -> PUT -> Confirm) & 6-Anchor UV Calibration Tool.
 * Includes real-time pxPerMm/perspective distortion check and live 170cm Rider SVG Overlay preview.
 * @param {object} props
 * @param {object} props.bike
 * @param {boolean} props.isAdmin
 * @param {() => Promise<void>} props.onBikeUpdated
 * @returns {import('react').JSX.Element}
 */
export default function BlueprintCalibrationTool({ bike, isAdmin, onBikeUpdated }) {
  const mediaList = useMemo(() => bike.media ?? [], [bike.media]);
  const [selectedMediaId, setSelectedMediaId] = useState(
    () =>
      mediaList.find((m) => m.mediaType === 'SIDE_PROFILE_BLUEPRINT' && m.isPrimary)?.id ??
      mediaList.find((m) => m.mediaType === 'SIDE_PROFILE_BLUEPRINT')?.id ??
      mediaList[0]?.id ??
      ''
  );

  // Store local objectURLs for newly uploaded dev/local-mock files so immediate preview works even if cdn.dirtfit.vn is unmapped locally
  const [localPreviewUrls, setLocalPreviewUrls] = useState({});
  const [uploadMediaType, setUploadMediaType] = useState('SIDE_PROFILE_BLUEPRINT');
  const [uploadIsPrimary, setUploadIsPrimary] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');

  const selectedMedia = useMemo(
    () => mediaList.find((m) => m.id === selectedMediaId) ?? mediaList[0] ?? null,
    [mediaList, selectedMediaId]
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
    return selectedMedia.url || '';
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

  const readImageDimensions = (file) =>
    new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({
          objectUrl,
          widthPx: Math.max(200, Math.min(8000, img.naturalWidth || 1200)),
          heightPx: Math.max(200, Math.min(8000, img.naturalHeight || 800)),
        });
      };
      img.onerror = () => {
        resolve({ objectUrl, widthPx: 1200, heightPx: 800 });
      };
      img.src = objectUrl;
    });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;

    setUploading(true);
    setUploadError('');
    setUploadStatus('Đang xin quyền Presign Upload...');

    try {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      const declaredMime = allowedTypes.includes(file.type) ? file.type : 'image/png';
      const dims = await readImageDimensions(file);

      // Step 1: Presign
      const presignRes = await apiRequest('/api/v1/admin/media/presign', {
        method: 'POST',
        body: {
          bikeId: bike.id,
          mediaType: uploadMediaType,
          mimeType: declaredMime,
          sizeBytes: file.size,
          originalFileName: file.name.slice(0, 180),
        },
      });
      const presign = presignRes.data;

      // Step 2: Binary PUT
      setUploadStatus('Đang tải file nhị phân lên Storage...');
      const putRes = await fetch(presign.uploadUrl, {
        method: presign.method || 'PUT',
        headers: {
          'content-type': declaredMime,
        },
        body: file,
      });

      if (!putRes.ok) {
        let detail = `Tải file thất bại (${putRes.status}).`;
        try {
          const errJson = await putRes.json();
          detail = errJson.detail || errJson.message || detail;
        } catch {
          // ignore parse errors
        }
        throw new Error(detail);
      }

      // Step 3: Confirm & 4KB Magic Bytes check
      setUploadStatus('Đang kiểm tra 4KB Magic Bytes tại Server...');
      const confirmRes = await apiRequest('/api/v1/admin/media/confirm', {
        method: 'POST',
        body: {
          bikeId: bike.id,
          storageKey: presign.storageKey,
          declaredMimeType: declaredMime,
          mediaType: uploadMediaType,
          altText: `${bike.name} (${uploadMediaType})`,
          widthPx: dims.widthPx,
          heightPx: dims.heightPx,
          isPrimary: uploadIsPrimary,
          sortOrder: mediaList.length,
        },
      });

      const createdMedia = confirmRes.data?.media;
      if (createdMedia?.id) {
        setLocalPreviewUrls((prev) => ({
          ...prev,
          [createdMedia.id]: dims.objectUrl,
        }));
        setSelectedMediaId(createdMedia.id);
      }

      setUploadStatus(
        `Upload thành công (${confirmRes.data?.verifiedMime || declaredMime}, ${dims.widthPx}x${dims.heightPx}px).`
      );
      await onBikeUpdated();
    } catch (err) {
      if (err instanceof ApiError) {
        setUploadError(
          `[${err.code || `HTTP_${err.status}`}] ${err.title ? `${err.title}: ` : ''}${err.detail || err.message}`
        );
      } else {
        setUploadError(err instanceof Error ? err.message : 'Upload thất bại.');
      }
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
      const savedMetrics = res.data?.metrics;
      setCalFeedback(
        savedMetrics
          ? `Đã lưu calibration! pxPerMm=${savedMetrics.pxPerMm}, sai số phối cảnh=${savedMetrics.perspectiveErrorPercent}%.`
          : 'Đã lưu calibration UV thành công!'
      );
      await onBikeUpdated();
    } catch (err) {
      if (err instanceof ApiError) {
        setCalError(`[${err.code}] ${err.detail || err.message}`);
      } else {
        setCalError('Không thể lưu dữ liệu calibration.');
      }
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
      {/* 1. Upload Box (Presign -> PUT -> Confirm) */}
      <div className="rounded-sm border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink">
              Tải lên Ảnh xe / Blueprint ngang (Presign -&gt; PUT -&gt; 4KB Magic Bytes)
            </h3>
            <p className="mt-0.5 text-xs text-ink-secondary">
              Chỉ chấp nhận JPEG, PNG, WebP tối đa 5MB. Server tự động kiểm tra Magic Bytes và xóa
              ngay file giả mạo.
            </p>
          </div>
          {!isAdmin && (
            <span className="rounded-sm border border-warning-border bg-warning-soft px-2.5 py-1 font-mono text-[11px] font-semibold text-warning">
              CHẾ ĐỘ XEM (CHỈ ADMIN ĐƯỢC UPLOAD / CALIBRATE)
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            value={uploadMediaType}
            onChange={(e) => setUploadMediaType(e.target.value)}
            disabled={!isAdmin || uploading}
            className="rounded-sm border border-line bg-canvas px-3 py-2 text-xs text-ink"
          >
            <option value="SIDE_PROFILE_BLUEPRINT">SIDE_PROFILE_BLUEPRINT (Ảnh hiệu chuẩn)</option>
            <option value="GALLERY">GALLERY (Ảnh thư viện)</option>
            <option value="SPEC_SHEET">SPEC_SHEET (Bảng thông số)</option>
          </select>

          <label className="inline-flex items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={uploadIsPrimary}
              onChange={(e) => setUploadIsPrimary(e.target.checked)}
              disabled={!isAdmin || uploading}
              className="accent-signal"
            />
            Đặt làm Blueprint/Ảnh chính (isPrimary)
          </label>

          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-semibold ${
              isAdmin && !uploading
                ? 'bg-ink text-surface hover:bg-signal'
                : 'cursor-not-allowed bg-canvas text-ink-muted'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Đang xử lý...' : 'Chọn ảnh Upload'}
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

      {/* 2. Media Selector + Interactive Calibration Workbench */}
      {mediaList.length === 0 ? (
        <div className="rounded-sm border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-ink-secondary">
          Xe này chưa có ảnh hoặc blueprint nào. Hãy tải lên ảnh Side Profile để bắt đầu hiệu chuẩn
          6 điểm neo UV.
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-12">
          {/* Left 8 cols: Interactive UV Canvas */}
          <div className="space-y-3 xl:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink-muted">Media:</span>
                <select
                  value={selectedMedia?.id || ''}
                  onChange={(e) => setSelectedMediaId(e.target.value)}
                  className="rounded-sm border border-line bg-canvas px-2.5 py-1.5 font-mono text-xs text-ink"
                >
                  {mediaList.map((m, idx) => (
                    <option key={m.id} value={m.id}>
                      #{idx + 1} · {m.mediaType} {m.isPrimary ? '(Primary)' : ''}{' '}
                      {m.calibrationData ? '✓ Calibrated' : ''}
                    </option>
                  ))}
                </select>

                <select
                  value={facing}
                  onChange={(e) => setFacing(e.target.value)}
                  disabled={!isAdmin}
                  className="rounded-sm border border-line bg-canvas px-2.5 py-1.5 font-mono text-xs text-ink"
                >
                  <option value="RIGHT">Hướng xe: RIGHT (Đầu xe bên phải)</option>
                  <option value="LEFT">Hướng xe: LEFT (Đầu xe bên trái)</option>
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
                  Overlay 170cm Rider
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
                    Reset neo
                  </button>
                )}
              </div>
            </div>

            {/* Active Anchor Hint Banner */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-signal/40 bg-signal-soft px-3 py-2 text-xs">
              <div className="flex items-center gap-2 font-medium text-ink">
                <Crosshair className="h-4 w-4 text-signal" />
                <span>
                  Đang đặt điểm: <strong>{activeStep.label}</strong> — {activeStep.hint}
                </span>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-secondary">
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                  className="accent-signal"
                />
                Tự chuyển điểm kế tiếp sau khi click
              </label>
            </div>

            {/* Canvas Container */}
            <div
              ref={canvasBoxRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
              className="relative select-none overflow-hidden rounded-sm border border-line-strong bg-white"
              style={{
                aspectRatio: `${imageDims.widthPx} / ${imageDims.heightPx}`,
                cursor: isAdmin ? 'crosshair' : 'default',
              }}
            >
              {/* Background Technical Grid + Uploaded Image */}
              {resolvedImageSrc && (
                <img
                  src={resolvedImageSrc}
                  alt={selectedMedia?.altText || bike.name}
                  draggable={false}
                  className="h-full w-full object-fill"
                />
              )}

              {/* Precision Overlay SVG (exact 1:1 image natural coordinates) */}
              <svg
                viewBox={livePreview.viewBox}
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {/* Ground Line */}
                <line
                  x1={0}
                  y1={anchorsUv.groundLineV * imageDims.heightPx}
                  x2={imageDims.widthPx}
                  y2={anchorsUv.groundLineV * imageDims.heightPx}
                  stroke="#15803D"
                  strokeWidth="2.5"
                  strokeDasharray="10 6"
                />
                {/* Axle-to-Axle Baseline */}
                <line
                  x1={anchorsUv.rearAxle.u * imageDims.widthPx}
                  y1={anchorsUv.rearAxle.v * imageDims.heightPx}
                  x2={anchorsUv.frontAxle.u * imageDims.widthPx}
                  y2={anchorsUv.frontAxle.v * imageDims.heightPx}
                  stroke="#E84C1E"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />

                {/* Live 170cm Rider Silhouette Preview */}
                {showRiderOverlay && livePreview.overlayJointsSvg && (
                  <g opacity="0.88">
                    <RiderFigureSvg
                      joints={livePreview.overlayJointsSvg}
                      contactTone={contactTone}
                    />
                  </g>
                )}
              </svg>

              {/* Draggable UV Anchor Handles */}
              {CALIBRATION_ANCHOR_STEPS.map((step) => {
                if (step.key === 'groundLineV') {
                  return (
                    <div
                      key={step.key}
                      onPointerDown={(e) => handleAnchorHandlePointerDown(e, step.key)}
                      style={{
                        top: `${anchorsUv.groundLineV * 100}%`,
                      }}
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
                    title={step.label}
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

          {/* Right 4 cols: 6 Anchor Coordinates & Real-Time Metrics */}
          <div className="space-y-4 xl:col-span-4">
            <div className="rounded-sm border border-line bg-surface p-4 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
                6 Điểm neo UV [0..1]
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
                      <span className="font-medium">{step.label}</span>
                      <span className="font-mono text-[11px] font-semibold tabular-telemetry">
                        {displayVal}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Real-Time Metrics from @dirtfit/ergonomics-engine */}
            <div className="rounded-sm border border-line bg-surface p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
                Kiểm tra Tỷ lệ & Độ méo Phối cảnh
              </h4>

              {!livePreview.isValid ? (
                <div className="rounded-sm border border-danger-border bg-danger-soft p-3 text-xs text-danger space-y-1">
                  <p className="font-semibold">Tọa độ neo chưa hợp lệ:</p>
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
                    <span className="text-ink-muted">Góc nghiêng Roll:</span>
                    <span className="text-ink">{livePreview.metrics.rollCorrectionDeg}&deg;</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Seat Height đo được:</span>
                    <span className="text-ink">
                      {livePreview.metrics.measuredSeatHeightMm} mm (Spec:{' '}
                      {bike.geometrySpec?.unladenSeatHeightMm} mm)
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-line pt-2">
                    <span className="text-ink-muted">Sai số phối cảnh:</span>
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
                      Preview Rider 170cm / 65kg:{' '}
                      <strong className="text-ink">
                        {livePreview.fitResult.footContact.contactStatus}
                      </strong>{' '}
                      (Score {livePreview.fitResult.fitScore}/100)
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-ink-muted">
                  Chưa có thông số hình học (`BikeGeometrySpec`) để tính `pxPerMm`.
                </p>
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
                {savingCal ? 'Đang lưu Calibration...' : 'Lưu Calibration UV (PATCH)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
