import { PersonDataSchema } from '../../models/person/PersonDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const personConverterAdmin = adminConverter(PersonDataSchema);
