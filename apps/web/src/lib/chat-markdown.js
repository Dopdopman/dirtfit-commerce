const ALLOWED_INTERNAL_PREFIXES = ['/policies/', '/bikes/', '/test-ride', '/compare', '/account'];

/**
 * Verify that a citation or card URL strictly targets a safe internal Storefront route.
 * Rejects `javascript:`, `data:`, protocol-relative `//`, and arbitrary external origins.
 * @param {unknown} rawUrl
 * @returns {boolean}
 */
export function isSafeInternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    return false;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return false;
  }
  return ALLOWED_INTERNAL_PREFIXES.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(prefix)
  );
}

/**
 * Parse inline bold (**text**) and inline code (`text`) without interpreting HTML tags.
 * Raw HTML such as `<script>` remains literal plain text so React safely escapes it.
 * @param {string} line
 * @returns {Array<{ type: 'text'|'bold'|'code', value: string }>}
 */
export function parseInlineRuns(line) {
  const input = String(line ?? '');
  const runs = [];
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
  let lastIndex = 0;

  let match;
  while ((match = tokenRegex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      runs.push({ type: 'text', value: input.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
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
