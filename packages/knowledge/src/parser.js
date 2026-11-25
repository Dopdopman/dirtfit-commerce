import { PUBLIC_POLICY_ROUTES } from './constants.js';

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const SECTION_HEADING_REGEX = /^##\s+\[([a-z0-9-]+)\]\s+(.+)$/;

/**
 * Parse a lightweight key: value YAML frontmatter header from Markdown content.
 * @param {string} rawMarkdown
 * @returns {{ metadata: Record<string, string>, body: string }}
 */
export function parseFrontmatter(rawMarkdown) {
  const match = FRONTMATTER_REGEX.exec(rawMarkdown);
  if (!match) {
    return { metadata: {}, body: rawMarkdown.trim() };
  }

  const [, rawHeader, rest] = match;
  const metadata = {};

  for (const line of rawHeader.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      continue;
    }
    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    metadata[key] = value;
  }

  return { metadata, body: rest.trim() };
}

/**
 * Parse structured blocks (paragraphs, subheadings, unordered/ordered lists, callouts, tables)
 * from a section's Markdown text without producing raw HTML.
 * @param {string} markdown
 * @returns {Array<object>}
 */
export function parseMarkdownBlocks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx].trim();

    if (!line) {
      idx += 1;
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push({
        type: 'subheading',
        text: line.slice(4).trim(),
      });
      idx += 1;
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines = [];
      while (idx < lines.length && lines[idx].trim().startsWith('> ')) {
        quoteLines.push(lines[idx].trim().slice(2).trim());
        idx += 1;
      }
      blocks.push({
        type: 'callout',
        text: quoteLines.join(' '),
      });
      continue;
    }

    if (
      line.startsWith('|') &&
      idx + 1 < lines.length &&
      /^\|[\s:|-]+\|$/.test(lines[idx + 1].trim())
    ) {
      const parseRow = (rowStr) =>
        rowStr
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());

      const headers = parseRow(line);
      idx += 2;
      const rows = [];
      while (idx < lines.length && lines[idx].trim().startsWith('|')) {
        rows.push(parseRow(lines[idx]));
        idx += 1;
      }
      blocks.push({
        type: 'table',
        headers,
        rows,
      });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (idx < lines.length && /^[-*]\s+/.test(lines[idx].trim())) {
        items.push(
          lines[idx]
            .trim()
            .replace(/^[-*]\s+/, '')
            .trim()
        );
        idx += 1;
      }
      blocks.push({
        type: 'ul',
        items,
      });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (idx < lines.length && /^\d+\.\s+/.test(lines[idx].trim())) {
        items.push(
          lines[idx]
            .trim()
            .replace(/^\d+\.\s+/, '')
            .trim()
        );
        idx += 1;
      }
      blocks.push({
        type: 'ol',
        items,
      });
      continue;
    }

    const paragraphLines = [];
    while (idx < lines.length) {
      const current = lines[idx].trim();
      if (
        !current ||
        current.startsWith('### ') ||
        current.startsWith('> ') ||
        /^[-*]\s+/.test(current) ||
        /^\d+\.\s+/.test(current) ||
        current.startsWith('|')
      ) {
        break;
      }
      paragraphLines.push(current);
      idx += 1;
    }
    if (paragraphLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        text: paragraphLines.join(' '),
      });
    }
  }

  return blocks;
}

/**
 * Build a concise plain-text snippet from section markdown suitable for chatbot citations.
 * @param {string} markdown
 * @param {number} [maxLength]
 * @returns {string}
 */
export function buildPlainSnippet(markdown, maxLength = 260) {
  const cleaned = markdown
    .replace(/^###\s+/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Parse a complete Markdown knowledge document into structured metadata, sections, and blocks.
 * @param {string} rawMarkdown
 * @param {string} fallbackSlug
 * @param {'en'|'vi'} fallbackLocale
 * @returns {object}
 */
export function parseKnowledgeDocument(rawMarkdown, fallbackSlug, fallbackLocale) {
  const { metadata, body } = parseFrontmatter(rawMarkdown);
  const slug = metadata.slug || fallbackSlug;
  const locale = metadata.locale || fallbackLocale;
  const publicPath = metadata.publicPath || PUBLIC_POLICY_ROUTES[slug] || '/policies/ordering';

  const lines = body.split(/\r?\n/);
  const sections = [];
  let currentSection = null;
  const introLines = [];

  for (const line of lines) {
    const match = SECTION_HEADING_REGEX.exec(line.trim());
    if (match) {
      if (currentSection) {
        sections.push(currentSection);
      }
      const [, sectionId, heading] = match;
      currentSection = {
        sectionId,
        heading: heading.trim(),
        rawLines: [],
      };
    } else if (currentSection) {
      currentSection.rawLines.push(line);
    } else {
      introLines.push(line);
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  const normalizedSections = sections.map((sec) => {
    const rawBody = sec.rawLines.join('\n').trim();
    const url = `${publicPath}#${sec.sectionId}`;
    return {
      sectionId: sec.sectionId,
      docSlug: slug,
      locale,
      title: metadata.title || slug,
      heading: sec.heading,
      body: rawBody,
      snippet: buildPlainSnippet(rawBody),
      url,
      blocks: parseMarkdownBlocks(rawBody),
    };
  });

  return {
    id: metadata.id || `${slug}-${locale}`,
    slug,
    locale,
    title: metadata.title || slug,
    kicker: metadata.kicker || 'DIRTFIT POLICY',
    summary: metadata.summary || '',
    publicPath,
    version: metadata.version || '2.0.0',
    lastUpdated: metadata.lastUpdated || '2026-11-25',
    introBlocks: parseMarkdownBlocks(introLines.join('\n').trim()),
    sections: normalizedSections,
  };
}
