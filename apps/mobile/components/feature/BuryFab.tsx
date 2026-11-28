import { personHref } from '../../lib/navigation/routes';
import { colors, elevation } from '@cultuvilla/shared/design-system';
import { useCallback, useRef, useState } from 'react';
import { Animated, Pressable as RNPressable, Text } from 'react-native';
import { TEXT_SCALING } from '../../lib/text/textScaling';
import { router, useFocusEffect } from 'expo-router';
import type { PartialDate } from '@cultuvilla/shared/models/person';
import { buildNameWithNickname, type PersonData } from '@cultuvilla/shared/models/person';
import { getPersonsByCreator, updatePerson } from '@cultuvilla/shared/services/personService';
import { BuriedSheet, type BuriedPersonaOption } from './BuriedSheet';
import { useT } from '../../lib/i18n';
import { withFirestoreErrorLog } from '../../lib/firestoreErrorLog';
import { showAlert } from '../../lib/dialogs';

export interface BuryFabProps {
  municipalityId: string;
  placeId: string;
  userId: string;
  /** Ids already buried here (from the parent's buried list) to mark rows. */
  buriedHereIds: string[];
  /** Called after a successful burial write so the parent reloads. */
  onChanged: () => void;
}

type PersonDoc = PersonData & { id: string };

export function BuryFab({ municipalityId, placeId, userId, buriedHereIds, onChanged }: BuryFabProps) {
  const { t } = useT();
  const [dependents, setDependents] = useState<PersonDoc[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoSelectId, setAutoSelectId] = useState<string | undefined>(undefined);
  const knownIds = useRef<Set<string>>(new Set());
  // Set right before navigating to /person/new so the next focus-reload knows
  // a fresh id should auto-advance the sheet, even if the user had zero
  // personas a cargo before (known.size === 0 is otherwise indistinguishable
  // from a passive first load).
  const pendingCreate = useRef(false);

  // Load personas a cargo on focus (so one created via /person/new shows on return).
  const load = useCallback(async () => {
    const result = await withFirestoreErrorLog('cemetery:getPersonsByCreator', () =>
      // Own personas: the caller is the creator, so the private ones count too.
      getPersonsByCreator(userId, userId),
    );
    // Personas a cargo are exactly the non-account persons this user created.
    const deps = result.filter((d) => d.userId == null);
    const known = knownIds.current;
    const fresh = deps.filter((d) => !known.has(d.id)).map((d) => d.id);
    if ((known.size > 0 || pendingCreate.current) && fresh.length === 1) {
      setAutoSelectId(fresh[0]);
    }
    pendingCreate.current = false;
    knownIds.current = new Set(deps.map((d) => d.id));
    setDependents(deps);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const buriedSet = new Set(buriedHereIds);
  const personas: BuriedPersonaOption[] = dependents.map((d) => ({
    id: d.id,
    name: buildNameWithNickname(d),
    buriedHere: buriedSet.has(d.id),
  }));

  async function handleConfirm(personId: string, deathDate: PartialDate | null) {
    setBusy(true);
    try {
      await updatePerson(personId, {
        burialPlace: { municipalityId, placeId },
        deathDate,
      });
      setAutoSelectId(undefined);
      setSheetOpen(false);
      onChanged();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'error', t('village.placeDetail.addDifunto'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Animated.View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 24, flexDirection: 'row', justifyContent: 'center', zIndex: 20 }}
      >
        <RNPressable
          onPress={() => {
            if (!busy) setSheetOpen(true);
          }}
          disabled={busy}
          testID="bury-fab"
          accessibilityRole="button"
          accessibilityLabel={t('village.placeDetail.addDifunto')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 10,
            paddingHorizontal: 22,
            borderRadius: 999,
            backgroundColor: colors.light.bg.accent,
            opacity: busy ? 0.7 : 1,
            elevation: 6,
            shadowColor: elevation.md.rn.shadowColor,
            shadowOpacity: 0.25,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
          }}
        >
          <Text {...TEXT_SCALING.label} style={{ color: colors.light.fg['on-accent'], fontSize: 18, lineHeight: 22, marginRight: 8 }}>＋</Text>
          <Text {...TEXT_SCALING.label} style={{ color: colors.light.fg['on-accent'], fontSize: 16, fontWeight: '700' }}>{t('village.placeDetail.addDifunto')}</Text>
        </RNPressable>
      </Animated.View>

      <BuriedSheet
        visible={sheetOpen}
        personas={personas}
        busy={busy}
        autoSelectId={autoSelectId}
        onClose={() => {
          setSheetOpen(false);
          setAutoSelectId(undefined);
        }}
        onCreateNew={() => {
          pendingCreate.current = true;
          router.push(personHref('new'));
        }}
        onConfirm={handleConfirm}
      />
    </>
  );
}
