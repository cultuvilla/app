import { VocabularyWordDataSchema } from '../../models/vocabulary/VocabularyWordDataModel';
import { clientConverter } from './sdkAdapters.client';

export const vocabularyWordConverterClient = clientConverter(VocabularyWordDataSchema);
