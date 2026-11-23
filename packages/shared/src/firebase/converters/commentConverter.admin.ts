import { CommentDataSchema } from '../../models/interaction/CommentDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const commentConverterAdmin = adminConverter(CommentDataSchema);
