import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import {
  COSA_CATEGORIES,
  DEFAULT_RESERVA_CONFIG,
  effectiveCosaAudience,
  MAX_COSA_CONDITIONS,
  MAX_COSA_DESCRIPTION,
  MAX_COSA_LOCATION_NOTE,
  MAX_COSA_TITLE,
  type CosaCategory,
  type CosaEdit,
  type CosaKind,
  type OrganizationData,
} from '@cultuvilla/shared/models/organization';
import type { LatLng } from '@cultuvilla/shared/models/core/LocationDataModel';
import { createCosa, deleteCosa, updateCosa, type Cosa } from '@cultuvilla/shared/services/cosatecaService';
import { uploadCosaImage, type UploadableImage } from '@cultuvilla/shared/services/imageService';
import { Button, FieldLabel, ImagePickerField, Input, Text, VStack } from '../../../primitives';
import { FormModal } from '../../../layout/FormModal';
import { SegmentedToggle } from '../../SegmentedToggle';
import { LocationField } from '../../LocationField';
import { CategoryChips } from './CosaRows';
import { ReservaConfigFields } from './Reserva';
import { parseReservaDraft, reservaDraft, type ReservaDraft, type ReservaDraftError } from '../../../../lib/orgs/reserva';
import { useT } from '../../../../lib/i18n';
import { showAlert, showConfirm } from '../../../../lib/dialogs';
import { pickImageAsBlob } from '../../../../lib/images';

type Owner = 'mine' | 'group';
const KINDS: readonly CosaKind[] = ['prestamo', 'servicio', 'regalo', 'reserva'];

/**
 * Offer something to a group's cosateca, or edit it. An integrante offers their
 * own, or gives a physical cosa to the group, which shares it hand to hand from
 * then on; an admin may offer any kind in the group's name. A photo is
 * uploaded under the cosa's own id, so a new cosa is created first and then
 * given it. What kind it is and whose are chosen once: its requests carry them,
 * so the rules freeze both. Where it is kept is an optional pin and a short
 * note. A reserva also carries its hours and limits.
 */
export function CosaSheet({
  visible,
  org,
  uid,
  myName,
  isAdmin,
  cosa,
  canDelete = false,
  onClose,
}: {
  visible: boolean;
  org: Pick<OrganizationData, 'name' | 'municipalityId' | 'cosateca'> & { id: string };
  uid: string;
  /** The viewer's public name, which a cosa they own carries. */
  myName: string;
  isAdmin: boolean;
  /** null = a new cosa. */
  cosa: Cosa | null;
  canDelete?: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const [kind, setKind] = useState<CosaKind>('prestamo');
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [conditions, setConditions] = useState('');
  const [category, setCategory] = useState<CosaCategory>('otros');
  const [owner, setOwner] = useState<Owner>('mine');
  const [photo, setPhoto] = useState<UploadableImage | null>(null);
  const [reserva, setReserva] = useState<ReservaDraft>(() => reservaDraft(DEFAULT_RESERVA_CONFIG));
  const [titleError, setTitleError] = useState<string | undefined>();
  const [reservaError, setReservaError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setKind(cosa?.kind ?? 'prestamo');
    setCoords(cosa?.location?.coordinates ?? null);
    setPlaceName(cosa?.location?.displayName ?? '');
    setLocationNote(cosa?.locationNote ?? '');
    setTitle(cosa?.title ?? '');
    setDescription(cosa?.description ?? '');
    setConditions(cosa?.conditions ?? '');
    setCategory(cosa?.category ?? 'otros');
    setOwner('mine');
    setPhoto(null);
    setReserva(reservaDraft(cosa?.reserva ?? DEFAULT_RESERVA_CONFIG));
    setTitleError(undefined);
    setReservaError(undefined);
  }, [visible, cosa]);

  const RESERVA_ERRORS: Record<ReservaDraftError, string> = {
    time: t('groups.cosateca.reserva.errors.time'),
    order: t('groups.cosateca.reserva.errors.order'),
    slotMinutes: t('groups.cosateca.reserva.errors.slotMinutes'),
    maxActiveReservations: t('groups.cosateca.reserva.errors.maxActive'),
    bookingHorizonDays: t('groups.cosateca.reserva.errors.horizon'),
  };

  // Who may give this kind to the group: anyone a physical cosa, an admin any kind.
  const canChooseOwner = isAdmin || kind === 'prestamo';
  const forGroup = canChooseOwner && owner === 'group';

  const save = async () => {
    if (!title.trim()) {
      setTitleError(t('groups.cosateca.form.nameRequired'));
      return;
    }
    setTitleError(undefined);
    let reservaConfig: CosaEdit['reserva'] = null;
    if (kind === 'reserva') {
      const parsed = parseReservaDraft(reserva, cosa?.reserva?.blackouts ?? []);
      if (!parsed.ok) {
        setReservaError(RESERVA_ERRORS[parsed.error]);
        return;
      }
      reservaConfig = parsed.config;
    }
    setReservaError(undefined);
    const fields = (imageURL: string | null) => ({
      kind,
      title: title.trim(),
      description: description.trim() || null,
      category,
      imageURL,
      conditions: conditions.trim() || null,
      location: coords ? { coordinates: coords, displayName: placeName.trim() } : null,
      locationNote: locationNote.trim() || null,
      reserva: reservaConfig,
    });
    setSaving(true);
    try {
      if (cosa) {
        const imageURL = photo ? await uploadCosaImage(cosa.id, uid, photo) : cosa.imageURL;
        await updateCosa(cosa.id, { ...fields(imageURL), status: cosa.status });
      } else {
        const id = await createCosa({
          ...fields(null),
          municipalityId: org.municipalityId,
          orgId: org.id,
          audience: effectiveCosaAudience(org.cosateca),
          ownerUid: forGroup ? null : uid,
          ownerName: forGroup ? org.name : myName,
          createdBy: uid,
          createdByName: myName,
        });
        if (photo) await updateCosa(id, { ...fields(await uploadCosaImage(id, uid, photo)), status: 'available' });
      }
      onClose();
    } catch {
      showAlert(t('groups.cosateca.errors.save'));
    } finally {
      setSaving(false);
    }
  };

  // The rules check who offered it against the public profile: without a name
  // a new cosa can only be refused.
  const needsMyName = cosa === null;
  const remove = () => {
    if (!cosa) return;
    showConfirm(
      t('groups.cosateca.form.delete'),
      t('groups.cosateca.form.deleteConfirm'),
      () => {
        deleteCosa(cosa.id)
          .then(onClose)
          .catch(() => showAlert(t('groups.cosateca.errors.save')));
      },
      { confirmText: t('common.delete'), cancelText: t('common.cancel') },
    );
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={t(cosa ? 'groups.cosateca.form.titleEdit' : 'groups.cosateca.form.titleNew')}
      testID="cosa-sheet"
      footer={
        <VStack gap={2} className="px-5 pt-3">
          <Button onPress={() => void save()} loading={saving} disabled={needsMyName && !myName} fullWidth testID="cosa-save">
            {t('groups.cosateca.form.save')}
          </Button>
          {cosa && canDelete ? (
            <Button variant="ghost" onPress={remove} fullWidth testID="cosa-delete">
              {t('groups.cosateca.form.delete')}
            </Button>
          ) : null}
        </VStack>
      }
    >
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <VStack gap={3} className="px-4 pt-4 pb-6">
          <FieldLabel>{t('groups.cosateca.form.kind')}</FieldLabel>
          {cosa ? (
            <Text className="font-medium" testID="cosa-kind-fixed">
              {t(`groups.cosateca.kinds.${kind}`)}
            </Text>
          ) : (
            <SegmentedToggle
              testID="cosa-kind"
              value={kind}
              options={KINDS.map((k) => ({ value: k, label: t(`groups.cosateca.kinds.${k}`) }))}
              onChange={setKind}
            />
          )}
          <Text variant="bodySm" tone="muted">
            {t(`groups.cosateca.kindHints.${kind}`)}
          </Text>
          {cosa === null && canChooseOwner ? (
            <>
              <FieldLabel>{t('groups.cosateca.form.owner')}</FieldLabel>
              <SegmentedToggle
                testID="cosa-owner"
                value={owner}
                options={[
                  { value: 'mine', label: t('groups.cosateca.form.ownerMine') },
                  { value: 'group', label: t('groups.cosateca.form.ownerGroup') },
                ]}
                onChange={setOwner}
              />
            </>
          ) : null}
          {cosa !== null && kind === 'prestamo' ? (
            <>
              <FieldLabel>{t('groups.cosateca.form.owner')}</FieldLabel>
              <Text className="font-medium" testID="cosa-owner-fixed">
                {cosa.ownerUid === null ? t('groups.cosateca.form.ownerGroup') : cosa.ownerName}
              </Text>
            </>
          ) : null}
          {kind === 'prestamo' && (cosa !== null || canChooseOwner) ? (
            <Text variant="bodySm" tone="muted" testID="cosa-owner-hint">
              {t(
                (cosa ? cosa.ownerUid === null : owner === 'group')
                  ? 'groups.cosateca.form.ownerHints.group'
                  : 'groups.cosateca.form.ownerHints.mine',
              )}
            </Text>
          ) : null}
          <Input
            label={t('groups.cosateca.form.name')}
            value={title}
            onChangeText={setTitle}
            maxLength={MAX_COSA_TITLE}
            error={titleError}
            testID="cosa-title"
          />
          <FieldLabel>{t('groups.cosateca.form.category')}</FieldLabel>
          <CategoryChips
            testID="cosa-category"
            categories={COSA_CATEGORIES}
            value={category}
            withAll={false}
            onChange={(next) => {
              if (next) setCategory(next);
            }}
          />
          <Input
            label={t('groups.cosateca.form.description')}
            value={description}
            onChangeText={setDescription}
            maxLength={MAX_COSA_DESCRIPTION}
            autoGrow
            testID="cosa-description"
          />
          <Input
            label={t('groups.cosateca.form.conditions')}
            value={conditions}
            onChangeText={setConditions}
            maxLength={MAX_COSA_CONDITIONS}
            testID="cosa-conditions"
          />
          <Text variant="bodySm" tone="muted">
            {t('groups.cosateca.form.conditionsHint')}
          </Text>
          <LocationField
            value={coords}
            displayName={placeName}
            onChange={(next, address) => {
              setCoords(next);
              setPlaceName(address);
            }}
            onClear={() => {
              setCoords(null);
              setPlaceName('');
            }}
            label={t('groups.cosateca.form.location')}
            testID="cosa-location"
          />
          <Input
            label={t('groups.cosateca.form.locationNote')}
            value={locationNote}
            onChangeText={setLocationNote}
            maxLength={MAX_COSA_LOCATION_NOTE}
            placeholder={t('groups.cosateca.form.locationNotePlaceholder')}
            testID="cosa-location-note"
          />
          {kind === 'reserva' ? <ReservaConfigFields draft={reserva} onChange={setReserva} error={reservaError} /> : null}
          <FieldLabel>{t('groups.cosateca.form.photo')}</FieldLabel>
          <ImagePickerField
            uri={photo?.previewUri ?? cosa?.imageURL ?? null}
            onPress={() => {
              void pickImageAsBlob().then((next) => {
                if (next) setPhoto(next);
              });
            }}
            label={t('groups.cosateca.form.photo')}
            testID="cosa-photo"
          />
        </VStack>
      </ScrollView>
    </FormModal>
  );
}
