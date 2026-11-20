/**
 * When the usage-analytics page asks (decided 2026-11-20, Álvaro). An account
 * that never answered is asked at the FIRST of:
 *
 *   - its first real action — one of {@link CONSENT_PROMPT_ACTIONS} — shown once
 *     it arrives on another, ordinary screen, never over a form in progress;
 *   - the third distinct local day it opens the app signed in.
 *
 * Never during onboarding. Closing the page without answering (Android back)
 * stores nothing and it asks again another day, once: after a second
 * unanswered close it never asks again. An answer anywhere — the page or the
 * Ajustes switch — ends it for good.
 *
 * Pure, so the rule is tested without a device; AnalyticsConsentProvider owns
 * the storage, the clock and the route.
 */

/** The actions that count as a first real action. The one list. */
export const CONSENT_PROMPT_ACTIONS = [
  'event-signup',
  'group-join',
  'village-join',
  'event-publish',
  'article-publish',
  'comment-publish',
  'aviso-publish',
  'history-publish',
  'word-publish',
] as const;

export type ConsentPromptAction = (typeof CONSENT_PROMPT_ACTIONS)[number];

/** The day count that asks someone who only looks. */
export const PROMPT_ON_DAY = 3;
/** Unanswered closes after which it never asks again. */
export const MAX_UNANSWERED_CLOSES = 2;

/** Per user, on this device. */
export interface ConsentPromptState {
  /** Distinct local days (`YYYY-MM-DD`) the app was opened signed in, up to {@link PROMPT_ON_DAY}. */
  days: string[];
  /** A first real action has completed. */
  acted: boolean;
  /** Times the page was closed without an answer. */
  closes: number;
  /** The day of the last unanswered close: it never asks twice the same day. */
  lastClosedOn: string | null;
}

export const EMPTY_PROMPT_STATE: ConsentPromptState = { days: [], acted: false, closes: 0, lastClosedOn: null };

export function localDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function withAppDay(state: ConsentPromptState, day: string): ConsentPromptState {
  if (state.days.includes(day) || state.days.length >= PROMPT_ON_DAY) return state;
  return { ...state, days: [...state.days, day] };
}

export function withAction(state: ConsentPromptState): ConsentPromptState {
  return state.acted ? state : { ...state, acted: true };
}

export function withUnansweredClose(state: ConsentPromptState, day: string): ConsentPromptState {
  return { ...state, closes: state.closes + 1, lastClosedOn: day };
}

/** Why the page is owed now: `action` waits for the next ordinary screen, `day` asks at once. */
export type PromptReason = 'action' | 'day';

export function promptReason(input: {
  /** The stored answer: `null` never asked, `undefined` still loading. */
  answer: boolean | null | undefined;
  onboarded: boolean;
  state: ConsentPromptState;
  today: string;
}): PromptReason | null {
  const { answer, onboarded, state, today } = input;
  if (answer !== null || !onboarded) return null;
  if (state.closes >= MAX_UNANSWERED_CLOSES || state.lastClosedOn === today) return null;
  if (state.days.length >= PROMPT_ON_DAY) return 'day';
  if (state.acted) return 'action';
  return null;
}

/**
 * Screens that are a form or a flow in progress: the page never covers one.
 * Matched on path segments, as `usePathname` gives them (route groups dropped).
 */
const FLOW_SEGMENTS = new Set([
  'completar-perfil',
  'entrar',
  'crear',
  'editar',
  'nuevo',
  'nueva',
  'definir',
  'unirse',
  'organizar',
  'vincular',
  'plaza',
  'cambiar-email',
  'eliminar-cuenta',
]);

export function isFlowRoute(pathname: string): boolean {
  return pathname.split('/').some((segment) => FLOW_SEGMENTS.has(segment));
}

/** Storage is the device's: anything unreadable starts over rather than throwing. */
export function parsePromptState(raw: string | null): ConsentPromptState {
  if (!raw) return EMPTY_PROMPT_STATE;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return EMPTY_PROMPT_STATE;
    const o = v as Record<string, unknown>;
    const days = Array.isArray(o.days) ? o.days.filter((d): d is string => typeof d === 'string') : [];
    return {
      days: days.slice(0, PROMPT_ON_DAY),
      acted: o.acted === true,
      closes: typeof o.closes === 'number' && Number.isFinite(o.closes) ? o.closes : 0,
      lastClosedOn: typeof o.lastClosedOn === 'string' ? o.lastClosedOn : null,
    };
  } catch {
    return EMPTY_PROMPT_STATE;
  }
}

type ActionListener = (action: ConsentPromptAction) => void;
const listeners = new Set<ActionListener>();

/**
 * Call where one of {@link CONSENT_PROMPT_ACTIONS} has just succeeded. Local
 * only — nothing leaves the device — so it runs whatever the consent.
 */
export function noteConsentPromptAction(action: ConsentPromptAction): void {
  for (const l of listeners) l(action);
}

export function onConsentPromptAction(listener: ActionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
