import { MembershipEventDataSchema } from '../../models/membership/MembershipEventDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const membershipEventConverterAdmin = adminConverter(MembershipEventDataSchema);
