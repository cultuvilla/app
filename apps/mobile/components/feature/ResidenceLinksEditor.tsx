import { Ionicons } from '@expo/vector-icons';
import { colors } from '@cultuvilla/shared/design-system';
import { VStack, HStack, Text, Pressable, FieldLabel, VillagePicker, BarrioPicker } from '../primitives';
import { useT } from '../../lib/i18n';
import type { MunicipalityLink } from '@cultuvilla/shared/models/person';

export interface ResidenceLinksEditorProps {
  /** Residence links being edited. A row with municipalityId '' is an unfilled new row. */
  value: MunicipalityLink[];
  onChange: (links: MunicipalityLink[]) => void;
}

/**
 * Multi-village residence editor for persons WITHOUT an account (deceased
 * relatives, historical figures, family members). Writes directly to
 * municipalityLinks — there is no membership to drive a barrio, so the village
 * and barrio are both chosen here. Add/remove villages freely; one barrio per
 * village. Account-holders edit residence via MembershipVillageEditor instead.
 */
export function ResidenceLinksEditor({ value, onChange }: ResidenceLinksEditorProps) {
  const { t } = useT();

  function setVillage(index: number, municipalityId: string | null) {
    // Changing the village clears the barrio — a barrio only exists within its village.
    onChange(
      value.map((l, i) => (i === index ? { municipalityId: municipalityId ?? '', barrioId: null } : l)),
    );
  }

  function setBarrio(index: number, barrioId: string | null) {
    onChange(value.map((l, i) => (i === index ? { ...l, barrioId } : l)));
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...value, { municipalityId: '', barrioId: null }]);
  }

  return (
    <VStack gap={3}>
      <FieldLabel>{t('profile.personForm.residenceHeading')}</FieldLabel>
      {value.map((link, i) => (
        <VStack key={i} gap={1} className="rounded-md border border-subtle p-3">
          <HStack className="items-center justify-between">
            <Text variant="bodySm" tone="muted">
              {i + 1}
            </Text>
            <Pressable
              onPress={() => removeRow(i)}
              accessibilityLabel={t('profile.personForm.removeVillage')}
              hitSlop={8}
              className="flex-row items-center p-1"
            >
              <Ionicons name="trash-outline" size={16} color={colors.light.fg.danger} />
              <Text variant="bodySm" tone="danger" className="ml-1">
                {t('profile.personForm.removeVillage')}
              </Text>
            </Pressable>
          </HStack>
          <VillagePicker
            label={t('profile.personForm.village')}
            value={link.municipalityId || null}
            onChange={(id) => setVillage(i, id)}
          />
          <BarrioPicker
            label={t('profile.personForm.barrio')}
            municipalityId={link.municipalityId || null}
            value={link.barrioId}
            onChange={(barrioId) => setBarrio(i, barrioId)}
            wholeVillageLabel={t('profile.personForm.wholeVillage')}
            // Show a barrio control for every selected village, even one with no
            // approved barrios yet — not only the ones that happen to have some.
            hideWhenEmpty={false}
          />
        </VStack>
      ))}
      <Pressable
        onPress={addRow}
        accessibilityLabel={t('profile.personForm.addVillage')}
        className="flex-row items-center justify-center rounded-md border border-dashed border-subtle p-3"
      >
        <Ionicons name="add" size={18} color="#64748b" />
        <Text className="ml-1">{t('profile.personForm.addVillage')}</Text>
      </Pressable>
    </VStack>
  );
}
