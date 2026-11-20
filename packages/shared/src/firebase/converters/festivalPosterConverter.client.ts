import { FestivalPosterDataSchema } from '../../models/festivalPoster/FestivalPosterDataModel';
import { clientConverter } from './sdkAdapters.client';

export const festivalPosterConverterClient = clientConverter(FestivalPosterDataSchema);
