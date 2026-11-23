import { CensoAnswersDataSchema } from '../../models/municipality/CensoAnswersDataModel';
import { clientConverter } from './sdkAdapters.client';

export const censoAnswersConverterClient = clientConverter(CensoAnswersDataSchema);
