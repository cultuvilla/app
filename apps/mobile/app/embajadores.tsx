import { Redirect } from 'expo-router';

// /embajadores is the read site's page for would-be Embajadores. Android opens
// every link on the host in the app, so here it lands on the village search,
// where a pueblo's page offers «Quiero ser embajador».
export default function Embajadores() {
  return <Redirect href="/descubrir" />;
}
