import { WrappedDataSchema } from '../../models/wrapped/WrappedDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const villageWrappedConverterAdmin = adminConverter(WrappedDataSchema);
