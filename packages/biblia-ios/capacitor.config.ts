import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: process.env.BIBLIA_BUNDLE_ID || 'com.example.provisional.biblia',
  appName: 'Biblia',
  webDir: 'web',
  ios: { contentInset: 'automatic', zoomEnabled: true },
  // Intentionally no server.url: release builds load the bundled app files.
};

export default config;
