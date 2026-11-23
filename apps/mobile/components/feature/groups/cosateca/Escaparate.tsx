import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes, palette } from '@cultuvilla/shared/design-system';
import { isSharedCosa, type CosaRequestAction } from '@cultuvilla/shared/models/organization';
import { formatDayKey } from '@cultuvilla/shared/utils';
import { respondToCosaRequest, type Cosa, type CosaRequest } from '@cultuvilla/shared/services/cosatecaService';
import { Button, HStack, Pressable, Text, VStack } from '../../../primitives';
import { RemoteImage } from '../../../primitives/RemoteImage';
import { FormModal } from '../../../layout/FormModal';
import { CosaRequestRow } from './CosaRows';
import { COSA_CATEGORY_TILES, cosaCardSubtitle, cosaStatusChip, holdingUntil, type CursoItem, type TocaItem } from './escaparate';
import { useT } from '../../../../lib/i18n';
import { showAlert, showConfirm } from '../../../../lib/dialogs';
import { cosaRequestDatesLabel, cosatecaErrorMessage } from '../../../../lib/orgs/cosateca';

/** A cosa in the shop window: its photo (or its category's tile) with one status chip, its name, and who offers it and how. */
export function CosaCard({ cosa, onPress }: { cosa: Cosa; onPress: () => void }) {
  const { t } = useT();
  const chip = cosaStatusChip(t, cosa);
  const tile = COSA_CATEGORY_TILES[cosa.category];
  return (
    <Pressable
      testID={`cosa-card-${cosa.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${cosa.title}, ${chip.label}`}
      onPress={onPress}
      className="flex-1 bg-surface-elevated border border-subtle rounded-xl overflow-hidden"
    >
      <View className={`items-center justify-center ${cosa.imageURL ? '' : tile.className}`} style={{ aspectRatio: 4 / 3 }}>
        {cosa.imageURL ? (
          <RemoteImage uri={cosa.imageURL} variant="thumb" style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <View testID={`cosa-card-tile-${cosa.id}`}>
            <Ionicons name={tile.icon} size={iconSizes.lg * 2} color={palette.terracotta} />
          </View>
        )}
        <View className="absolute top-2 left-2 rounded-full px-2 py-0.5 bg-surface-elevated">
          <Text variant="caption" tone={chip.free ? 'success' : 'primary'} className="font-semibold" testID={`cosa-card-state-${cosa.id}`}>
            {chip.label}
          </Text>
        </View>
      </View>
      <VStack gap={1} className="px-2 pt-1.5 pb-2">
        <Text className="font-semibold" numberOfLines={1}>
          {cosa.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1} testID={`cosa-card-subtitle-${cosa.id}`}>
          {cosaCardSubtitle(t, cosa)}
        </Text>
      </VStack>
    </Pressable>
  );
}

const CURSO_SHOWN = 3;

function TocaCard({ item, onOpen }: { item: TocaItem; onOpen: () => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState<CosaRequestAction | null>(null);
  const r = item.request;
  const shared = isSharedCosa({ kind: r.cosaKind, ownerUid: r.ownerUid });
  const title = t(`groups.cosateca.active.toca.${item.reason}`, { title: r.cosaTitle, name: r.requesterName });
  const detail = item.late && r.untilOn
    ? t('groups.cosateca.active.lateSince', { date: formatDayKey(r.untilOn, 'dayMonthShort') })
    : item.reason === 'overdueHeld'
      ? t('groups.cosateca.active.toca.talkHint')
      : cosaRequestDatesLabel(t, r);

  const act = (action: CosaRequestAction) => {
    setBusy(action);
    respondToCosaRequest(r.id, action)
      .catch((err: unknown) => showAlert(cosatecaErrorMessage(t, err)))
      .finally(() => setBusy(null));
  };
  const decline = () =>
    showConfirm(t('groups.cosateca.active.declineTitle', { title: r.cosaTitle }), t('groups.cosateca.active.declineBody', { name: r.requesterName }), () => act('decline'), {
      confirmText: t('groups.cosateca.actions.decline'),
      cancelText: t('common.cancel'),
    });

  return (
    <Pressable
      testID={`cosateca-active-${r.id}`}
      accessibilityRole="button"
      onPress={onOpen}
      className={`rounded-xl p-3 border-2 ${item.late ? 'border-danger bg-danger-subtle' : 'border-accent bg-surface-elevated'}`}
    >
      <VStack gap={2}>
        <VStack gap={0}>
          <Text className="font-bold" testID={`cosateca-active-title-${r.id}`}>
            {title}
          </Text>
          <Text variant="bodySm" tone={item.late ? 'danger' : 'muted'} className={item.late ? 'font-semibold' : undefined}>
            {detail}
          </Text>
        </VStack>
        {item.primary ? (
          <HStack gap={2}>
            <Button
              size="md"
              className="flex-1"
              onPress={() => item.primary && act(item.primary)}
              loading={busy === item.primary}
              disabled={busy !== null}
              testID={`cosateca-active-${item.primary}-${r.id}`}
            >
              {t(`groups.cosateca.actions.${shared && item.primary === 'lend' ? 'handOver' : item.primary}`)}
            </Button>
            {item.reason === 'answer' ? (
              <Button
                size="md"
                variant="secondary"
                className="flex-1"
                onPress={decline}
                loading={busy === 'decline'}
                disabled={busy !== null}
                testID={`cosateca-active-decline-${r.id}`}
              >
                {t('groups.cosateca.actions.decline')}
              </Button>
            ) : null}
          </HStack>
        ) : null}
      </VStack>
    </Pressable>
  );
}

function cursoDetail(t: ReturnType<typeof useT>['t'], item: CursoItem): string {
  const r = item.request;
  if (item.reason === 'holding') {
    const until = holdingUntil(r);
    return until ? t('groups.cosateca.active.backOn', { date: formatDayKey(until, 'dayMonthShort') }) : t('groups.cosateca.active.passOn');
  }
  if (item.reason === 'lentOut') {
    return r.untilOn ? t('groups.cosateca.active.untilOn', { date: formatDayKey(r.untilOn, 'dayMonthShort') }) : t('groups.cosateca.active.noReturnDate');
  }
  if (item.reason === 'waiting') return t('groups.cosateca.active.waitingAnswer');
  if (item.reason === 'accepted') return t('groups.cosateca.active.acceptedMeet');
  return cosaRequestDatesLabel(t, r);
}

function CursoRow({ item, uid, first, onPress }: { item: CursoItem; uid: string; first: boolean; onPress: () => void }) {
  const { t } = useT();
  const r = item.request;
  const mineAsked = r.requesterUid === uid;
  const key = item.reason === 'booked' ? (mineAsked ? 'bookedMine' : 'booked') : item.reason;
  return (
    <Pressable testID={`cosateca-active-${r.id}`} accessibilityRole="button" onPress={onPress} className={`px-3 py-2 ${first ? '' : 'border-t border-subtle'}`}>
      <HStack gap={2} className="items-center">
        <VStack gap={0} className="flex-1">
          <Text variant="bodySm" className="font-semibold" numberOfLines={1}>
            {t(`groups.cosateca.active.curso.${key}`, { title: r.cosaTitle, name: r.requesterName })}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {cursoDetail(t, item)}
          </Text>
        </VStack>
        <Ionicons name="chevron-forward" size={iconSizes.sm} color={palette.sage} />
      </HStack>
    </Pressable>
  );
}

/**
 * "En marcha", above the catalogue: what waits on the viewer ("Te toca") as
 * bold cards with the move to make right on them, then what is under way and
 * waits on someone else ("En curso") as quiet rows. With nothing on the viewer
 * it says so in green, so the two states never look alike. "Todo" opens every
 * request; the block hides when there is none at all.
 */
export function EnMarchaBlock({
  toca,
  curso,
  total,
  uid,
  onOpen,
  onAll,
}: {
  toca: readonly TocaItem[];
  curso: readonly CursoItem[];
  total: number;
  uid: string;
  onOpen: (requestId: string) => void;
  onAll: () => void;
}) {
  const { t } = useT();
  if (total === 0 && toca.length === 0 && curso.length === 0) return null;
  const all = (
    <Pressable testID="cosateca-inbox-open" accessibilityRole="button" onPress={onAll} hitSlop={8}>
      <Text variant="bodySm" className="text-accent font-semibold">
        {t('groups.cosateca.active.all', { count: total })}
      </Text>
    </Pressable>
  );
  const shown = curso.slice(0, CURSO_SHOWN);

  return (
    <VStack gap={2} testID="cosateca-active">
      {toca.length > 0 ? (
        <HStack className="items-center justify-between" testID="cosateca-toca">
          <HStack gap={2} className="items-center">
            <Text variant="caption" className="text-accent font-bold uppercase tracking-wide">
              {t('groups.cosateca.active.tocaTitle')}
            </Text>
            <View className="bg-accent rounded-full px-2">
              <Text variant="caption" tone="onAccent" className="font-bold">
                {toca.length}
              </Text>
            </View>
          </HStack>
          {all}
        </HStack>
      ) : curso.length > 0 ? (
        <HStack gap={2} className="items-center bg-success-subtle rounded-xl px-3 py-2" testID="cosateca-calm">
          <Ionicons name="checkmark-circle" size={iconSizes.md} color={colors.light.fg.success} />
          <Text variant="bodySm" tone="success" className="font-bold flex-1">
            {t('groups.cosateca.active.calm')}
          </Text>
          {all}
        </HStack>
      ) : (
        <HStack className="justify-end">{all}</HStack>
      )}
      {toca.map((item) => (
        <TocaCard key={item.request.id} item={item} onOpen={() => onOpen(item.request.id)} />
      ))}
      {shown.length > 0 ? (
        <VStack gap={1} testID="cosateca-curso">
          <Text variant="caption" tone="muted" className="font-bold uppercase tracking-wide pt-1">
            {t('groups.cosateca.active.cursoTitle')}
          </Text>
          <View className="bg-surface-elevated rounded-xl overflow-hidden">
            {shown.map((item, i) => (
              <CursoRow key={item.request.id} item={item} uid={uid} first={i === 0} onPress={() => onOpen(item.request.id)} />
            ))}
          </View>
        </VStack>
      ) : null}
    </VStack>
  );
}

/** Every request in the group, asked by the viewer or of them, in one list. */
export function CosaInboxSheet({
  visible,
  requests,
  uid,
  onOpen,
  onClose,
}: {
  visible: boolean;
  requests: readonly CosaRequest[];
  uid: string;
  onOpen: (requestId: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <FormModal visible={visible} onClose={onClose} title={t('groups.cosateca.inbox.all')} testID="cosateca-inbox">
      <FlatList
        data={requests}
        keyExtractor={(r) => r.id}
        contentContainerClassName="px-4 pt-3 pb-8 gap-2"
        ListEmptyComponent={
          <Text tone="muted" className="py-6 text-center">
            {t('groups.cosateca.inbox.empty')}
          </Text>
        }
        renderItem={({ item }) => (
          <CosaRequestRow request={item} showRequester={item.requesterUid !== uid} onPress={() => onOpen(item.id)} />
        )}
      />
    </FormModal>
  );
}
