import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  HISTORY_ENTRY_MAX_IMAGES,
  HISTORY_ENTRY_TITLE_MAX,
  type HistoricalDate,
  type HistoryEntryBody,
  type HistoryEntryImage,
} from '@cultuvilla/shared/models/history';
import { uploadHistoryEntryImage } from '@cultuvilla/shared/services/imageService';
import { Button } from '../../primitives/Button';
import { FieldLabel } from '../../primitives/FieldLabel';
import { Input } from '../../primitives/Input';
import { Text } from '../../primitives/Text';
import { Toggle } from '../../primitives/Toggle';
import { VStack } from '../../primitives/VStack';
import { MultiImagePickerRow } from '../MultiImagePickerRow';
import { MentionTextInput } from '../MentionTextInput';
import { HistoricalDateField } from './HistoricalDateField';
import { useT } from '../../../lib/i18n';
import { pickImageAsBlob } from '../../../lib/images';
import { useMentionSources } from '../../../lib/useMentionSources';
import {
  draftFromDate,
  emptyDateDraft,
  validateHistoryDates,
  type HistoryDatesError,
} from '../../../lib/history/historyForm';

export interface HistoryEntryFormValues {
  title: string;
  body: HistoryEntryBody;
  images: HistoryEntryImage[];
  start: HistoricalDate;
  end: HistoricalDate | null;
  approximate: boolean;
  sources: string | null;
}

const EMPTY_BODY: HistoryEntryBody = { text: '', mentions: [], links: [], marks: [] };

type FormError = HistoryDatesError | 'titleRequired' | 'saveFailed';

/**
 * Create + edit form for a history entry. Images upload as they are picked,
 * under the entry id the caller minted, so the doc write only carries URLs.
 */
export function HistoryEntryForm({
  municipalityId,
  entryId,
  initial,
  onSubmit,
}: {
  municipalityId: string;
  entryId: string;
  initial?: HistoryEntryFormValues;
  onSubmit: (values: HistoryEntryFormValues) => Promise<void>;
}) {
  const { t } = useT();
  const { candidates } = useMentionSources(municipalityId);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState<HistoryEntryBody>(initial?.body ?? EMPTY_BODY);
  const [images, setImages] = useState<HistoryEntryImage[]>(initial?.images ?? []);
  const [start, setStart] = useState(initial ? draftFromDate(initial.start) : emptyDateDraft());
  const [isRange, setIsRange] = useState(initial?.end != null);
  const [end, setEnd] = useState(initial?.end ? draftFromDate(initial.end) : emptyDateDraft());
  const [approximate, setApproximate] = useState(initial?.approximate ?? false);
  const [sources, setSources] = useState(initial?.sources ?? '');
  const [addingImage, setAddingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  async function addImage() {
    const picked = await pickImageAsBlob();
    if (!picked) return;
    setAddingImage(true);
    try {
      const url = await uploadHistoryEntryImage(municipalityId, entryId, picked);
      setImages((prev) => [...prev, { url, caption: null }]);
    } finally {
      setAddingImage(false);
    }
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function setCaption(index: number, caption: string) {
    setImages((prev) => prev.map((img, i) => (i === index ? { ...img, caption } : img)));
  }

  async function submit() {
    if (!title.trim()) {
      setError('titleRequired');
      return;
    }
    const dates = validateHistoryDates({ start, isRange, end });
    if ('error' in dates) {
      setError(dates.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        title,
        body,
        images: images.map((img) => ({ url: img.url, caption: img.caption?.trim() || null })),
        start: dates.start,
        end: dates.end,
        approximate,
        sources: sources.trim() || null,
      });
    } catch {
      setError('saveFailed');
    } finally {
      setSaving(false);
    }
  }

  const dateError = (which: 'start' | 'end'): string | undefined => {
    if (!error || error === 'titleRequired' || error === 'saveFailed') return undefined;
    const isEndError = error.startsWith('end');
    if ((which === 'end') !== isEndError) return undefined;
    return t(`village.history.form.errors.${error}`);
  };

  return (
    <ScrollView contentContainerClassName="p-4 pb-10" keyboardShouldPersistTaps="handled">
      <VStack gap={4} align="stretch">
        <VStack gap={1} align="start">
          <FieldLabel>{t('village.history.form.images')}</FieldLabel>
          <Text tone="muted" variant="bodySm">
            {t('village.history.form.imagesHint')}
          </Text>
          <MultiImagePickerRow
            uris={images.map((img) => img.url)}
            onAddPress={addImage}
            onRemove={removeImage}
            max={HISTORY_ENTRY_MAX_IMAGES}
            adding={addingImage}
            addLabel={t('village.history.form.addImage')}
            removeLabel={t('village.history.form.removeImage')}
            testID="history-images"
          />
        </VStack>
        {images.map((img, index) => (
          <Input
            key={img.url}
            testID={`history-caption-${String(index)}`}
            value={img.caption ?? ''}
            onChangeText={(text) => setCaption(index, text)}
            label={t('village.history.form.caption', { n: index + 1 })}
            placeholder={t('village.history.form.captionPlaceholder')}
          />
        ))}
        <Input
          testID="history-title-input"
          value={title}
          onChangeText={setTitle}
          label={t('village.history.form.title')}
          placeholder={t('village.history.form.titlePlaceholder')}
          maxLength={HISTORY_ENTRY_TITLE_MAX}
          error={error === 'titleRequired' ? t('village.history.form.errors.titleRequired') : undefined}
        />
        <VStack gap={3} align="stretch">
          <HistoricalDateField
            testID="history-start"
            label={isRange ? t('village.history.form.from') : t('village.history.form.date')}
            value={start}
            onChange={setStart}
            error={dateError('start')}
          />
          <Text tone="muted" variant="bodySm">
            {t('village.history.form.dateHint')}
          </Text>
          <Toggle
            testID="history-range-toggle"
            value={isRange}
            onValueChange={setIsRange}
            label={t('village.history.form.isRange')}
          />
          {isRange ? (
            <HistoricalDateField
              testID="history-end"
              label={t('village.history.form.to')}
              value={end}
              onChange={setEnd}
              error={dateError('end')}
            />
          ) : null}
          <Toggle
            testID="history-approximate-toggle"
            value={approximate}
            onValueChange={setApproximate}
            label={t('village.history.form.approximate')}
          />
        </VStack>
        <VStack gap={1} align="stretch">
          <FieldLabel>{t('village.history.form.body')}</FieldLabel>
          <MentionTextInput
            testID="history-body-input"
            value={body.text}
            mentions={body.mentions}
            links={body.links}
            marks={body.marks}
            onChange={(text, mentions, links, marks) => setBody({ text, mentions, links, marks })}
            candidates={candidates}
            placeholder={t('village.history.form.bodyPlaceholder')}
          />
        </VStack>
        <Input
          testID="history-sources-input"
          value={sources}
          onChangeText={setSources}
          label={t('village.history.form.sources')}
          placeholder={t('village.history.form.sourcesPlaceholder')}
          multiline
          autoGrow
        />
        {error === 'saveFailed' ? (
          <Text tone="danger">{t('village.history.form.errors.saveFailed')}</Text>
        ) : null}
        <View>
          <Button testID="history-submit" onPress={submit} loading={saving} fullWidth>
            {t('village.history.form.save')}
          </Button>
        </View>
      </VStack>
    </ScrollView>
  );
}
