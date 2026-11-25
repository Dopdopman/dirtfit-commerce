import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROMPT_VERSION,
  REQUIRED_PLACEHOLDERS,
  getChatbotPrompts,
  loadChatbotPrompts,
  renderGroundedPrompt,
} from '../../src/modules/chatbot/prompts/prompt-loader.js';

describe('Phase 9 Chatbot Prompt Governance Loader', () => {
  it('loads all prompt templates cleanly, verifies required placeholders, and renders context', () => {
    const prompts = getChatbotPrompts();
    expect(prompts.version).toBe(PROMPT_VERSION);

    for (const placeholder of REQUIRED_PLACEHOLDERS.system) {
      expect(prompts.system).toContain(placeholder);
    }
    for (const placeholder of REQUIRED_PLACEHOLDERS.grounding) {
      expect(prompts.grounding).toContain(placeholder);
    }

    const rendered = renderGroundedPrompt(prompts, {
      locale: 'vi',
      detectedIntent: 'POLICY_ORDERING',
      policyChunks: '[ordering-and-deposit-guide#cod-policy] COD blocked for motorcycles',
      liveCatalogContext: 'Honda CRF300L — 168,000,000 VND (available: 4)',
      ergonomicsEvaluation: 'None',
      conversationHistory: 'None',
      userMessage: 'Xe máy có cho thanh toán COD không?',
    });

    expect(rendered.systemInstruction).toContain('locale: `vi`');
    expect(rendered.systemInstruction).toContain('Prompt-Injection Guardrails');
    expect(rendered.userPrompt).toContain('detected_intent="POLICY_ORDERING"');
    expect(rendered.userPrompt).toContain('COD blocked for motorcycles');
    expect(rendered.userPrompt).not.toContain('{{POLICY_CHUNKS}}');
    expect(rendered.userPrompt).not.toContain('{{LIVE_CATALOG_CONTEXT}}');
    expect(rendered.userPrompt).not.toContain('{{ERGONOMICS_EVALUATION}}');
  });

  it('fails fast when a required prompt file is missing or a required placeholder is removed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dirtfit-prompt-test-'));

    try {
      // Missing files fail-fast
      expect(() => loadChatbotPrompts({ baseDir: tmpDir })).toThrow(/Missing required prompt file/);

      // Copy valid files then corrupt intent-and-grounding.md by removing {{POLICY_CHUNKS}}
      const valid = loadChatbotPrompts();
      fs.writeFileSync(path.join(tmpDir, 'system.prompt.md'), valid.system, 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'guardrails.prompt.md'), valid.guardrails, 'utf8');
      fs.writeFileSync(
        path.join(tmpDir, 'intent-and-grounding.md'),
        valid.grounding.replace('{{POLICY_CHUNKS}}', 'REMOVED_PLACEHOLDER'),
        'utf8'
      );

      expect(() => loadChatbotPrompts({ baseDir: tmpDir })).toThrow(
        /missing required placeholder\(s\): \{\{POLICY_CHUNKS\}\}/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
