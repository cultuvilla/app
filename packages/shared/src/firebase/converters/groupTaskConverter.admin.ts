import {
  GroupTaskDataSchema,
  TaskReminderDataSchema,
  TaskTemplateDataSchema,
} from '../../models/organization/GroupTaskDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const groupTaskConverterAdmin = adminConverter(GroupTaskDataSchema);
export const taskTemplateConverterAdmin = adminConverter(TaskTemplateDataSchema);
export const taskReminderConverterAdmin = adminConverter(TaskReminderDataSchema);
