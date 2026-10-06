import { z } from 'zod';

/**
 * A person's sex as recorded on their profile. Core, not person-owned: the
 * village model denormalizes it for the Embajador/Embajadora title, and a
 * municipality must not depend on the person model to say so.
 */
export const SexSchema = z.enum(['male', 'female', 'other']);
export type Sex = z.infer<typeof SexSchema>;
