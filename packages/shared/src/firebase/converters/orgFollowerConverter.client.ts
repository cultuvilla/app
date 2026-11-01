import { OrgFollowerDataSchema } from '../../models/organization/OrgFollowerDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const orgFollowerConverterClient = makeConverter(OrgFollowerDataSchema, clientSdkCtors);
