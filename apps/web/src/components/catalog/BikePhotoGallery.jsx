'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import { buildParametricWireframe, worldToSvg } from '@dirtfit/ergonomics-engine';
import ParametricBikeSvg from '@/components/simulator/ParametricBikeSvg';
import { getBikeCardMedia } from '@/lib/media-helpers';
import { useI18n } from '@/providers/I18nProvider';

const GALLERY_WIREFRAME_VIEWPORT = Object.freeze({
  originSvgX: 112,
  originSvgY: 224,
  pxPerMm: 0.21,
});

/**
 * Motorcycle Real Photo Gallery with Studio-Frame Thumbnail Strip, Radix Lightbox,
 * and automatic 2D Parametric Wireframe SVG fallback when no real photos are live.
 * @param {object} props
 * @param {object} props.bike
 * @returns {import('react').JSX.Element}
 */
export default function BikePhotoGallery({ bike }) {
  const { t } = useI18n();
  const { galleryImages } = useMemo(() => getBikeCardMedia(bike), [bike]);
  const [failedIds, setFailedIds] = useState(() => new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const visiblePhotos = useMemo(
    () => galleryImages.filter((item) => !failedIds.has(item.id)),
    [galleryImages, failedIds]
  );

  useEffect(() => {
    setFailedIds(new Set());
    setActiveIndex(0);
  }, [bike?.id]);

  useEffect(() => {
    if (activeIndex >= visiblePhotos.length && visiblePhotos.length > 0) {
      setActiveIndex(0);
    }
  }, [activeIndex, visiblePhotos.length]);

  useEffect(() => {
    if (!lightboxOpen || visiblePhotos.length <= 1) {
      return undefined;
    }
    const onKeyDown = (e) => {
      if (e.key === 'ArrowRight') {
        setActiveIndex((prev) => (prev + 1) % visiblePhotos.length);
      } else if (e.key === 'ArrowLeft') {
        setActiveIndex((prev) => (prev - 1 + visiblePhotos.length) % visiblePhotos.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxOpen, visiblePhotos.length]);

  const fallbackWireframe = useMemo(() => {
    if (!bike?.geometrySpec) {
      return null;
    }
    const wireframeMm = buildParametricWireframe(bike.geometrySpec);
    const projectPt = (pt) => worldToSvg(pt, GALLERY_WIREFRAME_VIEWPORT);
    const scaleLen = (mm) => Math.round(mm * GALLERY_WIREFRAME_VIEWPORT.pxPerMm * 10) / 10;
    return {
      rearWheel: {
        center: projectPt(wireframeMm.rearWheel.center),
        tireRadiusPx: scaleLen(wireframeMm.rearWheel.tireRadiusMm),
        rimRadiusPx: scaleLen(wireframeMm.rearWheel.rimRadiusMm),
      },
      frontWheel: {
        center: projectPt(wireframeMm.frontWheel.center),
        tireRadiusPx: scaleLen(wireframeMm.frontWheel.tireRadiusMm),
        rimRadiusPx: scaleLen(wireframeMm.frontWheel.rimRadiusMm),
      },
      swingarm: wireframeMm.swingarm.map(projectPt),
      forkLine: wireframeMm.forkLine.map(projectPt),
      chassisLoop: wireframeMm.chassisLoop.map(projectPt),
      seatProfile: wireframeMm.seatProfile.map(projectPt),
      handlebar: wireframeMm.handlebar.map(projectPt),
      footpeg: projectPt(wireframeMm.footpeg),
      groundLine: wireframeMm.groundLine.map(projectPt),
    };
  }, [bike?.geometrySpec]);

  const markPhotoFailed = (photoId) => {
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.add(photoId);
      return next;
    });
  };

  if (visiblePhotos.length === 0) {
    return (
      <div className="space-y-3">
        <div className="cad-grid-bg relative aspect-[16/10] w-full overflow-hidden border border-line bg-canvas">
          {fallbackWireframe && (
            <svg
              viewBox="0 0 560 270"
              className="h-full w-full"
              aria-label={`${bike.name} 2D wireframe blueprint`}
            >
              <line
                x1="20"
                y1={GALLERY_WIREFRAME_VIEWPORT.originSvgY}
                x2="540"
                y2={GALLERY_WIREFRAME_VIEWPORT.originSvgY}
                stroke="#1C1E21"
                strokeOpacity="0.25"
                strokeWidth="1.5"
              />
              <ParametricBikeSvg svgWireframe={fallbackWireframe} />
            </svg>
          )}

          <div className="absolute bottom-3 left-3 rounded-sm border border-line-strong bg-surface/95 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-secondary">
            {t('media.specPreviewBadge')}
          </div>

          <a
            href="#simulator"
            className="absolute bottom-3 right-3 rounded-sm border border-signal bg-surface/95 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-signal transition-colors hover:bg-signal hover:text-surface"
          >
            {t('media.jumpToSimulator')} &darr;
          </a>
        </div>
      </div>
    );
  }

  const activePhoto = visiblePhotos[activeIndex] ?? visiblePhotos[0];
  const counterLabel = `${String(activeIndex + 1).padStart(2, '0')} / ${String(
    visiblePhotos.length
  ).padStart(2, '0')}`;

  return (
    <div className="space-y-3">
      {/* Main Studio Frame */}
      <div className="group relative aspect-[16/10] w-full overflow-hidden border border-line bg-canvas">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="block h-full w-full cursor-zoom-in p-2"
          aria-label={t('media.openLightbox')}
        >
          <img
            src={activePhoto.url}
            alt={activePhoto.altText || bike.name}
            onError={() => markPhotoFailed(activePhoto.id)}
            className="h-full w-full object-contain"
          />
        </button>

        {visiblePhotos.length > 1 && (
          <>
            <button
              type="button"
              aria-label={t('media.prevPhoto')}
              onClick={() =>
                setActiveIndex((prev) => (prev - 1 + visiblePhotos.length) % visiblePhotos.length)
              }
              className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-sm border border-line-strong bg-surface/90 p-1.5 text-ink shadow-sm transition-colors hover:border-signal hover:text-signal"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={t('media.nextPhoto')}
              onClick={() => setActiveIndex((prev) => (prev + 1) % visiblePhotos.length)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm border border-line-strong bg-surface/90 p-1.5 text-ink shadow-sm transition-colors hover:border-signal hover:text-signal"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        <div className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-sm border border-line bg-surface/90 px-2 py-0.5 font-mono text-[10px] font-bold text-ink tabular-telemetry">
          {counterLabel}
        </div>

        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
          <a
            href="#simulator"
            className="rounded-sm border border-line-strong bg-surface/95 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink transition-colors hover:border-signal hover:text-signal"
          >
            {t('media.fitReadyBadge')}
          </a>
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={t('media.openLightbox')}
            className="rounded-sm border border-line-strong bg-surface/95 p-1 text-ink transition-colors hover:border-signal hover:text-signal"
          >
            <Expand className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Thumbnail Strip */}
      {visiblePhotos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {visiblePhotos.map((photo, idx) => {
            const isSelected = idx === activeIndex;
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-sm border bg-canvas transition-all ${
                  isSelected
                    ? 'border-signal ring-1 ring-signal'
                    : 'border-line opacity-80 hover:border-line-strong hover:opacity-100'
                }`}
              >
                <img
                  src={photo.url}
                  alt={photo.altText || `${bike.name} ${idx + 1}`}
                  loading="lazy"
                  onError={() => markPhotoFailed(photo.id)}
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Fullscreen Radix Dialog Lightbox */}
      <Dialog.Root open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/90 backdrop-blur-xs" />
          <Dialog.Content className="fixed inset-4 z-50 flex flex-col items-center justify-center focus:outline-none">
            <Dialog.Title className="sr-only">
              {bike.name} — {counterLabel}
            </Dialog.Title>

            <div className="relative flex max-h-[85vh] max-w-[92vw] items-center justify-center">
              <img
                src={activePhoto.url}
                alt={activePhoto.altText || bike.name}
                className="max-h-[82vh] max-w-[90vw] rounded-sm border border-line-strong bg-surface object-contain shadow-2xl"
              />

              {visiblePhotos.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label={t('media.prevPhoto')}
                    onClick={() =>
                      setActiveIndex(
                        (prev) => (prev - 1 + visiblePhotos.length) % visiblePhotos.length
                      )
                    }
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-sm border border-line bg-surface/95 p-2 text-ink shadow-md hover:border-signal hover:text-signal"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('media.nextPhoto')}
                    onClick={() => setActiveIndex((prev) => (prev + 1) % visiblePhotos.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm border border-line bg-surface/95 p-2 text-ink shadow-md hover:border-signal hover:text-signal"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            <div className="mt-3 flex items-center gap-4 rounded-sm border border-line-strong bg-surface px-4 py-1.5 font-mono text-xs text-ink">
              <span className="font-bold tabular-telemetry">{counterLabel}</span>
              <span className="text-ink-secondary">{activePhoto.altText || bike.name}</span>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label={t('media.closeLightbox')}
                  className="inline-flex items-center gap-1 rounded-sm border border-line px-2 py-0.5 text-[11px] font-semibold text-ink hover:border-signal hover:text-signal"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>ESC</span>
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
