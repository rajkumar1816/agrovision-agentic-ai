import { executeAgentWorkflow } from './supervisor';
import { FarmerContextInput } from './types';

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the automation loop described in the brief: the agent senses the
 * latest input data (soil telemetry) on a fixed interval, decides whether
 * the farmer needs to know something, and — if so — sends it to them
 * (writes a notification) without being asked. Call this once from
 * server.ts on boot.
 */
export function startAutonomousMonitor(defaultFarmer: FarmerContextInput) {
  const intervalMs = Number(process.env.AGENT_AUTONOMOUS_INTERVAL_MS) || 5 * 60 * 1000; // 5 min default

  if (timer) clearInterval(timer);

  const tick = async () => {
    try {
      const result = await executeAgentWorkflow({ farmer: defaultFarmer }, { autonomous: true });
      console.log(
        `[agent-automation] farm=${defaultFarmer.farmId} action=${result.decision.actionType} notified=${result.notified}`
      );
    } catch (err) {
      console.error('[agent-automation] tick failed:', err);
    }
  };

  // Run once shortly after boot, then on the configured interval.
  setTimeout(tick, 15 * 1000);
  timer = setInterval(tick, intervalMs);

  console.log(`[agent-automation] started, checking every ${Math.round(intervalMs / 1000)}s`);
}

export function stopAutonomousMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}
