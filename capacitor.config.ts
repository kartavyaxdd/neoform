import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "app.neoform.android",
  appName: "NEOFORM",
  loggingBehavior: "none",
  webDir: "dist",
  server: { androidScheme: "https", hostname: "localhost" },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
};
export default config;
