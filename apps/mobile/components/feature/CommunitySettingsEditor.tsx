import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { VStack, Text, Input, ImagePickerField } from '../primitives';
import { LocationPicker } from './LocationPicker';
import { FiestasEditor } from './FiestasEditor';
import { useT } from '../../lib/i18n';
import { showAlert } from '../../lib/dialogs';
import { pickImageAsBlob } from '../../lib/images';
import {
  getMunicipality,
  updateCommunity,
  updateMunicipality,
} from '@cultuvilla/shared/services/municipalityService';
import { uploadMunicipalityImage } from '@cultuvilla/shared/services/imageService';
import { MAP_ZOOM_DEFAULT, clampMapZoom } from '@cultuvilla/shared/services/mapsService';
import {
  escudoFullUrl,
  hasManualEscudo,
} from '@cultuvilla/shared/models/municipality/MunicipalityDataModel';
import type { MunicipalityData } from '@cultuvilla/shared/models/municipality/MunicipalityDataModel';
import type { LatLng } from '@cultuvilla/shared/models/core/LocationDataModel';
import type { FiestaBlock } from '@cultuvilla/shared/models/municipality/FiestaBlockModel';

/**
 * Organizer-only community editor (escudo, location, description). Content-only
 * so the "Editar pueblo" screen can render it directly. Every field saves
 * immediately — escudo on pick, location/zoom on change, description on blur,
 * once typing pauses, and on close if still unsaved — so the screen's "Listo"
 * button just closes the editor. (A parent calling an imperative save() on
 * unmount once no-opped against a nulled ref; the close flush here lives in
 * the editor and reads its own refs.) `afterFiestas` renders right below the
 * fiestas, where the screen puts the entry to the fiestas summary they feed.
 */
const DESCRIPTION_SAVE_DELAY_MS = 600;

export function CommunitySettingsEditor({
  villageId,
  afterFiestas,
}: {
  villageId: string;
  afterFiestas?: ReactNode;
}) {
  const { t } = useT();
  const [village, setVillage] = useState<MunicipalityData | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [zoom, setZoom] = useState<number>(MAP_ZOOM_DEFAULT);
  const [uploadingEscudo, setUploadingEscudo] = useState(false);
  const [fiestas, setFiestas] = useState<FiestaBlock[]>([]);

  const load = useCallback(async () => {
    if (!villageId) return;
    const m = await getMunicipality(villageId);
    setVillage(m);
    savedDescription.current = m?.community?.description ?? '';
    setDescription(savedDescription.current);
    setFiestas(m?.community?.fiestas ?? []);
    setCoords(m?.coordinates ?? null);
    setLocationLabel(m?.locationLabel ?? '');
    setZoom(clampMapZoom(m?.mapZoom ?? MAP_ZOOM_DEFAULT));
  }, [villageId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeEscudo() {
    if (!villageId) return;
    const picked = await pickImageAsBlob({ square: true });
    if (!picked) return;
    setUploadingEscudo(true);
    try {
      const url = await uploadMunicipalityImage(villageId, picked);
      await updateMunicipality(villageId, { escudoManualUrl: url });
      await load();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingEscudo(false);
    }
  }

  const saveLocation = useCallback(
    async (nextCoords: LatLng | null, nextZoom: number, nextLabel: string) => {
      if (!villageId) return;
      try {
        await updateMunicipality(villageId, {
          coordinates: nextCoords,
          locationLabel: nextCoords && nextLabel !== '' ? nextLabel : null,
          mapZoom: nextCoords ? nextZoom : null,
        });
      } catch (e) {
        showAlert(e instanceof Error ? e.message : String(e));
      }
    },
    [villageId],
  );

  const saveFiestas = useCallback(
    async (next: FiestaBlock[]) => {
      if (!villageId) return;
      setFiestas(next);
      try {
        await updateCommunity(villageId, { fiestas: next });
      } catch (e) {
        showAlert(e instanceof Error ? e.message : String(e));
      }
    },
    [villageId],
  );

  // The last description stored (or loaded). It moves only once a write has
  // succeeded, so a failed one is retried by the next blur or pause.
  const savedDescription = useRef<string | null>(null);
  // The latest typed value, for the flush when the editor closes.
  const latestDescription = useRef<string | null>(null);
  latestDescription.current = description;

  const writeDescription = useCallback(
    async (value: string) => {
      try {
        await updateCommunity(villageId, { description: value });
        savedDescription.current = value;
      } catch (e) {
        showAlert(e instanceof Error ? e.message : String(e));
      }
    },
    [villageId],
  );

  const saveDescription = useCallback(async () => {
    if (!villageId || description === null || description === savedDescription.current) return;
    await writeDescription(description);
  }, [villageId, description, writeDescription]);

  // Also save once typing pauses, and flush on close: "Listo" leaves the
  // editor without blurring the field, and a description saved only on blur
  // was dropped there.
  useEffect(() => {
    if (description === null || description === savedDescription.current) return;
    const timer = setTimeout(() => void saveDescription(), DESCRIPTION_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [description, saveDescription]);

  useEffect(
    () => () => {
      const pending = latestDescription.current;
      if (villageId && pending !== null && pending !== savedDescription.current) {
        void writeDescription(pending);
      }
    },
    [villageId, writeDescription],
  );

  const hasEscudo = village ? escudoFullUrl(village) !== null : false;

  return (
    <ScrollView contentContainerClassName="p-4">
      <VStack gap={3}>
        <Text variant="h3">{t('village.admin.community.escudo')}</Text>
        <ImagePickerField
          uri={village ? escudoFullUrl(village) : null}
          onPress={() => void changeEscudo()}
          label={hasEscudo ? t('village.escudo.change') : t('village.escudo.add')}
          resizeMode={village && hasManualEscudo(village) ? 'cover' : 'contain'}
          loading={uploadingEscudo}
          testID="community-escudo"
        />

        {/* Render only once loaded, so the picker seeds its state (and preview)
            from the saved coordinates instead of the pre-load null. */}
        {village ? (
          <LocationPicker
            value={coords}
            valueLabel={locationLabel}
            onChange={(next, label) => {
              setCoords(next);
              setLocationLabel(label);
              void saveLocation(next, zoom, label);
            }}
            zoom={zoom}
            onZoomChange={(z) => {
              setZoom(z);
              void saveLocation(coords, z, locationLabel);
            }}
            showUseMyLocation={false}
            testID="community-location"
          />
        ) : null}

        <Text variant="h3" className="mt-2">{t('village.admin.community.description')}</Text>
        <Input
          value={description ?? ''}
          onChangeText={setDescription}
          onBlur={() => void saveDescription()}
          multiline
          testID="community-description"
          placeholder={t('village.admin.community.description')}
        />

        <FiestasEditor
          blocks={fiestas}
          onChange={(next) => void saveFiestas(next)}
        />
        {afterFiestas}
      </VStack>
    </ScrollView>
  );
}
