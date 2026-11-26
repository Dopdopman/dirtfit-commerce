const SAFE_INTERNAL_URL_REGEX =
  /^\/(?:bikes|accessories|compare|test-ride|policies|cart|account)(?:\/[a-zA-Z0-9._-]+)*(?:\?[a-zA-Z0-9._=&%-]+)?(?:#[a-zA-Z0-9._-]+)?$/;

const INLINE_TOKEN_REGEX =
  /(\*\*\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)\*\*|\[\*\*([^\]\n]+)\*\*\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g;

/**
 * Verify that a citation, link, or card URL strictly targets a safe internal DirtFit Storefront route.
 * Rejects `javascript:`, `data:`, protocol-relative `//`, backslash traversal, `%2e%2e`/`%2f`,
 * arbitrary external origins, and `/admin` routes.
 * @param {unknown} rawUrl
 * @returns {boolean}
 */
export function isSafeInternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    return false;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return false;
  }
  if (/(?:^|\/)\.\.(?:\/|$)|%2e%2e|%2f|%5c/i.test(trimmed)) {
    return false;
  }
  return SAFE_INTERNAL_URL_REGEX.test(trimmed);
}

/**
 * Parse inline bold (**text**), inline code (`text`), and internal Markdown links ([label](href))
 * supporting `**[label](href)**`, `[**label**](href)`, and `[label](href)` without HTML injection.
 * Any unsafe URL inside Markdown links is downgraded to safe plain/bold text.
 * @param {string} line
 * @returns {Array<{ type: 'text'|'bold'|'code'|'link', value?: string, label?: string, href?: string, bold?: boolean }>}
 */
export function parseInlineRuns(line) {
  const input = String(line ?? '');
  const runs = [];
  INLINE_TOKEN_REGEX.lastIndex = 0;
  let lastIndex = 0;

  let match;
  while ((match = INLINE_TOKEN_REGEX.exec(input)) !== null) {
    if (match.index > lastIndex) {
      runs.push({ type: 'text', value: input.slice(lastIndex, match.index) });
    }

    const token = match[0];
    if (match[2] !== undefined && match[3] !== undefined) {
      const label = match[2];
      const href = match[3].trim();
      if (isSafeInternalUrl(href)) {
        runs.push({ type: 'link', label, href, bold: true });
      } else {
        runs.push({ type: 'bold', value: label });
      }
    } else if (match[4] !== undefined && match[5] !== undefined) {
      const label = match[4];
      const href = match[5].trim();
      if (isSafeInternalUrl(href)) {
        runs.push({ type: 'link', label, href, bold: true });
      } else {
        runs.push({ type: 'bold', value: label });
      }
    } else if (match[6] !== undefined && match[7] !== undefined) {
      const label = match[6];
      const href = match[7].trim();
      if (isSafeInternalUrl(href)) {
        runs.push({ type: 'link', label, href, bold: false });
      } else {
        runs.push({ type: 'text', value: label });
      }
    } else if (token.startsWith('**') && token.endsWith('**')) {
      runs.push({ type: 'bold', value: token.slice(2, -2) });
    } else if (token.startsWith('`') && token.endsWith('`')) {
      runs.push({ type: 'code', value: token.slice(1, -1) });
    } else if (token.startsWith('*') && token.endsWith('*')) {
      runs.push({ type: 'bold', value: token.slice(1, -1) });
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < input.length) {
    runs.push({ type: 'text', value: input.slice(lastIndex) });
  }

  return runs.length > 0 ? runs : [{ type: 'text', value: '' }];
}

/**
 * Convert plain/grounded Markdown text into a safe block AST (paragraphs & bullet lists).
 * Strictly whitelisted — zero raw HTML parsing or execution.
 * @param {unknown} rawText
 * @returns {Array<{ type: 'paragraph', runs: Array<object> } | { type: 'list', items: Array<Array<object>> }>}
 */
export function parseSafeChatMarkdown(rawText) {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    return [];
  }

  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let listItems = [];

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: 'list', items: listItems });
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    const bulletMatch = line.match(/^(?:[-*•]|\d+\.)\s+(.+)$/);
    if (bulletMatch) {
      listItems.push(parseInlineRuns(bulletMatch[1]));
      continue;
    }

    flushList();
    blocks.push({ type: 'paragraph', runs: parseInlineRuns(line) });
  }

  flushList();
  return blocks;
}
