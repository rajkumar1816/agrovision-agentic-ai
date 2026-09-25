import { getSupabase } from '../lib/supabaseClient';
import { latestSoilTelemetry, soilHistory } from '../state/telemetryStore';
import { AgentDecision, FarmerContextInput, ToolResult } from './types';

/* ------------------------------------------------------------------
 * SENSE: soil telemetry (the live input the automation reacts to)
 * ------------------------------------------------------------------ */
export async function senseSoilTelemetry(): Promise<ToolResult> {
  return {
    source: 'IOT SOIL SENSOR',
    ...latestSoilTelemetry,
    recentTrend: soilHistory.slice(-5),
  };
}

/* ------------------------------------------------------------------
 * SENSE: weather (mocked — swap for a real provider behind this
 * same function signature when one is wired up)
 * ------------------------------------------------------------------ */
export async function senseWeather(farmer: FarmerContextInput): Promise<ToolResult> {
  return {
    source: 'WEATHER FORECAST (DEMO)',
    location: `${farmer.district || 'Guntur'}, ${farmer.state || 'Andhra Pradesh'}`,
    condition: 'Partly cloudy',
    rainProbabilityPercent: 35,
    tempC: 32,
  };
}

/* ------------------------------------------------------------------
 * SENSE: last crop-doctor scan result, if the caller passed one
 * ------------------------------------------------------------------ */
export async function senseCropHealth(recentScan?: { disease?: string; severity?: string } | null): Promise<ToolResult> {
  if (recentScan && recentScan.disease && recentScan.disease !== 'None detected') {
    return {
      source: 'CROP DOCTOR SCAN',
      disease: recentScan.disease,
      severity: recentScan.severity || 'Low',
    };
  }
  return {
    source: 'CROP DOCTOR SCAN',
    disease: 'None detected',
    severity: 'None',
  };
}

/* ------------------------------------------------------------------
 * SENSE: mandi / market snapshot (mocked)
 * ------------------------------------------------------------------ */
export async function senseMarket(farmer: FarmerContextInput): Promise<ToolResult> {
  return {
    source: 'MANDI PRICE FEED (DEMO)',
    crop: farmer.primaryCrop || 'Paddy (Rice)',
    trend: 'up',
    changePercent: 4,
  };
}

/* ------------------------------------------------------------------
 * RECALL: read the agent's own recent history back from Supabase so
 * it has continuity (avoids re-alerting the farmer every tick, and
 * gives it "memory" of what it already told them).
 * ------------------------------------------------------------------ */
export async function recallRecentDecisions(farmId: string, limit = 5): Promise<ToolResult> {
  const client = getSupabase();
  if (!client) {
    return { source: 'AGENT MEMORY (UNAVAILABLE — SUPABASE NOT CONFIGURED)', decisions: [] };
  }
  const { data, error } = await client
    .from('agent_decisions')
    .select('*')
    .eq('farm_id', farmId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { source: 'AGENT MEMORY (SUPABASE ERROR)', error: error.message, decisions: [] };
  }
  return { source: 'AGENT MEMORY (SUPABASE)', decisions: data || [] };
}

/* ------------------------------------------------------------------
 * ACT: persist every sensed telemetry reading to Supabase, so the
 * agent (and the farmer's history) has a durable record it can read
 * back later instead of relying on the in-memory store alone.
 * ------------------------------------------------------------------ */
export async function persistTelemetryReading(farmId: string): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from('soil_telemetry').insert({
    farm_id: farmId,
    moisture_percent: latestSoilTelemetry.moisturePercent,
    soil_temp_c: latestSoilTelemetry.soilTempC,
    air_temp_c: latestSoilTelemetry.airTempC,
    humidity_percent: latestSoilTelemetry.humidityPercent,
    status: latestSoilTelemetry.status,
    nitrogen_ppm: latestSoilTelemetry.nitrogenPpm,
    phosphorus_ppm: latestSoilTelemetry.phosphorusPpm,
    potassium_ppm: latestSoilTelemetry.potassiumPpm,
    ec_value: latestSoilTelemetry.ecValue,
  });
  if (error) throw new Error(`SUPABASE_CONNECTION_ERROR: ${error.message}`);
}

/* ------------------------------------------------------------------
 * ACT: persist the agent's decision/reasoning trail
 * ------------------------------------------------------------------ */
export async function persistDecision(farmId: string, decision: AgentDecision): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from('agent_decisions').insert({
    farm_id: farmId,
    action_type: decision.actionType,
    decision: decision.decision,
    reasoning: decision.reasoning,
    priority: decision.priority,
    category: decision.category,
    sources: decision.sources,
  });
  if (error) throw new Error(`SUPABASE_CONNECTION_ERROR: ${error.message}`);
}

/* ------------------------------------------------------------------
 * ACT: send data to the user — writes a notification the frontend
 * polls for, so the farmer sees what the automation decided without
 * having to ask a question first.
 * ------------------------------------------------------------------ */
export async function notifyFarmer(farmId: string, decision: AgentDecision, title: string): Promise<boolean> {
  const client = getSupabase();
  if (!client) {
    console.log(`[agent] (no Supabase configured) would notify farm ${farmId}: ${title} — ${decision.decision}`);
    return false;
  }
  const { error } = await client.from('agent_notifications').insert({
    farm_id: farmId,
    title,
    message: decision.decision,
    priority: decision.priority,
    category: decision.category,
  });
  return !error;
}
