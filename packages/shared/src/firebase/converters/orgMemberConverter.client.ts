import { OrgMemberDataSchema } from '../../models/organization/OrgMemberDataModel';
import { clientConverter } from './sdkAdapters.client';

export const orgMemberConverterClient = clientConverter(OrgMemberDataSchema);
