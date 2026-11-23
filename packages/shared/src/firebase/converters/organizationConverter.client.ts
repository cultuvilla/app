import { OrganizationDataSchema } from '../../models/organization/OrganizationDataModel';
import { clientConverter } from './sdkAdapters.client';

export const organizationConverterClient = clientConverter(OrganizationDataSchema);
