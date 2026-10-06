import { CensoAnswersDataSchema } from '../../models/municipality/CensoAnswersDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const censoAnswersConverterAdmin = makeConverter(CensoAnswersDataSchema, adminSdkCtors);
