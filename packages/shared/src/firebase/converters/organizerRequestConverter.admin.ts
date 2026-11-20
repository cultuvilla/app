import { OrganizerRequestDataSchema } from '../../models/municipality/OrganizerRequestDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const organizerRequestConverterAdmin = adminConverter(OrganizerRequestDataSchema);
