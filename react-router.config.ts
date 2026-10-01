import type { Config } from "@react-router/dev/config";

export default {
  // Config options...
  // Mode SPA : le front utilise localStorage, BroadcastChannel et le plein écran côté navigateur
  ssr: false,
} satisfies Config;
