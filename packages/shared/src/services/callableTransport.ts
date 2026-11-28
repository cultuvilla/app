// The one way client code reaches a callable. A routed callable goes through
// the callable gateway (`firebase/callableGateway.ts`); the rest, and every
// call from a project that has not joined, reach the callable's own service.
import {
  httpsCallable,
  httpsCallableFromURL,
  type HttpsCallable,
  type HttpsCallableOptions,
} from '../firebase/sdk/functions';
import { getFirebaseFunctions } from '../firebase';
import { callableGatewayUrl, routesThroughCallableGateway } from '../firebase/callableGateway';
import { callableGatewayEmulatorHost } from '../firebase/callableGatewayEmulator';

/** The callable `name`, through the gateway when this project routes it there. */
export function getCallable<RequestData = unknown, ResponseData = unknown>(
  name: string,
  options?: HttpsCallableOptions,
): HttpsCallable<RequestData, ResponseData> {
  const functions = getFirebaseFunctions();
  // Widened on purpose: service unit tests stub the instance, often as nothing.
  const stubbable = functions as { app?: { options: { projectId?: string } } } | undefined;
  const projectId = stubbable?.app?.options.projectId;
  if (!projectId || !routesThroughCallableGateway(name, projectId)) {
    return options
      ? httpsCallable<RequestData, ResponseData>(functions, name, options)
      : httpsCallable<RequestData, ResponseData>(functions, name);
  }
  const url = callableGatewayUrl(name, { projectId, functionsEmulatorHost: callableGatewayEmulatorHost() });
  return httpsCallableFromURL<RequestData, ResponseData>(functions, url, options);
}
