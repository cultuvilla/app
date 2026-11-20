import { VillageRankingDataSchema } from '../../models/municipality/VillageRankingDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const villageRankingConverterAdmin = adminConverter(VillageRankingDataSchema);
