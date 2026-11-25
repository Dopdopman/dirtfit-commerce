import fs from 'node:fs';
import path from 'node:path';

export const PROMPT_VERSION = '2.0.0';

const DEFAULT_PROMPT_URLS = Object.freeze({
  system: new URL('./system.prompt.md', import.meta.url),
  guardrails: new URL('./guardrails.prompt.md', import.meta.url),
  grounding: new URL('./intent-and-grounding.md', import.meta.url),
});

const PROMPT_FILENAMES = Object.freeze({
  system: 'system.prompt.md',
  guardrails: 'guardrails.prompt.md',
  grounding: 'intent-and-grounding.md',
});

export const REQUIRED_PLACEHOLDERS = Object.freeze({
  system: Object.freeze(['{{LOCALE}}']),
  guardrails: Object.freeze([]),
  grounding: Object.freeze([
    '{{LOCALE}}',
    '{{DETECTED_INTENT}}',
    '{{POLICY_CHUNKS}}',
    '{{LIVE_CATALOG_CONTEXT}}',
    '{{ERGONOMICS_EVALUATION}}',
    '{{CONVERSATION_HISTORY}}',
    '{{USER_MESSAGE}}',
  ]),
});

let cachedPrompts = null;

/**
 * Validate that a loaded prompt template is non-empty and includes every required placeholder.
 * Throws fail-fast on violation.
 * @param {string} key
 * @param {string} content
 */
function assertValidPromptTemplate(key, content) {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error(`[chatbot/prompts] Prompt template "${key}" is empty.`);
  }

  const required = REQUIRED_PLACEHOLDERS[key] ?? [];
  const missing = required.filter((placeholder) => !content.includes(placeholder));
  if (missing.length > 0) {
    throw new Error(
      `[chatbot/prompts] Prompt template "${key}" is missing required placeholder(s): ${missing.join(', ')}`
    );
  }
}

/**
 * Load and validate all chatbot prompt governance files synchronously (fail-fast).
 * Uses static `new URL(..., import.meta.url)` by default, or an optional `baseDir` for unit tests.
 * @param {object} [options]
 * @param {string} [options.baseDir]
 * @returns {{ version: string, system: string, guardrails: string, grounding: string }}
 */
export function loadChatbotPrompts(options = {}) {
  const { baseDir } = options;
  const loaded = { version: PROMPT_VERSION };

  for (const key of Object.keys(PROMPT_FILENAMES)) {
    const fileTarget = baseDir
      ? path.join(baseDir, PROMPT_FILENAMES[key])
      : DEFAULT_PROMPT_URLS[key];

    if (!fs.existsSync(fileTarget)) {
      throw new Error(`[chatbot/prompts] Missing required prompt file: ${PROMPT_FILENAMES[key]}`);
    }

    const content = fs.readFileSync(fileTarget, 'utf8');
    assertValidPromptTemplate(key, content);
    loaded[key] = content;
  }

  return Object.freeze(loaded);
}

/**
 * Return singleton cached prompt bundle loaded at API startup.
 * @returns {{ version: string, system: string, guardrails: string, grounding: string }}
 */
export function getChatbotPrompts() {
  if (!cachedPrompts) {
    cachedPrompts = loadChatbotPrompts();
  }
  return cachedPrompts;
}

/**
 * Render system instructions and grounded user prompt payload from validated templates.
 * @param {{ system: string, guardrails: string, grounding: string }} templates
 * @param {object} values
 * @param {'en'|'vi'} values.locale
 * @param {string} values.detectedIntent
 * @param {string} values.policyChunks
 * @param {string} values.liveCatalogContext
 * @param {string} values.ergonomicsEvaluation
 * @param {string} values.conversationHistory
 * @param {string} values.userMessage
 * @returns {{ systemInstruction: string, userPrompt: string }}
 */
export function renderGroundedPrompt(templates, values) {
  const safeLocale = values.locale === 'vi' ? 'vi' : 'en';
  const systemInstruction = [
    templates.system.replaceAll('{{LOCALE}}', safeLocale),
    templates.guardrails,
  ].join('\n\n');

  const userPrompt = templates.grounding
    .replaceAll('{{LOCALE}}', safeLocale)
    .replaceAll('{{DETECTED_INTENT}}', String(values.detectedIntent || 'OUT_OF_SCOPE'))
    .replaceAll('{{POLICY_CHUNKS}}', String(values.policyChunks || 'None'))
    .replaceAll('{{LIVE_CATALOG_CONTEXT}}', String(values.liveCatalogContext || 'None'))
    .replaceAll('{{ERGONOMICS_EVALUATION}}', String(values.ergonomicsEvaluation || 'None'))
    .replaceAll('{{CONVERSATION_HISTORY}}', String(values.conversationHistory || 'None'))
    .replaceAll('{{USER_MESSAGE}}', String(values.userMessage || ''));

  return { systemInstruction, userPrompt };
}
