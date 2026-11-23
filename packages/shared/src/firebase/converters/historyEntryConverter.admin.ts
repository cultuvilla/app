import { HistoryEntryDataSchema } from '../../models/history/HistoryEntryDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const historyEntryConverterAdmin = adminConverter(HistoryEntryDataSchema);
