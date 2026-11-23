import { VocabularyTermDataSchema } from '../../models/vocabulary/VocabularyTermDataModel';
import { clientConverter } from './sdkAdapters.client';

export const vocabularyTermConverterClient = clientConverter(VocabularyTermDataSchema);
