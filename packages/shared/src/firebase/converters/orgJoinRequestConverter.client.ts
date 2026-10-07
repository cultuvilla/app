import { OrgJoinRequestDataSchema } from '../../models/organization/OrgJoinRequestDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const orgJoinRequestConverterClient = makeConverter(OrgJoinRequestDataSchema, clientSdkCtors);
