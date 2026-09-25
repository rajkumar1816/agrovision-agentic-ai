import { GoogleGenAI } from '@google/genai';

let genAI: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genAI) {
    genAI = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  }
  return genAI;
}

/**
 * Resilient Gemini caller with automatic failover across models:
 * 1. Primary: gemini-3.8-flash
 * 2. Fallback: gemini-3.1-flash-lite (fast, handles high traffic/demand spikes)
 */
export async function callGemini(params: {
  contents: any;
  config?: any;
  preferredModel?: string;
}): Promise<string | null> {
  const ai = getGenAI();
  if (!ai) return null;

  const candidateModels = [params.preferredModel || 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        ...(params.config ? { config: params.config } : {}),
      });
      if (response && typeof response.text === 'string' && response.text.trim()) {
        return response.text;
      }
    } catch (_err: any) {
      // Gracefully attempt alternative model
    }
  }
  return null;
}
