import { Redirect } from 'expo-router';

// /pueblos is the read site's directory of pueblos. Android opens every link on
// the host in the app, so here it lands on the village search instead.
export default function Pueblos() {
  return <Redirect href="/descubrir" />;
}
