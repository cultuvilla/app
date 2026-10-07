import { CensoAnswersDataSchema } from '../../models/municipality/CensoAnswersDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const censoAnswersConverterClient = makeConverter(CensoAnswersDataSchema, clientSdkCtors);
