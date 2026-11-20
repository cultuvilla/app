import {
  GroupMessageDataSchema,
  GroupMessageDeliveryDataSchema,
  GroupMessageReadDataSchema,
  GroupPollVoteDataSchema,
} from '../../models/organization/GroupMessageDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const groupMessageConverterAdmin = adminConverter(GroupMessageDataSchema);
export const groupMessageDeliveryConverterAdmin = adminConverter(GroupMessageDeliveryDataSchema);
export const groupMessageReadConverterAdmin = adminConverter(GroupMessageReadDataSchema);
export const groupPollVoteConverterAdmin = adminConverter(GroupPollVoteDataSchema);
