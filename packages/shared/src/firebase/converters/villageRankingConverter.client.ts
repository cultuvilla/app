import { VillageRankingDataSchema } from '../../models/municipality/VillageRankingDataModel';
import { clientConverter } from './sdkAdapters.client';

export const villageRankingConverterClient = clientConverter(VillageRankingDataSchema);
