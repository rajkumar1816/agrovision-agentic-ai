import { FarmerContextInput } from '../agent/types';

export interface N8nAgentRequest {
  farmer_id: string;
  message: string;
  language: string;
  crop?: string;
  farm_id: string;
  location?: {
    latitude?: number;
    longitude?: number;
    district?: string;
    state?: string;
  };
  context: Record<string, unknown>;
}

export interface N8nAgentResponse {
  success: true;
  intent?: string;
  language: string;
  answer: string;
  recommendation?: string;
  tools_used: string[];
  data_used: unknown[];
  confidence: number | null;
  needs_more_information: boolean;
}

export class N8nUnavailableError extends Error {
  code = 'N8N_UNAVAILABLE';
}

export function isN8nConfigured(): boolean {
  return Boolean(process.env.N8N_WEBHOOK_URL);
}

function isValidResponse(value: unknown): value is N8nAgentResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<N8nAgentResponse>;
  return (
    response.success === true &&
    typeof response.answer === 'string' &&
    typeof response.language === 'string' &&
    Array.isArray(response.tools_used) &&
    Array.isArray(response.data_used) &&
    typeof response.needs_more_information === 'boolean'
  );
}

export async function callN8nAgent(
  request: N8nAgentRequest,
  timeoutMs = Number(process.env.N8N_TIMEOUT_MS) || 30_000,
): Promise<N8nAgentResponse> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) throw new N8nUnavailableError('N8N_WEBHOOK_URL is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { Authorization: `Bearer ${process.env.N8N_WEBHOOK_SECRET}` }
          : {}),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new N8nUnavailableError(`n8n returned HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!isValidResponse(payload)) {
      throw new N8nUnavailableError('n8n returned an invalid response contract');
    }
    return payload;
  } catch (error) {
    if (error instanceof N8nUnavailableError) throw error;
    throw new N8nUnavailableError('Unable to reach the n8n webhook');
  } finally {
    clearTimeout(timeout);
  }
}

export function toN8nRequest(
  question: string,
  farmer: FarmerContextInput,
  recentScan?: unknown,
): N8nAgentRequest {
  return {
    farmer_id: farmer.farmId,
    message: question,
    language: farmer.language || 'en',
    crop: farmer.primaryCrop,
    farm_id: farmer.farmId,
    location: {
      district: farmer.district,
      state: farmer.state,
    },
    context: {
      secondary_crop: farmer.secondaryCrop,
      soil_type: farmer.soilType,
      farmer_name: farmer.name,
      recent_scan: recentScan || null,
    },
  };
}