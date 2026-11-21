import { NewsPostDataSchema } from '../../models/news/NewsPostDataModel';
import { clientConverter } from './sdkAdapters.client';

export const newsPostConverterClient = clientConverter(NewsPostDataSchema);
