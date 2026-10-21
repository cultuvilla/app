import {
  GroupMessageDataSchema,
  GroupMessageDeliveryDataSchema,
  GroupMessageReadDataSchema,
  GroupPollVoteDataSchema,
} from '../../models/organization/GroupMessageDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const groupMessageConverterAdmin = makeConverter(GroupMessageDataSchema, adminSdkCtors);
export const groupMessageDeliveryConverterAdmin = makeConverter(GroupMessageDeliveryDataSchema, adminSdkCtors);
export const groupMessageReadConverterAdmin = makeConverter(GroupMessageReadDataSchema, adminSdkCtors);
export const groupPollVoteConverterAdmin = makeConverter(GroupPollVoteDataSchema, adminSdkCtors);
