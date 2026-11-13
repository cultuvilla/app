import {
  GroupTaskDataSchema,
  TaskReminderDataSchema,
  TaskTemplateDataSchema,
} from '../../models/organization/GroupTaskDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const groupTaskConverterClient = makeConverter(GroupTaskDataSchema, clientSdkCtors);
export const taskTemplateConverterClient = makeConverter(TaskTemplateDataSchema, clientSdkCtors);
export const taskReminderConverterClient = makeConverter(TaskReminderDataSchema, clientSdkCtors);
