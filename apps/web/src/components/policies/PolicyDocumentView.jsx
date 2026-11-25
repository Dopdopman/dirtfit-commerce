import Link from 'next/link';
import { getDictionary } from '@/lib/i18n/translate';

const INLINE_TOKEN_REGEX = /(\*\*[^*]+\*\*|`[^`]+`)/g;

/**
 * Safely convert inline bold (**...**) and code (`...`) tokens into React elements.
 * Never uses `dangerouslySetInnerHTML` or parses arbitrary HTML tags.
 * @param {string} text
 * @param {string} keyPrefix
 * @returns {Array<import('react').ReactNode>}
 */
function renderInlineTokens(text, keyPrefix) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  const parts = text.split(INLINE_TOKEN_REGEX);
  return parts
    .filter((part) => part.length > 0)
    .map((part, idx) => {
      const key = `${keyPrefix}-${idx}`;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={key} className="font-semibold text-ink">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code
            key={key}
            className="rounded-sm border border-line bg-canvas px-1.5 py-0.5 font-mono text-[12px] text-ink"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={key}>{part}</span>;
    });
}

/**
 * Render structured Markdown AST blocks safely into Industrial Editorial UI components.
 * @param {object} props
 * @param {Array<object>} props.blocks
 * @param {string} props.keyPrefix
 * @returns {import('react').JSX.Element|null}
 */
function StructuredBlocks({ blocks, keyPrefix }) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => {
        const blockKey = `${keyPrefix}-b-${idx}`;

        if (block.type === 'subheading') {
          return (
            <h3 key={blockKey} className="pt-2 font-display text-base font-bold text-ink">
              {renderInlineTokens(block.text, blockKey)}
            </h3>
          );
        }

        if (block.type === 'callout') {
          return (
            <div
              key={blockKey}
              className="border-l-2 border-signal bg-canvas px-4 py-3 text-sm leading-relaxed text-ink-secondary"
            >
              {renderInlineTokens(block.text, blockKey)}
            </div>
          );
        }

        if (block.type === 'ul') {
          return (
            <ul
              key={blockKey}
              className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-secondary"
            >
              {block.items.map((item, itemIdx) => (
                <li key={`${blockKey}-li-${itemIdx}`}>
                  {renderInlineTokens(item, `${blockKey}-li-${itemIdx}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol
              key={blockKey}
              className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-secondary"
            >
              {block.items.map((item, itemIdx) => (
                <li key={`${blockKey}-oli-${itemIdx}`}>
                  {renderInlineTokens(item, `${blockKey}-oli-${itemIdx}`)}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={blockKey} className="overflow-x-auto border border-line">
              <table className="w-full border-collapse text-left text-xs sm:text-sm">
                <thead className="border-b border-line bg-canvas text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  <tr>
                    {block.headers.map((head, hIdx) => (
                      <th key={`${blockKey}-th-${hIdx}`} className="px-3 py-2.5">
                        {renderInlineTokens(head, `${blockKey}-th-${hIdx}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {block.rows.map((row, rIdx) => (
                    <tr key={`${blockKey}-tr-${rIdx}`}>
                      {row.map((cell, cIdx) => (
                        <td
                          key={`${blockKey}-td-${rIdx}-${cIdx}`}
                          className="px-3 py-2.5 align-top text-ink-secondary"
                        >
                          {renderInlineTokens(cell, `${blockKey}-td-${rIdx}-${cIdx}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <p key={blockKey} className="text-sm leading-relaxed text-ink-secondary">
            {renderInlineTokens(block.text, blockKey)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Technical Editorial Policy Document layout with sticky TOC and cross-links.
 * @param {object} props
 * @param {object} props.doc
 * @param {Array<object>} props.allPolicies
 * @param {'en'|'vi'} props.locale
 * @returns {import('react').JSX.Element}
 */
export default function PolicyDocumentView({ doc, allPolicies, locale }) {
  const dict = getDictionary(locale);
  const policyLabels = dict.policies;

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6">
      {/* Top Policy Tabs */}
      <nav
        aria-label={policyLabels.navLabel}
        className="mb-8 flex flex-wrap gap-2 border-b border-line pb-4"
      >
        {allPolicies.map((item) => {
          const isActive = item.slug === doc.slug;
          return (
            <Link
              key={item.slug}
              href={item.publicPath}
              className={`rounded-sm border px-3 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? 'border-line-strong bg-ink text-surface'
                  : 'border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink'
              }`}
            >
              {item.title}
            </Link>
          );
        })}
      </nav>

      {/* Header */}
      <header className="mb-8 border border-line-strong bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-signal">
            {doc.kicker}
          </span>
          <div className="flex items-center gap-3 font-mono text-[11px] text-ink-muted tabular-nums">
            <span>
              {policyLabels.versionLabel} v{doc.version}
            </span>
            <span>·</span>
            <span>
              {policyLabels.updatedLabel} {doc.lastUpdated}
            </span>
          </div>
        </div>
        <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          {doc.title}
        </h1>
        {doc.summary && (
          <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-ink-secondary">
            {doc.summary}
          </p>
        )}
        {doc.introBlocks?.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <StructuredBlocks blocks={doc.introBlocks} keyPrefix={`${doc.slug}-intro`} />
          </div>
        )}
      </header>

      {/* Main 2-Column Editorial Grid */}
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left: Structured Sections */}
        <div className="space-y-6 lg:col-span-8">
          {doc.sections.map((section, idx) => (
            <section
              key={section.sectionId}
              id={section.sectionId}
              className="scroll-mt-24 border border-line bg-surface p-6"
            >
              <div className="mb-3 flex items-baseline gap-2.5 border-b border-line pb-2.5">
                <span className="font-mono text-xs font-bold text-signal tabular-nums">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <h2 className="font-display text-lg font-bold text-ink">{section.heading}</h2>
              </div>
              <StructuredBlocks
                blocks={section.blocks}
                keyPrefix={`${doc.slug}-${section.sectionId}`}
              />
            </section>
          ))}
        </div>

        {/* Right: Sticky TOC & Quick Actions */}
        <aside className="lg:col-span-4">
          <div className="sticky top-24 space-y-5">
            <div className="border border-line-strong bg-surface p-5">
              <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-ink-muted">
                {policyLabels.tocTitle}
              </div>
              <ol className="mt-3 space-y-2 text-xs">
                {doc.sections.map((section, idx) => (
                  <li key={section.sectionId}>
                    <a
                      href={`#${section.sectionId}`}
                      className="group flex items-baseline gap-2 text-ink-secondary hover:text-signal"
                    >
                      <span className="font-mono text-[11px] text-ink-muted tabular-nums group-hover:text-signal">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="font-medium leading-snug">{section.heading}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>

            <div className="border border-line bg-surface p-5">
              <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-ink-muted">
                {policyLabels.quickActionsTitle}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href="/bikes"
                  className="rounded-sm bg-signal px-3 py-2 text-center text-xs font-bold text-surface hover:bg-signal-hover"
                >
                  {dict.footer.links.bikes}
                </Link>
                <Link
                  href="/compare"
                  className="rounded-sm border border-line-strong bg-surface px-3 py-2 text-center text-xs font-semibold text-ink hover:bg-canvas"
                >
                  {dict.footer.links.compare}
                </Link>
                <Link
                  href="/test-ride"
                  className="rounded-sm border border-line bg-surface px-3 py-2 text-center text-xs font-semibold text-ink-secondary hover:border-line-strong hover:text-ink"
                >
                  {dict.footer.links.testRide}
                </Link>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
