import { AgentDecision, ToolResult } from './types';

/**
 * Deterministic fallback decision logic. This always runs first so the
 * agent has a grounded, explainable decision; the supervisor may then ask
 * Gemini to turn it into a friendly farmer-facing reply, but the *decision
 * itself* (what action, what priority) is never left to an LLM guess.
 */
export function decide(toolResults: {
  soil: ToolResult;
  weather: ToolResult;
  cropHealth: ToolResult;
  market: ToolResult;
}): AgentDecision {
  const { soil, weather, cropHealth, market } = toolResults;
  const moisture = Number(soil.moisturePercent);
  const sources = [soil.source, weather.source, cropHealth.source, market.source].map(String);

  if (String(cropHealth.disease) !== 'None detected') {
    return {
      actionType: 'DISEASE_ALERT',
      decision: `Possible ${cropHealth.disease} detected (${cropHealth.severity} severity). Inspect the crop and consider the recommended treatment before it spreads.`,
      reasoning: `Crop Doctor's last scan flagged ${cropHealth.disease}. Current humidity (${weather.condition}) can accelerate fungal spread, so this takes priority over routine irrigation advice.`,
      priority: cropHealth.severity === 'High' ? 'urgent' : 'high',
      category: 'disease',
      sources,
    };
  }

  if (moisture < 20) {
    return {
      actionType: 'IRRIGATE',
      decision: 'Soil moisture is critically low. Start irrigation now to avoid crop stress.',
      reasoning: `Sensed soil moisture is ${moisture}%, below the 20% wilting-point threshold.`,
      priority: 'urgent',
      category: 'irrigation',
      sources,
    };
  }

  if (moisture < 35) {
    return {
      actionType: 'IRRIGATE',
      decision: `Soil moisture is dropping (${moisture}%). Recommend a 40-minute drip cycle this evening.`,
      reasoning: `Sensed soil moisture ${moisture}% is below the 35% comfort threshold; rain probability is only ${weather.rainProbabilityPercent}%, so natural rainfall is unlikely to cover the gap.`,
      priority: 'high',
      category: 'irrigation',
      sources,
    };
  }

  if (moisture > 80) {
    return {
      actionType: 'DELAY_IRRIGATION',
      decision: 'Soil is waterlogged. Hold off irrigation and open drainage channels.',
      reasoning: `Sensed soil moisture is ${moisture}%, above the 80% waterlogging threshold.`,
      priority: 'high',
      category: 'irrigation',
      sources,
    };
  }

  if (market.trend === 'up' && Number(market.changePercent) >= 3) {
    return {
      actionType: 'MARKET_TIP',
      decision: `${market.crop} mandi prices are trending up (+${market.changePercent}%). Good window to sell if you have stock ready.`,
      reasoning: 'Market feed shows a favorable price movement for the farmer\'s primary crop.',
      priority: 'medium',
      category: 'market',
      sources,
    };
  }

  return {
    actionType: 'NO_ACTION',
    decision: 'Conditions are stable — no urgent action needed right now.',
    reasoning: `Soil moisture (${moisture}%) is within the optimal range and no disease was detected.`,
    priority: 'low',
    category: 'general',
    sources,
  };
}
