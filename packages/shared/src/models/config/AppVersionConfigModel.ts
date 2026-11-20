import { z } from 'zod';

/** `config/appVersion` — the force-update gate's one doc. */
export const APP_VERSION_CONFIG_DOC_ID = 'appVersion';

const PlatformVersionsSchema = z.object({
  minSupported: z.string(),
  latest: z.string(),
});

export const AppVersionConfigSchema = z.object({
  ios: PlatformVersionsSchema,
  android: PlatformVersionsSchema,
  storeUrl: z.object({
    ios: z.url(),
    android: z.url(),
  }),
});
export type AppVersionConfig = z.infer<typeof AppVersionConfigSchema>;
