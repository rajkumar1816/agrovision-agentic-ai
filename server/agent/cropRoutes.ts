import { Router, Request, Response } from 'express';
import { getAuthContext } from '../lib/auth';
import { analyzeCropImage, CropDiagnosisError, findVerifiedKnowledge } from '../lib/cropDiagnosis';

export const cropRouter = Router();
const supportedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const supportedLanguages = new Set(['en', 'te', 'hi']);

function errorResponse(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof CropDiagnosisError) {
    return { status: error.code === 'SUPABASE_CONNECTION_ERROR' ? 503 : 503, body: { success: false, error: error.code } };
  }
  return { status: 500, body: { success: false, error: 'INTERNAL_SERVER_ERROR' } };
}

cropRouter.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType, crop, language = 'en', farmerId = null, farmId = null } = req.body || {};
    if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
      return res.status(400).json({ success: false, error: 'INVALID_IMAGE', message: 'Please upload a crop image.' });
    }
    if (/^https?:\/\//i.test(imageBase64.trim())) {
      return res.status(400).json({ success: false, error: 'INVALID_IMAGE', message: 'Remote image URLs are not accepted.' });
    }
    if (typeof mimeType !== 'string' || !supportedMimeTypes.has(mimeType)) {
      return res.status(400).json({ success: false, error: 'INVALID_IMAGE', message: 'Please upload JPG, JPEG, PNG or WebP.' });
    }
    if (typeof crop !== 'string' || crop.length < 1 || crop.length > 100) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Please select a crop.' });
    }
    if (typeof language !== 'string' || !supportedLanguages.has(language)) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Unsupported language.' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').trim();
    if (cleanBase64.length < 50) {
      return res.status(400).json({ success: false, error: 'INVALID_IMAGE', message: 'The uploaded image is empty or invalid.' });
    }
    if (cleanBase64.length > 20 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'FILE_TOO_LARGE', message: 'Please upload a smaller image.' });
    }

    const vision = await analyzeCropImage({ imageBase64: cleanBase64, mimeType, crop, language });
    const knowledge = await findVerifiedKnowledge(vision, language);
    const requiresExpertReview = vision.confidence < 0.6 || vision.problemName === 'Unable to confidently identify';
    const chemicalControl = knowledge
      .filter((record) => record.active_ingredient || record.product_name)
      .map((record) => ({
        activeIngredient: record.active_ingredient,
        productName: record.product_name,
        formulation: record.formulation,
        approvedUse: record.approved_use,
        dosage: record.dosage,
        applicationMethod: record.application_method,
        waitingPeriod: record.waiting_period,
        safetyPrecautions: record.safety_precautions,
        source: record.source_name,
        sourceUrl: record.source_url,
      }));
    const first = knowledge[0];
    const analysis = {
      crop: vision.crop,
      problemType: vision.problemType,
      problemName: vision.problemName,
      confidence: vision.confidence,
      severity: vision.severity,
      symptoms: vision.symptoms,
      possibleCauses: vision.possibleCauses,
      prevention: first?.prevention ? [first.prevention] : [],
      culturalControl: first?.cultural_control ? [first.cultural_control] : [],
      biologicalControl: first?.biological_control ? [first.biological_control] : [],
      chemicalControl,
      safetyPrecautions: chemicalControl.length
        ? ['Follow the product label and use only legally approved products for this crop and target.', 'Wear label-specified protective equipment. Do not exceed the label rate or mix products unless the label permits it.', 'Observe the required pre-harvest interval and keep pesticides away from children, animals and food.']
        : ['Verified pesticide information is currently unavailable. Consult your local agricultural officer or follow the product label.'],
      verifiedInformation: knowledge.length > 0,
      source: first?.source_name || '',
      sourceUrl: first?.source_url || '',
      requiresExpertReview,
      knowledgeAvailable: knowledge.length > 0,
    };

    const auth = await getAuthContext(req);
    let historySaved = false;
    if (auth) {
      const { error } = await auth.client.from('crop_diagnosis_history').insert({
        user_id: auth.user.id,
        farmer_id: farmerId,
        farm_id: farmId,
        crop_name: vision.crop,
        detected_problem: vision.problemName,
        problem_type: vision.problemType,
        confidence: vision.confidence,
        severity: vision.severity,
        symptoms: vision.symptoms,
        recommendations: analysis,
        language,
      });
      historySaved = !error;
    }

    return res.json({ success: true, analysis, historySaved });
  } catch (error) {
    const response = errorResponse(error);
    return res.status(response.status).json(response.body);
  }
});

cropRouter.get('/knowledge', async (req: Request, res: Response) => {
  try {
    const crop = String(req.query.crop || '');
    const language = String(req.query.language || 'en') as 'en' | 'te' | 'hi';
    if (!crop || !supportedLanguages.has(language)) return res.status(400).json({ success: false, error: 'VALIDATION_ERROR' });
    const records = await findVerifiedKnowledge({ crop, problemType: 'Unknown', problemName: String(req.query.pest || req.query.disease || ''), confidence: 0, severity: 'Unknown', symptoms: [], possibleCauses: [] }, language);
    return res.json({ success: true, records });
  } catch (error) {
    const response = errorResponse(error);
    return res.status(response.status).json(response.body);
  }
});

cropRouter.get('/history', async (req: Request, res: Response) => {
  const auth = await getAuthContext(req);
  if (!auth) return res.status(401).json({ success: false, error: 'AUTHENTICATION_REQUIRED' });
  const { data, error } = await auth.client.from('crop_diagnosis_history').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(503).json({ success: false, error: 'SUPABASE_CONNECTION_ERROR' });
  return res.json({ success: true, history: data || [] });
});