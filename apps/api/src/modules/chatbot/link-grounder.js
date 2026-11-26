import { foldVietnameseText } from '@dirtfit/knowledge/retriever';

const MARKDOWN_LINK_REGEX = /\[([^\]\n]{1,140})\]\(((?:[^()\s]|\([^()\s]*\)){1,220})\)/g;
const PROTECTED_SEGMENT_REGEX =
  /(\[[^\]\n]{1,140}\]\((?:[^()\s]|\([^()\s]*\)){1,220}\)|`[^`\n]+`)/g;
const SAFE_STATIC_INTERNAL_PATH_REGEX =
  /^\/(?:bikes|accessories|compare|test-ride|cart|account|policies\/(?:ordering|terms|warranty|rider-fit))(?:#[a-zA-Z0-9._-]+)?$/;
const SAFE_BIKE_PATH_REGEX =
  /^\/bikes\/([a-zA-Z0-9._-]+)(\?[a-zA-Z0-9._=&%-]+)?(#[a-zA-Z0-9._-]+)?$/;

function hasUnsafePathChars(rawHref) {
  if (typeof rawHref !== 'string') {
    return true;
  }
  const trimmed = rawHref.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return true;
  }
  return /(?:^|\/)\.\.(?:\/|$)|%2e%2e|%2f|%5c/i.test(trimmed);
}

/**
 * Verify static/policy internal paths against a tight non-admin allowlist.
 * @param {string} rawHref
 * @returns {boolean}
 */
function isSafeStaticInternalPath(rawHref) {
  if (hasUnsafePathChars(rawHref)) {
    return false;
  }
  return SAFE_STATIC_INTERNAL_PATH_REGEX.test(rawHref.trim());
}

/**
 * Extract deduplicated ACTIVE compatible accessories across live catalog bikes.
 * @param {Array<object>} [liveBikes]
 * @returns {Array<{ id: string|null, sku: string, name: string }>}
 */
export function extractGroundedAccessories(liveBikes = []) {
  const bySku = new Map();
  if (!Array.isArray(liveBikes)) {
    return [];
  }

  for (const bike of liveBikes) {
    for (const comp of bike?.compatibilities ?? []) {
      const acc = comp?.accessory;
      if (!acc?.sku || !acc?.name) {
        continue;
      }
      if (acc.status && acc.status !== 'ACTIVE') {
        continue;
      }
      const key = String(acc.sku).trim().toUpperCase();
      if (!key || bySku.has(key)) {
        continue;
      }
      bySku.set(key, {
        id: acc.id ?? null,
        sku: String(acc.sku).trim(),
        name: String(acc.name).trim(),
      });
    }
  }

  return Array.from(bySku.values());
}

function splitProtectedSegments(text) {
  const segments = [];
  let lastIndex = 0;
  PROTECTED_SEGMENT_REGEX.lastIndex = 0;

  let match;
  while ((match = PROTECTED_SEGMENT_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), protected: false });
    }
    segments.push({ text: match[0], protected: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), protected: false });
  }

  return segments;
}

function foldWithIndexMap(input) {
  let folded = '';
  const origStarts = [];
  const origEnds = [];

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const foldedCh = foldVietnameseText(ch);
    for (let k = 0; k < foldedCh.length; k += 1) {
      folded += foldedCh[k];
      origStarts.push(i);
      origEnds.push(i + 1);
    }
  }

  return { folded, origStarts, origEnds };
}

function isWordBoundaryOk(folded, startIdx, endIdx) {
  const beforeOk = startIdx === 0 || !/[a-z0-9]/.test(folded[startIdx - 1]);
  const afterOk = endIdx === folded.length || !/[a-z0-9]/.test(folded[endIdx]);
  return beforeOk && afterOk;
}

function linkFirstOccurrence(segments, needleName, href) {
  const foldedNeedle = foldVietnameseText(String(needleName ?? '')).trim();
  if (foldedNeedle.length < 4) {
    return false;
  }

  for (let sIdx = 0; sIdx < segments.length; sIdx += 1) {
    const seg = segments[sIdx];
    if (seg.protected || !seg.text) {
      continue;
    }

    const { folded, origStarts, origEnds } = foldWithIndexMap(seg.text);
    let searchFrom = 0;

    while (searchFrom <= folded.length - foldedNeedle.length) {
      const matchIdx = folded.indexOf(foldedNeedle, searchFrom);
      if (matchIdx === -1) {
        break;
      }
      const endIdx = matchIdx + foldedNeedle.length;
      if (isWordBoundaryOk(folded, matchIdx, endIdx)) {
        const origStart = origStarts[matchIdx];
        const origEnd = origEnds[endIdx - 1];
        const origText = seg.text.slice(origStart, origEnd);
        const replacement = [];

        if (origStart > 0) {
          replacement.push({ text: seg.text.slice(0, origStart), protected: false });
        }
        replacement.push({ text: `[${origText}](${href})`, protected: true });
        if (origEnd < seg.text.length) {
          replacement.push({ text: seg.text.slice(origEnd), protected: false });
        }

        segments.splice(sIdx, 1, ...replacement);
        return true;
      }
      searchFrom = matchIdx + 1;
    }
  }

  return false;
}

/**
 * Enforce grounded internal Markdown links on assistant answers:
 * Pass 1 validates/repairs/strips existing links (blocking hallucinated slugs & external/XSS URLs).
 * Pass 2 safely auto-links first unlinked occurrences of grounded bikes and accessories.
 * Pure JS, zero DB/network I/O.
 * @param {string} answer
 * @param {Array<object>} [groundedBikes]
 * @param {Array<object>} [groundedAccessories]
 * @returns {string}
 */
export function linkifyGroundedProducts(answer, groundedBikes = [], groundedAccessories = []) {
  if (typeof answer !== 'string' || !answer.trim()) {
    return typeof answer === 'string' ? answer : '';
  }

  const validBikes = Array.isArray(groundedBikes)
    ? groundedBikes.filter((b) => b?.slug && b?.name)
    : [];
  const validBikesBySlug = new Map();
  const validBikesByFoldedName = new Map();
  const validBikesByCompactName = new Map();

  for (const bike of validBikes) {
    const slugLower = String(bike.slug).trim().toLowerCase();
    const foldedName = foldVietnameseText(bike.name).trim();
    const compactName = foldedName.replace(/[^a-z0-9]+/g, '');
    validBikesBySlug.set(slugLower, bike);
    if (foldedName) {
      validBikesByFoldedName.set(foldedName, bike);
    }
    if (compactName.length >= 4) {
      validBikesByCompactName.set(compactName, bike);
    }
  }

  const mergedAccessories = new Map();
  for (const acc of extractGroundedAccessories(validBikes)) {
    mergedAccessories.set(acc.sku.toUpperCase(), acc);
  }
  if (Array.isArray(groundedAccessories)) {
    for (const acc of groundedAccessories) {
      if (acc?.sku && acc?.name) {
        const key = String(acc.sku).trim().toUpperCase();
        if (!mergedAccessories.has(key)) {
          mergedAccessories.set(key, {
            id: acc.id ?? null,
            sku: String(acc.sku).trim(),
            name: String(acc.name).trim(),
          });
        }
      }
    }
  }

  const linkedBikeSlugs = new Set();
  const linkedAccessorySkus = new Set();

  // Pass 1: Validate, repair wrong slugs, or strip hallucinated/unsafe links
  const pass1 = answer.replace(MARKDOWN_LINK_REGEX, (_full, rawLabel, rawHref) => {
    const href = String(rawHref ?? '').trim();
    const plainLabel = String(rawLabel ?? '')
      .replace(/^\*\*|\*\*$/g, '')
      .trim();

    if (hasUnsafePathChars(href)) {
      return rawLabel;
    }

    const bikeMatch = href.match(SAFE_BIKE_PATH_REGEX);
    if (bikeMatch) {
      const candidateSlug = bikeMatch[1].toLowerCase();
      const matchedBike = validBikesBySlug.get(candidateSlug);
      if (matchedBike) {
        linkedBikeSlugs.add(matchedBike.slug.toLowerCase());
        return `[${rawLabel}](${href})`;
      }

      const foldedLabel = foldVietnameseText(plainLabel);
      const compactLabel = foldedLabel.replace(/[^a-z0-9]+/g, '');
      const repairedBike =
        validBikesByFoldedName.get(foldedLabel) || validBikesByCompactName.get(compactLabel);
      if (repairedBike) {
        linkedBikeSlugs.add(repairedBike.slug.toLowerCase());
        return `[${rawLabel}](/bikes/${repairedBike.slug})`;
      }

      return rawLabel;
    }

    if (href.startsWith('/accessories?')) {
      const qs = new URLSearchParams(href.slice('/accessories?'.length));
      const candidateSku = (qs.get('sku') ?? '').trim().toUpperCase();
      const matchedAcc = candidateSku ? mergedAccessories.get(candidateSku) : null;
      if (matchedAcc) {
        linkedAccessorySkus.add(matchedAcc.sku.toUpperCase());
        return `[${rawLabel}](/accessories?sku=${encodeURIComponent(matchedAcc.sku)})`;
      }
      return rawLabel;
    }

    if (href.startsWith('/compare?')) {
      const qs = new URLSearchParams(href.slice('/compare?'.length));
      const bikeA = (qs.get('bikeA') ?? '').trim().toLowerCase();
      const bikeB = (qs.get('bikeB') ?? '').trim().toLowerCase();
      const validA = bikeA ? validBikesBySlug.get(bikeA) : null;
      const validB = bikeB ? validBikesBySlug.get(bikeB) : null;
      if (validA && validB) {
        return `[${rawLabel}](/compare?bikeA=${encodeURIComponent(validA.slug)}&bikeB=${encodeURIComponent(validB.slug)})`;
      }
      if (/(compare|so sanh|ghost)/i.test(foldVietnameseText(plainLabel))) {
        return `[${rawLabel}](/compare)`;
      }
      return rawLabel;
    }

    if (isSafeStaticInternalPath(href)) {
      return `[${rawLabel}](${href})`;
    }

    return rawLabel;
  });

  // Pass 2: Auto-link first unlinked grounded bike & accessory mentions safely (longest first)
  const segments = splitProtectedSegments(pass1);

  const sortedBikes = [...validBikes].sort((a, b) => String(b.name).length - String(a.name).length);
  for (const bike of sortedBikes) {
    const slugLower = String(bike.slug).toLowerCase();
    if (linkedBikeSlugs.has(slugLower)) {
      continue;
    }
    if (linkFirstOccurrence(segments, bike.name, `/bikes/${bike.slug}`)) {
      linkedBikeSlugs.add(slugLower);
    }
  }

  const sortedAccessories = Array.from(mergedAccessories.values()).sort((a, b) =>
    a.name.length < b.name.length ? 1 : -1
  );
  for (const acc of sortedAccessories) {
    const skuKey = acc.sku.toUpperCase();
    if (acc.name.length < 6 || linkedAccessorySkus.has(skuKey)) {
      continue;
    }
    if (
      linkFirstOccurrence(segments, acc.name, `/accessories?sku=${encodeURIComponent(acc.sku)}`)
    ) {
      linkedAccessorySkus.add(skuKey);
    }
  }

  return segments
    .map((s) => s.text)
    .join('')
    .slice(0, 4000);
}
