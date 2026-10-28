import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native wrapper (iOS/Android) around the Vite build in dist/. The game is online-only, so the server address is
 * baked into the web build (VITE_SERVER_URL, see src/net/connect.ts) - nothing in this file points at the server.
 */
const config: CapacitorConfig = {
  appId: 'online.treadfront.app',
  appName: 'Treadfront',
  webDir: 'dist',
  backgroundColor: '#0b0f14',
  ios: { contentInset: 'never', backgroundColor: '#0b0f14' },
  android: { backgroundColor: '#0b0f14', allowMixedContent: false },
  plugins: {
    SplashScreen: { launchAutoHide: true, launchShowDuration: 800, backgroundColor: '#0b0f14', showSpinner: false },
    StatusBar: { overlaysWebView: true, style: 'DARK', backgroundColor: '#0b0f14' },
  },
};

export default config;
