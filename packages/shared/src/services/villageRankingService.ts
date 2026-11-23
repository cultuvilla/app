import { getDb } from '../firebase';
import { villageRankingDoc } from '../firebase/refs/client';
import { VILLAGE_RANKING_DOC, type RankedVillage } from '../models/municipality/VillageRankingDataModel';
import { watchDoc, type Unwatch, type WatchError } from './watch';

/**
 * The active pueblos with the most to show, best first. Empty until the
 * nightly `refreshVillageRanking` has written the doc once.
 */
export function watchRankedVillages(onNext: (villages: RankedVillage[]) => void, onError: WatchError): Unwatch {
  return watchDoc(
    villageRankingDoc(getDb(), VILLAGE_RANKING_DOC),
    (row) => {
      onNext(row?.villages ?? []);
    },
    onError,
  );
}
