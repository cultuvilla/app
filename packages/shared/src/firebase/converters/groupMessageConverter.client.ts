import {
  GroupMessageDataSchema,
  GroupMessageDeliveryDataSchema,
  GroupMessageReadDataSchema,
  GroupPollVoteDataSchema,
} from '../../models/organization/GroupMessageDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const groupMessageConverterClient = makeConverter(GroupMessageDataSchema, clientSdkCtors);
export const groupMessageDeliveryConverterClient = makeConverter(GroupMessageDeliveryDataSchema, clientSdkCtors);
export const groupMessageReadConverterClient = makeConverter(GroupMessageReadDataSchema, clientSdkCtors);
export const groupPollVoteConverterClient = makeConverter(GroupPollVoteDataSchema, clientSdkCtors);
