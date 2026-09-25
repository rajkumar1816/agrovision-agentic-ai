import { Router, Request, Response } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import { callN8nAgent, isN8nConfigured, N8nUnavailableError, toN8nRequest } from '../lib/n8n';
import { executeAgentWorkflow } from './supervisor';

export const agentRouter = Router();

/* ----------------------------------------------------
 * POST /api/agent/run — full agentic loop, farmer-triggered.
 * Senses live data, decides, replies, and persists to Supabase.
 * ---------------------------------------------------- */
agentRouter.post('/run', async (req: Request, res: Response) => {
  try {
    const { question, farmer, recentScan } = req.body || {};
    if (!farmer || typeof farmer.farmId !== 'string' || !farmer.farmId.trim()) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'farmer.farmId is required' });
    }
    if (typeof question !== 'string' || !question.trim() || question.length > 4000) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'question must be 1-4000 characters' });
    }

    if (isN8nConfigured()) {
      try {
        const result = await callN8nAgent(toN8nRequest(question.trim(), farmer, recentScan));
        return res.json({ ...result, source: 'n8n' });
      } catch (error) {
        if (error instanceof N8nUnavailableError) {
          return res.status(503).json({ success: false, error: error.code, message: error.message });
        }
        throw error;
      }
    }

    const result = await executeAgentWorkflow({ question, farmer }, { autonomous: false, recentScan });
    return res.json({ success: true, source: 'local-agent', ...result });
  } catch (error: any) {
    console.error('Agent run error:', error);
    return res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR', message: 'Agent failed to run' });
  }
});

/* ----------------------------------------------------
 * GET /api/agent/notifications?farmId=FARM001 — notifications the
 * automation has pushed, for the frontend to poll and surface.
 * ---------------------------------------------------- */
agentRouter.get('/notifications', async (req: Request, res: Response) => {
  const farmId = String(req.query.farmId || 'FARM001');
  const client = getSupabase();
  if (!client) {
    return res.json({ success: true, notifications: [], note: 'Supabase not configured' });
  }
  const { data, error } = await client
    .from('agent_notifications')
    .select('*')
    .eq('farm_id', farmId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.json({ success: true, notifications: data || [] });
});

/* ----------------------------------------------------
 * GET /api/agent/history?farmId=FARM001 — the agent's own decision
 * trail, i.e. what it has read back and referred to as memory.
 * ---------------------------------------------------- */
agentRouter.get('/history', async (req: Request, res: Response) => {
  const farmId = String(req.query.farmId || 'FARM001');
  const client = getSupabase();
  if (!client) {
    return res.json({ success: true, decisions: [], telemetry: [], note: 'Supabase not configured' });
  }
  const [decisions, telemetry] = await Promise.all([
    client.from('agent_decisions').select('*').eq('farm_id', farmId).order('created_at', { ascending: false }).limit(20),
    client.from('soil_telemetry').select('*').eq('farm_id', farmId).order('recorded_at', { ascending: false }).limit(20),
  ]);

  return res.json({
    success: true,
    decisions: decisions.data || [],
    telemetry: telemetry.data || [],
  });
});
