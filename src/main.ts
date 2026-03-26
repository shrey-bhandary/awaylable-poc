import { runMockInboundCall } from "./telephony/mockTelephony.js";
import { checkLiveKitPluginAvailability } from "./integrations/livekitPlugins.js";
import { createVoicePipeline } from "./runtime/pipelineFactory.js";

async function bootstrap(): Promise<void> {
  const { config, pipeline } = createVoicePipeline();

  const pluginStatus = await checkLiveKitPluginAvailability();
  console.log("LiveKit plugin availability (Phase 1 check):");
  for (const plugin of pluginStatus) {
    console.log(`- ${plugin.packageName}: ${plugin.loaded ? "available" : "missing"}`);
  }

  if (config.APP_MODE === "mock") {
    await runMockInboundCall({
      from: config.MOCK_CALLER,
      to: config.MOCK_CALLEE,
      pipeline,
      callerUtterance: "Hi, what are your support hours and starter pricing?"
    });
    return;
  }

  throw new Error("Use APP_MODE=mock for CLI demo, APP_MODE=web for frontend, APP_MODE=exotel for future integration");
}

bootstrap().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
