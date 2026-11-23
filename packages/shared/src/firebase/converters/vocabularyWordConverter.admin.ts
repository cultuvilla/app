import { VocabularyWordDataSchema } from '../../models/vocabulary/VocabularyWordDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const vocabularyWordConverterAdmin = adminConverter(VocabularyWordDataSchema);
