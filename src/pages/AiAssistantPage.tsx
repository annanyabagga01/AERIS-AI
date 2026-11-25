import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Home,
  Leaf,
  Loader2,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Train,
} from 'lucide-react';
import { useChatbotError } from '../components/ChatbotErrorBoundary.tsx';
import {
  evaluateAqiVerificationStatus,
  sanitizeChatHistory,
} from '../lib/aiContext.ts';
import { buildApiUrl } from '../lib/apiClient.ts';
import { formatFreshnessLabel } from '../lib/aqi.ts';
import { classifyChatbotError } from '../lib/chatbotErrors.ts';
import type {
  AiRecommendationStructured,
  ChatMessage,
  CityAqiResponse,
  FamilyPreferences,
} from '../lib/types.ts';

interface AiAssistantPageProps {
  aqiData: CityAqiResponse | null;
  stationId?: string;
  preferences: FamilyPreferences;
}

const INITIAL_SUGGESTED_QUESTIONS = [
  'Create a personalized morning, afternoon, and evening winter smog plan for our household.',
  'Explain what the monitoring data limitations are for my city and how general vs. sensitive precautions differ.',
  'When should we ventilate our home today, run HEPA filtration, and avoid indoor pollution?',
  'Compare enclosed commuting choices and estimated CO2e avoided for our daily travel.',
];

const FOLLOW_UP_QUESTIONS = [
  'What are the limitations of simulated demonstration readings, and how conservative should we be?',
  'How should we handle evening kitchen exhaust and smoke-free indoor habits tonight?',
  'What if a family member is pollution-sensitive — how should we tighten this schedule?',
  'How much CO2e could switching a 12 km one-way commute from solo car to Metro avoid per 5-day week?',
];

const CHAT_SESSION_STORAGE_KEY = 'aeris_ai_chat_session_v1';
const CLIENT_REQUEST_TIMEOUT_MS = 45_000;

function loadSessionMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is ChatMessage =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as ChatMessage).id === 'string' &&
          ((item as ChatMessage).role === 'user' ||
            (item as ChatMessage).role === 'assistant') &&
          typeof (item as ChatMessage).text === 'string' &&
          typeof (item as ChatMessage).timestampIso === 'string' &&
          !(item as ChatMessage).error
      )
      .slice(-16);
  } catch {
    return [];
  }
}

function saveSessionMessages(messages: ChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    const persistable = messages.filter((m) => !m.error).slice(-16);
    if (persistable.length === 0) {
      window.sessionStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(
        CHAT_SESSION_STORAGE_KEY,
        JSON.stringify(persistable)
      );
    }
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeStructuredRecommendation(
  raw: Partial<AiRecommendationStructured> | null | undefined
): AiRecommendationStructured | null {
  if (!raw || typeof raw !== 'object') return null;
  const summary =
    typeof raw.summary === 'string' ? raw.summary.trim() : '';
  if (!summary) return null;

  const schedule =
    raw.dailySchedule && typeof raw.dailySchedule === 'object'
      ? raw.dailySchedule
      : ({} as Partial<AiRecommendationStructured['dailySchedule']>);

  return {
    summary,
    currentRisk:
      typeof raw.currentRisk === 'string' && raw.currentRisk.trim()
        ? raw.currentRisk.trim()
        : 'Simulated Air Quality Assessment (Demo Mode)',
    recommendedActions: toStringList(raw.recommendedActions),
    avoidActions: toStringList(raw.avoidActions),
    indoorAdvice: toStringList(raw.indoorAdvice),
    commuteAdvice: toStringList(raw.commuteAdvice),
    dailySchedule: {
      morning:
        typeof schedule.morning === 'string' && schedule.morning.trim()
          ? schedule.morning.trim()
          : 'Check simulated local AQI before planning morning outdoor routines.',
      afternoon:
        typeof schedule.afternoon === 'string' && schedule.afternoon.trim()
          ? schedule.afternoon.trim()
          : 'Review simulated midday air quality before ventilating or commuting.',
      evening:
        typeof schedule.evening === 'string' && schedule.evening.trim()
          ? schedule.evening.trim()
          : 'Keep indoor air smoke-free and limit outdoor exertion if simulated AQI is elevated.',
    },
    reasoning:
      typeof raw.reasoning === 'string' && raw.reasoning.trim()
        ? raw.reasoning.trim()
        : 'Grounded in simulated city air quality context and household preferences.',
    sourceReferences: toStringList(raw.sourceReferences),
    dataLimitations:
      typeof raw.dataLimitations === 'string' && raw.dataLimitations.trim()
        ? raw.dataLimitations.trim()
        : 'AERIS AI Simulation Engine (SIMULATED DATA · DEMO MODE). Precautionary guidance only; not medical advice.',
  };
}

export function AiAssistantPage({
  aqiData,
  stationId,
  preferences,
}: AiAssistantPageProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadSessionMessages()
  );
  const messagesRef = useRef<ChatMessage[]>(messages);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const msgSeqRef = useRef(0);
  const { reportError, clearError } = useChatbotError();

  const nextMessageId = (prefix: 'u' | 'a' | 'e') => {
    msgSeqRef.current += 1;
    return `${prefix}-${Date.now()}-${msgSeqRef.current}`;
  };

  useEffect(() => {
    messagesRef.current = messages;
    saveSessionMessages(messages);
  }, [messages]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      inFlightRef.current = false;
    };
  }, []);

  const verification = aqiData ? evaluateAqiVerificationStatus(aqiData) : null;
  const activeStation =
    (aqiData?.selectedStationId
      ? aqiData.stations.find((s) => s.id === aqiData.selectedStationId)
      : undefined) ?? aqiData?.stations[0];

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, loading]);

  const askGemini = async (
    questionText: string,
    options?: { retryErrorId?: string }
  ) => {
    const trimmed = questionText.trim();
    if (!trimmed || inFlightRef.current) return;
    inFlightRef.current = true;

    const currentMessages = messagesRef.current;
    const baseMessages = options?.retryErrorId
      ? currentMessages.filter((m) => m.id !== options.retryErrorId)
      : currentMessages;

    const historyPayload = sanitizeChatHistory(
      baseMessages
        .filter((m) => !m.error)
        .map((m) => ({
          role: m.role,
          text:
            m.role === 'assistant' && m.structured
              ? `${m.structured.summary} Risk: ${m.structured.currentRisk}. Schedule: Morning=${m.structured.dailySchedule.morning}; Afternoon=${m.structured.dailySchedule.afternoon}; Evening=${m.structured.dailySchedule.evening}`
              : m.text,
        })),
      8
    );

    if (options?.retryErrorId) {
      setMessages((prev) => prev.filter((m) => m.id !== options.retryErrorId));
    } else {
      const userMsg: ChatMessage = {
        id: nextMessageId('u'),
        role: 'user',
        text: trimmed,
        timestampIso: new Date().toISOString(),
      };
      setMessages((prev) => {
        const next = [...prev, userMsg];
        return next.length > 16 ? next.slice(next.length - 16) : next;
      });
    }
    setPrompt('');
    setLoading(true);
    clearError();

    let responseStatus: number | undefined;
    let serverErrorMessage: string | null = null;
    const errorMsgId = nextMessageId('e');

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CLIENT_REQUEST_TIMEOUT_MS);

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('Failed to fetch: browser is offline.');
      }

      const res = await fetch(buildApiUrl('/api/ai/recommendations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          city: preferences.city,
          station: stationId && stationId !== 'all' ? stationId : undefined,
          preferences,
          question: trimmed,
          history: historyPayload,
        }),
      });
      responseStatus = res.status;

      const rawBody = await res.text();
      let json: {
        error?: string;
        reply?: string;
        text?: string;
        recommendation?: Partial<AiRecommendationStructured>;
      } | null = null;
      if (rawBody.trim()) {
        try {
          json = JSON.parse(rawBody) as {
            error?: string;
            reply?: string;
            text?: string;
            recommendation?: Partial<AiRecommendationStructured>;
          };
        } catch {
          json = null;
        }
      }

      const normalizedRecommendation = normalizeStructuredRecommendation(
        json?.recommendation
      );
      const plainReply =
        typeof json?.reply === 'string' && json.reply.trim()
          ? json.reply.trim()
          : typeof json?.text === 'string' && json.text.trim()
          ? json.text.trim()
          : null;

      if (!res.ok || (!normalizedRecommendation && !plainReply)) {
        serverErrorMessage =
          json?.error ??
          (!res.ok
            ? null
            : 'The AI backend returned an empty response. Please click Retry.');
        const descriptor = classifyChatbotError({
          httpStatus: res.status,
          serverMessage: serverErrorMessage,
        });
        throw new Error(descriptor.message);
      }

      if (!mountedRef.current) return;

      const assistantMsg: ChatMessage = {
        id: nextMessageId('a'),
        role: 'assistant',
        text: normalizedRecommendation?.summary ?? plainReply ?? '',
        structured: normalizedRecommendation ?? undefined,
        timestampIso: new Date().toISOString(),
      };
      setMessages((prev) => {
        const next = [...prev, assistantMsg];
        return next.length > 16 ? next.slice(next.length - 16) : next;
      });
    } catch (err) {
      if (!mountedRef.current) return;
      const effectiveError = timedOut
        ? Object.assign(
            new Error(
              'The AI assistant timed out waiting for Gemini. Click Retry to send your message again.'
            ),
            { name: 'TimeoutError' }
          )
        : err;
      const descriptor = classifyChatbotError({
        error: effectiveError,
        httpStatus: responseStatus,
        serverMessage: serverErrorMessage,
        isOffline:
          typeof navigator !== 'undefined' && navigator.onLine === false,
      });
      reportError(descriptor, () => {
        void askGemini(trimmed, { retryErrorId: errorMsgId });
      });
      const errMsg: ChatMessage = {
        id: errorMsgId,
        role: 'assistant',
        text: descriptor.title,
        error: descriptor.message,
        timestampIso: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      window.clearTimeout(timeoutId);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      inFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  const hasAssistantReply = messages.some(
    (m) => m.role === 'assistant' && !m.error && (Boolean(m.structured) || Boolean(m.text))
  );

  return (
    <div className="space-y-5">
      {/* Grounded Server Context Header */}
      <section className="aeris-panel rounded-xl p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Bot className="w-5 h-5 text-cyan-400 shrink-0" />
              <span>AERIS AI Conversational Advisor</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Grounded server-side in AERIS AI Simulation Engine readings (SIMULATED
              DATA · DEMO MODE), 6-tier CPCB health category guidance, and household
              sensitivity. Never diagnoses, prescribes medication, or promises
              masks/purifiers guarantee protection.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>SIMULATED DATA · DEMO MODE</span>
            </span>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setMessages([]);
                  saveSessionMessages([]);
                }}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800/80 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Chat</span>
              </button>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-300">
          <span>
            City: <strong className="text-slate-100">{preferences.city}</strong>
          </span>
          {activeStation && (
            <>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span>
                Station:{' '}
                <strong className="text-slate-200">{activeStation.station}</strong>
              </span>
            </>
          )}
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span>
            AQI:{' '}
            <strong className="font-mono tabular-nums text-cyan-300">
              {aqiData?.primaryAqi ?? 'Unavailable'} (
              {aqiData?.category ?? 'Unavailable'})
            </strong>
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span>
            Source:{' '}
            <strong className="text-amber-300 font-mono">
              AERIS AI Simulation Engine (SIMULATED)
            </strong>
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span>
            Sensitivity:{' '}
            <strong
              className={
                preferences.pollutionSensitiveHousehold
                  ? 'text-amber-300'
                  : 'text-slate-200'
              }
            >
              {preferences.pollutionSensitiveHousehold
                ? 'Sensitive Household On'
                : 'Standard Household'}
            </strong>
          </span>
          {aqiData?.lastUpdatedIso && (
            <>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="font-mono tabular-nums text-slate-400">
                {formatFreshnessLabel(aqiData.lastUpdatedIso)}
              </span>
            </>
          )}
        </div>

        {verification && !verification.isLiveVerified ? (
          <p
            data-testid="ai-verification-warning"
            className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2"
          >
            {verification.verificationNotice}
          </p>
        ) : !verification ? (
          <p
            data-testid="ai-verification-warning"
            className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2"
          >
            Live AQI telemetry for {preferences.city} is currently loading or unavailable; server-side queries will evaluate live status at request time.
          </p>
        ) : null}
      </section>

      {/* Suggested Questions */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>
            {hasAssistantReply
              ? 'Suggested Follow-Up Questions'
              : 'Suggested Questions'}
          </span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(hasAssistantReply
            ? FOLLOW_UP_QUESTIONS
            : INITIAL_SUGGESTED_QUESTIONS
          ).map((q) => (
            <button
              key={q}
              type="button"
              disabled={loading}
              onClick={() => void askGemini(q)}
              className="px-3.5 py-2.5 rounded-lg aeris-subcard text-xs text-slate-200 hover:border-cyan-500/45 hover:text-cyan-200 hover:-translate-y-0.5 disabled:opacity-50 transition-all text-left"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Thread */}
      <section className="aeris-panel rounded-xl p-5 space-y-5 min-h-[380px] flex flex-col justify-between">
        <div className="space-y-5 max-h-[680px] overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <div className="py-12 text-center space-y-2.5">
              <p className="text-sm font-medium text-slate-200">
                Ask AERIS AI about air quality & daily planning in{' '}
                {preferences.city}
              </p>
              <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                Ask about outdoor exertion, children’s school routines, home
                ventilation windows, HEPA filtration, avoiding indoor smoke,
                commute options, or estimated CO2e savings. You can ask follow-up
                questions in the same thread.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={
                  msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'
                }
              >
                {msg.role === 'user' ? (
                  <div className="max-w-xl rounded-xl bg-cyan-500/15 border border-cyan-500/30 px-4 py-3 text-sm text-slate-100">
                    {msg.text}
                  </div>
                ) : msg.error ? (
                  <div className="w-full rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-200 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">
                          AI Recommendation Unavailable
                        </p>
                        <p className="text-xs text-rose-300/90 mt-1">
                          {msg.error}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        const errIndex = messages.findIndex((m) => m.id === msg.id);
                        const precedingUser = (
                          errIndex > 0 ? messages.slice(0, errIndex) : messages
                        )
                          .reverse()
                          .find((m) => m.role === 'user');
                        if (precedingUser) {
                          void askGemini(precedingUser.text, {
                            retryErrorId: msg.id,
                          });
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg border border-rose-400/40 text-xs font-medium text-rose-100 hover:bg-rose-500/20 transition-colors shrink-0"
                    >
                      Retry
                    </button>
                  </div>
                ) : msg.structured ? (
                  <motion.article
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    data-testid="ai-structured-response"
                    className="w-full rounded-xl bg-[#070D1B] border border-cyan-500/20 p-5 space-y-4 shadow-[inset_0_1px_0_rgba(103,232,249,0.06)]"
                  >
                    {/* Header: Current Risk & Timestamp */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                      <div className="space-y-0.5">
                        <p className="text-[11px] uppercase tracking-wider text-cyan-400 font-semibold">
                          Current Risk Assessment
                        </p>
                        <h3 className="text-sm font-semibold text-slate-100">
                          {msg.structured.currentRisk}
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        {new Date(msg.timestampIso).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Summary */}
                    <p className="text-sm text-slate-100 leading-relaxed">
                      {msg.structured.summary}
                    </p>

                    {/* Recommended Actions & Avoid Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="p-3.5 rounded-lg bg-[#0B1120] border border-emerald-500/25 space-y-2">
                        <p className="font-semibold text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Recommended Actions</span>
                        </p>
                        <ul className="list-disc pl-4 space-y-1 text-slate-300">
                          {msg.structured.recommendedActions.map((step, idx) => (
                            <li key={idx}>{step}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-3.5 rounded-lg bg-[#0B1120] border border-rose-500/25 space-y-2">
                        <p className="font-semibold text-rose-300 flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Actions to Avoid</span>
                        </p>
                        <ul className="list-disc pl-4 space-y-1 text-slate-300">
                          {msg.structured.avoidActions.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Indoor Advice & Commute Advice */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="p-3.5 rounded-lg bg-[#0B1120] border border-slate-800/80 space-y-2">
                        <p className="font-semibold text-cyan-300 flex items-center gap-1.5">
                          <Home className="w-3.5 h-3.5" />
                          <span>Indoor Air & Ventilation Advice</span>
                        </p>
                        <ul className="list-disc pl-4 space-y-1 text-slate-300">
                          {msg.structured.indoorAdvice.map((step, idx) => (
                            <li key={idx}>{step}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-3.5 rounded-lg bg-[#0B1120] border border-slate-800/80 space-y-2">
                        <p className="font-semibold text-teal-300 flex items-center gap-1.5">
                          <Train className="w-3.5 h-3.5" />
                          <span>Commute & Eco Impact Advice</span>
                        </p>
                        <ul className="list-disc pl-4 space-y-1 text-slate-300">
                          {msg.structured.commuteAdvice.map((alt, idx) => (
                            <li key={idx}>{alt}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Personalized Daily Schedule */}
                    <div className="p-3.5 rounded-lg bg-[#0B1120] border border-slate-800/80 space-y-2 text-xs">
                      <p className="font-semibold text-slate-100 flex items-center gap-1.5">
                        <Leaf className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Personalized Morning, Afternoon & Evening Plan</span>
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                        <div className="space-y-1">
                          <p className="font-medium text-cyan-300">Morning</p>
                          <p className="text-slate-300 leading-relaxed">
                            {msg.structured.dailySchedule.morning}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-emerald-300">Afternoon</p>
                          <p className="text-slate-300 leading-relaxed">
                            {msg.structured.dailySchedule.afternoon}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-amber-300">Evening</p>
                          <p className="text-slate-300 leading-relaxed">
                            {msg.structured.dailySchedule.evening}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Reasoning, Source References & Data Limitations */}
                    <div className="pt-3 border-t border-slate-800/80 text-xs text-slate-400 space-y-1.5">
                      <p>
                        <strong className="text-slate-300">Reasoning:</strong>{' '}
                        {msg.structured.reasoning}
                      </p>
                      <p>
                        <strong className="text-slate-300">
                          Source References:
                        </strong>{' '}
                        {msg.structured.sourceReferences.join(' · ')}
                      </p>
                      <p className="text-amber-300/90 pt-0.5">
                        <strong className="text-amber-200">
                          Data Limitations & Notice:
                        </strong>{' '}
                        {msg.structured.dataLimitations}
                      </p>
                    </div>
                  </motion.article>
                ) : msg.text ? (
                  <div className="max-w-xl rounded-xl bg-[#070D1B] border border-cyan-500/20 px-4 py-3 text-sm text-slate-100 leading-relaxed">
                    {msg.text}
                  </div>
                ) : null}
              </div>
            ))
          )}

          {loading && (
            <div
              role="status"
              aria-live="polite"
              data-testid="ai-loading-indicator"
              className="rounded-xl bg-[#080E1C] border border-cyan-500/30 p-5 space-y-3"
            >
              <div className="flex items-center gap-2 text-xs font-medium text-cyan-300">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>
                  Consulting Gemini with simulated {preferences.city} AQI &amp;
                  household context...
                </span>
              </div>
              <div className="space-y-2 animate-pulse">
                <div className="h-3.5 w-48 bg-slate-800 rounded" />
                <div className="h-3 w-full bg-slate-800 rounded" />
                <div className="h-3 w-4/5 bg-slate-800 rounded" />
              </div>
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {/* Input Form & Bounded Context Indicator */}
        <div className="pt-4 border-t border-slate-800/80 space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void askGemini(prompt);
            }}
            className="flex items-center gap-3"
          >
            <label htmlFor="ai-prompt-input" className="sr-only">
              Ask AERIS AI about air quality, indoor air, commuting, and daily planning
            </label>
            <input
              id="ai-prompt-input"
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                hasAssistantReply
                  ? 'Ask a follow-up question (e.g. evening cooking, school run, Metro CO2e)...'
                  : 'Ask about outdoor activity, school hours, ventilation, HEPA, or eco commuting...'
              }
              className="flex-1 px-4 py-2.5 rounded-lg aeris-input text-sm text-slate-100 placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              aria-label="Send message to AERIS AI"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              <span>{loading ? 'Sending...' : 'Send'}</span>
            </button>
          </form>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>
              Bounded multi-turn context (last 8 messages sent per turn)
            </span>
            <span className="font-mono tabular-nums">
              {messages.filter((m) => !m.error).length} / 16 stored messages
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
