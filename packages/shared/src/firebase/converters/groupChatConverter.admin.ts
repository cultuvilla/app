import {
  GroupChatMessageDataSchema,
  GroupChatReadDataSchema,
  GroupChatThreadDataSchema,
} from '../../models/organization/GroupChatDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const groupChatMessageConverterAdmin = makeConverter(GroupChatMessageDataSchema, adminSdkCtors);
export const groupChatThreadConverterAdmin = makeConverter(GroupChatThreadDataSchema, adminSdkCtors);
export const groupChatReadConverterAdmin = makeConverter(GroupChatReadDataSchema, adminSdkCtors);
