import { VillageRankingDataSchema } from '../../models/municipality/VillageRankingDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const villageRankingConverterAdmin = makeConverter(VillageRankingDataSchema, adminSdkCtors);
