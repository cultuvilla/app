import { OrgJoinRequestDataSchema } from '../../models/organization/OrgJoinRequestDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const orgJoinRequestConverterAdmin = makeConverter(OrgJoinRequestDataSchema, adminSdkCtors);
