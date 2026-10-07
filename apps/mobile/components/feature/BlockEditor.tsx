import { useRef } from 'react';
import { Image, Text as RNText, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { HStack, Pressable, Text, VStack } from '../primitives';
import { useT } from '../../lib/i18n';
import { pickImageWithSize } from '../../lib/images';
import { MentionTextInput } from './MentionTextInput';
import { HEADING_LEVELS, HEADING_PRESENTATION, type HeadingLevel } from '../../lib/newsHeading';
import { splitMentionsAtCaret, type MentionCandidate } from '../../lib/mentionText';
import type {
  NewsMention,
  NewsLink,
  NewsMark,
  NewsTextBlock,
} from '@cultuvilla/shared/models/news/NewsPostDataModel';

const ACCENT = colors.light.fg.accent;
const MUTED = colors.light.fg.muted;


/**
 * Editor-side block. Distinct from the persisted `NewsBlock`: it carries a
 * stable `id` for list keys, and image blocks hold either an already-uploaded
 * `storagePath` (edit mode) or a freshly-picked `blob` awaiting upload on submit.
 * The parent screen maps these to `NewsBlock`s at save time.
 */
export type EditorTextBlock = {
  id: string;
  type: 'text';
  text: string;
  mentions: NewsMention[];
  links: NewsLink[];
  marks: NewsMark[];
};
export type EditorImageBlock = {
  id: string;
  type: 'image';
  /** Set when the image is already in Storage (edit mode). */
  storagePath: string | null;
  /** Set for a freshly-picked image, uploaded on submit. */
  blob: Blob | null;
  /** Preview/display URI (download URL or local asset uri). */
  uri: string | null;
  width: number;
  height: number;
  caption: string;
  captionMentions: NewsMention[];
  captionLinks: NewsLink[];
  captionMarks: NewsMark[];
};
/** A section / subsection title: plain text, no mentions, links or marks. */
export type EditorHeadingBlock = {
  id: string;
  type: 'heading';
  text: string;
  level: HeadingLevel;
};
export type EditorBlock = EditorTextBlock | EditorImageBlock | EditorHeadingBlock;


// Cap to avoid unbounded arrays — the block editor's inline body images, not a
// gallery, so this is a UI-only product decision rather than a schema limit.
const MAX_IMAGE_BLOCKS = 25;

let blockSeq = 0;
export function newBlockId(): string {
  blockSeq += 1;
  return `b${blockSeq}-${Date.now()}`;
}

export function emptyTextBlock(): EditorTextBlock {
  return { id: newBlockId(), type: 'text', text: '', mentions: [], links: [], marks: [] };
}

/** Stored text block → editor block. A heading is persisted as a styled text block. */
export function newsTextToEditorBlock(b: NewsTextBlock): EditorTextBlock | EditorHeadingBlock {
  if (b.style !== 'paragraph') return { id: newBlockId(), type: 'heading', text: b.text, level: b.style };
  return { id: newBlockId(), type: 'text', text: b.text, mentions: b.mentions, links: b.links, marks: b.marks };
}

/** Editor text or heading block → stored text block. */
export function editorBlockToNewsText(b: EditorTextBlock | EditorHeadingBlock): NewsTextBlock {
  if (b.type === 'heading') {
    return { type: 'text', text: b.text, mentions: [], links: [], marks: [], style: b.level };
  }
  return { type: 'text', text: b.text, mentions: b.mentions, links: b.links, marks: b.marks, style: 'paragraph' };
}

/** The part of a paragraph between `start` and `end`, with its spans rebased. */
function sliceTextBlock(b: EditorTextBlock, start: number, end: number, id: string): EditorTextBlock {
  const within = <T extends { offset: number; length: number }>(spans: T[]) =>
    splitMentionsAtCaret(splitMentionsAtCaret(spans, start).after, end - start).before;
  return {
    id,
    type: 'text',
    text: b.text.slice(start, end),
    mentions: within(b.mentions),
    links: within(b.links),
    marks: within(b.marks),
  };
}

/** `a` then `b` as one paragraph (keeping `a`'s id), separated by `sep` when both have text. */
function joinTextBlocks(a: EditorTextBlock, b: EditorTextBlock, sep: string): EditorTextBlock {
  const gap = a.text && b.text ? sep : '';
  const shift = a.text.length + gap.length;
  const rebase = <T extends { offset: number }>(spans: T[]) => spans.map((s) => ({ ...s, offset: s.offset + shift }));
  return {
    id: a.id,
    type: 'text',
    text: a.text + gap + b.text,
    mentions: [...a.mentions, ...rebase(b.mentions)],
    links: [...a.links, ...rebase(b.links)],
    marks: [...a.marks, ...rebase(b.marks)],
  };
}

interface BlockEditorProps {
  blocks: EditorBlock[];
  onChange: (blocks: EditorBlock[]) => void;
  candidates: MentionCandidate[];
  /** Heads every block's ids: `<prefix>-text-<i>`, `<prefix>-heading-<i>`, `<prefix>-caption-<i>`, `<prefix>-add-image`. */
  testIDPrefix?: string;
}

/**
 * A block editor for news bodies — the mobile analogue of a WordPress editor,
 * kept deliberately simple: you write in a text area. "Add image" drops an image
 * at the caret, and the format toolbar's title buttons turn the selected line
 * into a title. Either splits the current paragraph around the new block and
 * guarantees a text box after it so writing can continue. There is no separate
 * "add paragraph" or manual reorder — the structure follows from where titles
 * and images go.
 */
export function BlockEditor({ blocks, onChange, candidates, testIDPrefix }: BlockEditorProps) {
  const blockTestID = (kind: string, index?: number) =>
    testIDPrefix ? `${testIDPrefix}-${kind}${index === undefined ? '' : `-${index}`}` : undefined;
  const { t } = useT();
  // The currently-focused text block and caret, tracked in a ref (no re-render
  // needed) so an image insert knows where to split.
  const active = useRef<{ id: string | null; caret: number }>({ id: null, caret: 0 });
  const imageBlockCount = blocks.filter((b) => b.type === 'image').length;

  function updateBlock(id: string, patch: Partial<EditorBlock>) {
    onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as EditorBlock) : b)));
  }

  // Removing an image or heading between two paragraphs merges them back into
  // one, so the author never ends up with invisibly-adjacent text blocks.
  function removeBlock(id: string) {
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const prev = blocks[i - 1];
    const next = blocks[i + 1];
    if (prev?.type === 'text' && next?.type === 'text') {
      onChange([...blocks.slice(0, i - 1), joinTextBlocks(prev, next, '\n\n'), ...blocks.slice(i + 2)]);
    } else {
      onChange(blocks.filter((b) => b.id !== id));
    }
  }

  // Drop `inserted` at the caret of the focused paragraph, splitting it in two
  // (text before / text after). A text box always follows so writing can
  // continue. With no focused paragraph, the block is appended.
  function insertAtCaret(inserted: EditorBlock) {
    const i = active.current.id ? blocks.findIndex((b) => b.id === active.current.id) : -1;
    const target = i >= 0 ? blocks[i] : undefined;
    if (!target || target.type !== 'text') {
      onChange([...blocks, inserted, emptyTextBlock()]);
      return;
    }

    const caret = Math.min(Math.max(active.current.caret, 0), target.text.length);
    const beforeBlock = sliceTextBlock(target, 0, caret, target.id);
    const afterBlock = sliceTextBlock(target, caret, target.text.length, newBlockId());
    const middle: EditorBlock[] = [];
    if (beforeBlock.text.length > 0) middle.push(beforeBlock);
    middle.push(inserted);
    middle.push(afterBlock);
    // The focused paragraph was consumed by the split; a later insert with no
    // re-focus must not act on its stale caret.
    active.current = { id: null, caret: 0 };
    onChange([...blocks.slice(0, i), ...middle, ...blocks.slice(i + 1)]);
  }

  // Turn the line holding `at` into a title: the paragraph splits into the lines
  // before it, the title, and the lines after it (always kept, so writing can
  // continue). A title is plain text, so spans inside that line are dropped.
  function lineToHeading(blockId: string, at: number, level: HeadingLevel) {
    const i = blocks.findIndex((b) => b.id === blockId);
    const target = blocks[i];
    if (!target || target.type !== 'text') return;
    const { text } = target;
    const lineStart = text.lastIndexOf('\n', Math.max(at - 1, -1)) + 1;
    const newline = text.indexOf('\n', at);
    const lineEnd = newline === -1 ? text.length : newline;

    const beforeBlock = sliceTextBlock(target, 0, Math.max(lineStart - 1, 0), target.id);
    const heading: EditorHeadingBlock = {
      id: newBlockId(),
      type: 'heading',
      text: text.slice(lineStart, lineEnd).trim(),
      level,
    };
    const afterBlock = sliceTextBlock(target, Math.min(lineEnd + 1, text.length), text.length, newBlockId());
    const middle: EditorBlock[] = [];
    if (beforeBlock.text.length > 0) middle.push(beforeBlock);
    middle.push(heading, afterBlock);
    active.current = { id: null, caret: 0 };
    onChange([...blocks.slice(0, i), ...middle, ...blocks.slice(i + 1)]);
  }

  // Turn a title back into a line, joined into the paragraphs around it.
  function headingToText(id: string) {
    const i = blocks.findIndex((b) => b.id === id);
    const heading = blocks[i];
    if (!heading || heading.type !== 'heading') return;
    let merged: EditorTextBlock = { id: heading.id, type: 'text', text: heading.text, mentions: [], links: [], marks: [] };
    let from = i;
    let to = i + 1;
    const prev = blocks[i - 1];
    if (prev?.type === 'text') {
      merged = joinTextBlocks(prev, merged, '\n');
      from = i - 1;
    }
    const next = blocks[i + 1];
    if (next?.type === 'text') {
      merged = joinTextBlocks(merged, next, '\n');
      to = i + 2;
    }
    onChange([...blocks.slice(0, from), merged, ...blocks.slice(to)]);
  }

  async function addImageAtCaret() {
    const picked = await pickImageWithSize();
    if (!picked) return;
    insertAtCaret({
      id: newBlockId(),
      type: 'image',
      storagePath: null,
      blob: picked.blob,
      uri: picked.previewUri ?? null,
      width: picked.width,
      height: picked.height,
      caption: '',
      captionMentions: [],
      captionLinks: [],
      captionMarks: [],
    });
  }

  return (
    <VStack gap={3}>
      {blocks.map((block, index) =>
        block.type === 'text' ? (
          <MentionTextInput
            key={block.id}
            value={block.text}
            mentions={block.mentions}
            links={block.links}
            marks={block.marks}
            candidates={candidates}
            placeholder={t('news.compose.block.textPlaceholder')}
            testID={blockTestID('text', index)}
            onChange={(text, mentions, links, marks) => updateBlock(block.id, { text, mentions, links, marks })}
            onFocus={() => {
              active.current = { id: block.id, caret: block.text.length };
            }}
            onHeading={(level, at) => lineToHeading(block.id, at, level)}
            onSelectionChange={(caret) => {
              if (active.current.id === block.id) active.current.caret = caret;
            }}
          />
        ) : block.type === 'heading' ? (
          <HeadingBlock
            key={block.id}
            block={block}
            onToText={() => headingToText(block.id)}
            onText={(text) => updateBlock(block.id, { text })}
            onLevel={(level) => updateBlock(block.id, { level })}
            onRemove={() => removeBlock(block.id)}
            testID={blockTestID('heading', index)}
          />
        ) : (
          <ImageBlock
            key={block.id}
            block={block}
            candidates={candidates}
            captionPlaceholder={t('news.compose.block.captionPlaceholder')}
            removeLabel={t('news.compose.block.removeImage')}
            onCaption={(caption, captionMentions, captionLinks, captionMarks) =>
              updateBlock(block.id, { caption, captionMentions, captionLinks, captionMarks })}
            onRemove={() => removeBlock(block.id)}
            testID={blockTestID('image', index)}
          />
        ),
      )}

      {imageBlockCount < MAX_IMAGE_BLOCKS ? (
        <AddBlockButton
          icon="image-outline"
          label={t('news.compose.block.addImage')}
          onPress={() => void addImageAtCaret()}
          testID={blockTestID('add-image')}
        />
      ) : null}
    </VStack>
  );
}

function ImageBlock({
  block,
  candidates,
  captionPlaceholder,
  removeLabel,
  onCaption,
  onRemove,
  testID,
}: {
  block: EditorImageBlock;
  candidates: MentionCandidate[];
  captionPlaceholder: string;
  removeLabel: string;
  onCaption: (
    caption: string,
    captionMentions: NewsMention[],
    captionLinks: NewsLink[],
    captionMarks: NewsMark[],
  ) => void;
  onRemove: () => void;
  testID?: string;
}) {
  return (
    <VStack gap={2}>
      <View
        className="overflow-hidden rounded-lg bg-surface"
        style={{ width: '100%', aspectRatio: block.width > 0 && block.height > 0 ? block.width / block.height : 16 / 9 }}
      >
        {block.uri ? (
          <Image
            source={{ uri: block.uri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
          hitSlop={8}
          testID={testID ? `${testID}-remove` : undefined}
          className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full bg-black/50"
        >
          <Ionicons name="close" size={20} color="#ffffff" />
        </Pressable>
      </View>
      <MentionTextInput
        value={block.caption}
        mentions={block.captionMentions}
        links={block.captionLinks}
        marks={block.captionMarks}
        candidates={candidates}
        placeholder={captionPlaceholder}
        onChange={onCaption}
        testID={testID ? `${testID}-caption` : undefined}
      />
    </VStack>
  );
}

function HeadingBlock({
  block,
  onToText,
  onText,
  onLevel,
  onRemove,
  testID,
}: {
  block: EditorHeadingBlock;
  onToText: () => void;
  onText: (text: string) => void;
  onLevel: (level: HeadingLevel) => void;
  onRemove: () => void;
  testID?: string;
}) {
  const { t } = useT();
  const placeholder = t(`news.compose.block.${block.level}Placeholder`);
  return (
    <VStack gap={2} className="rounded-md border border-subtle bg-surface px-3 py-2">
      <HStack gap={2} className="items-center">
        {HEADING_LEVELS.map((level) => {
          const selected = block.level === level;
          return (
            <Pressable
              key={level}
              onPress={() => onLevel(level)}
              accessibilityRole="button"
              accessibilityLabel={t(`news.compose.block.${level}`)}
              accessibilityState={{ selected }}
              testID={testID ? `${testID}-${level}` : undefined}
              className={`rounded-full border px-3 py-1 ${selected ? 'border-accent bg-surface-elevated' : 'border-subtle'}`}
            >
              <RNText className={`text-caption ${selected ? 'text-accent' : 'text-muted'}`}>
                {t(`news.compose.block.${level}`)}
              </RNText>
            </Pressable>
          );
        })}
        <Pressable
          onPress={onToText}
          accessibilityRole="button"
          accessibilityLabel={t('news.compose.block.paragraph')}
          testID={testID ? `${testID}-to-text` : undefined}
          className="rounded-full border border-subtle px-3 py-1"
        >
          <RNText className="text-caption text-muted">{t('news.compose.block.paragraph')}</RNText>
        </Pressable>
        <View className="flex-1" />
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={t('news.compose.block.removeSection')}
          hitSlop={8}
          testID={testID ? `${testID}-remove` : undefined}
          className="h-8 w-8 items-center justify-center"
        >
          <Ionicons name="close" size={iconSizes.md} color={MUTED} />
        </Pressable>
      </HStack>
      <TextInput
        value={block.text}
        onChangeText={onText}
        placeholder={placeholder}
        placeholderTextColor={MUTED}
        accessibilityLabel={placeholder}
        className={`text-primary text-${HEADING_PRESENTATION[block.level].variant} ${HEADING_PRESENTATION[block.level].className}`}
        style={{ padding: 0 }}
        cursorColor={ACCENT}
        selectionColor={ACCENT}
        testID={testID}
      />
    </VStack>
  );
}

/** Dashed "add" affordance mirroring the pueblo tab's AddCard (dashed border,
 *  accent icon, centered label). */
function AddBlockButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      className="items-center justify-center gap-1 rounded-2xl border border-dashed border-subtle py-4"
    >
      <Ionicons name={icon} size={26} color={ACCENT} />
      <Text variant="bodySm" tone="muted" className="text-center">
        {label}
      </Text>
    </Pressable>
  );
}
