import { callGemini } from './gemini';
import { getSupabase, getSupabaseAnon } from './supabaseClient';

export interface CropVisionAnalysis {
  crop: string;
  problemType: 'Pest' | 'Disease' | 'Unknown';
  problemName: string;
  confidence: number;
  severity: 'Low' | 'Moderate' | 'High' | 'Unknown';
  symptoms: string[];
  possibleCauses: string[];
}

export interface VerifiedKnowledgeRecord {
  crop_name: string;
  pest_name: string | null;
  disease_name: string | null;
  problem_type: string;
  symptoms: string | null;
  causes: string | null;
  affected_stage: string | null;
  prevention: string | null;
  cultural_control: string | null;
  biological_control: string | null;
  active_ingredient: string | null;
  product_name: string | null;
  formulation: string | null;
  approved_use: string | null;
  dosage: string | null;
  application_method: string | null;
  waiting_period: string | null;
  safety_precautions: string | null;
  source_name: string | null;
  source_url: string | null;
  region: string | null;
  language: string;
}

export class CropDiagnosisError extends Error {
  constructor(public code: 'DISEASE_SERVICE_UNAVAILABLE' | 'INVALID_MODEL_RESPONSE' | 'SUPABASE_CONNECTION_ERROR') {
    super(code);
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 12);
}

function parseVisionResponse(rawText: string, selectedCrop: string): CropVisionAnalysis {
  const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new CropDiagnosisError('INVALID_MODEL_RESPONSE');
  }

  if (!parsed || typeof parsed !== 'object') throw new CropDiagnosisError('INVALID_MODEL_RESPONSE');
  const value = parsed as Record<string, unknown>;
  const confidenceValue = Number(value.confidence);
  const confidence = confidenceValue > 1 ? confidenceValue / 100 : confidenceValue;
  const problemName = typeof value.problemName === 'string' ? value.problemName.trim() : '';
  const problemType = value.problemType === 'Pest' || value.problemType === 'Disease' ? value.problemType : 'Unknown';
  const severity = value.severity === 'Low' || value.severity === 'Moderate' || value.severity === 'High' ? value.severity : 'Unknown';

  if (!problemName || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new CropDiagnosisError('INVALID_MODEL_RESPONSE');
  }

  return {
    crop: typeof value.crop === 'string' && value.crop.trim() ? value.crop.trim() : selectedCrop,
    problemType,
    problemName,
    confidence,
    severity,
    symptoms: asStringArray(value.symptoms),
    possibleCauses: asStringArray(value.possibleCauses),
  };
}

export async function analyzeCropImage(input: {
  imageBase64: string;
  mimeType: string;
  crop: string;
  language: 'en' | 'te' | 'hi';
}): Promise<CropVisionAnalysis> {
  const rawText = await callGemini({
    contents: {
      parts: [
        { inlineData: { data: input.imageBase64, mimeType: input.mimeType } },
        {
          text: `Analyze this crop image as a vision screening tool. The selected crop is only context, not proof. Return only JSON with this exact shape: {"crop":"","problemType":"Pest|Disease|Unknown","problemName":"","confidence":0.0,"severity":"Low|Moderate|High|Unknown","symptoms":[],"possibleCauses":[]}. Do not provide pesticide names, active ingredients, dosage, concentration, waiting periods, or treatment instructions. Use confidence between 0 and 1. Respond for language ${input.language}. If uncertain, use problemName "Unable to confidently identify" and a confidence below 0.6.`,
        },
      ],
    },
  });

  if (!rawText) throw new CropDiagnosisError('DISEASE_SERVICE_UNAVAILABLE');
  return parseVisionResponse(rawText, input.crop);
}

export async function findVerifiedKnowledge(
  analysis: CropVisionAnalysis,
  language: 'en' | 'te' | 'hi',
): Promise<VerifiedKnowledgeRecord[]> {
  const client = getSupabase() || getSupabaseAnon();
  if (!client) return [];

  const safeCrop = analysis.crop.replace(/[%_]/g, ' ').trim();
  const { data, error } = await client
    .from('agricultural_pest_knowledge')
    .select('crop_name,pest_name,disease_name,problem_type,symptoms,causes,affected_stage,prevention,cultural_control,biological_control,active_ingredient,product_name,formulation,approved_use,dosage,application_method,waiting_period,safety_precautions,source_name,source_url,region,language')
    .eq('verified', true)
    .eq('status', 'active')
    .in('language', [language, 'en'])
    .ilike('crop_name', `%${safeCrop}%`)
    .limit(30);

  if (error) throw new CropDiagnosisError('SUPABASE_CONNECTION_ERROR');
  const records = (data || []) as VerifiedKnowledgeRecord[];
  const problem = analysis.problemName.toLowerCase();
  return records.sort((left, right) => {
    const leftText = `${left.pest_name || ''} ${left.disease_name || ''}`.toLowerCase();
    const rightText = `${right.pest_name || ''} ${right.disease_name || ''}`.toLowerCase();
    return Number(rightText.includes(problem)) - Number(leftText.includes(problem));
  });
}