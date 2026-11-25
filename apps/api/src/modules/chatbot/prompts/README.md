# DirtFit Chatbot Prompt Governance (`v2.0.0`)

This directory decouples all LLM instructions, safety guardrails, and grounded context templates from JavaScript application code so prompts remain auditable via Git PR reviews and regression-tested automatically.

## Managed Files

| File                      | Responsibility                                                                                                                  |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------ |
| `system.prompt.md`        | Assistant persona, bilingual (`en` / `vi`) rules, citation mandate, zero-hallucination constraints.                             |
| `guardrails.prompt.md`    | Prompt-injection defense, system-prompt confidentiality, scope restrictions, anti-IDOR rules.                                   |
| `intent-and-grounding.md` | Structured template injecting retrieved policy chunks, live `CatalogCache` data, and real `@dirtfit/ergonomics-engine` numbers. |
| `prompt-loader.js`        | Pure JS ESM fail-fast loader verifying file presence and required `{{PLACEHOLDER}}` contracts on API boot.                      |

## Required Template Placeholders

`prompt-loader.js` fails fast at startup if any of the following placeholders are missing:

- `system.prompt.md`: `{{LOCALE}}`
- `intent-and-grounding.md`:
  - `{{LOCALE}}`
  - `{{DETECTED_INTENT}}`
  - `{{POLICY_CHUNKS}}`
  - `{{LIVE_CATALOG_CONTEXT}}`
  - `{{ERGONOMICS_EVALUATION}}`
  - `{{CONVERSATION_HISTORY}}`
  - `{{USER_MESSAGE}}`

## Change & Regression Workflow

1. Update the target `.prompt.md` file and increment the `PROMPT_VERSION` header if semantics change.
2. Verify all placeholder contracts with `pnpm --filter @dirtfit/api run test:unit` (or `pnpm test`).
3. Confirm both `GeminiChatAdapter` and `GroundedFallbackAdapter` outputs match policy & ergonomics assertions in `chatbot-grounded.test.js`.
