import { ContentReportDataSchema } from '../../models/moderation/ContentReportDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const contentReportConverterAdmin = adminConverter(ContentReportDataSchema);
