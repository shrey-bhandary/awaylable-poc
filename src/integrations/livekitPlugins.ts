type PluginLoadStatus = {
  packageName: string;
  loaded: boolean;
  reason?: string;
};

const pluginPackages = [
  "@livekit/agents-plugin-silero",
  "@livekit/agents-plugin-deepgram",
  "@livekit/agents"
] as const;

export async function checkLiveKitPluginAvailability(): Promise<PluginLoadStatus[]> {
  const results: PluginLoadStatus[] = [];

  for (const packageName of pluginPackages) {
    try {
      await import(packageName);
      results.push({ packageName, loaded: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown import error";
      results.push({ packageName, loaded: false, reason });
    }
  }

  return results;
}
