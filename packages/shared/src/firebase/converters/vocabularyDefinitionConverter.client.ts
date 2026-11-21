import { VocabularyDefinitionDataSchema } from '../../models/vocabulary/VocabularyDefinitionDataModel';
import { clientConverter } from './sdkAdapters.client';

export const vocabularyDefinitionConverterClient = clientConverter(VocabularyDefinitionDataSchema);
