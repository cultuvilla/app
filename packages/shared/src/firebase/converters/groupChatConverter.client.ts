import {
  GroupChatMessageDataSchema,
  GroupChatReadDataSchema,
  GroupChatThreadDataSchema,
} from '../../models/organization/GroupChatDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const groupChatMessageConverterClient = makeConverter(GroupChatMessageDataSchema, clientSdkCtors);
export const groupChatThreadConverterClient = makeConverter(GroupChatThreadDataSchema, clientSdkCtors);
export const groupChatReadConverterClient = makeConverter(GroupChatReadDataSchema, clientSdkCtors);
