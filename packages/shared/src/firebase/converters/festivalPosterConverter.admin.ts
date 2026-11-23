import { FestivalPosterDataSchema } from '../../models/festivalPoster/FestivalPosterDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const festivalPosterConverterAdmin = adminConverter(FestivalPosterDataSchema);
