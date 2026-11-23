import { CensoAnswersDataSchema } from '../../models/municipality/CensoAnswersDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const censoAnswersConverterAdmin = adminConverter(CensoAnswersDataSchema);
