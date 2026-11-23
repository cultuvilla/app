import { VocabularyDefinitionDataSchema } from '../../models/vocabulary/VocabularyDefinitionDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const vocabularyDefinitionConverterAdmin = adminConverter(VocabularyDefinitionDataSchema);
