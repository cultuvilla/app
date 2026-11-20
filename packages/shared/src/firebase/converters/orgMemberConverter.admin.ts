import { OrgMemberDataSchema } from '../../models/organization/OrgMemberDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const orgMemberConverterAdmin = adminConverter(OrgMemberDataSchema);
