import { VocabularyTermDataSchema } from '../../models/vocabulary/VocabularyTermDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const vocabularyTermConverterAdmin = adminConverter(VocabularyTermDataSchema);
