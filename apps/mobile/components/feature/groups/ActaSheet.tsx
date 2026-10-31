import { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { ACTA_BODIES, isActiveSocio, type ActaAttendee, type ActaBody, type ActaInput } from '@cultuvilla/shared/models/organization';
import type { Acta } from '@cultuvilla/shared/services/recordsService';
import type { Socio } from '@cultuvilla/shared/services/socioService';
import { Button, Checkbox, DateField, HStack, Input, Pressable, Text, Toggle, VStack } from '../../primitives';
import { SegmentedToggle } from '../SegmentedToggle';
import { FormModal } from '../../layout/FormModal';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { dayKeyOfPickedDate, pickedDateOfDayKey, todayKey } from '../../../lib/orgs/cuota';

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter((l) => l !== '');

/**
 * Write or correct an acta: which body met, when and where, who came (socios
 * ticked from the roster plus a count of others), the agenda, the acuerdos,
 * and whether socios may read it. Lists are one item per line — the simplest
 * thing to type on a phone.
 */
export function ActaSheet({
  visible,
  acta,
  socios,
  onSave,
  onClose,
}: {
  visible: boolean;
  /** Null for a new acta. */
  acta: Acta | null;
  socios: Socio[];
  onSave: (input: ActaInput) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [body, setBody] = useState<ActaBody>('asamblea_general');
  const [title, setTitle] = useState('');
  const [heldOn, setHeldOn] = useState(todayKey());
  const [place, setPlace] = useState('');
  const [present, setPresent] = useState<Map<string, string>>(new Map());
  const [others, setOthers] = useState('0');
  const [agenda, setAgenda] = useState('');
  const [agreements, setAgreements] = useState('');
  const [visibleToSocios, setVisibleToSocios] = useState(false);
  const [othersError, setOthersError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setBody(acta?.body ?? 'asamblea_general');
    setTitle(acta?.title ?? '');
    setHeldOn(acta?.heldOn ?? todayKey());
    setPlace(acta?.place ?? '');
    setPresent(new Map((acta?.attendees ?? []).map((a) => [a.socioId, a.name])));
    setOthers(String(acta?.otherAttendees ?? 0));
    setAgenda((acta?.agenda ?? []).join('\n'));
    setAgreements((acta?.agreements ?? []).join('\n'));
    setVisibleToSocios(acta?.visibleToSocios ?? false);
    setOthersError(undefined);
  }, [visible, acta]);

  // Active socios, plus anyone already on the acta who has since left.
  const choices = useMemo(
    () => socios.filter((s) => isActiveSocio(s) || present.has(s.id)).sort((a, b) => a.displayName.localeCompare(b.displayName, 'es')),
    [socios, present],
  );

  const toggle = (socio: Socio, on: boolean) =>
    setPresent((prev) => {
      const next = new Map(prev);
      if (on) next.set(socio.id, socio.displayName);
      else next.delete(socio.id);
      return next;
    });

  const save = () => {
    const otherCount = Number(others.trim() === '' ? '0' : others.trim());
    if (!Number.isInteger(otherCount) || otherCount < 0) {
      setOthersError(t('groups.records.actas.form.othersInvalid'));
      return;
    }
    const attendees: ActaAttendee[] = [...present].map(([socioId, name]) => ({ socioId, name }));
    setSaving(true);
    onSave({
      body,
      title,
      heldOn,
      place,
      attendees,
      otherAttendees: otherCount,
      agenda: lines(agenda),
      agreements: lines(agreements),
      visibleToSocios,
    })
      .then(onClose)
      .catch(() => showAlert(t('groups.records.error')))
      .finally(() => setSaving(false));
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={t(acta ? 'groups.records.actas.form.titleEdit' : 'groups.records.actas.form.titleNew')}
      testID="acta-sheet"
      footer={
        <VStack className="px-5 pt-3">
          <Button onPress={save} loading={saving} fullWidth testID="acta-save">
            {t('groups.records.actas.form.save')}
          </Button>
        </VStack>
      }
    >
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" testID="acta-scroll">
        <VStack gap={3} className="px-4 pt-4 pb-6">
          <Text variant="bodySm" className="font-bold">
            {t('groups.records.actas.form.body')}
          </Text>
          <SegmentedToggle
            testID="acta-body"
            value={body}
            options={ACTA_BODIES.map((b) => ({ value: b, label: t(`groups.records.actas.body.${b}`) }))}
            onChange={setBody}
          />
          <Input label={t('groups.records.actas.form.heading')} value={title} onChangeText={setTitle} testID="acta-title" />
          <DateField
            label={t('groups.records.actas.form.date')}
            value={pickedDateOfDayKey(heldOn)}
            onChange={(d) => setHeldOn(d ? dayKeyOfPickedDate(d) : todayKey())}
            testID="acta-date"
          />
          <Input label={t('groups.records.actas.form.place')} value={place} onChangeText={setPlace} testID="acta-place" />

          <HStack justify="between" align="center">
            <Text variant="bodySm" className="font-bold">
              {`${t('groups.records.actas.form.attendees')} (${String(present.size)})`}
            </Text>
            <HStack gap={4}>
              <Pressable
                testID="acta-attendees-all"
                accessibilityRole="button"
                onPress={() => setPresent(new Map(choices.map((s) => [s.id, s.displayName])))}
              >
                <Text variant="bodySm" className="text-accent font-medium">
                  {t('groups.records.actas.form.all')}
                </Text>
              </Pressable>
              <Pressable testID="acta-attendees-none" accessibilityRole="button" onPress={() => setPresent(new Map())}>
                <Text variant="bodySm" className="text-accent font-medium">
                  {t('groups.records.actas.form.none')}
                </Text>
              </Pressable>
            </HStack>
          </HStack>
          {choices.map((s) => (
            <Checkbox
              key={s.id}
              value={present.has(s.id)}
              onValueChange={(on) => toggle(s, on)}
              label={s.displayName}
              testID={`acta-attendee-${s.id}`}
            />
          ))}
          <Input
            label={t('groups.records.actas.form.others')}
            value={others}
            onChangeText={setOthers}
            keyboardType="number-pad"
            error={othersError}
            testID="acta-others"
          />

          <Input label={t('groups.records.actas.form.agenda')} value={agenda} onChangeText={setAgenda} autoGrow testID="acta-agenda" />
          <Input
            label={t('groups.records.actas.form.agreements')}
            value={agreements}
            onChangeText={setAgreements}
            autoGrow
            testID="acta-agreements"
          />

          <Toggle
            testID="acta-visible"
            value={visibleToSocios}
            label={t('groups.records.actas.form.visible')}
            onValueChange={setVisibleToSocios}
          />
          <Text tone="muted" variant="bodySm">
            {t('groups.records.actas.form.visibleHint')}
          </Text>
        </VStack>
      </ScrollView>
    </FormModal>
  );
}
