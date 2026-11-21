import { OrgJoinRequestDataSchema } from '../../models/organization/OrgJoinRequestDataModel';
import { clientConverter } from './sdkAdapters.client';

export const orgJoinRequestConverterClient = clientConverter(OrgJoinRequestDataSchema);
