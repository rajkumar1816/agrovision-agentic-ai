import React, { useEffect, useState, useRef } from 'react';
import {
  Stethoscope,
  Upload,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  HelpCircle,
  Leaf,
  ShieldAlert,
  Clock,
  ChevronRight,
  Info
} from 'lucide-react';
import { CropScanResult } from '../types';
import { SAMPLE_LEAF_IMAGES } from '../data/mockData';
import { Language } from '../types';
import { supabase } from '../lib/supabase';

const CROPS_LIST = [
  'Paddy (Rice)',
  'Cotton',
  'Maize',
  'Chilli',
  'Tomato',
  'Groundnut',
  'Turmeric',
  'Other'
];

interface CropDoctorViewProps {
  onScanComplete?: (scan: CropScanResult) => void;
  language?: Language;
}

export const CropDoctorView: React.FC<CropDoctorViewProps> = ({ onScanComplete, language = 'en' }) => {
  const [selectedCrop, setSelectedCrop] = useState<string>('Paddy (Rice)');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [currentDiagnosis, setCurrentDiagnosis] = useState<CropScanResult | null>(null);
  const [recentScans, setRecentScans] = useState<CropScanResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      if (!session?.access_token) return;
      const response = await fetch('/api/crop/history', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!active || !response.ok) return;
      const payload = await response.json();
      const history = Array.isArray(payload.history) ? payload.history : [];
      setRecentScans(history.map((record: any) => ({
        id: record.id,
        crop: record.crop_name,
        imageUrl: record.image_url || undefined,
        timestamp: record.created_at,
        disease: record.detected_problem,
        confidence: Math.round(Number(record.confidence || 0) * 100),
        severity: record.severity === 'Moderate' ? 'Medium' : record.severity || 'None',
        symptoms: record.symptoms || [],
        organicTreatment: record.recommendations?.biologicalControl?.join(' ') || 'No verified biological control recorded.',
        chemicalTreatment: record.recommendations?.chemicalControl?.length ? 'Verified chemical-control information available.' : 'Verified pesticide information is unavailable.',
        prevention: record.recommendations?.prevention?.join(' ') || 'No verified prevention guidance recorded.',
        simpleExplanation: 'Previously saved diagnosis.',
        disclaimer: 'Confirm diagnosis with a qualified agricultural professional before treatment.',
      })));
    };
    void loadHistory();
    return () => {
      active = false;
    };
  }, []);

  const processImageFile = (file: File) => {
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!supportedTypes.includes(file.type)) {
      setErrorMsg('Please upload JPG, JPEG, PNG or WebP.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('Please upload a smaller image (maximum 15 MB).');
      return;
    }
    setErrorMsg(null);
    setImageMimeType(file.type);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const handleSelectSample = (sample: typeof SAMPLE_LEAF_IMAGES[0]) => {
    setSelectedCrop(sample.crop);
    setImagePreview(null);
    setErrorMsg('Reference sample selected. Upload a new crop image before analysis.');
  };

  const resetAnalysis = () => {
    setImagePreview(null);
    setCurrentDiagnosis(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAnalyze = async () => {
    if (!imagePreview) {
      setErrorMsg('Please select or upload a crop leaf image first.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);

    try {
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const res = await fetch('/api/crop/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          imageBase64: imagePreview,
          mimeType: imageMimeType,
          crop: selectedCrop,
          language: language === 'te' || language === 'hi' ? language : 'en',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.analysis) {
        throw new Error(data.message || data.error || 'DISEASE_SERVICE_UNAVAILABLE');
      }
      const analysis = data.analysis;
      const chemicalText = analysis.chemicalControl?.length
        ? analysis.chemicalControl.map((item: any) => [item.activeIngredient, item.productName, item.formulation, item.dosage, item.waitingPeriod].filter(Boolean).join(' | ')).join('\n')
        : 'Verified pesticide information is currently unavailable. Please consult your local agricultural officer or follow the product label.';
      const resultWithImage: CropScanResult = {
        id: 'scan-' + Date.now(),
        crop: analysis.crop,
        imageUrl: imagePreview,
        timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        disease: analysis.problemName,
        confidence: Math.round(analysis.confidence * 100),
        severity: analysis.severity === 'Moderate' ? 'Medium' : analysis.severity === 'High' ? 'High' : analysis.severity === 'Low' ? 'Low' : 'None',
        symptoms: analysis.symptoms || [],
        organicTreatment: [...(analysis.biologicalControl || []), ...(analysis.culturalControl || [])].join(' ') || 'No verified biological or cultural control was found.',
        chemicalTreatment: chemicalText,
        prevention: (analysis.prevention || []).join(' ') || 'No verified prevention guidance was found.',
        simpleExplanation: analysis.requiresExpertReview
          ? 'The image result is uncertain. Please upload a clearer close-up image and consult a qualified agricultural expert before treatment.'
          : `AI identification: ${analysis.problemName}. Verified agricultural guidance is shown only when matching Supabase knowledge is available.`,
        disclaimer: 'AI identification is a screening result. Confirm the diagnosis with your local agriculture officer before applying any treatment.',
        problemType: analysis.problemType,
        possibleCauses: analysis.possibleCauses,
        biologicalControl: analysis.biologicalControl,
        chemicalControl: analysis.chemicalControl,
        safetyPrecautions: analysis.safetyPrecautions,
        verifiedInformation: analysis.verifiedInformation,
        requiresExpertReview: analysis.requiresExpertReview,
        source: analysis.source,
      };
      setCurrentDiagnosis(resultWithImage);
      setRecentScans((prev) => [resultWithImage, ...prev.filter((s) => s.id !== resultWithImage.id).slice(0, 5)]);
      onScanComplete?.(resultWithImage);
    } catch (err: any) {
      console.warn('Diagnosis Engine Notice:', err.message);
      setErrorMsg(
        err.message === 'DISEASE_SERVICE_UNAVAILABLE'
          ? 'Crop analysis is temporarily unavailable. Please try again.'
          : err.message === 'SUPABASE_CONNECTION_ERROR'
          ? 'Agricultural knowledge service is temporarily unavailable.'
          : err.message || 'We could not analyze this image. Please upload a clearer close-up image.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 text-emerald-800 font-bold text-xs uppercase tracking-wider mb-1">
          <Stethoscope className="w-4 h-4 text-emerald-600" />
          <span>Computer Vision Plant Pathology</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-950 font-serif">
          AI Crop Doctor — Leaf Disease Diagnostic Center
        </h1>
        <p className="text-xs sm:text-sm text-stone-600 mt-1 max-w-2xl">
          Capture or upload an image of an infected leaf. Our neural vision model analyzes symptoms, assesses severity, and prescribes organic and chemical treatments.
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left Column: Image Input & Controls */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card: Upload & Select */}
          <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs">
            <h2 className="text-sm font-bold text-stone-900 mb-4 flex items-center justify-between">
              <span>Step 1: Crop & Leaf Image</span>
              <span className="text-[11px] font-normal text-stone-500">Camera / Upload</span>
            </h2>

            {/* Crop Selector */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Select Cultivated Crop
              </label>
              <select
                id="crop-select-dropdown"
                value={selectedCrop}
                onChange={(e) => setSelectedCrop(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {CROPS_LIST.map((crop) => (
                  <option key={crop} value={crop}>
                    {crop}
                  </option>
                ))}
              </select>
            </div>

            {/* Image Preview & Dropzone */}
            <div className="relative mb-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files?.[0];
                  if (file) processImageFile(file);
                }}
                className="relative aspect-4/3 rounded-xl border-2 border-dashed border-stone-300 hover:border-emerald-600 bg-stone-50 flex flex-col items-center justify-center overflow-hidden cursor-pointer group transition"
              >
                {imagePreview ? (
                  <>
                    <img
                      src={imagePreview}
                      alt="Crop leaf preview"
                      className="w-full h-full object-cover group-hover:opacity-90 transition"
                      crossOrigin="anonymous"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-bold gap-2">
                      <Camera className="w-4 h-4" />
                      <span>Change Image</span>
                    </div>
                  </>
                ) : (
                  <div className="p-6 text-center">
                    <Upload className="w-8 h-8 text-stone-400 mx-auto mb-2 group-hover:text-emerald-600 transition" />
                    <p className="text-xs font-bold text-stone-700">Click to upload or take a photo</p>
                    <p className="text-[11px] text-stone-500 mt-1">PNG, JPG up to 15MB</p>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {imagePreview && (
              <div className="mb-4 flex gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-100">
                  Change Image
                </button>
                <button type="button" onClick={resetAnalysis} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">
                  Remove Image
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="mb-4 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Analyze Button */}
            <button
              id="analyze-leaf-btn"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="w-full py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-700/20 transition cursor-pointer"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Analyzing Leaf Pathogens via Vision AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  <span>Run AI Disease Diagnosis</span>
                </>
              )}
            </button>
          </div>

          {/* Card: Try Sample Leaf Gallery */}
          <div className="bg-stone-100 rounded-2xl p-4 border border-stone-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                <Leaf className="w-3.5 h-3.5 text-emerald-700" />
                <span>Quick Test: Real Leaf Samples</span>
              </h3>
              <span className="text-[10px] text-stone-500">Tap to select</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SAMPLE_LEAF_IMAGES.map((sample) => (
                <button
                  key={sample.id}
                  onClick={() => handleSelectSample(sample)}
                  className={`relative rounded-xl overflow-hidden border text-left p-1 bg-white hover:border-emerald-600 transition cursor-pointer group ${
                    imagePreview === sample.url ? 'border-emerald-600 ring-2 ring-emerald-600/30' : 'border-stone-200'
                  }`}
                >
                  <img
                    src={sample.url}
                    alt={sample.name}
                    className="w-full h-16 object-cover rounded-lg mb-1"
                    crossOrigin="anonymous"
                  />
                  <div className="px-1">
                    <div className="text-[10px] font-bold text-stone-900 truncate">{sample.crop}</div>
                    <div className="text-[9px] text-stone-500 truncate">{sample.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Diagnostic Results & History */}
        <div className="lg:col-span-7 space-y-6">
          {currentDiagnosis ? (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
              {/* Top Banner */}
              <div
                className={`px-6 py-4 flex flex-wrap items-center justify-between gap-3 ${
                  currentDiagnosis.severity === 'High'
                    ? 'bg-red-50 border-b border-red-200'
                    : currentDiagnosis.severity === 'Medium'
                    ? 'bg-amber-50 border-b border-amber-200'
                    : 'bg-emerald-50 border-b border-emerald-200'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">
                      {currentDiagnosis.crop}
                    </span>
                    <span className="text-stone-300">•</span>
                    <span className="text-xs text-stone-500 font-mono">{currentDiagnosis.timestamp}</span>
                  </div>
                  <h3 className="text-xl font-black text-stone-950 mt-0.5">{currentDiagnosis.disease}</h3>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-stone-500">Confidence</div>
                    <div className="text-lg font-black text-emerald-800">{currentDiagnosis.confidence}%</div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      currentDiagnosis.severity === 'High'
                        ? 'bg-red-200 text-red-900'
                        : currentDiagnosis.severity === 'Medium'
                        ? 'bg-amber-200 text-amber-900'
                        : 'bg-emerald-200 text-emerald-900'
                    }`}
                  >
                    Severity: {currentDiagnosis.severity}
                  </span>
                </div>
              </div>

              {/* Simple Farmer Language Explanation */}
              <div className="px-6 py-4 bg-emerald-900 text-white flex items-start gap-3">
                <Info className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    Farmer Summary (సరళ వివరణ / सरल सारांश)
                  </div>
                  <p className="text-xs text-emerald-50 leading-relaxed mt-1">
                    {currentDiagnosis.simpleExplanation}
                  </p>
                </div>
              </div>

              {/* Body Details */}
              <div className="p-6 space-y-6">
                {/* Visible Symptoms */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Identified Visible Symptoms</span>
                  </h4>
                  <ul className="space-y-1.5">
                    {currentDiagnosis.symptoms?.map((sym, idx) => (
                      <li key={idx} className="text-xs text-stone-700 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                        <span>{sym}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {currentDiagnosis.possibleCauses?.length ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-900">Possible Causes</h4>
                    <ul className="space-y-1.5">
                      {currentDiagnosis.possibleCauses.map((cause, idx) => <li key={idx} className="text-xs text-stone-700">• {cause}</li>)}
                    </ul>
                  </div>
                ) : null}

                {/* Treatment Grid */}
                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Organic Treatment */}
                  <div className="bg-emerald-50/60 rounded-xl p-4 border border-emerald-200">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 mb-2">
                      <Leaf className="w-4 h-4 text-emerald-600" />
                      <span>Organic & Bio-Control Solution</span>
                    </div>
                    <p className="text-xs text-stone-700 leading-relaxed">
                      {currentDiagnosis.organicTreatment}
                    </p>
                  </div>

                  {/* Chemical Treatment */}
                  <div className="bg-blue-50/60 rounded-xl p-4 border border-blue-200">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 mb-2">
                      <ShieldAlert className="w-4 h-4 text-blue-700" />
                      <span>Recommended Chemical Fungicide/Pesticide</span>
                    </div>
                    <p className="whitespace-pre-line text-xs text-stone-700 leading-relaxed">
                      {currentDiagnosis.chemicalTreatment}
                    </p>
                    <div className={`mt-3 text-[11px] font-bold ${currentDiagnosis.verifiedInformation ? 'text-emerald-800' : 'text-amber-800'}`}>
                      {currentDiagnosis.verifiedInformation ? `Verified source: ${currentDiagnosis.source || 'Supabase agricultural knowledge'}` : 'No verified pesticide record found.'}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <h5 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-900">
                    <ShieldAlert className="h-4 w-4 text-red-700" /> Important Safety Information
                  </h5>
                  <ul className="space-y-1.5 text-xs text-red-950">
                    {(currentDiagnosis.safetyPrecautions || [
                      'Follow the product label and use only legally approved products.',
                      'Do not exceed label rates or mix chemicals unless the label permits it.',
                      'Keep pesticides away from children, animals and food, and observe the waiting period.',
                    ]).map((precaution, idx) => <li key={idx}>• {precaution}</li>)}
                  </ul>
                </div>

                {/* Prevention */}
                <div className="bg-stone-50 rounded-xl p-4 border border-stone-200">
                  <h5 className="text-xs font-bold text-stone-900 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Future Prevention & Agronomic Practices</span>
                  </h5>
                  <p className="text-xs text-stone-600 leading-relaxed">{currentDiagnosis.prevention}</p>
                </div>

                {/* Disclaimer */}
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                  <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong>Important Agronomic Disclaimer: </strong>
                    {currentDiagnosis.disclaimer}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-500">
              <Stethoscope className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <p className="font-bold text-stone-700">No leaf diagnostic loaded</p>
              <p className="text-xs text-stone-500 mt-1">Select an image on the left and tap "Run AI Disease Diagnosis".</p>
            </div>
          )}

          {currentDiagnosis && (
            <button onClick={resetAnalysis} className="w-full rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100">
              Analyze Another Image
            </button>
          )}

          {/* Scan History */}
          <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 mb-4 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-500" />
              <span>Recent Diagnostic History</span>
            </h3>

            <div className="space-y-2">
              {recentScans.map((scan) => (
                <div
                  key={scan.id}
                  onClick={() => setCurrentDiagnosis(scan)}
                  className="flex items-center justify-between p-3 rounded-xl border border-stone-100 hover:border-emerald-300 hover:bg-emerald-50/50 transition cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    {scan.imageUrl ? (
                      <img
                        src={scan.imageUrl}
                        alt={scan.crop}
                        className="w-10 h-10 rounded-lg object-cover border border-stone-200"
                        crossOrigin="anonymous"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800 text-xs font-bold">
                        🌿
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-bold text-stone-900">{scan.disease}</div>
                      <div className="text-[10px] text-stone-500">{scan.crop} • {scan.timestamp}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-700">{scan.confidence}%</span>
                    <ChevronRight className="w-4 h-4 text-stone-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
