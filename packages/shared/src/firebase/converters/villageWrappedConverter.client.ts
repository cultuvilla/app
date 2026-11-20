import { WrappedDataSchema } from '../../models/wrapped/WrappedDataModel';
import { clientConverter } from './sdkAdapters.client';

export const villageWrappedConverterClient = clientConverter(WrappedDataSchema);
