import { NewsPostDataSchema } from '../../models/news/NewsPostDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const newsPostConverterAdmin = adminConverter(NewsPostDataSchema);
