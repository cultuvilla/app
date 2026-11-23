import { MembershipEventDataSchema } from '../../models/membership/MembershipEventDataModel';
import { clientConverter } from './sdkAdapters.client';

export const membershipEventConverterClient = clientConverter(MembershipEventDataSchema);
