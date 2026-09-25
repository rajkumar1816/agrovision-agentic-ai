import { callGemini } from '../lib/gemini';
import { decide } from './planner';
import {
  notifyFarmer,
  persistDecision,
  persistTelemetryReading,
  recallRecentDecisions,
  senseCropHealth,
  senseMarket,
  senseSoilTelemetry,
  senseWeather,
} from './tools';
import { AgentDecision, AgentRunRequest, AgentRunResponse, AgentTrace } from './types';

const LANGUAGE_NAMES: Record<string, string> = {
  te: 'Telugu (తెలుగు)',
  hi: 'Hindi (हिन्दी)',
  en: 'English',
  ta: 'Tamil (தமிழ்)',
  kn: 'Kannada (ಕನ್ನಡ)',
  mr: 'Marathi (मराठी)',
  bn: 'Bengali (বাংলা)',
  pa: 'Punjabi (ਪੰਜਾਬੀ)',
  gu: 'Gujarati (ગુજરાતી)',
};

async function phraseReply(decision: AgentDecision, question: string | undefined, language: string, farmerName: string): Promise<string> {
  const targetLang = LANGUAGE_NAMES[language] || 'Telugu';
  const prompt = `You are AgroVision's farm automation agent speaking directly to farmer ${farmerName}.
Reply in ${targetLang}, warm and simple, 2-4 sentences, no markdown.
The agent already decided the following by sensing live farm data (do not contradict it, just explain it naturally):
- Decision: ${decision.decision}
- Reasoning: ${decision.reasoning}
${question ? `The farmer asked: "${question}"` : 'This is a proactive automated check-in, the farmer did not ask anything this time.'}`;

  const text = await callGemini({ contents: prompt, config: { temperature: 0.6 } });
  if (text && text.trim()) return text.trim();

  // Deterministic fallback if Gemini is unavailable
  return `${decision.decision} (${decision.reasoning})`;
}

/**
 * The full agentic loop: sense -> recall -> decide -> (optionally) act.
 * Set `autonomous: true` for background-automation ticks (no human
 * question) — those are the ones allowed to push a notification, since a
 * manual chat question already gets its answer back in the response.
 */
export async function executeAgentWorkflow(
  request: AgentRunRequest,
  opts: { autonomous?: boolean; recentScan?: { disease?: string; severity?: string } | null } = {}
): Promise<AgentRunResponse> {
  const trace: AgentTrace[] = [];
  let step = 0;
  const pushTrace = (label: string) => {
    step += 1;
    trace.push({ step, label, timestamp: new Date().toISOString() });
  };

  const farmId = request.farmer.farmId;

  pushTrace('Sensing soil telemetry from IoT feed');
  const soil = await senseSoilTelemetry();

  pushTrace('Checking weather outlook');
  const weather = await senseWeather(request.farmer);

  pushTrace('Reviewing latest crop-doctor scan');
  const cropHealth = await senseCropHealth(opts.recentScan);

  pushTrace('Checking mandi market trend');
  const market = await senseMarket(request.farmer);

  pushTrace('Recalling recent agent memory from Supabase');
  const memory = await recallRecentDecisions(farmId, 3);

  pushTrace('Deciding next action from sensed data');
  const decision = decide({ soil, weather, cropHealth, market });

  pushTrace('Persisting sensed reading and decision to Supabase');
  await persistTelemetryReading(farmId);
  await persistDecision(farmId, decision);

  let notified = false;
  if (opts.autonomous) {
    const priorDecisions = (memory.decisions as any[]) || [];
    const lastSameKind = priorDecisions.find((d) => d.action_type === decision.actionType);
    const isDuplicate = Boolean(lastSameKind) && decision.actionType !== 'DISEASE_ALERT';
    if (decision.actionType !== 'NO_ACTION' && !isDuplicate) {
      pushTrace('Sending automated alert to farmer');
      notified = await notifyFarmer(farmId, decision, `${decision.category.toUpperCase()} advisory`);
    } else {
      pushTrace('No new alert needed — matches recent memory or conditions are stable');
    }
  }

  pushTrace('Composing farmer-facing reply');
  const reply = await phraseReply(decision, request.question, request.farmer.language || 'te', request.farmer.name || 'Kisan');

  return {
    reply,
    decision,
    trace,
    toolResults: { soil, weather, cropHealth, market, memory },
    notified,
    timestamp: new Date().toISOString(),
  };
}
