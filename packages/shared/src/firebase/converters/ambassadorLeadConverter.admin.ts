import { AmbassadorLeadDataSchema } from '../../models/ambassadorLead/AmbassadorLeadDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const ambassadorLeadConverterAdmin = makeConverter(AmbassadorLeadDataSchema, adminSdkCtors);
