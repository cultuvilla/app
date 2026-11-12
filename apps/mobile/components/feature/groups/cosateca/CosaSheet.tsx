import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes, palette } from '@cultuvilla/shared/design-system';
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
import { Button, FieldLabel, HStack, ImagePickerField, Input, Pressable, Text, VStack } from '../../../primitives';
import { FormModal } from '../../../layout/FormModal';
import { SegmentedToggle } from '../../SegmentedToggle';
import { LocationField } from '../../LocationField';
import { CategoryChips } from './CosaRows';
import { ReservaConfigFields } from './Reserva';
import { parseReservaDraft, reservaDraft, type ReservaDraft, type ReservaDraftError } from '../../../../lib/orgs/reserva';
import { useT } from '../../../../lib/i18n';
import { showAlert, showConfirm } from '../../../../lib/dialogs';
import { CameraPermissionDeniedError, pickImageAsBlob, takePhotoAsBlob } from '../../../../lib/images';

type Owner = 'mine' | 'group';
type Step = 'photo' | 'what' | 'how';
const KINDS: readonly CosaKind[] = ['prestamo', 'regalo', 'servicio', 'reserva'];

/**
 * Offer something to a group's cosateca, or edit it. Offering goes in three
 * steps: the photo (camera, gallery, or none), what it is, and how it is
 * shared, said as a sentence ("La presto"). Editing shows it all on one page.
 *
 * An integrante offers their own, or gives a physical cosa to the group, which
 * shares it hand to hand from then on; an admin may offer any kind in the
 * group's name. A photo is uploaded under the cosa's own id, so a new cosa is
 * created first and then given it. What kind it is and whose are chosen once:
 * its requests carry them, so the rules freeze both. Where it is kept is an
 * optional pin and a short note. A reserva also carries its hours and limits.
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
  const [step, setStep] = useState<Step>('photo');
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
    setStep('photo');
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

  // Offering goes step by step; editing shows every section at once.
  const stepped = cosa === null;
  const shows = (s: Step) => !stepped || step === s;

  // Who may give this kind to the group: anyone a physical cosa, an admin any kind.
  const canChooseOwner = isAdmin || kind === 'prestamo';
  const forGroup = canChooseOwner && owner === 'group';

  const checkTitle = (): boolean => {
    if (!title.trim()) {
      setTitleError(t('groups.cosateca.form.nameRequired'));
      return false;
    }
    setTitleError(undefined);
    return true;
  };

  const choosePhoto = (source: 'camera' | 'gallery') => {
    (source === 'camera' ? takePhotoAsBlob() : pickImageAsBlob())
      .then((next) => {
        if (!next) return;
        setPhoto(next);
        if (stepped && step === 'photo') setStep('what');
      })
      .catch((error: unknown) => {
        showAlert(t(error instanceof CameraPermissionDeniedError ? 'groups.cosateca.form.cameraDenied' : 'groups.cosateca.errors.generic'));
      });
  };

  const next = () => {
    if (step === 'photo') setStep('what');
    else if (step === 'what' && checkTitle()) setStep('how');
  };

  const back = () => {
    if (stepped && step === 'how') setStep('what');
    else if (stepped && step === 'what') setStep('photo');
    else onClose();
  };

  const save = async () => {
    if (!checkTitle()) {
      if (stepped) setStep('what');
      return;
    }
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

  const previewUri = photo?.previewUri ?? cosa?.imageURL ?? null;
  const atLastStep = !stepped || step === 'how';

  return (
    <FormModal
      visible={visible}
      onClose={back}
      title={t(cosa ? 'groups.cosateca.form.titleEdit' : 'groups.cosateca.form.titleNew')}
      testID="cosa-sheet"
      footer={
        <VStack gap={2} className="px-5 pt-3">
          {atLastStep ? (
            <Button onPress={() => void save()} loading={saving} disabled={needsMyName && !myName} fullWidth testID="cosa-save">
              {t(stepped ? 'groups.cosateca.form.publish' : 'groups.cosateca.form.save')}
            </Button>
          ) : (
            <Button
              onPress={next}
              variant={step === 'photo' && !photo ? 'ghost' : 'primary'}
              fullWidth
              testID="cosa-next"
            >
              {t(step === 'photo' && !photo ? 'groups.cosateca.form.noPhoto' : 'groups.cosateca.form.next')}
            </Button>
          )}
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
          {shows('photo') ? (
            <VStack gap={3} testID="cosa-step-photo">
              <ImagePickerField
                uri={previewUri}
                width="100%"
                height={stepped ? 260 : 180}
                onPress={() => choosePhoto('gallery')}
                label={t('groups.cosateca.form.pickPhoto')}
                testID="cosa-photo-preview"
              />
              <HStack gap={2}>
                <View className="flex-1">
                  <Button variant="secondary" onPress={() => choosePhoto('camera')} fullWidth testID="cosa-photo-camera">
                    {t('groups.cosateca.form.takePhoto')}
                  </Button>
                </View>
                <View className="flex-1">
                  <Button variant="secondary" onPress={() => choosePhoto('gallery')} fullWidth testID="cosa-photo">
                    {t('groups.cosateca.form.pickPhoto')}
                  </Button>
                </View>
              </HStack>
            </VStack>
          ) : null}

          {shows('what') ? (
            <VStack gap={3} testID="cosa-step-what">
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
                onChange={(picked) => {
                  if (picked) setCategory(picked);
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
            </VStack>
          ) : null}

          {shows('how') ? (
            <VStack gap={3} testID="cosa-step-how">
              {cosa ? (
                <>
                  <FieldLabel>{t('groups.cosateca.form.kind')}</FieldLabel>
                  <Text className="font-medium" testID="cosa-kind-fixed">
                    {t(`groups.cosateca.form.kindSentences.${kind}`)}
                  </Text>
                </>
              ) : (
                <VStack gap={2} testID="cosa-kind">
                  {KINDS.map((k) => {
                    const chosen = k === kind;
                    return (
                      <Pressable
                        key={k}
                        testID={`cosa-kind-${k}`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: chosen }}
                        onPress={() => setKind(k)}
                        className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                          chosen ? 'border-accent bg-accent-subtle/20' : 'border-subtle bg-surface-elevated'
                        }`}
                      >
                        <Ionicons
                          name={chosen ? 'radio-button-on' : 'radio-button-off'}
                          size={iconSizes.md}
                          color={chosen ? palette.terracotta : palette.sage}
                        />
                        <Text className={chosen ? 'font-bold' : 'font-medium'}>{t(`groups.cosateca.form.kindSentences.${k}`)}</Text>
                      </Pressable>
                    );
                  })}
                </VStack>
              )}
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
              <Input
                label={t('groups.cosateca.form.conditions')}
                value={conditions}
                onChangeText={setConditions}
                maxLength={MAX_COSA_CONDITIONS}
                placeholder={t('groups.cosateca.form.conditionsPlaceholder')}
                testID="cosa-conditions"
              />
              <LocationField
                value={coords}
                displayName={placeName}
                onChange={(picked, address) => {
                  setCoords(picked);
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
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>
    </FormModal>
  );
}
