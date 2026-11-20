import { OrganizationDataSchema } from '../../models/organization/OrganizationDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const organizationConverterAdmin = adminConverter(OrganizationDataSchema);
