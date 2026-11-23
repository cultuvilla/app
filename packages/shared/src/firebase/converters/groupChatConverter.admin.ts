import {
  GroupChatMessageDataSchema,
  GroupChatReadDataSchema,
  GroupChatThreadDataSchema,
} from '../../models/organization/GroupChatDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const groupChatMessageConverterAdmin = adminConverter(GroupChatMessageDataSchema);
export const groupChatThreadConverterAdmin = adminConverter(GroupChatThreadDataSchema);
export const groupChatReadConverterAdmin = adminConverter(GroupChatReadDataSchema);
