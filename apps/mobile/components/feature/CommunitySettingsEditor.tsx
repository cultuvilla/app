import { useCallback, useEffect, useRef, useState } from 'react';
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
 * immediately — escudo on pick, location/zoom on change, description on blur
 * and once typing pauses —
 * so the screen's "Listo" button just closes the editor (a deferred save keyed
 * off unmount would silently no-op against a nulled ref, the bug this replaced).
 */
const DESCRIPTION_SAVE_DELAY_MS = 600;

export function CommunitySettingsEditor({ villageId }: { villageId: string }) {
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

  // The last description written (or loaded), so neither a blur nor the
  // debounce below writes an unchanged one.
  const savedDescription = useRef<string | null>(null);

  const saveDescription = useCallback(async () => {
    if (!villageId || description === null || description === savedDescription.current) return;
    savedDescription.current = description;
    try {
      await updateCommunity(villageId, { description });
    } catch (e) {
      showAlert(e instanceof Error ? e.message : String(e));
    }
  }, [villageId, description]);

  // Also save once typing pauses: "Listo" closes the editor without blurring
  // the field, and a description saved only on blur was dropped there.
  useEffect(() => {
    if (description === null || description === savedDescription.current) return;
    const timer = setTimeout(() => void saveDescription(), DESCRIPTION_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [description, saveDescription]);

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
      </VStack>
    </ScrollView>
  );
}
