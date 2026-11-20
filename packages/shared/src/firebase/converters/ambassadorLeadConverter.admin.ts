import { AmbassadorLeadDataSchema } from '../../models/ambassadorLead/AmbassadorLeadDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const ambassadorLeadConverterAdmin = adminConverter(AmbassadorLeadDataSchema);
