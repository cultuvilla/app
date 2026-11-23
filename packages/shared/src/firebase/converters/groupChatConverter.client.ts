import {
  GroupChatMessageDataSchema,
  GroupChatReadDataSchema,
  GroupChatThreadDataSchema,
} from '../../models/organization/GroupChatDataModel';
import { clientConverter } from './sdkAdapters.client';

export const groupChatMessageConverterClient = clientConverter(GroupChatMessageDataSchema);
export const groupChatThreadConverterClient = clientConverter(GroupChatThreadDataSchema);
export const groupChatReadConverterClient = clientConverter(GroupChatReadDataSchema);
