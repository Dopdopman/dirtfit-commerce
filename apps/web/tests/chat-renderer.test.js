import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isSafeInternalUrl, parseSafeChatMarkdown } from '@/lib/chat-markdown';

describe('Phase 11 Frontend Unit Tests — Safe Whitelist Chat Renderer & XSS Defense', () => {
  it('parses whitelisted paragraphs, lists, bold, and code while neutralizing raw HTML XSS payloads', () => {
    const markdown = [
      'Official **DirtFit** summary:',
      '- Hold duration: `15 minutes` via **PayOS VietQR**',
      '<script>alert("xss")</script> <img src=x onerror=alert(1)>',
    ].join('\n');

    const blocks = parseSafeChatMarkdown(markdown);
    expect(blocks.length).toBe(3);
    expect(blocks[0].type).toBe('paragraph');
    expect(blocks[0].runs.some((r) => r.type === 'bold' && r.value === 'DirtFit')).toBe(true);

    expect(blocks[1].type).toBe('list');
    expect(blocks[1].items[0].some((r) => r.type === 'code' && r.value === '15 minutes')).toBe(
      true
    );

    // Raw HTML tags stay inert plain text inside 'text' nodes (auto-escaped by React JSX)
    expect(blocks[2].type).toBe('paragraph');
    expect(blocks[2].runs[0].type).toBe('text');
    expect(blocks[2].runs[0].value).toContain('<script>alert("xss")</script>');
    expect(blocks[2].runs[0].value).toContain('<img src=x onerror=alert(1)>');
  });

  it('strictly restricts clickable citation/card URLs to internal DirtFit routes', () => {
    expect(isSafeInternalUrl('/policies/ordering#cod-rules')).toBe(true);
    expect(isSafeInternalUrl('/bikes/honda-crf300l?heightCm=168&weightKg=65')).toBe(true);
    expect(isSafeInternalUrl('/test-ride')).toBe(true);
    expect(isSafeInternalUrl('/account')).toBe(true);

    expect(isSafeInternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeInternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeInternalUrl('https://evil.example/phish')).toBe(false);
    expect(isSafeInternalUrl('//evil.example')).toBe(false);
  });

  it('guarantees zero dangerouslySetInnerHTML usage across Chatbot UI components', () => {
    const widgetSrc = fs.readFileSync(
      new URL('../src/components/chat/SupportChatWidget.jsx', import.meta.url),
      'utf8'
    );
    const safeMsgSrc = fs.readFileSync(
      new URL('../src/components/chat/SafeChatMessage.jsx', import.meta.url),
      'utf8'
    );
    const miniCardSrc = fs.readFileSync(
      new URL('../src/components/chat/MiniFitCard.jsx', import.meta.url),
      'utf8'
    );

    expect(widgetSrc).not.toContain('dangerouslySetInnerHTML');
    expect(safeMsgSrc).not.toContain('dangerouslySetInnerHTML');
    expect(miniCardSrc).not.toContain('dangerouslySetInnerHTML');
  });
});
