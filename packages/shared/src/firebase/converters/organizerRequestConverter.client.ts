import { OrganizerRequestDataSchema } from '../../models/municipality/OrganizerRequestDataModel';
import { clientConverter } from './sdkAdapters.client';

export const organizerRequestConverterClient = clientConverter(OrganizerRequestDataSchema);
