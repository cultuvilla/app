import { useMemo, useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  Pressable,
  Text as RNText,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, zIndex } from '@cultuvilla/shared/design-system';
import { Text, VStack } from '../primitives';
import { useT } from '../../lib/i18n';
import {
  activeMentionQuery,
  adjustMentions,
  deleteMentionAt,
  insertMention,
  type MentionCandidate,
} from '../../lib/mentionText';
import {
  detectPastedUrl,
  applyCustomTextLink,
  buildLinkRuns,
  isSafeHttpUrl,
  addLinkSpan,
  sliceRuns,
  type LinkRun,
} from '../../lib/linkText';
import { toggleMark, isRangeMarked } from '../../lib/markText';
import { markPresentation } from '../../lib/markStyle';
import { HEADING_LEVELS, type HeadingLevel } from '../../lib/newsHeading';
import { LinkSheet } from './LinkSheet';
import { LinkUrlSheet } from './LinkUrlSheet';
import {
  NEWS_MARK_TYPES,
  type NewsMention,
  type NewsLink,
  type NewsMark,
  type NewsMarkType,
  type MentionEntityType,
} from '@cultuvilla/shared/models/news/NewsPostDataModel';

const ACCENT = colors.light.fg.accent;

// The single letter shown on each formatting button, styled by its own mark so
// the button previews the effect (bold B, italic I, underlined U, struck S).
const MARK_BUTTON_LABEL: Record<NewsMarkType, string> = {
  bold: 'B',
  italic: 'I',
  underline: 'U',
  strikethrough: 'S',
};

// Appended to the caret-line measurer so its last line still has height when
// the text ends in a newline.
const TRAILING_ANCHOR = String.fromCodePoint(0x200b); // zero-width space

// Vertical gap between the caret's line and the toolbar/link sheet anchored
// beneath it.
const ANCHOR_GAP = 6;

function StyledRuns({ runs }: { runs: LinkRun[] }) {
  return (
    <>
      {runs.map((run, i) => {
        // Raw RNText (not the primitive Text) so `text-accent` isn't
        // overridden by the primitive's default `text-primary` tone.
        const linked = !!(run.mention || run.link || run.autoUrl);
        const pres = markPresentation(run.marks, linked);
        const color = linked ? 'text-accent' : 'text-primary';
        return (
          <RNText key={i} className={`${color} ${pres.className}`} style={pres.style}>
            {run.text}
          </RNText>
        );
      })}
    </>
  );
}

const ENTITY_ICON: Record<MentionEntityType, keyof typeof Ionicons.glyphMap> = {
  organization: 'people-outline',
  event: 'calendar-outline',
  place: 'location-outline',
  barrio: 'map-outline',
  village: 'home-outline',
  news: 'newspaper-outline',
  festivalPoster: 'image-outline',
};

interface MentionTextInputProps {
  value: string;
  mentions: NewsMention[];
  links: NewsLink[];
  marks: NewsMark[];
  onChange: (text: string, mentions: NewsMention[], links: NewsLink[], marks: NewsMark[]) => void;
  candidates: MentionCandidate[];
  placeholder?: string;
  /** Fired when this field gains focus — lets the editor track the active block. */
  onFocus?: () => void;
  /** Reports the caret position so the editor can split here on image insert. */
  onSelectionChange?: (caret: number) => void;
  /**
   * Turns the line holding the selection into a title. When absent (image
   * captions) the toolbar shows no title buttons.
   */
  onHeading?: (level: HeadingLevel, selectionStart: number) => void;
  testID?: string;
}

/**
 * A multiline text field with `@`-mention autocomplete. Mentions are stored as
 * ranges alongside the raw text (see {@link lib/mentionText}); the field itself
 * renders plain text — the styled, tappable rendering happens on the reader
 * ({@link RichText}). Suggestions render inline beneath the field (rather than a
 * floating overlay) so they never clip inside the editor's ScrollView.
 */
export function MentionTextInput({
  value,
  mentions,
  links,
  marks,
  onChange,
  candidates,
  placeholder,
  onFocus,
  onSelectionChange,
  onHeading,
  testID,
}: MentionTextInputProps) {
  const { t } = useT();
  // Track the caret only to detect an in-progress `@query`. We deliberately do
  // NOT control the native `selection` prop: on Android a controlled selection
  // forces the field into NO_SUGGESTIONS mode, which drops the keyboard's
  // suggestion strip (the "keyboard got smaller" bug). After a mention insert we
  // let the caret fall to the end of the new value, which is the common case.
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  // Height (in px) of the text up to the caret, rendered at the same width as
  // the real field — i.e. the y-offset of the bottom of the caret's own line.
  // Lets the toolbar/link sheets anchor next to the selection instead of
  // always trailing the whole field. Measured via a hidden mirror of the
  // overlay text since RN's TextInput exposes only character offsets, not
  // on-screen caret coordinates.
  const [caretLineTop, setCaretLineTop] = useState(0);
  const [pendingUrl, setPendingUrl] = useState<{ url: string; offset: number; length: number } | null>(
    null,
  );
  // A non-empty range awaiting a URL (the toolbar's link button opens LinkUrlSheet).
  const [linkRange, setLinkRange] = useState<{ start: number; end: number } | null>(null);
  const runs = useMemo(() => buildLinkRuns(value, mentions, links, marks), [value, mentions, links, marks]);

  const inputRef = useRef<TextInput>(null);

  const hasSelection = selection.start !== selection.end;
  const active = !hasSelection ? activeMentionQuery(value, selection.start, mentions) : null;

  const suggestions = useMemo(() => {
    if (!active) return [];
    const q = active.query.trim().toLowerCase();
    const matches = q
      ? candidates.filter((c) => c.label.toLowerCase().includes(q))
      : candidates;
    return matches.slice(0, 8);
  }, [active, candidates]);

  function handleChangeText(next: string) {
    const nextMentions = adjustMentions(value, next, mentions);
    const nextLinks = adjustMentions(value, next, links);
    const nextMarks = adjustMentions(value, next, marks);
    onChange(next, nextMentions, nextLinks, nextMarks);
    const detected = detectPastedUrl(value, next);
    if (detected && isSafeHttpUrl(detected.url)) setPendingUrl(detected);
  }

  function handleKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    const key = e.nativeEvent.key;
    if (key !== 'Backspace' && key !== 'Delete') return;
    if (selection.start !== selection.end) return; // a range delete flows through adjustMentions
    const res = deleteMentionAt(value, mentions, selection.start, key === 'Backspace' ? 'backward' : 'forward');
    if (!res) return;
    // preventDefault fires on RN-Web (our primary target); it stops the textarea
    // from also eating one character. Native has no equivalent — see the plan's
    // accepted-risks note.
    (e as unknown as { preventDefault?: () => void }).preventDefault?.();
    onChange(res.text, res.mentions, adjustMentions(value, res.text, links), adjustMentions(value, res.text, marks));
    moveCaret(res.cursor);
  }

  function pick(candidate: MentionCandidate) {
    if (!active) return;
    const res = insertMention(value, mentions, active, candidate);
    onChange(res.text, res.mentions, adjustMentions(value, res.text, links), adjustMentions(value, res.text, marks));
    moveCaret(res.cursor);
  }

  // Toolbar actions operate on the last known selection range. The value is
  // unchanged (a mark is a style; a link records a span over existing text), so
  // even if pressing the button blurred the field, the offsets stay valid.
  function applyMarkToSelection(type: NewsMarkType) {
    onChange(value, mentions, links, toggleMark(marks, type, selection.start, selection.end));
  }

  function openLinkForSelection() {
    setLinkRange({ start: selection.start, end: selection.end });
  }

  // A programmatic edit (mention insert / atomic delete) moves the caret without
  // the native field firing onSelectionChange — on web a scripted value+selection
  // change doesn't reliably re-emit it. Report the new caret to the parent
  // ourselves so consumers tracking it (e.g. BlockEditor's image-insert split
  // point) don't act on a stale offset. Predicting it also closes the suggestion
  // list immediately; the native onSelectionChange confirms it on the next frame.
  function moveCaret(cursor: number) {
    setSelection({ start: cursor, end: cursor });
    onSelectionChange?.(cursor);
  }

  return (
    <VStack gap={1}>
      <View className="border rounded-md px-3 py-2 bg-surface border-subtle">
        {/* The input sits in normal flow with scrolling off, so it auto-grows
            line-by-line and renders the styled runs as its own children —
            glyphs, caret and selection share one layout. */}
        <View style={{ position: 'relative', minHeight: 80 }}>
          {/* Mirrors the styled text up to the caret, so bold/italic widths wrap
              it exactly like the visible text. */}
          <Text
            testID="caret-line-measurer"
            pointerEvents="none"
            className="text-body"
            style={{ position: 'absolute', width: '100%', opacity: 0 }}
            onLayout={(e) => setCaretLineTop(e.nativeEvent.layout.height)}
          >
            <StyledRuns runs={sliceRuns(runs, selection.start)} />
            {TRAILING_ANCHOR}
          </Text>
          <TextInput
            ref={inputRef}
            // The input gets its text from the children below; passing
            // `value` as well is unsupported.
            onChangeText={handleChangeText}
            onKeyPress={handleKeyPress}
            multiline
            scrollEnabled={false}
            placeholder={placeholder}
            placeholderTextColor={colors.light.fg.muted}
            accessibilityLabel={placeholder}
            testID={testID}
            className="text-body"
            textAlignVertical="top"
            style={{ minHeight: 80, padding: 0 }}
            cursorColor={ACCENT}
            selectionColor={ACCENT}
            onFocus={onFocus}
            onSelectionChange={(e) => {
              const sel = e.nativeEvent.selection;
              setSelection(sel);
              onSelectionChange?.(sel.start);
            }}
          >
            {value ? <StyledRuns runs={runs} /> : null}
          </TextInput>
          {hasSelection ? (
            <View
              testID="format-toolbar"
              className="flex-row items-center gap-1 rounded-md border border-subtle bg-surface-elevated p-1 shadow-md"
              style={{ position: 'absolute', top: caretLineTop + ANCHOR_GAP, left: 0, zIndex: zIndex.dropdown }}
            >
              {NEWS_MARK_TYPES.map((type) => {
                const activeMark = isRangeMarked(marks, type, selection.start, selection.end);
                const pres = markPresentation([type], false);
                return (
                  <Pressable
                    key={type}
                    onPress={() => applyMarkToSelection(type)}
                    accessibilityRole="button"
                    accessibilityLabel={t(`news.compose.format.${type}`)}
                    accessibilityState={{ selected: activeMark }}
                    hitSlop={4}
                    className={`h-8 w-8 items-center justify-center rounded ${activeMark ? 'bg-surface' : ''}`}
                  >
                    {/* The label previews its own effect (struck S, italic I, …).
                        Raw RNText so `text-accent` wins and the decoration style
                        (underline/strikethrough) actually renders. */}
                    <RNText className={`text-accent ${pres.className}`} style={pres.style}>
                      {MARK_BUTTON_LABEL[type]}
                    </RNText>
                  </Pressable>
                );
              })}
              {onHeading
                ? HEADING_LEVELS.map((level) => (
                    <Pressable
                      key={level}
                      onPress={() => onHeading(level, selection.start)}
                      accessibilityRole="button"
                      accessibilityLabel={t(`news.compose.format.${level}`)}
                      hitSlop={4}
                      className="h-8 items-center justify-center rounded px-2"
                    >
                      <RNText className={`text-accent ${level === 'section' ? 'font-bold' : 'text-bodySm font-semibold'}`}>
                        {t(`news.compose.format.${level}`)}
                      </RNText>
                    </Pressable>
                  ))
                : null}
              <Pressable
                onPress={openLinkForSelection}
                accessibilityRole="button"
                accessibilityLabel={t('news.compose.format.link')}
                hitSlop={4}
                className="h-8 w-8 items-center justify-center rounded"
              >
                <Ionicons name="link" size={18} color={ACCENT} />
              </Pressable>
            </View>
          ) : null}
          <LinkSheet
            anchorTop={caretLineTop + ANCHOR_GAP}
            url={pendingUrl?.url ?? null}
            onDismiss={() => setPendingUrl(null)}
            onSave={(displayText) => {
              if (pendingUrl && displayText) {
                const res = applyCustomTextLink(value, mentions, links, pendingUrl, displayText);
                // The display text replaces the pasted URL, so mark spans shift too.
                onChange(res.text, res.mentions, res.links, adjustMentions(value, res.text, marks));
              }
              setPendingUrl(null);
            }}
          />
          <LinkUrlSheet
            anchorTop={caretLineTop + ANCHOR_GAP}
            displayText={linkRange ? value.slice(linkRange.start, linkRange.end) : null}
            onDismiss={() => setLinkRange(null)}
            onSave={(url) => {
              if (linkRange) {
                onChange(value, mentions, addLinkSpan(links, linkRange.start, linkRange.end, url), marks);
              }
              setLinkRange(null);
            }}
          />
        </View>
      </View>
      {active && suggestions.length > 0 ? (
        <VStack gap={1} className="rounded-md border border-subtle bg-surface-elevated p-1">
          {suggestions.map((c) => (
            <Pressable
              key={`${c.entityType}:${c.entityId}`}
              onPress={() => pick(c)}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              className="flex-row items-center gap-2 rounded p-2"
            >
              <Ionicons name={ENTITY_ICON[c.entityType]} size={18} color={ACCENT} />
              <Text className="flex-1" numberOfLines={1}>
                {c.label}
              </Text>
              <Text variant="caption" tone="muted">
                {t(`news.compose.mentionType.${c.entityType}`)}
              </Text>
            </Pressable>
          ))}
        </VStack>
      ) : null}
    </VStack>
  );
}
