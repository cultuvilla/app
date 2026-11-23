import { HistoryEntryDataSchema } from '../../models/history/HistoryEntryDataModel';
import { clientConverter } from './sdkAdapters.client';

export const historyEntryConverterClient = clientConverter(HistoryEntryDataSchema);
