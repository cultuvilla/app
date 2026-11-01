import { OrgFollowerDataSchema } from '../../models/organization/OrgFollowerDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const orgFollowerConverterAdmin = makeConverter(OrgFollowerDataSchema, adminSdkCtors);
