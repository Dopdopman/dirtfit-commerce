import { foldVietnameseText } from '@dirtfit/knowledge/retriever';

const INJECTION_PATTERNS = Object.freeze([
  {
    id: 'override_en',
    regex:
      /\b(ignore|disregard|forget|override)\b[\s\w]{0,40}\b(previous|above|prior|all|system)\b[\s\w]{0,30}\b(instructions?|prompts?|rules?|directives?)\b/i,
  },
  {
    id: 'override_vi',
    regex:
      /\b(bo qua|phot lo|vo hieu hoa|thay the)\b[\s\w]{0,40}\b(huong dan|chi thi|quy tac|system prompt|luat)\b/i,
  },
  {
    id: 'system_prompt_leak_en',
    regex:
      /\b(reveal|show|print|dump|output|repeat|expose|tell me|what is)\b[\s\w]{0,40}\b(system prompt|hidden prompt|developer prompt|initial instructions?|guardrails|system\.prompt\.md|guardrails\.prompt\.md|intent-and-grounding\.md)\b/i,
  },
  {
    id: 'system_prompt_leak_vi',
    regex:
      /\b(tiet lo|hien thi|in ra|xuat ra|cho xem|noi cho toi)\b[\s\w]{0,40}\b(system prompt|prompt he thong|huong dan he thong|system\.prompt\.md|guardrails\.prompt\.md)\b/i,
  },
  {
    id: 'direct_prompt_filename',
    regex: /\b(system\.prompt\.md|guardrails\.prompt\.md|intent-and-grounding\.md)\b/i,
  },
  {
    id: 'jailbreak_persona',
    regex:
      /\b(act as dan|do anything now|developer mode|jailbreak|unrestricted mode|bypass safety|bypass guardrails)\b/i,
  },
  {
    id: 'secret_exfil',
    regex:
      /\b(process\.env|gemini_api_key|jwt_access_secret|refresh_token_pepper|oauth_state_secret|x-goog-api-key)\b/i,
  },
  {
    id: 'sql_exfil',
    regex: /\b(select\s+\*\s+from|drop\s+table|union\s+select|pg_catalog|information_schema)\b/i,
  },
  {
    id: 'xml_boundary_spoof',
    regex:
      /<\/?\s*(system|grounded_context|policy_chunks|ergonomics_evaluation|live_catalog_context|user_message)\s*>/i,
  },
]);

/**
 * Strip ASCII control characters (except newline and tab) without control regexes.
 * @param {string} rawText
 * @returns {string}
 */
export function sanitizeChatInput(rawText) {
  if (typeof rawText !== 'string') {
    return '';
  }

  let cleaned = '';
  for (let i = 0; i < rawText.length; i += 1) {
    const code = rawText.charCodeAt(i);
    if (code >= 32 || code === 9 || code === 10 || code === 13) {
      cleaned += rawText[i];
    }
  }
  return cleaned.trim();
}

/**
 * Detect prompt injection, system-prompt exfiltration, or SQL/secret probing in EN or VI.
 * Designed to avoid false positives on normal motorcycle/sizing/policy queries.
 * @param {string} message
 * @returns {{ blocked: boolean, reason: string|null, matchedPattern: string|null }}
 */
export function detectPromptInjection(message) {
  const cleaned = sanitizeChatInput(message);
  if (!cleaned) {
    return { blocked: false, reason: null, matchedPattern: null };
  }

  const normalized = foldVietnameseText(cleaned);

  for (const rule of INJECTION_PATTERNS) {
    if (rule.regex.test(cleaned) || rule.regex.test(normalized)) {
      return {
        blocked: true,
        reason: 'PROMPT_INJECTION_DETECTED',
        matchedPattern: rule.id,
      };
    }
  }

  return { blocked: false, reason: null, matchedPattern: null };
}

/**
 * Build a polite domain-scoped refusal message when prompt injection or leak attempts occur.
 * @param {'en'|'vi'} locale
 * @returns {string}
 */
export function buildGuardrailRefusalMessage(locale = 'en') {
  if (locale === 'vi') {
    return (
      'Tôi không thể thực hiện yêu cầu thay đổi chỉ thị hệ thống hoặc tiết lộ cấu hình nội bộ của DirtFit Commerce. ' +
      'Tôi sẵn sàng hỗ trợ bạn về chọn size xe địa hình theo vóc dáng (Rider Fit), giá bán/tồn kho, quy trình đặt cọc PayOS VietQR, điều khoản, bảo hành và lịch lái thử tại showroom.'
    );
  }

  return (
    'I cannot override system instructions or disclose internal DirtFit Commerce prompts or configuration. ' +
    'I can help you with Rider Fit motorcycle sizing, live bike pricing and stock, PayOS VietQR deposits & COD rules, warranty/terms policies, and showroom test-ride bookings.'
  );
}

/**
 * Sanitize LLM output by removing accidental raw HTML tags and secret-like strings before persistence/display.
 * @param {string} rawText
 * @returns {string}
 */
export function sanitizeAssistantOutput(rawText) {
  if (typeof rawText !== 'string') {
    return '';
  }

  return rawText
    .replace(/<[^>]{1,120}>/g, '')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED]')
    .trim()
    .slice(0, 4000);
}
