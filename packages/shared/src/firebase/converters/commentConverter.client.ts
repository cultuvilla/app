import { CommentDataSchema } from '../../models/interaction/CommentDataModel';
import { clientConverter } from './sdkAdapters.client';

export const commentConverterClient = clientConverter(CommentDataSchema);
