import {
  GroupTaskDataSchema,
  TaskReminderDataSchema,
  TaskTemplateDataSchema,
} from '../../models/organization/GroupTaskDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const groupTaskConverterAdmin = makeConverter(GroupTaskDataSchema, adminSdkCtors);
export const taskTemplateConverterAdmin = makeConverter(TaskTemplateDataSchema, adminSdkCtors);
export const taskReminderConverterAdmin = makeConverter(TaskReminderDataSchema, adminSdkCtors);
