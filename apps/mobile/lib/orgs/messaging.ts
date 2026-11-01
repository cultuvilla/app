import {
  GROUP_POLL_MAX_OPTIONS,
  type GroupMessageAudienceKind,
  type GroupPollKind,
  type GroupWhatsappMode,
  type SendGroupMessageInput,
} from '@cultuvilla/shared/models/organization';

export type PollChoice = GroupPollKind | 'none';

/** What the composer holds while the admin writes. */
export interface ComposerForm {
  title: string;
  body: string;
  audience: GroupMessageAudienceKind;
  eventId: string | null;
  push: boolean;
  email: boolean;
  whatsapp: GroupWhatsappMode;
  poll: PollChoice;
  question: string;
  /** The choices of a multiple-choice poll, as typed (blank ones are dropped). */
  options: string[];
}

export function emptyComposerForm(): ComposerForm {
  return {
    title: '',
    body: '',
    audience: 'all',
    eventId: null,
    push: true,
    email: true,
    whatsapp: 'none',
    poll: 'none',
    question: '',
    options: ['', ''],
  };
}

export type ComposerError = 'subject' | 'body' | 'event' | 'poll';

/**
 * The callable's input from the form, or the first thing to fix. `yesNo` are
 * the localized labels a yes/no poll stores, so every channel shows the words
 * the admin saw.
 */
export function composerInput(
  form: ComposerForm,
  ids: { orgId: string; messageId: string },
  yesNo: [string, string],
): { input: SendGroupMessageInput } | { error: ComposerError } {
  const title = form.title.trim();
  const body = form.body.trim();
  if (!title) return { error: 'subject' };
  if (!body) return { error: 'body' };
  if (form.audience === 'event' && !form.eventId) return { error: 'event' };

  let poll: SendGroupMessageInput['poll'] = null;
  if (form.poll !== 'none') {
    const question = form.question.trim();
    const options = form.poll === 'yes_no' ? [...yesNo] : form.options.map((o) => o.trim()).filter(Boolean);
    if (!question || options.length < 2 || options.length > GROUP_POLL_MAX_OPTIONS) return { error: 'poll' };
    poll = { question, kind: form.poll, options };
  }

  return {
    input: {
      orgId: ids.orgId,
      messageId: ids.messageId,
      title,
      body,
      audience: { kind: form.audience, eventId: form.audience === 'event' ? form.eventId : null },
      channels: { push: form.push, email: form.email, whatsapp: form.whatsapp },
      // Avisos are no longer pinned (decided 2026-11-01, user); the field stays
      // in the callable's input for the binaries that still offer it.
      pinned: false,
      poll,
    },
  };
}
