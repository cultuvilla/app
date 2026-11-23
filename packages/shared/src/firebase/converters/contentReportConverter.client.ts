import { ContentReportDataSchema } from '../../models/moderation/ContentReportDataModel';
import { clientConverter } from './sdkAdapters.client';

export const contentReportConverterClient = clientConverter(ContentReportDataSchema);
