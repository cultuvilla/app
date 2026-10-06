import { Redirect } from 'expo-router';

// /descarga is the URL printed on the QR. The read site sends a browser to its
// store; when the link opens the app instead, the visitor already has it.
export default function Descarga() {
  return <Redirect href="/(tabs)" />;
}
