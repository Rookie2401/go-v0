import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: process.env.GOREVIEW_BUNDLE_ID || 'com.example.provisional.goreview',
  appName: 'GoReview',
  webDir: 'web',
  ios: { contentInset: 'automatic', zoomEnabled: true },
  // Intentionally no server.url: release builds load the bundled app files.
};

export default config;
