import {
  GroupMessageDataSchema,
  GroupMessageDeliveryDataSchema,
  GroupMessageReadDataSchema,
  GroupPollVoteDataSchema,
} from '../../models/organization/GroupMessageDataModel';
import { clientConverter } from './sdkAdapters.client';

export const groupMessageConverterClient = clientConverter(GroupMessageDataSchema);
export const groupMessageDeliveryConverterClient = clientConverter(GroupMessageDeliveryDataSchema);
export const groupMessageReadConverterClient = clientConverter(GroupMessageReadDataSchema);
export const groupPollVoteConverterClient = clientConverter(GroupPollVoteDataSchema);
