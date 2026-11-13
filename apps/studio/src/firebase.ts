import { initFirebase } from '@cultuvilla/shared/firebase';
import { webOriginForProject } from '@cultuvilla/shared/utils/webOrigin';

type FirebaseConfig = Parameters<typeof initFirebase>[0];

let origin: string | null = null;

/**
 * Hosting serves each project's web config at a reserved URL, so one build
 * runs against whichever env serves it; locally, Vite proxies it to dev.
 */
export async function startFirebase(): Promise<void> {
  const response = await fetch('/__/firebase/init.json');
  if (!response.ok) throw new Error(`studio: no Firebase config (${response.status})`);
  const config = (await response.json()) as FirebaseConfig;
  initFirebase(config);
  origin = webOriginForProject(config.projectId);
}

/**
 * The public site of this env — where the QR code points, so the app link
 * matches the host the app claims even when the studio is opened on another
 * of the project's domains.
 */
export function siteOrigin(): string {
  if (!origin) throw new Error('studio: Firebase is not started');
  return origin;
}
