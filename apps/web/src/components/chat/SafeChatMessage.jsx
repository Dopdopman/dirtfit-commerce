'use client';

import Link from 'next/link';
import { parseSafeChatMarkdown } from '@/lib/chat-markdown';

function renderInlineRuns(runs, keyPrefix, onNavigate) {
  return runs.map((run, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (run.type === 'link') {
      return (
        <Link
          key={key}
          href={run.href}
          onClick={onNavigate}
          className={`${run.bold ? 'font-bold' : 'font-semibold'} text-signal underline decoration-signal/40 underline-offset-2 transition-colors hover:text-ink hover:decoration-ink`}
        >
          {run.label}
        </Link>
      );
    }
    if (run.type === 'bold') {
      return (
        <strong key={key} className="font-semibold text-ink">
          {run.value}
        </strong>
      );
    }
    if (run.type === 'code') {
      return (
        <code
          key={key}
          className="rounded-sm border border-line bg-canvas px-1 py-0.5 font-mono text-[11px] text-ink tabular-telemetry"
        >
          {run.value}
        </code>
      );
    }
    return <span key={key}>{run.value}</span>;
  });
}

/**
 * Pure React whitelist Markdown renderer for Chatbot replies (no raw HTML injection).
 * @param {object} props
 * @param {string} props.content
 * @param {() => void} [props.onNavigate]
 * @returns {import('react').JSX.Element|null}
 */
export default function SafeChatMessage({ content, onNavigate }) {
  const blocks = parseSafeChatMarkdown(content);
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-ink-secondary">
      {blocks.map((block, bIdx) => {
        if (block.type === 'list') {
          return (
            <ul key={`list-${bIdx}`} className="list-disc space-y-1.5 pl-4">
              {block.items.map((itemRuns, iIdx) => (
                <li key={`item-${bIdx}-${iIdx}`}>
                  {renderInlineRuns(itemRuns, `li-${bIdx}-${iIdx}`, onNavigate)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`p-${bIdx}`} className="break-words">
            {renderInlineRuns(block.runs, `p-${bIdx}`, onNavigate)}
          </p>
        );
      })}
    </div>
  );
}
