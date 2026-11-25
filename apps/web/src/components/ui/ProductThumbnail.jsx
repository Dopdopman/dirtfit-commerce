'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wrench } from 'lucide-react';
import { resolveClientMediaUrl } from '@/lib/media-helpers';

const SIZE_CLASSES = Object.freeze({
  xs: 'h-10 w-12',
  sm: 'h-12 w-16',
  md: 'h-16 w-24 sm:h-20 sm:w-28',
});

/**
 * Resilient product thumbnail with automatic fallback to crisp bike wireframe SVG
 * or Industrial Technical SKU card when no real photo is available or URL fails.
 * @param {object} props
 * @param {'BIKE'|'ACCESSORY'} [props.itemType]
 * @param {string|null|undefined} [props.src]
 * @param {string} [props.alt]
 * @param {string|null|undefined} [props.sku]
 * @param {string|null|undefined} [props.href]
 * @param {'xs'|'sm'|'md'} [props.size]
 * @param {boolean} [props.openInNewTab]
 * @param {string} [props.className]
 * @returns {import('react').JSX.Element}
 */
export default function ProductThumbnail({
  itemType = 'BIKE',
  src,
  alt = '',
  sku,
  href,
  size = 'md',
  openInNewTab = false,
  className = '',
}) {
  const resolvedSrc = resolveClientMediaUrl(src);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [resolvedSrc]);

  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const showPhoto = Boolean(resolvedSrc && !imgFailed);
  const shortSku = typeof sku === 'string' && sku.trim() ? sku.trim().slice(0, 12) : null;

  const frame = (
    <div
      className={`relative shrink-0 overflow-hidden rounded-sm border border-line bg-canvas ${sizeClass} ${className}`}
    >
      {showPhoto ? (
        <img
          src={resolvedSrc}
          alt={alt || shortSku || itemType}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className={
            itemType === 'ACCESSORY'
              ? 'h-full w-full object-contain p-1'
              : 'h-full w-full object-cover'
          }
        />
      ) : itemType === 'BIKE' ? (
        <div className="cad-grid-bg flex h-full w-full items-center justify-center p-1">
          <svg
            viewBox="0 0 80 48"
            className="h-full w-full text-ink-secondary"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <circle cx="18" cy="34" r="9.5" />
            <circle cx="62" cy="34" r="10.5" />
            <path d="M18 34 L34 26 L49 18 L62 34" />
            <path d="M27 22 L44 21 L51 12 L58 13" />
            <line x1="6" y1="44" x2="74" y2="44" strokeOpacity="0.35" strokeWidth="1.2" />
          </svg>
        </div>
      ) : (
        <div className="cad-grid-bg flex h-full w-full flex-col items-center justify-center px-1 text-center">
          <Wrench className={size === 'xs' ? 'h-3.5 w-3.5 text-signal' : 'h-4 w-4 text-signal'} />
          {size !== 'xs' && shortSku && (
            <span className="mt-0.5 max-w-full truncate font-mono text-[8px] font-bold uppercase text-ink-secondary">
              {shortSku}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (typeof href === 'string' && href.startsWith('/') && !href.startsWith('//')) {
    return (
      <Link
        href={href}
        target={openInNewTab ? '_blank' : undefined}
        rel={openInNewTab ? 'noopener noreferrer' : undefined}
        className="inline-block shrink-0 transition-opacity hover:opacity-90"
        title={alt || shortSku || undefined}
      >
        {frame}
      </Link>
    );
  }

  return frame;
}
