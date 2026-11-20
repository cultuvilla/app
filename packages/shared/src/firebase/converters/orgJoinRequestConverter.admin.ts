import { OrgJoinRequestDataSchema } from '../../models/organization/OrgJoinRequestDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const orgJoinRequestConverterAdmin = adminConverter(OrgJoinRequestDataSchema);
