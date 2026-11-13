import { VillageRankingDataSchema } from '../../models/municipality/VillageRankingDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const villageRankingConverterClient = makeConverter(VillageRankingDataSchema, clientSdkCtors);
