import type { AppState } from "../app-types";
import { initializeTikTokMinis } from "../tiktok-minis";

interface RuntimeControllerOptions {
  clientKey: string;
  state: AppState;
  render: () => void;
  recordBeat: (message: string) => void;
  navigationBarColor: string;
}

export async function bootstrapRuntimeController(options: RuntimeControllerOptions): Promise<void> {
  if (!options.clientKey) {
    options.recordBeat("Preview mode active. Add a client key when you want TikTok runtime hooks.");
    options.render();
    return;
  }

  const result = await initializeTikTokMinis(options.clientKey);
  if (!result.ok) {
    options.state.runtimeMode = "preview";
    options.state.runtimeMessage = result.message;
    options.recordBeat(result.message);
    options.render();
    return;
  }

  options.state.runtimeMode = "tiktok";
  options.state.runtimeMessage = "TikTok Minis runtime ready. This prototype can now inherit native shell styling.";

  if (result.sdk.canIUse?.("setNavigationBarColor") && result.sdk.setNavigationBarColor) {
    result.sdk.setNavigationBarColor({
      frontColor: "#ffffff",
      backgroundColor: options.navigationBarColor,
    });
  }

  options.recordBeat("TikTok runtime initialized.");
  options.render();
}
