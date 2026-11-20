import {
  GroupTaskDataSchema,
  TaskReminderDataSchema,
  TaskTemplateDataSchema,
} from '../../models/organization/GroupTaskDataModel';
import { clientConverter } from './sdkAdapters.client';

export const groupTaskConverterClient = clientConverter(GroupTaskDataSchema);
export const taskTemplateConverterClient = clientConverter(TaskTemplateDataSchema);
export const taskReminderConverterClient = clientConverter(TaskReminderDataSchema);
