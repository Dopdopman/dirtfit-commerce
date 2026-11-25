'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, Copy, MessageSquare, RotateCcw, Send, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import MiniFitCard from '@/components/chat/MiniFitCard';
import SafeChatMessage from '@/components/chat/SafeChatMessage';
import { apiRequest, ApiError } from '@/lib/api-client';
import { isSafeInternalUrl } from '@/lib/chat-markdown';
import { useAuth, useRiderProfile } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Floating Industrial Motorsport AI Support Chatbot Drawer for DirtFit Storefront.
 * Automatically hidden on `/admin/*` via StorefrontShell.
 * @returns {import('react').JSX.Element}
 */
export default function SupportChatWidget() {
  const pathname = usePathname();
  const { user, authReady } = useAuth();
  const { riderProfile } = useRiderProfile();
  const { locale, t } = useI18n();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [feedbackBusyId, setFeedbackBusyId] = useState(null);

  const endRef = useRef(null);
  const inputRef = useRef(null);

  // Lift trigger upward on mobile pages that have sticky bottom CTA/Checkout actions
  const hasMobileBottomCta =
    pathname?.startsWith('/bikes/') ||
    pathname?.startsWith('/cart') ||
    pathname?.startsWith('/checkout');

  const quickPrompts = useMemo(
    () => [
      t('chat.quickPromptDeposit'),
      t('chat.quickPromptFit'),
      t('chat.quickPromptShowroom'),
      t('chat.quickPromptWarranty'),
    ],
    [t]
  );

  const fetchSessionHistory = useCallback(async () => {
    setLoadingHistory(true);
    setErrorMsg(null);
    try {
      const data = await apiRequest(`/api/v1/chat/session?locale=${locale}`);
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    } catch {
      // Allow UI to remain usable even if cold start fails transiently
    } finally {
      setLoadingHistory(false);
    }
  }, [locale]);

  useEffect(() => {
    if (isOpen && authReady) {
      fetchSessionHistory();
    }
  }, [isOpen, authReady, user?.id, fetchSessionHistory]);

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [isOpen, messages.length, sending]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const handleSend = async (overrideMessage) => {
    const candidate = typeof overrideMessage === 'string' ? overrideMessage : inputText;
    const trimmed = candidate.trim();
    if (!trimmed || sending) {
      return;
    }

    setSending(true);
    setErrorMsg(null);
    if (typeof overrideMessage !== 'string') {
      setInputText('');
    }

    const optimisticId = `temp-${Date.now()}`;
    const optimisticUser = {
      id: optimisticId,
      role: 'USER',
      content: trimmed,
      citations: [],
      recommendedBikes: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const data = await apiRequest('/api/v1/chat/messages', {
        method: 'POST',
        body: {
          message: trimmed,
          locale,
          riderProfile: {
            heightCm: Number(riderProfile?.heightCm ?? 170),
            weightKg: Number(riderProfile?.weightKg ?? 68),
            ...(riderProfile?.inseamCm ? { inseamCm: Number(riderProfile.inseamCm) } : {}),
            ...(riderProfile?.footwear ? { footwear: riderProfile.footwear } : {}),
          },
        },
      });

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticId),
        data.userMessage,
        data.assistantMessage,
      ]);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      if (typeof overrideMessage !== 'string') {
        setInputText(trimmed);
      }
      if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
        setErrorMsg(t('chat.rateLimitError'));
      } else {
        setErrorMsg(err?.detail || t('chat.genericError'));
      }
    } finally {
      setSending(false);
    }
  };

  const handleFeedback = async (messageId, feedback) => {
    if (feedbackBusyId) return;
    setFeedbackBusyId(messageId);
    try {
      const data = await apiRequest(`/api/v1/chat/messages/${messageId}/feedback`, {
        method: 'POST',
        body: { feedback },
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback: data.message.feedback } : m))
      );
    } catch {
      // Ignore silent feedback failure
    } finally {
      setFeedbackBusyId(null);
    }
  };

  const handleCopy = async (messageId, content) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId((prev) => (prev === messageId ? null : prev)), 1500);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleReset = async () => {
    if (sending) return;
    setErrorMsg(null);
    try {
      await apiRequest('/api/v1/chat/session', { method: 'DELETE' });
      setMessages([]);
      await fetchSessionHistory();
    } catch {
      setErrorMsg(t('chat.genericError'));
    }
  };

  const remainingChars = 1000 - inputText.length;

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={t('chat.openButtonAria')}
          data-testid="chat-widget-trigger"
          className={`fixed right-4 z-40 inline-flex items-center gap-2 rounded-sm border border-line-strong bg-ink px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-surface shadow-lg transition-colors hover:border-signal hover:bg-signal md:bottom-5 md:right-5 ${
            hasMobileBottomCta ? 'bottom-20' : 'bottom-5'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
          <MessageSquare className="h-4 w-4" />
          <span>{t('chat.triggerLabel')}</span>
        </button>
      )}

      {isOpen && (
        <aside
          aria-label={t('chat.drawerTitle')}
          data-testid="chat-widget-drawer"
          className="fixed bottom-4 right-4 z-50 flex h-[min(640px,calc(100vh-84px))] w-[calc(100vw-2rem)] flex-col rounded-sm border border-line-strong bg-canvas shadow-2xl sm:bottom-5 sm:right-5 sm:w-[420px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line-strong bg-ink px-4 py-3 text-surface">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest">
                  {t('chat.drawerTitle')}
                </div>
                <div className="font-mono text-[10px] text-zinc-400">
                  {t('chat.localeIndicator')}: {locale.toUpperCase()}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleReset}
                title={t('chat.resetBtn')}
                aria-label={t('chat.resetBtn')}
                className="rounded-sm border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-surface hover:text-surface"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title={t('chat.closeBtn')}
                aria-label={t('chat.closeBtn')}
                className="rounded-sm border border-zinc-700 p-1 text-zinc-300 transition-colors hover:border-signal hover:bg-signal hover:text-surface"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Message Stream */}
          <div aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5">
            {loadingHistory && messages.length === 0 && (
              <div className="rounded-sm border border-line bg-surface p-3 text-xs text-ink-muted">
                {t('chat.loadingSession')}
              </div>
            )}

            {!loadingHistory && messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-sm border border-line bg-surface p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-signal">
                    {t('chat.welcomeKicker')}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                    {t('chat.welcomeBody')}
                  </p>
                </div>

                <div>
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                    {t('chat.quickPromptsLabel')}
                  </div>
                  <div className="grid gap-1.5">
                    {quickPrompts.map((promptText) => (
                      <button
                        key={promptText}
                        type="button"
                        onClick={() => handleSend(promptText)}
                        className="rounded-sm border border-line bg-surface px-3 py-2 text-left text-xs text-ink transition-colors hover:border-ink hover:bg-canvas"
                      >
                        {promptText}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((msg) => {
              const isUser = msg.role === 'USER';
              if (isUser) {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-sm bg-ink px-3.5 py-2.5 text-[13px] leading-relaxed text-surface">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              const safeCitations = (msg.citations ?? []).filter((c) => isSafeInternalUrl(c?.url));
              const recs = Array.isArray(msg.recommendedBikes) ? msg.recommendedBikes : [];

              return (
                <div
                  key={msg.id}
                  className="space-y-2.5 rounded-sm border border-line bg-surface p-3.5"
                >
                  <SafeChatMessage content={msg.content} />

                  {recs.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {recs.map((bike) => (
                        <MiniFitCard
                          key={`${msg.id}-${bike.slug}`}
                          bike={bike}
                          onNavigate={() => setIsOpen(false)}
                        />
                      ))}
                    </div>
                  )}

                  {safeCitations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
                      {safeCitations.map((citation) => (
                        <Link
                          key={`${msg.id}-${citation.url}`}
                          href={citation.url}
                          onClick={() => setIsOpen(false)}
                          className="rounded-sm border border-line bg-canvas px-2 py-1 font-mono text-[10px] text-ink-secondary transition-colors hover:border-ink hover:text-ink"
                        >
                          [{citation.id}] {citation.section}
                        </Link>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-line pt-2 text-[10px] text-ink-muted">
                    <span>
                      {msg.provider === 'grounded-fallback'
                        ? t('chat.groundedModeBadge')
                        : msg.provider === 'gemini'
                          ? 'Gemini Grounded'
                          : t('chat.guardrailBadge')}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.content)}
                        aria-label={t('chat.copyBtn')}
                        className="inline-flex items-center gap-1 rounded-sm border border-line px-1.5 py-0.5 hover:border-ink hover:text-ink"
                      >
                        {copiedId === msg.id ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(msg.id, 'UP')}
                        disabled={feedbackBusyId === msg.id}
                        aria-label={t('chat.helpfulUpBtn')}
                        className={`rounded-sm border px-1.5 py-0.5 transition-colors ${
                          msg.feedback === 'UP'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                            : 'border-line hover:border-ink hover:text-ink'
                        }`}
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(msg.id, 'DOWN')}
                        disabled={feedbackBusyId === msg.id}
                        aria-label={t('chat.helpfulDownBtn')}
                        className={`rounded-sm border px-1.5 py-0.5 transition-colors ${
                          msg.feedback === 'DOWN'
                            ? 'border-red-600 bg-red-50 text-red-700'
                            : 'border-line hover:border-ink hover:text-ink'
                        }`}
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {sending && (
              <div className="rounded-sm border border-line bg-surface px-3.5 py-2.5 text-xs text-ink-muted">
                {t('chat.thinkingIndicator')}
              </div>
            )}

            <div ref={endRef} />
          </div>

          {/* Input Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="border-t border-line bg-surface p-3"
          >
            {errorMsg && (
              <div className="mb-2 rounded-sm border border-red-300 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                maxLength={1000}
                disabled={sending}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={t('chat.inputPlaceholder')}
                aria-label={t('chat.inputPlaceholder')}
                className="flex-1 rounded-sm border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || inputText.trim().length === 0}
                aria-label={t('chat.sendBtn')}
                className="inline-flex items-center justify-center rounded-sm bg-ink px-3 py-2 text-xs font-semibold text-surface transition-colors hover:bg-signal disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>

            {remainingChars <= 150 && (
              <div className="mt-1 text-right font-mono text-[10px] text-ink-muted">
                {remainingChars} {t('chat.charsRemaining')}
              </div>
            )}
          </form>
        </aside>
      )}
    </>
  );
}
