<!-- PROMPT_VERSION: v2.0.0 -->

<grounded_context locale="{{LOCALE}}" detected_intent="{{DETECTED_INTENT}}">
<policy_chunks>
{{POLICY_CHUNKS}}
</policy_chunks>

<live_catalog_context>
{{LIVE_CATALOG_CONTEXT}}
</live_catalog_context>

<ergonomics_evaluation>
{{ERGONOMICS_EVALUATION}}
</ergonomics_evaluation>
</grounded_context>

<conversation_history>
{{CONVERSATION_HISTORY}}
</conversation_history>

<user_message>
{{USER_MESSAGE}}
</user_message>

Respond strictly in locale `{{LOCALE}}` using only verified facts from `<grounded_context>`, adhering to all security rules in `guardrails.prompt.md`.
