var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express3 = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_dotenv = __toESM(require("dotenv"), 1);

// server/lib/gemini.ts
var import_genai = require("@google/genai");
var genAI = null;
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genAI) {
    genAI = new import_genai.GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });
  }
  return genAI;
}
async function callGemini(params) {
  const ai = getGenAI();
  if (!ai) return null;
  const candidateModels = [params.preferredModel || "gemini-3.8-flash", "gemini-3.1-flash-lite"];
  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        ...params.config ? { config: params.config } : {}
      });
      if (response && typeof response.text === "string" && response.text.trim()) {
        return response.text;
      }
    } catch (_err) {
    }
  }
  return null;
}

// server/lib/supabaseClient.ts
var import_supabase_js = require("@supabase/supabase-js");
var supabase = null;
var supabaseAnon = null;
var warnedMissingConfig = false;
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (!warnedMissingConfig) {
      console.warn(
        "[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set \u2014 agent will run in-memory only, nothing will be persisted."
      );
      warnedMissingConfig = true;
    }
    return null;
  }
  if (!supabase) {
    supabase = (0, import_supabase_js.createClient)(url, key, {
      auth: { persistSession: false }
    });
  }
  return supabase;
}
function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function getSupabaseAnon() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!supabaseAnon) {
    supabaseAnon = (0, import_supabase_js.createClient)(url, key, {
      auth: { persistSession: false }
    });
  }
  return supabaseAnon;
}

// server/agent/routes.ts
var import_express = require("express");

// server/lib/n8n.ts
var N8nUnavailableError = class extends Error {
  constructor() {
    super(...arguments);
    this.code = "N8N_UNAVAILABLE";
  }
};
function isN8nConfigured() {
  return Boolean(process.env.N8N_WEBHOOK_URL);
}
function isValidResponse(value) {
  if (!value || typeof value !== "object") return false;
  const response = value;
  return response.success === true && typeof response.answer === "string" && typeof response.language === "string" && Array.isArray(response.tools_used) && Array.isArray(response.data_used) && typeof response.needs_more_information === "boolean";
}
async function callN8nAgent(request, timeoutMs = Number(process.env.N8N_TIMEOUT_MS) || 3e4) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) throw new N8nUnavailableError("N8N_WEBHOOK_URL is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...process.env.N8N_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.N8N_WEBHOOK_SECRET}` } : {}
      },
      body: JSON.stringify(request),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new N8nUnavailableError(`n8n returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (!isValidResponse(payload)) {
      throw new N8nUnavailableError("n8n returned an invalid response contract");
    }
    return payload;
  } catch (error) {
    if (error instanceof N8nUnavailableError) throw error;
    throw new N8nUnavailableError("Unable to reach the n8n webhook");
  } finally {
    clearTimeout(timeout);
  }
}
function toN8nRequest(question, farmer, recentScan) {
  return {
    farmer_id: farmer.farmId,
    message: question,
    language: farmer.language || "en",
    crop: farmer.primaryCrop,
    farm_id: farmer.farmId,
    location: {
      district: farmer.district,
      state: farmer.state
    },
    context: {
      secondary_crop: farmer.secondaryCrop,
      soil_type: farmer.soilType,
      farmer_name: farmer.name,
      recent_scan: recentScan || null
    }
  };
}

// server/agent/planner.ts
function decide(toolResults) {
  const { soil, weather, cropHealth, market } = toolResults;
  const moisture = Number(soil.moisturePercent);
  const sources = [soil.source, weather.source, cropHealth.source, market.source].map(String);
  if (String(cropHealth.disease) !== "None detected") {
    return {
      actionType: "DISEASE_ALERT",
      decision: `Possible ${cropHealth.disease} detected (${cropHealth.severity} severity). Inspect the crop and consider the recommended treatment before it spreads.`,
      reasoning: `Crop Doctor's last scan flagged ${cropHealth.disease}. Current humidity (${weather.condition}) can accelerate fungal spread, so this takes priority over routine irrigation advice.`,
      priority: cropHealth.severity === "High" ? "urgent" : "high",
      category: "disease",
      sources
    };
  }
  if (moisture < 20) {
    return {
      actionType: "IRRIGATE",
      decision: "Soil moisture is critically low. Start irrigation now to avoid crop stress.",
      reasoning: `Sensed soil moisture is ${moisture}%, below the 20% wilting-point threshold.`,
      priority: "urgent",
      category: "irrigation",
      sources
    };
  }
  if (moisture < 35) {
    return {
      actionType: "IRRIGATE",
      decision: `Soil moisture is dropping (${moisture}%). Recommend a 40-minute drip cycle this evening.`,
      reasoning: `Sensed soil moisture ${moisture}% is below the 35% comfort threshold; rain probability is only ${weather.rainProbabilityPercent}%, so natural rainfall is unlikely to cover the gap.`,
      priority: "high",
      category: "irrigation",
      sources
    };
  }
  if (moisture > 80) {
    return {
      actionType: "DELAY_IRRIGATION",
      decision: "Soil is waterlogged. Hold off irrigation and open drainage channels.",
      reasoning: `Sensed soil moisture is ${moisture}%, above the 80% waterlogging threshold.`,
      priority: "high",
      category: "irrigation",
      sources
    };
  }
  if (market.trend === "up" && Number(market.changePercent) >= 3) {
    return {
      actionType: "MARKET_TIP",
      decision: `${market.crop} mandi prices are trending up (+${market.changePercent}%). Good window to sell if you have stock ready.`,
      reasoning: "Market feed shows a favorable price movement for the farmer's primary crop.",
      priority: "medium",
      category: "market",
      sources
    };
  }
  return {
    actionType: "NO_ACTION",
    decision: "Conditions are stable \u2014 no urgent action needed right now.",
    reasoning: `Soil moisture (${moisture}%) is within the optimal range and no disease was detected.`,
    priority: "low",
    category: "general",
    sources
  };
}

// server/state/telemetryStore.ts
var latestSoilTelemetry = {
  timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  moisturePercent: 31,
  soilTempC: 28.4,
  airTempC: 32.1,
  humidityPercent: 68,
  status: "Soil is becoming dry",
  recommendation: "Soil moisture is dipping below 35% threshold. Recommend 40 minutes drip irrigation this evening around 5:30 PM.",
  nitrogenPpm: 185,
  phosphorusPpm: 24,
  potassiumPpm: 195,
  ecValue: 1.2
};
var soilHistory = [
  { time: "06:00 AM", moisture: 42, temp: 24, humidity: 82 },
  { time: "08:00 AM", moisture: 39, temp: 26, humidity: 76 },
  { time: "10:00 AM", moisture: 36, temp: 29, humidity: 71 },
  { time: "12:00 PM", moisture: 33, temp: 33, humidity: 62 },
  { time: "02:00 PM", moisture: 31, temp: 34, humidity: 58 },
  { time: "04:00 PM", moisture: 31, temp: 31, humidity: 64 },
  { time: "06:00 PM", moisture: 31, temp: 28, humidity: 68 }
];
function setLatestSoilTelemetry(record) {
  latestSoilTelemetry = record;
  soilHistory.push({
    time: record.timestamp,
    moisture: record.moisturePercent,
    temp: Math.round(record.soilTempC),
    humidity: Math.round(record.humidityPercent)
  });
  if (soilHistory.length > 10) {
    soilHistory.shift();
  }
}
function deriveStatus(moisturePercent) {
  if (moisturePercent < 20) {
    return {
      status: "Critical - Irrigation Required",
      recommendation: "Urgent: Soil moisture is dangerously low (<20%). Crop is reaching permanent wilting point. Initiate irrigation immediately."
    };
  }
  if (moisturePercent < 35) {
    return {
      status: "Soil is becoming dry",
      recommendation: "Soil moisture is dipping below 35% threshold. Recommend 40-50 minutes drip irrigation this evening around 5:30 PM."
    };
  }
  if (moisturePercent > 80) {
    return {
      status: "Waterlogged",
      recommendation: "Soil is saturated/waterlogged (>80%). Open drainage channels to prevent root asphyxiation and collar rot."
    };
  }
  return { status: "Optimal", recommendation: "Soil moisture is optimal. No irrigation required today." };
}

// server/agent/tools.ts
async function senseSoilTelemetry() {
  return {
    source: "IOT SOIL SENSOR",
    ...latestSoilTelemetry,
    recentTrend: soilHistory.slice(-5)
  };
}
async function senseWeather(farmer) {
  return {
    source: "WEATHER FORECAST (DEMO)",
    location: `${farmer.district || "Guntur"}, ${farmer.state || "Andhra Pradesh"}`,
    condition: "Partly cloudy",
    rainProbabilityPercent: 35,
    tempC: 32
  };
}
async function senseCropHealth(recentScan) {
  if (recentScan && recentScan.disease && recentScan.disease !== "None detected") {
    return {
      source: "CROP DOCTOR SCAN",
      disease: recentScan.disease,
      severity: recentScan.severity || "Low"
    };
  }
  return {
    source: "CROP DOCTOR SCAN",
    disease: "None detected",
    severity: "None"
  };
}
async function senseMarket(farmer) {
  return {
    source: "MANDI PRICE FEED (DEMO)",
    crop: farmer.primaryCrop || "Paddy (Rice)",
    trend: "up",
    changePercent: 4
  };
}
async function recallRecentDecisions(farmId, limit = 5) {
  const client = getSupabase();
  if (!client) {
    return { source: "AGENT MEMORY (UNAVAILABLE \u2014 SUPABASE NOT CONFIGURED)", decisions: [] };
  }
  const { data, error } = await client.from("agent_decisions").select("*").eq("farm_id", farmId).order("created_at", { ascending: false }).limit(limit);
  if (error) {
    return { source: "AGENT MEMORY (SUPABASE ERROR)", error: error.message, decisions: [] };
  }
  return { source: "AGENT MEMORY (SUPABASE)", decisions: data || [] };
}
async function persistTelemetryReading(farmId) {
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from("soil_telemetry").insert({
    farm_id: farmId,
    moisture_percent: latestSoilTelemetry.moisturePercent,
    soil_temp_c: latestSoilTelemetry.soilTempC,
    air_temp_c: latestSoilTelemetry.airTempC,
    humidity_percent: latestSoilTelemetry.humidityPercent,
    status: latestSoilTelemetry.status,
    nitrogen_ppm: latestSoilTelemetry.nitrogenPpm,
    phosphorus_ppm: latestSoilTelemetry.phosphorusPpm,
    potassium_ppm: latestSoilTelemetry.potassiumPpm,
    ec_value: latestSoilTelemetry.ecValue
  });
  if (error) throw new Error(`SUPABASE_CONNECTION_ERROR: ${error.message}`);
}
async function persistDecision(farmId, decision) {
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from("agent_decisions").insert({
    farm_id: farmId,
    action_type: decision.actionType,
    decision: decision.decision,
    reasoning: decision.reasoning,
    priority: decision.priority,
    category: decision.category,
    sources: decision.sources
  });
  if (error) throw new Error(`SUPABASE_CONNECTION_ERROR: ${error.message}`);
}
async function notifyFarmer(farmId, decision, title) {
  const client = getSupabase();
  if (!client) {
    console.log(`[agent] (no Supabase configured) would notify farm ${farmId}: ${title} \u2014 ${decision.decision}`);
    return false;
  }
  const { error } = await client.from("agent_notifications").insert({
    farm_id: farmId,
    title,
    message: decision.decision,
    priority: decision.priority,
    category: decision.category
  });
  return !error;
}

// server/agent/supervisor.ts
var LANGUAGE_NAMES = {
  te: "Telugu (\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41)",
  hi: "Hindi (\u0939\u093F\u0928\u094D\u0926\u0940)",
  en: "English",
  ta: "Tamil (\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD)",
  kn: "Kannada (\u0C95\u0CA8\u0CCD\u0CA8\u0CA1)",
  mr: "Marathi (\u092E\u0930\u093E\u0920\u0940)",
  bn: "Bengali (\u09AC\u09BE\u0982\u09B2\u09BE)",
  pa: "Punjabi (\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40)",
  gu: "Gujarati (\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0)"
};
async function phraseReply(decision, question, language, farmerName) {
  const targetLang = LANGUAGE_NAMES[language] || "Telugu";
  const prompt = `You are AgroVision's farm automation agent speaking directly to farmer ${farmerName}.
Reply in ${targetLang}, warm and simple, 2-4 sentences, no markdown.
The agent already decided the following by sensing live farm data (do not contradict it, just explain it naturally):
- Decision: ${decision.decision}
- Reasoning: ${decision.reasoning}
${question ? `The farmer asked: "${question}"` : "This is a proactive automated check-in, the farmer did not ask anything this time."}`;
  const text = await callGemini({ contents: prompt, config: { temperature: 0.6 } });
  if (text && text.trim()) return text.trim();
  return `${decision.decision} (${decision.reasoning})`;
}
async function executeAgentWorkflow(request, opts = {}) {
  const trace = [];
  let step = 0;
  const pushTrace = (label) => {
    step += 1;
    trace.push({ step, label, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  };
  const farmId = request.farmer.farmId;
  pushTrace("Sensing soil telemetry from IoT feed");
  const soil = await senseSoilTelemetry();
  pushTrace("Checking weather outlook");
  const weather = await senseWeather(request.farmer);
  pushTrace("Reviewing latest crop-doctor scan");
  const cropHealth = await senseCropHealth(opts.recentScan);
  pushTrace("Checking mandi market trend");
  const market = await senseMarket(request.farmer);
  pushTrace("Recalling recent agent memory from Supabase");
  const memory = await recallRecentDecisions(farmId, 3);
  pushTrace("Deciding next action from sensed data");
  const decision = decide({ soil, weather, cropHealth, market });
  pushTrace("Persisting sensed reading and decision to Supabase");
  await persistTelemetryReading(farmId);
  await persistDecision(farmId, decision);
  let notified = false;
  if (opts.autonomous) {
    const priorDecisions = memory.decisions || [];
    const lastSameKind = priorDecisions.find((d) => d.action_type === decision.actionType);
    const isDuplicate = Boolean(lastSameKind) && decision.actionType !== "DISEASE_ALERT";
    if (decision.actionType !== "NO_ACTION" && !isDuplicate) {
      pushTrace("Sending automated alert to farmer");
      notified = await notifyFarmer(farmId, decision, `${decision.category.toUpperCase()} advisory`);
    } else {
      pushTrace("No new alert needed \u2014 matches recent memory or conditions are stable");
    }
  }
  pushTrace("Composing farmer-facing reply");
  const reply = await phraseReply(decision, request.question, request.farmer.language || "te", request.farmer.name || "Kisan");
  return {
    reply,
    decision,
    trace,
    toolResults: { soil, weather, cropHealth, market, memory },
    notified,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// server/agent/routes.ts
var agentRouter = (0, import_express.Router)();
agentRouter.post("/run", async (req, res) => {
  try {
    const { question, farmer, recentScan } = req.body || {};
    if (!farmer || typeof farmer.farmId !== "string" || !farmer.farmId.trim()) {
      return res.status(400).json({ success: false, error: "VALIDATION_ERROR", message: "farmer.farmId is required" });
    }
    if (typeof question !== "string" || !question.trim() || question.length > 4e3) {
      return res.status(400).json({ success: false, error: "VALIDATION_ERROR", message: "question must be 1-4000 characters" });
    }
    if (isN8nConfigured()) {
      try {
        const result2 = await callN8nAgent(toN8nRequest(question.trim(), farmer, recentScan));
        return res.json({ ...result2, source: "n8n" });
      } catch (error) {
        if (error instanceof N8nUnavailableError) {
          return res.status(503).json({ success: false, error: error.code, message: error.message });
        }
        throw error;
      }
    }
    const result = await executeAgentWorkflow({ question, farmer }, { autonomous: false, recentScan });
    return res.json({ success: true, source: "local-agent", ...result });
  } catch (error) {
    console.error("Agent run error:", error);
    return res.status(500).json({ success: false, error: "INTERNAL_SERVER_ERROR", message: "Agent failed to run" });
  }
});
agentRouter.get("/notifications", async (req, res) => {
  const farmId = String(req.query.farmId || "FARM001");
  const client = getSupabase();
  if (!client) {
    return res.json({ success: true, notifications: [], note: "Supabase not configured" });
  }
  const { data, error } = await client.from("agent_notifications").select("*").eq("farm_id", farmId).order("created_at", { ascending: false }).limit(20);
  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.json({ success: true, notifications: data || [] });
});
agentRouter.get("/history", async (req, res) => {
  const farmId = String(req.query.farmId || "FARM001");
  const client = getSupabase();
  if (!client) {
    return res.json({ success: true, decisions: [], telemetry: [], note: "Supabase not configured" });
  }
  const [decisions, telemetry] = await Promise.all([
    client.from("agent_decisions").select("*").eq("farm_id", farmId).order("created_at", { ascending: false }).limit(20),
    client.from("soil_telemetry").select("*").eq("farm_id", farmId).order("recorded_at", { ascending: false }).limit(20)
  ]);
  return res.json({
    success: true,
    decisions: decisions.data || [],
    telemetry: telemetry.data || []
  });
});

// server/agent/cropRoutes.ts
var import_express2 = require("express");

// server/lib/auth.ts
var import_supabase_js2 = require("@supabase/supabase-js");
function getUserScopedClient(accessToken) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return (0, import_supabase_js2.createClient)(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}
async function getAuthContext(request) {
  const authorization = request.header("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const client = getSupabaseAnon();
  if (!accessToken || !client) return null;
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  const userScopedClient = getUserScopedClient(accessToken);
  if (!userScopedClient) return null;
  return {
    user: { id: data.user.id, email: data.user.email },
    accessToken,
    client: userScopedClient
  };
}

// server/lib/cropDiagnosis.ts
var CropDiagnosisError = class extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
};
function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim().length > 0).slice(0, 12);
}
function parseVisionResponse(rawText, selectedCrop) {
  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new CropDiagnosisError("INVALID_MODEL_RESPONSE");
  }
  if (!parsed || typeof parsed !== "object") throw new CropDiagnosisError("INVALID_MODEL_RESPONSE");
  const value = parsed;
  const confidenceValue = Number(value.confidence);
  const confidence = confidenceValue > 1 ? confidenceValue / 100 : confidenceValue;
  const problemName = typeof value.problemName === "string" ? value.problemName.trim() : "";
  const problemType = value.problemType === "Pest" || value.problemType === "Disease" ? value.problemType : "Unknown";
  const severity = value.severity === "Low" || value.severity === "Moderate" || value.severity === "High" ? value.severity : "Unknown";
  if (!problemName || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new CropDiagnosisError("INVALID_MODEL_RESPONSE");
  }
  return {
    crop: typeof value.crop === "string" && value.crop.trim() ? value.crop.trim() : selectedCrop,
    problemType,
    problemName,
    confidence,
    severity,
    symptoms: asStringArray(value.symptoms),
    possibleCauses: asStringArray(value.possibleCauses)
  };
}
async function analyzeCropImage(input) {
  const rawText = await callGemini({
    contents: {
      parts: [
        { inlineData: { data: input.imageBase64, mimeType: input.mimeType } },
        {
          text: `Analyze this crop image as a vision screening tool. The selected crop is only context, not proof. Return only JSON with this exact shape: {"crop":"","problemType":"Pest|Disease|Unknown","problemName":"","confidence":0.0,"severity":"Low|Moderate|High|Unknown","symptoms":[],"possibleCauses":[]}. Do not provide pesticide names, active ingredients, dosage, concentration, waiting periods, or treatment instructions. Use confidence between 0 and 1. Respond for language ${input.language}. If uncertain, use problemName "Unable to confidently identify" and a confidence below 0.6.`
        }
      ]
    }
  });
  if (!rawText) throw new CropDiagnosisError("DISEASE_SERVICE_UNAVAILABLE");
  return parseVisionResponse(rawText, input.crop);
}
async function findVerifiedKnowledge(analysis, language) {
  const client = getSupabase() || getSupabaseAnon();
  if (!client) return [];
  const safeCrop = analysis.crop.replace(/[%_]/g, " ").trim();
  const { data, error } = await client.from("agricultural_pest_knowledge").select("crop_name,pest_name,disease_name,problem_type,symptoms,causes,affected_stage,prevention,cultural_control,biological_control,active_ingredient,product_name,formulation,approved_use,dosage,application_method,waiting_period,safety_precautions,source_name,source_url,region,language").eq("verified", true).eq("status", "active").in("language", [language, "en"]).ilike("crop_name", `%${safeCrop}%`).limit(30);
  if (error) throw new CropDiagnosisError("SUPABASE_CONNECTION_ERROR");
  const records = data || [];
  const problem = analysis.problemName.toLowerCase();
  return records.sort((left, right) => {
    const leftText = `${left.pest_name || ""} ${left.disease_name || ""}`.toLowerCase();
    const rightText = `${right.pest_name || ""} ${right.disease_name || ""}`.toLowerCase();
    return Number(rightText.includes(problem)) - Number(leftText.includes(problem));
  });
}

// server/agent/cropRoutes.ts
var cropRouter = (0, import_express2.Router)();
var supportedMimeTypes = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
var supportedLanguages = /* @__PURE__ */ new Set(["en", "te", "hi"]);
function errorResponse(error) {
  if (error instanceof CropDiagnosisError) {
    return { status: error.code === "SUPABASE_CONNECTION_ERROR" ? 503 : 503, body: { success: false, error: error.code } };
  }
  return { status: 500, body: { success: false, error: "INTERNAL_SERVER_ERROR" } };
}
cropRouter.post("/analyze", async (req, res) => {
  try {
    const { imageBase64, mimeType, crop, language = "en", farmerId = null, farmId = null } = req.body || {};
    if (typeof imageBase64 !== "string" || !imageBase64.trim()) {
      return res.status(400).json({ success: false, error: "INVALID_IMAGE", message: "Please upload a crop image." });
    }
    if (/^https?:\/\//i.test(imageBase64.trim())) {
      return res.status(400).json({ success: false, error: "INVALID_IMAGE", message: "Remote image URLs are not accepted." });
    }
    if (typeof mimeType !== "string" || !supportedMimeTypes.has(mimeType)) {
      return res.status(400).json({ success: false, error: "INVALID_IMAGE", message: "Please upload JPG, JPEG, PNG or WebP." });
    }
    if (typeof crop !== "string" || crop.length < 1 || crop.length > 100) {
      return res.status(400).json({ success: false, error: "VALIDATION_ERROR", message: "Please select a crop." });
    }
    if (typeof language !== "string" || !supportedLanguages.has(language)) {
      return res.status(400).json({ success: false, error: "VALIDATION_ERROR", message: "Unsupported language." });
    }
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "").trim();
    if (cleanBase64.length < 50) {
      return res.status(400).json({ success: false, error: "INVALID_IMAGE", message: "The uploaded image is empty or invalid." });
    }
    if (cleanBase64.length > 20 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: "FILE_TOO_LARGE", message: "Please upload a smaller image." });
    }
    const vision = await analyzeCropImage({ imageBase64: cleanBase64, mimeType, crop, language });
    const knowledge = await findVerifiedKnowledge(vision, language);
    const requiresExpertReview = vision.confidence < 0.6 || vision.problemName === "Unable to confidently identify";
    const chemicalControl = knowledge.filter((record) => record.active_ingredient || record.product_name).map((record) => ({
      activeIngredient: record.active_ingredient,
      productName: record.product_name,
      formulation: record.formulation,
      approvedUse: record.approved_use,
      dosage: record.dosage,
      applicationMethod: record.application_method,
      waitingPeriod: record.waiting_period,
      safetyPrecautions: record.safety_precautions,
      source: record.source_name,
      sourceUrl: record.source_url
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
      safetyPrecautions: chemicalControl.length ? ["Follow the product label and use only legally approved products for this crop and target.", "Wear label-specified protective equipment. Do not exceed the label rate or mix products unless the label permits it.", "Observe the required pre-harvest interval and keep pesticides away from children, animals and food."] : ["Verified pesticide information is currently unavailable. Consult your local agricultural officer or follow the product label."],
      verifiedInformation: knowledge.length > 0,
      source: first?.source_name || "",
      sourceUrl: first?.source_url || "",
      requiresExpertReview,
      knowledgeAvailable: knowledge.length > 0
    };
    const auth = await getAuthContext(req);
    let historySaved = false;
    if (auth) {
      const { error } = await auth.client.from("crop_diagnosis_history").insert({
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
        language
      });
      historySaved = !error;
    }
    return res.json({ success: true, analysis, historySaved });
  } catch (error) {
    const response = errorResponse(error);
    return res.status(response.status).json(response.body);
  }
});
cropRouter.get("/knowledge", async (req, res) => {
  try {
    const crop = String(req.query.crop || "");
    const language = String(req.query.language || "en");
    if (!crop || !supportedLanguages.has(language)) return res.status(400).json({ success: false, error: "VALIDATION_ERROR" });
    const records = await findVerifiedKnowledge({ crop, problemType: "Unknown", problemName: String(req.query.pest || req.query.disease || ""), confidence: 0, severity: "Unknown", symptoms: [], possibleCauses: [] }, language);
    return res.json({ success: true, records });
  } catch (error) {
    const response = errorResponse(error);
    return res.status(response.status).json(response.body);
  }
});
cropRouter.get("/history", async (req, res) => {
  const auth = await getAuthContext(req);
  if (!auth) return res.status(401).json({ success: false, error: "AUTHENTICATION_REQUIRED" });
  const { data, error } = await auth.client.from("crop_diagnosis_history").select("*").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(50);
  if (error) return res.status(503).json({ success: false, error: "SUPABASE_CONNECTION_ERROR" });
  return res.json({ success: true, history: data || [] });
});

// server/agent/automation.ts
var timer = null;
function startAutonomousMonitor(defaultFarmer) {
  const intervalMs = Number(process.env.AGENT_AUTONOMOUS_INTERVAL_MS) || 5 * 60 * 1e3;
  if (timer) clearInterval(timer);
  const tick = async () => {
    try {
      const result = await executeAgentWorkflow({ farmer: defaultFarmer }, { autonomous: true });
      console.log(
        `[agent-automation] farm=${defaultFarmer.farmId} action=${result.decision.actionType} notified=${result.notified}`
      );
    } catch (err) {
      console.error("[agent-automation] tick failed:", err);
    }
  };
  setTimeout(tick, 15 * 1e3);
  timer = setInterval(tick, intervalMs);
  console.log(`[agent-automation] started, checking every ${Math.round(intervalMs / 1e3)}s`);
}

// server.ts
import_dotenv.default.config();
var app = (0, import_express3.default)();
var PORT = Number(process.env.PORT) || 3e3;
app.use(import_express3.default.json({ limit: "35mb" }));
app.use(import_express3.default.urlencoded({ extended: true, limit: "35mb" }));
app.use("/api/agent", agentRouter);
app.use("/api/crop", cropRouter);
app.get("/api/health", (_req, res) => {
  res.json({
    status: "healthy",
    platform: "AgroVision AI",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasSupabase: isSupabaseConfigured(),
    time: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/health/supabase", async (_req, res) => {
  const client = getSupabase();
  if (!client) {
    return res.status(503).json({
      success: false,
      service: "supabase",
      status: "not_configured",
      error: "SUPABASE_CONNECTION_ERROR"
    });
  }
  const { error } = await client.from("soil_telemetry").select("id").limit(1);
  if (error) {
    return res.status(503).json({
      success: false,
      service: "supabase",
      status: "unavailable",
      error: "SUPABASE_CONNECTION_ERROR"
    });
  }
  return res.json({ success: true, service: "supabase", status: "connected" });
});
app.post("/api/ai/crop-doctor", async (req, res) => {
  return res.status(410).json({
    success: false,
    error: "DEPRECATED_ENDPOINT",
    message: "Use POST /api/crop/analyze for verified crop diagnosis."
  });
  try {
    const { imageBase64, mimeType = "image/jpeg", crop = "Paddy (Rice)" } = req.body;
    if (typeof crop !== "string" || crop.length > 100) {
      return res.status(400).json({ success: false, error: "VALIDATION_ERROR", message: "crop must be a short string" });
    }
    if (typeof imageBase64 !== "string" || !imageBase64.trim()) {
      return res.status(400).json({ success: false, error: "INVALID_IMAGE", message: "An image upload is required" });
    }
    if (/^https?:\/\//i.test(imageBase64.trim())) {
      return res.status(400).json({
        success: false,
        error: "INVALID_IMAGE",
        message: "Remote image URLs are not accepted; upload the image directly."
      });
    }
    const supportedMimeTypes2 = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
    if (typeof mimeType !== "string" || !supportedMimeTypes2.has(mimeType)) {
      return res.status(400).json({ success: false, error: "INVALID_IMAGE", message: "Only JPEG, PNG, and WebP images are supported" });
    }
    const ai = getGenAI();
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z0-9.+-]+;base64,/, "").trim();
    const effectiveMime = mimeType;
    if (cleanBase64.length > 15 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: "FILE_TOO_LARGE", message: "Image must be smaller than 15 MB" });
    }
    if (cleanBase64 && cleanBase64.length > 50 && !cleanBase64.startsWith("http")) {
      const prompt = `You are a certified senior agricultural pathologist and crop doctor in India specializing in Indian farming conditions.
Analyze this leaf image of crop "${crop}".
Perform disease diagnosis and return ONLY a valid JSON object matching this schema (do NOT use markdown backticks, return pure raw JSON):
{
  "crop": "${crop}",
  "disease": "Specific disease name or 'Healthy / No Disease Detected'",
  "confidence": 92,
  "severity": "Low" | "Medium" | "High" | "None",
  "symptoms": ["Detailed visible symptom 1", "Detailed visible symptom 2"],
  "organicTreatment": "Practical organic and biological treatment (e.g., neem oil, Trichoderma, cow urine spray)",
  "chemicalTreatment": "Approved CIBRC chemical fungicide/insecticide with exact dosage per litre water",
  "prevention": "Cultural and preventive farming practices (irrigation, spacing, resistant varieties)",
  "simpleExplanation": "Simple 2-3 sentence explanation easily understood by an Indian farmer in simple vocabulary",
  "disclaimer": "This is an AI-assisted diagnostic screening based on computer vision. Please confirm with your local Mandal Agriculture Officer or Krishi Vigyan Kendra (KVK) before applying hazardous chemicals."
}`;
      const rawText = await callGemini({
        contents: {
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: effectiveMime || "image/jpeg"
              }
            },
            { text: prompt }
          ]
        }
      });
      if (rawText) {
        try {
          const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(cleanJson);
          return res.json({
            success: true,
            source: "gemini-vision",
            result: {
              id: "scan-" + Date.now(),
              timestamp: (/* @__PURE__ */ new Date()).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
              ...parsed
            }
          });
        } catch {
        }
      }
    }
    return res.status(503).json({
      success: false,
      error: "DISEASE_SERVICE_UNAVAILABLE",
      message: "No configured disease detection service returned a result."
    });
    const cropLower = (crop || "").toLowerCase();
    let sampleDiagnosis;
    if (cropLower.includes("paddy") || cropLower.includes("rice")) {
      sampleDiagnosis = {
        crop: crop || "Paddy (Rice)",
        disease: "Paddy Leaf Blast (Magnaporthe oryzae)",
        confidence: 91,
        severity: "Medium",
        symptoms: [
          "Spindle-shaped or eye-shaped lesions with ash-grey center and brownish borders",
          "Yellowing of leaves around lesions",
          "Premature drying of leaf blades during high humidity"
        ],
        organicTreatment: "Spray Pseudomonas fluorescens (bio-agent) @ 10g/litre of water. Spray 5% Neem seed kernel extract (NSKE) or diluted cow urine (10%) with sour buttermilk.",
        chemicalTreatment: "Spray Tricyclazole 75% WP @ 0.6g/L or Isoprothiolane 40% EC @ 1.5ml/L under local agriculture officer supervision.",
        prevention: "Avoid excessive application of nitrogenous fertilizer (split urea into 3 split doses). Maintain proper field drainage and avoid continuous stagnation.",
        simpleExplanation: "\u0C35\u0C30\u0C3F \u0C06\u0C15\u0C41\u0C32\u0C32\u0C4B \u0C2C\u0C42\u0C1C\u0C41 \u0C24\u0C46\u0C17\u0C41\u0C32\u0C41 (\u0C2C\u0C4D\u0C32\u0C3E\u0C38\u0C4D\u0C1F\u0C4D) \u0C32\u0C15\u0C4D\u0C37\u0C23\u0C3E\u0C32\u0C41 \u0C17\u0C2E\u0C28\u0C3F\u0C02\u0C1A\u0C2C\u0C21\u0C4D\u0C21\u0C3E\u0C2F\u0C3F. \u0C05\u0C27\u0C3F\u0C15 \u0C2F\u0C42\u0C30\u0C3F\u0C2F\u0C3E \u0C35\u0C3E\u0C21\u0C15\u0C3E\u0C28\u0C4D\u0C28\u0C3F \u0C24\u0C17\u0C4D\u0C17\u0C3F\u0C02\u0C1A\u0C3F \u0C1C\u0C40\u0C35 \u0C28\u0C3F\u0C2F\u0C02\u0C24\u0C4D\u0C30\u0C23 \u0C2E\u0C02\u0C26\u0C41\u0C32\u0C41 \u0C2A\u0C3F\u0C1A\u0C3F\u0C15\u0C3E\u0C30\u0C40 \u0C1A\u0C47\u0C2F\u0C02\u0C21\u0C3F. / Early leaf blast detected on paddy leaf. Avoid excessive urea and spray recommended bio-fungicide in morning hours.",
        disclaimer: "This is an AI-assisted diagnostic screening based on computer vision. Please confirm with your local Mandal Agriculture Officer or Krishi Vigyan Kendra (KVK) before applying hazardous chemicals."
      };
    } else if (cropLower.includes("tomato")) {
      sampleDiagnosis = {
        crop: crop || "Tomato",
        disease: "Tomato Early Blight (Alternaria solani)",
        confidence: 89,
        severity: "Low",
        symptoms: [
          "Concentric dark rings (target board pattern) on lower foliage",
          "Yellow chlorotic halo surrounding brown circular spots",
          "Lower leaf defoliation"
        ],
        organicTreatment: "Foliar spray of Trichoderma harzianum @ 5g/L or Copper oxychloride 50% WP @ 2.5g/L.",
        chemicalTreatment: "Mancozeb 75% WP @ 2g/L or Chlorothalonil 75% WP @ 2g/L water at 10-day intervals.",
        prevention: "Water at the base using drip irrigation to keep foliage dry. Remove and destroy lower infected leaves.",
        simpleExplanation: "\u0C1F\u0C2E\u0C4B\u0C1F\u0C3E \u0C1A\u0C46\u0C1F\u0C4D\u0C32 \u0C15\u0C4D\u0C30\u0C3F\u0C02\u0C26\u0C3F \u0C06\u0C15\u0C41\u0C32\u0C32\u0C4B \u0C2E\u0C1A\u0C4D\u0C1A\u0C32 \u0C24\u0C46\u0C17\u0C41\u0C32\u0C41 \u0C2A\u0C4D\u0C30\u0C3E\u0C30\u0C02\u0C2D\u0C2E\u0C48\u0C02\u0C26\u0C3F. \u0C21\u0C4D\u0C30\u0C3F\u0C2A\u0C4D \u0C26\u0C4D\u0C35\u0C3E\u0C30\u0C3E \u0C28\u0C40\u0C30\u0C02\u0C26\u0C3F\u0C02\u0C1A\u0C02\u0C21\u0C3F \u0C2E\u0C30\u0C3F\u0C2F\u0C41 \u0C06\u0C15\u0C41\u0C32\u0C2A\u0C48 \u0C28\u0C40\u0C30\u0C41 \u0C2A\u0C21\u0C15\u0C41\u0C02\u0C21\u0C3E \u0C1A\u0C42\u0C21\u0C02\u0C21\u0C3F. / Early blight detected on lower tomato foliage. Prune bottom leaves and water via drip.",
        disclaimer: "Always verify diagnosis with certified agricultural extension officer before chemical spray."
      };
    } else if (cropLower.includes("cotton")) {
      sampleDiagnosis = {
        crop: crop || "Cotton",
        disease: "Cotton Leaf Curl Virus (CLCuV)",
        confidence: 87,
        severity: "Medium",
        symptoms: [
          "Upward curling of leaf margins with thickened veins",
          "Enation (leaf-like outgrowths) on underside of leaf veins",
          "Stunted plant growth and reduced boll formation"
        ],
        organicTreatment: "Control whitefly vectors using yellow sticky traps (10 traps/acre) and 5% Neem oil spray (5ml/L).",
        chemicalTreatment: "Vector management: Diafenthiuron 50% WP @ 1.2g/L or Dinotefuran 20% SG @ 0.3g/L of water.",
        prevention: "Eradicate weed hosts around field borders. Plant resistant Bt hybrid varieties.",
        simpleExplanation: "\u0C2A\u0C24\u0C4D\u0C24\u0C3F \u0C06\u0C15\u0C41\u0C32\u0C32\u0C4B \u0C2E\u0C41\u0C21\u0C41\u0C24 \u0C35\u0C48\u0C30\u0C38\u0C4D \u0C32\u0C15\u0C4D\u0C37\u0C23\u0C3E\u0C32\u0C41 \u0C2E\u0C30\u0C3F\u0C2F\u0C41 \u0C24\u0C46\u0C32\u0C4D\u0C32\u0C26\u0C4B\u0C2E \u0C09\u0C28\u0C3F\u0C15\u0C3F \u0C15\u0C28\u0C3F\u0C2A\u0C3F\u0C38\u0C4D\u0C24\u0C4B\u0C02\u0C26\u0C3F. \u0C2A\u0C38\u0C41\u0C2A\u0C41 \u0C30\u0C02\u0C17\u0C41 \u0C1C\u0C3F\u0C17\u0C41\u0C30\u0C41 \u0C05\u0C1F\u0C4D\u0C1F\u0C32\u0C41 \u0C0F\u0C30\u0C4D\u0C2A\u0C3E\u0C1F\u0C41 \u0C1A\u0C47\u0C38\u0C3F \u0C35\u0C47\u0C2A \u0C28\u0C42\u0C28\u0C46 \u0C2A\u0C3F\u0C1A\u0C3F\u0C15\u0C3E\u0C30\u0C40 \u0C1A\u0C47\u0C2F\u0C02\u0C21\u0C3F. / Leaf curl virus symptoms seen on cotton. Manage whiteflies using yellow sticky traps and neem oil.",
        disclaimer: "Consult your local KVK or agricultural scientist before applying scheduled insecticides."
      };
    } else if (cropLower.includes("chilli") || cropLower.includes("pepper")) {
      sampleDiagnosis = {
        crop: crop || "Chilli",
        disease: "Chilli Anthracnose & Dieback (Colletotrichum capsici)",
        confidence: 88,
        severity: "Medium",
        symptoms: [
          "Circular sunken brown necrotic spots with concentric rings on fruits and leaves",
          "Die-back of twigs from top downwards with black spore pustules",
          "Premature fruit drop and fruit bleaching"
        ],
        organicTreatment: "Seed treatment with Trichoderma viride @ 4g/kg seed. Foliar spray of Pseudomonas fluorescens @ 5g/L.",
        chemicalTreatment: "Spray Azoxystrobin 23% SC @ 1ml/L or Difenoconazole 25% EC @ 0.5ml/L at 15-day intervals.",
        prevention: "Use disease-free certified seeds. Avoid overhead sprinkler irrigation during flowering and fruit setting.",
        simpleExplanation: "\u0C2E\u0C3F\u0C30\u0C2A \u0C2A\u0C02\u0C1F\u0C32\u0C4B \u0C15\u0C4A\u0C2E\u0C4D\u0C2E \u0C0E\u0C02\u0C21\u0C41 \u0C24\u0C46\u0C17\u0C41\u0C32\u0C41 (\u0C06\u0C02\u0C25\u0C4D\u0C30\u0C3E\u0C15\u0C4D\u0C28\u0C4B\u0C38\u0C4D) \u0C32\u0C15\u0C4D\u0C37\u0C23\u0C3E\u0C32\u0C41 \u0C15\u0C28\u0C3F\u0C2A\u0C3F\u0C02\u0C1A\u0C3E\u0C2F\u0C3F. \u0C2A\u0C48 \u0C28\u0C41\u0C02\u0C21\u0C3F \u0C0E\u0C02\u0C21\u0C3F\u0C2A\u0C4B\u0C24\u0C41\u0C28\u0C4D\u0C28 \u0C15\u0C4A\u0C2E\u0C4D\u0C2E\u0C32\u0C28\u0C41 \u0C15\u0C24\u0C4D\u0C24\u0C3F\u0C30\u0C3F\u0C02\u0C1A\u0C3F \u0C2C\u0C2F\u0C4B \u0C2B\u0C02\u0C17\u0C3F\u0C38\u0C48\u0C21\u0C4D \u0C2A\u0C3F\u0C1A\u0C3F\u0C15\u0C3E\u0C30\u0C40 \u0C1A\u0C47\u0C2F\u0C02\u0C21\u0C3F. / Anthracnose dieback detected on chilli. Prune affected twigs and spray recommended fungicide.",
        disclaimer: "Consult local Mandal Agriculture Officer for exact seasonal spray schedule."
      };
    } else if (cropLower.includes("wheat")) {
      sampleDiagnosis = {
        crop: crop || "Wheat",
        disease: "Yellow Stripe Rust (Puccinia striiformis)",
        confidence: 90,
        severity: "Medium",
        symptoms: [
          "Yellow pustules arranged in linear stripes/stripes along leaf veins",
          "Powdery yellow spores rubbing off on fingers upon touching",
          "Early chlorosis and leaf drying under cool humid conditions"
        ],
        organicTreatment: "Dust sulfur or spray bio-control Bacillus subtilis formulations @ 5g/L.",
        chemicalTreatment: "Spray Propiconazole 25% EC (Tilt) @ 1ml/L of water at the first appearance of pustules.",
        prevention: "Cultivate resistant varieties (e.g. HD-2967, DBW-187). Avoid excessive early nitrogen application.",
        simpleExplanation: "\u0C17\u0C4B\u0C27\u0C41\u0C2E \u0C2A\u0C02\u0C1F\u0C32\u0C4B \u0C2A\u0C38\u0C41\u0C2A\u0C41 \u0C15\u0C41\u0C02\u0C15\u0C41\u0C2E \u0C24\u0C46\u0C17\u0C41\u0C32\u0C41 (\u0C0E\u0C32\u0C4D\u0C32\u0C4B \u0C30\u0C38\u0C4D\u0C1F\u0C4D) \u0C32\u0C15\u0C4D\u0C37\u0C23\u0C3E\u0C32\u0C41 \u0C17\u0C2E\u0C28\u0C3F\u0C02\u0C1A\u0C2C\u0C21\u0C4D\u0C21\u0C3E\u0C2F\u0C3F. / Yellow stripe rust observed on wheat foliage. Apply protective Propiconazole spray as per ICAR guidelines.",
        disclaimer: "Immediate reporting to district Agriculture Officer is advised for rust surveillance."
      };
    } else {
      sampleDiagnosis = {
        crop: crop || "Field Crop",
        disease: "Foliar Leaf Spot & Nutrient Chlorosis",
        confidence: 86,
        severity: "Low",
        symptoms: [
          "Irregular brown spotting on outer leaf margins",
          "Interveinal chlorosis (light yellowing between leaf veins)"
        ],
        organicTreatment: "Spray Jeevamrutham / Panchagavya @ 3% solution or spray 1% multi-micronutrient mixture.",
        chemicalTreatment: "Apply Zinc Sulphate 0.5% + Urea 1% foliar spray to correct trace micronutrient deficiency.",
        prevention: "Conduct comprehensive soil test and ensure balanced NPK with organic farmyard manure.",
        simpleExplanation: "\u0C06\u0C15\u0C41\u0C32\u0C32\u0C4B \u0C38\u0C42\u0C15\u0C4D\u0C37\u0C4D\u0C2E \u0C2A\u0C4B\u0C37\u0C15\u0C3E\u0C32 \u0C32\u0C4B\u0C2A\u0C02 \u0C2E\u0C30\u0C3F\u0C2F\u0C41 \u0C38\u0C4D\u0C35\u0C32\u0C4D\u0C2A \u0C06\u0C15\u0C41\u0C2E\u0C1A\u0C4D\u0C1A \u0C15\u0C28\u0C3F\u0C2A\u0C3F\u0C38\u0C4D\u0C24\u0C41\u0C28\u0C4D\u0C28\u0C3E\u0C2F\u0C3F. \u0C2A\u0C02\u0C1A\u0C17\u0C35\u0C4D\u0C2F \u0C32\u0C47\u0C26\u0C3E \u0C1C\u0C3F\u0C02\u0C15\u0C4D \u0C2E\u0C3F\u0C36\u0C4D\u0C30\u0C2E\u0C3E\u0C28\u0C4D\u0C28\u0C3F \u0C2A\u0C3F\u0C1A\u0C3F\u0C15\u0C3E\u0C30\u0C40 \u0C1A\u0C47\u0C2F\u0C02\u0C21\u0C3F. / Minor leaf spot and micronutrient deficiency observed. Apply organic foliar spray.",
        disclaimer: "Consult your local agricultural extension service for on-site validation."
      };
    }
    return res.json({
      success: true,
      source: "icar-expert-engine",
      result: {
        id: "scan-" + Date.now(),
        timestamp: (/* @__PURE__ */ new Date()).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
        ...sampleDiagnosis
      }
    });
  } catch (error) {
    console.error("Crop Doctor Error:", error);
    return res.status(503).json({
      success: false,
      error: "DISEASE_SERVICE_UNAVAILABLE",
      message: "Disease detection failed before returning a prediction."
    });
  }
});
app.post("/api/ai/assistant", async (req, res) => {
  try {
    const { message, language = "te", farmerContext } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }
    const languageNames = {
      te: "Telugu (\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41)",
      hi: "Hindi (\u0939\u093F\u0928\u094D\u0926\u0940)",
      en: "English",
      ta: "Tamil (\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD)",
      kn: "Kannada (\u0C95\u0CA8\u0CCD\u0CA8\u0CA1)",
      mr: "Marathi (\u092E\u0930\u093E\u0920\u0940)",
      bn: "Bengali (\u09AC\u09BE\u0982\u09B2\u09BE)",
      pa: "Punjabi (\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40)",
      gu: "Gujarati (\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0)"
    };
    const targetLang = languageNames[language] || "Telugu";
    const systemInstruction = `You are "AgroVision Assistant" (\u0C05\u0C17\u0C4D\u0C30\u0C4B\u0C35\u0C3F\u0C1C\u0C28\u0C4D / \u090F\u0917\u094D\u0930\u094B\u0935\u093F\u091C\u0928), an empathetic, deeply knowledgeable AI agricultural advisor dedicated to Indian farmers.
Target language for your response: ${targetLang}.
Guidelines:
1. Always reply primarily in the farmer's selected language (${targetLang}).
2. Use simple, friendly, respectful vocabulary without complicated scientific jargon.
3. Address the farmer respectfully (e.g. "\u0C30\u0C48\u0C24\u0C41 \u0C2E\u0C3F\u0C24\u0C4D\u0C30\u0C2E\u0C3E" in Telugu, "\u0915\u093F\u0938\u093E\u0928 \u092D\u093E\u0908" in Hindi).
4. Provide practical, low-cost, actionable Indian farming advice (organic options first, safe chemical dosage if needed, irrigation tips, government schemes like PM-KISAN, APMC mandi rates, weather tips).
5. If the farmer asks about severe diseases or unknown chemical mixtures, advise cross-checking with the local Mandal Agriculture Officer or Krishi Vigyan Kendra (KVK).
6. Keep answers concise, helpful, and organized with clear bullet points.
Farmer Profile Context:
- Farmer Name: ${farmerContext?.name || "Kisan"}
- Crops: ${farmerContext?.primaryCrop || "Paddy (Rice)"}, ${farmerContext?.secondaryCrop || "Tomato"}
- Location: ${farmerContext?.district || "Guntur"}, ${farmerContext?.state || "Andhra Pradesh"}
- Soil: ${farmerContext?.soilType || "Black Cotton Soil"}
- Current Soil Moisture: ${latestSoilTelemetry.moisturePercent}% (${latestSoilTelemetry.status})`;
    const replyText = await callGemini({
      contents: message,
      config: {
        systemInstruction,
        temperature: 0.7
      }
    });
    if (replyText && replyText.trim()) {
      return res.json({
        success: true,
        source: "gemini",
        reply: replyText.trim(),
        language,
        timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      });
    }
    let fallbackReply = "";
    const m = (message || "").toLowerCase();
    if (language === "te") {
      if (m.includes("\u0C35\u0C30\u0C3F") || m.includes("paddy") || m.includes("\u0C0E\u0C30\u0C41\u0C35\u0C41") || m.includes("fertilizer") || m.includes("\u0C16\u0C3E\u0C24\u0C3E") || m.includes("\u0C2F\u0C42\u0C30\u0C3F\u0C2F\u0C3E")) {
        fallbackReply = `\u0C28\u0C2E\u0C38\u0C4D\u0C15\u0C3E\u0C30\u0C02 \u0C30\u0C48\u0C24\u0C41 \u0C2E\u0C3F\u0C24\u0C4D\u0C30\u0C2E\u0C3E \u{1F33E}

\u0C2E\u0C40 \u0C35\u0C30\u0C3F \u0C2A\u0C02\u0C1F\u0C15\u0C41 \u0C38\u0C3F\u0C2B\u0C3E\u0C30\u0C4D\u0C38\u0C41 \u0C1A\u0C47\u0C38\u0C3F\u0C28 \u0C0E\u0C30\u0C41\u0C35\u0C41\u0C32 \u0C2F\u0C3E\u0C1C\u0C2E\u0C3E\u0C28\u0C4D\u0C2F\u0C02:
1. **\u0C26\u0C41\u0C15\u0C4D\u0C15\u0C3F\u0C32\u0C4B (\u0C06\u0C16\u0C30\u0C3F \u0C26\u0C41\u0C15\u0C4D\u0C15\u0C3F):** \u0C0E\u0C15\u0C30\u0C3E\u0C28\u0C3F\u0C15\u0C3F 50 \u0C15\u0C47\u0C1C\u0C40\u0C32 \u0C21\u0C3F.\u0C0E.\u0C2A\u0C3F (DAP), 15 \u0C15\u0C47\u0C1C\u0C40\u0C32 \u0C2A\u0C4A\u0C1F\u0C3E\u0C37\u0C4D (MOP) \u0C2E\u0C30\u0C3F\u0C2F\u0C41 10 \u0C15\u0C47\u0C1C\u0C40\u0C32 \u0C1C\u0C3F\u0C02\u0C15\u0C4D \u0C38\u0C32\u0C4D\u0C2B\u0C47\u0C1F\u0C4D \u0C35\u0C47\u0C2F\u0C02\u0C21\u0C3F.
2. **\u0C2E\u0C4A\u0C26\u0C1F\u0C3F \u0C26\u0C2B\u0C3E \u0C2F\u0C42\u0C30\u0C3F\u0C2F\u0C3E:** \u0C28\u0C3E\u0C1F\u0C3F\u0C28 20-25 \u0C30\u0C4B\u0C1C\u0C41\u0C32\u0C15\u0C41 (\u0C2A\u0C3F\u0C32\u0C15\u0C32\u0C41 \u0C2A\u0C46\u0C1F\u0C4D\u0C1F\u0C47 \u0C26\u0C36\u0C32\u0C4B) \u0C0E\u0C15\u0C30\u0C3E\u0C28\u0C3F\u0C15\u0C3F 25-30 \u0C15\u0C47\u0C1C\u0C40\u0C32 \u0C35\u0C47\u0C2A \u0C2A\u0C42\u0C24 \u0C2A\u0C42\u0C38\u0C3F\u0C28 \u0C2F\u0C42\u0C30\u0C3F\u0C2F\u0C3E \u0C35\u0C47\u0C2F\u0C02\u0C21\u0C3F.
3. **\u0C30\u0C46\u0C02\u0C21\u0C35 \u0C26\u0C2B\u0C3E:** \u0C28\u0C3E\u0C1F\u0C3F\u0C28 40-45 \u0C30\u0C4B\u0C1C\u0C41\u0C32\u0C15\u0C41 (\u0C1A\u0C3F\u0C30\u0C41\u0C2A\u0C4A\u0C1F\u0C4D\u0C1F \u0C26\u0C36\u0C32\u0C4B) \u0C2E\u0C30\u0C4B 25 \u0C15\u0C47\u0C1C\u0C40\u0C32 \u0C2F\u0C42\u0C30\u0C3F\u0C2F\u0C3E + 10 \u0C15\u0C47\u0C1C\u0C40\u0C32 \u0C2A\u0C4A\u0C1F\u0C3E\u0C37\u0C4D \u0C35\u0C47\u0C2F\u0C02\u0C21\u0C3F.
4. **\u0C2E\u0C41\u0C16\u0C4D\u0C2F \u0C38\u0C42\u0C1A\u0C28:** \u0C2F\u0C42\u0C30\u0C3F\u0C2F\u0C3E\u0C28\u0C41 \u0C12\u0C15\u0C47\u0C38\u0C3E\u0C30\u0C3F \u0C35\u0C47\u0C2F\u0C15\u0C41\u0C02\u0C21\u0C3E 3 \u0C26\u0C2B\u0C3E\u0C32\u0C41\u0C17\u0C3E \u0C35\u0C47\u0C38\u0C4D\u0C24\u0C47 \u0C2E\u0C4A\u0C15\u0C4D\u0C15\u0C32\u0C15\u0C41 \u0C2C\u0C3E\u0C17\u0C3E \u0C05\u0C02\u0C26\u0C41\u0C24\u0C41\u0C02\u0C26\u0C3F \u0C2E\u0C30\u0C3F\u0C2F\u0C41 \u0C16\u0C30\u0C4D\u0C1A\u0C41 \u0C24\u0C17\u0C4D\u0C17\u0C41\u0C24\u0C41\u0C02\u0C26\u0C3F.

\u0C0F\u0C26\u0C48\u0C28\u0C3E \u0C38\u0C02\u0C26\u0C47\u0C39\u0C02 \u0C09\u0C02\u0C1F\u0C47 \u0C2E\u0C40 \u0C38\u0C4D\u0C25\u0C3E\u0C28\u0C3F\u0C15 \u0C35\u0C4D\u0C2F\u0C35\u0C38\u0C3E\u0C2F \u0C05\u0C27\u0C3F\u0C15\u0C3E\u0C30\u0C3F\u0C28\u0C3F \u0C32\u0C47\u0C26\u0C3E \u0C15\u0C3F\u0C38\u0C3E\u0C28\u0C4D \u0C15\u0C3E\u0C32\u0C4D \u0C38\u0C46\u0C02\u0C1F\u0C30\u0C4D (1800-180-1551) \u0C28\u0C41 \u0C38\u0C02\u0C2A\u0C4D\u0C30\u0C26\u0C3F\u0C02\u0C1A\u0C02\u0C21\u0C3F.`;
      } else if (m.includes("\u0C28\u0C40\u0C30\u0C41") || m.includes("irrigation") || m.includes("\u0C24\u0C47\u0C2E") || m.includes("moisture")) {
        fallbackReply = `\u0C30\u0C48\u0C24\u0C41 \u0C2E\u0C3F\u0C24\u0C4D\u0C30\u0C2E\u0C3E, \u0C2E\u0C40 \u0C2A\u0C4A\u0C32\u0C02\u0C32\u0C4B \u0C24\u0C3E\u0C1C\u0C3E \u0C28\u0C47\u0C32 \u0C24\u0C47\u0C2E **${latestSoilTelemetry.moisturePercent}%** \u0C17\u0C3E \u0C28\u0C2E\u0C4B\u0C26\u0C48\u0C02\u0C26\u0C3F.

- **\u0C2A\u0C4D\u0C30\u0C38\u0C4D\u0C24\u0C41\u0C24 \u0C2A\u0C30\u0C3F\u0C38\u0C4D\u0C25\u0C3F\u0C24\u0C3F:** ${latestSoilTelemetry.status} (${latestSoilTelemetry.moisturePercent < 30 ? "\u0C28\u0C40\u0C1F\u0C3F \u0C24\u0C21\u0C41\u0C32\u0C41 \u0C05\u0C35\u0C38\u0C30\u0C02" : "\u0C24\u0C47\u0C2E \u0C38\u0C30\u0C3F\u0C2A\u0C21\u0C3E \u0C09\u0C02\u0C26\u0C3F"})
- **\u0C38\u0C3F\u0C2B\u0C3E\u0C30\u0C4D\u0C38\u0C41:** \u0C38\u0C3E\u0C2F\u0C02\u0C24\u0C4D\u0C30\u0C02 \u0C35\u0C47\u0C33\u0C32\u0C4D\u0C32\u0C4B \u0C21\u0C4D\u0C30\u0C3F\u0C2A\u0C4D \u0C32\u0C47\u0C26\u0C3E \u0C15\u0C3E\u0C32\u0C4D\u0C35 \u0C26\u0C4D\u0C35\u0C3E\u0C30\u0C3E \u0C28\u0C40\u0C30\u0C02\u0C26\u0C3F\u0C38\u0C4D\u0C24\u0C47 \u0C06\u0C35\u0C3F\u0C30\u0C3F \u0C15\u0C3E\u0C15\u0C41\u0C02\u0C21\u0C3E \u0C2E\u0C4A\u0C15\u0C4D\u0C15\u0C32 \u0C35\u0C47\u0C33\u0C4D\u0C32\u0C15\u0C41 \u0C38\u0C2E\u0C30\u0C4D\u0C25\u0C35\u0C02\u0C24\u0C02\u0C17\u0C3E \u0C05\u0C02\u0C26\u0C41\u0C24\u0C41\u0C02\u0C26\u0C3F. \u0C30\u0C3E\u0C2C\u0C4B\u0C2F\u0C47 48 \u0C17\u0C02\u0C1F\u0C32\u0C4D\u0C32\u0C4B \u0C1A\u0C3F\u0C30\u0C41\u0C1C\u0C32\u0C4D\u0C32\u0C41\u0C32\u0C41 \u0C15\u0C41\u0C30\u0C3F\u0C38\u0C47 \u0C05\u0C35\u0C15\u0C3E\u0C36\u0C02 \u0C09\u0C02\u0C26\u0C3F, \u0C15\u0C3E\u0C2C\u0C1F\u0C4D\u0C1F\u0C3F \u0C05\u0C24\u0C3F\u0C17\u0C3E \u0C28\u0C40\u0C30\u0C41 \u0C28\u0C3F\u0C32\u0C35\u0C15\u0C41\u0C02\u0C21\u0C3E \u0C1A\u0C42\u0C21\u0C02\u0C21\u0C3F.`;
      } else if (m.includes("\u0C27\u0C30") || m.includes("\u0C2E\u0C3E\u0C30\u0C4D\u0C15\u0C46\u0C1F\u0C4D") || m.includes("\u0C30\u0C47\u0C1F\u0C41") || m.includes("\u0C1F\u0C2E\u0C4B\u0C1F\u0C3E") || m.includes("\u0C2E\u0C3F\u0C30\u0C4D\u0C1A\u0C3F")) {
        fallbackReply = `\u0C30\u0C48\u0C24\u0C41 \u0C2E\u0C3F\u0C24\u0C4D\u0C30\u0C2E\u0C3E \u{1F4C8}
\u0C08 \u0C30\u0C4B\u0C1C\u0C41 \u0C2A\u0C4D\u0C30\u0C27\u0C3E\u0C28 \u0C2E\u0C3E\u0C30\u0C4D\u0C15\u0C46\u0C1F\u0C4D (APMC \u0C2E\u0C02\u0C21\u0C3F) \u0C24\u0C3E\u0C1C\u0C3E \u0C27\u0C30\u0C32 \u0C38\u0C30\u0C33\u0C3F:
- **\u0C35\u0C30\u0C3F (\u0C38\u0C4B\u0C28\u0C3E \u0C2E\u0C38\u0C42\u0C30\u0C3F):** \u0C15\u0C4D\u0C35\u0C3F\u0C02\u0C1F\u0C3E\u0C32\u0C4D\u200C\u0C15\u0C41 \u20B92,350 - \u20B92,550
- **\u0C2E\u0C3F\u0C30\u0C2A (\u0C24\u0C47\u0C1C\u0C3E \u0C15\u0C3E\u0C30\u0C02 \u0C30\u0C15\u0C02 - \u0C17\u0C41\u0C02\u0C1F\u0C42\u0C30\u0C41):** \u0C15\u0C4D\u0C35\u0C3F\u0C02\u0C1F\u0C3E\u0C32\u0C4D\u200C\u0C15\u0C41 \u20B918,400 - \u20B921,200 (+\u20B9400 \u0C2A\u0C46\u0C30\u0C41\u0C17\u0C41\u0C26\u0C32)
- **\u0C1F\u0C2E\u0C4B\u0C1F\u0C3E (\u0C2E\u0C26\u0C28\u0C2A\u0C32\u0C4D\u0C32\u0C46):** \u0C15\u0C4D\u0C30\u0C47\u0C1F\u0C4D (25 \u0C15\u0C3F\u0C32\u0C4B\u0C32\u0C41) \u20B9580 - \u20B9720
- **\u0C2A\u0C24\u0C4D\u0C24\u0C3F (\u0C2E\u0C27\u0C4D\u0C2F\u0C38\u0C4D\u0C25 \u0C2A\u0C3F\u0C02\u0C1C):** \u0C15\u0C4D\u0C35\u0C3F\u0C02\u0C1F\u0C3E\u0C32\u0C4D\u200C\u0C15\u0C41 \u20B97,100 - \u20B97,450
\u0C15\u0C3F\u0C38\u0C3E\u0C28\u0C4D \u0C2E\u0C3F\u0C24\u0C4D\u0C30 "\u0C2E\u0C3E\u0C30\u0C4D\u0C15\u0C46\u0C1F\u0C4D \u0C2A\u0C4D\u0C32\u0C47\u0C38\u0C4D" \u0C26\u0C4D\u0C35\u0C3E\u0C30\u0C3E \u0C26\u0C33\u0C3E\u0C30\u0C41\u0C32\u0C41 \u0C32\u0C47\u0C15\u0C41\u0C02\u0C21\u0C3E \u0C28\u0C47\u0C30\u0C41\u0C17\u0C3E \u0C15\u0C4A\u0C28\u0C41\u0C17\u0C4B\u0C32\u0C41\u0C26\u0C3E\u0C30\u0C41\u0C32\u0C24\u0C4B \u0C2E\u0C3E\u0C1F\u0C4D\u0C32\u0C3E\u0C21\u0C3F \u0C2E\u0C02\u0C1A\u0C3F \u0C27\u0C30 \u0C2A\u0C4A\u0C02\u0C26\u0C35\u0C1A\u0C4D\u0C1A\u0C41.`;
      } else if (m.includes("\u0C2A\u0C25\u0C15\u0C02") || m.includes("\u0C38\u0C4D\u0C15\u0C40\u0C2E\u0C4D") || m.includes("\u0C15\u0C3F\u0C38\u0C3E\u0C28\u0C4D") || m.includes("\u0C38\u0C2C\u0C4D\u0C38\u0C3F\u0C21\u0C40") || m.includes("\u0C21\u0C2C\u0C4D\u0C2C\u0C41")) {
        fallbackReply = `\u0C30\u0C48\u0C24\u0C41 \u0C2E\u0C3F\u0C24\u0C4D\u0C30\u0C2E\u0C3E \u{1F3DB}\uFE0F
\u0C2A\u0C4D\u0C30\u0C38\u0C4D\u0C24\u0C41\u0C24\u0C02 \u0C05\u0C02\u0C26\u0C41\u0C2C\u0C3E\u0C1F\u0C41\u0C32\u0C4B \u0C09\u0C28\u0C4D\u0C28 \u0C2E\u0C41\u0C16\u0C4D\u0C2F\u0C2E\u0C48\u0C28 \u0C2A\u0C4D\u0C30\u0C2D\u0C41\u0C24\u0C4D\u0C35 \u0C2A\u0C25\u0C15\u0C3E\u0C32\u0C41:
1. **\u0C2A\u0C40\u0C0E\u0C02-\u0C15\u0C3F\u0C38\u0C3E\u0C28\u0C4D \u0C38\u0C2E\u0C4D\u0C2E\u0C3E\u0C28\u0C4D \u0C28\u0C3F\u0C27\u0C3F:** \u0C38\u0C02\u0C35\u0C24\u0C4D\u0C38\u0C30\u0C3E\u0C28\u0C3F\u0C15\u0C3F \u20B96,000 (3 \u0C26\u0C2B\u0C3E\u0C32\u0C4D\u0C32\u0C4B \u20B92,000 \u0C1A\u0C4A\u0C2A\u0C4D\u0C2A\u0C41\u0C28). \u0C2E\u0C40 \u0C06\u0C27\u0C3E\u0C30\u0C4D e-KYC \u0C2E\u0C30\u0C3F\u0C2F\u0C41 \u0C2C\u0C4D\u0C2F\u0C3E\u0C02\u0C15\u0C4D \u0C32\u0C3F\u0C02\u0C15\u0C4D \u0C27\u0C43\u0C35\u0C40\u0C15\u0C30\u0C3F\u0C02\u0C1A\u0C41\u0C15\u0C4B\u0C02\u0C21\u0C3F.
2. **\u0C2A\u0C4D\u0C30\u0C27\u0C3E\u0C28\u0C2E\u0C02\u0C24\u0C4D\u0C30\u0C3F \u0C15\u0C43\u0C37\u0C3F \u0C38\u0C3F\u0C02\u0C1A\u0C3E\u0C2F\u0C3F \u0C2F\u0C4B\u0C1C\u0C28 (PMKSY):** \u0C21\u0C4D\u0C30\u0C3F\u0C2A\u0C4D \u0C2E\u0C30\u0C3F\u0C2F\u0C41 \u0C38\u0C4D\u0C2A\u0C4D\u0C30\u0C3F\u0C02\u0C15\u0C4D\u0C32\u0C30\u0C4D \u0C38\u0C46\u0C1F\u0C4D\u0C32\u0C2A\u0C48 \u0C1A\u0C3F\u0C28\u0C4D\u0C28 \u0C30\u0C48\u0C24\u0C41\u0C32\u0C15\u0C41 90% \u0C35\u0C30\u0C15\u0C41 \u0C30\u0C3E\u0C2F\u0C3F\u0C24\u0C40.
3. **\u0C2A\u0C40\u0C0E\u0C02 \u0C2B\u0C38\u0C32\u0C4D \u0C2C\u0C40\u0C2E\u0C3E \u0C2F\u0C4B\u0C1C\u0C28 (PMFBY):** \u0C05\u0C24\u0C3F\u0C35\u0C43\u0C37\u0C4D\u0C1F\u0C3F, \u0C05\u0C28\u0C3E\u0C35\u0C43\u0C37\u0C4D\u0C1F\u0C3F \u0C28\u0C37\u0C4D\u0C1F\u0C3E\u0C32\u0C15\u0C41 \u0C30\u0C15\u0C4D\u0C37\u0C23 \u0C15\u0C32\u0C4D\u0C2A\u0C3F\u0C02\u0C1A\u0C47 \u0C24\u0C15\u0C4D\u0C15\u0C41\u0C35 \u0C2A\u0C4D\u0C30\u0C40\u0C2E\u0C3F\u0C2F\u0C02 \u0C2A\u0C02\u0C1F\u0C32 \u0C2C\u0C40\u0C2E\u0C3E \u0C2A\u0C25\u0C15\u0C02.
\u0C2E\u0C3E "\u0C2A\u0C4D\u0C30\u0C2D\u0C41\u0C24\u0C4D\u0C35 \u0C2A\u0C25\u0C15\u0C3E\u0C32" \u0C1F\u0C4D\u0C2F\u0C3E\u0C2C\u0C4D \u0C32\u0C4B \u0C2E\u0C40 \u0C35\u0C3F\u0C35\u0C30\u0C3E\u0C32\u0C41 \u0C28\u0C2E\u0C4B\u0C26\u0C41 \u0C1A\u0C47\u0C38\u0C3F \u0C28\u0C47\u0C30\u0C41\u0C17\u0C3E \u0C26\u0C30\u0C16\u0C3E\u0C38\u0C4D\u0C24\u0C41 \u0C1A\u0C47\u0C38\u0C41\u0C15\u0C4B\u0C35\u0C1A\u0C4D\u0C1A\u0C41.`;
      } else {
        fallbackReply = `\u0C28\u0C2E\u0C38\u0C4D\u0C15\u0C3E\u0C30\u0C02 \u0C30\u0C48\u0C24\u0C41 \u0C2E\u0C3F\u0C24\u0C4D\u0C30\u0C2E\u0C3E! \u{1F64F}
\u0C28\u0C47\u0C28\u0C41 \u0C15\u0C3F\u0C38\u0C3E\u0C28\u0C4D \u0C2E\u0C3F\u0C24\u0C4D\u0C30 AI \u0C35\u0C4D\u0C2F\u0C35\u0C38\u0C3E\u0C2F \u0C38\u0C39\u0C3E\u0C2F\u0C15\u0C41\u0C21\u0C3F\u0C28\u0C3F. \u0C2E\u0C40\u0C30\u0C41 \u0C28\u0C28\u0C4D\u0C28\u0C41 \u0C35\u0C40\u0C1F\u0C3F\u0C2A\u0C48 \u0C05\u0C21\u0C17\u0C35\u0C1A\u0C4D\u0C1A\u0C41:
- \u{1F33E} **\u0C2A\u0C02\u0C1F\u0C32 \u0C38\u0C3E\u0C17\u0C41 & \u0C0E\u0C30\u0C41\u0C35\u0C41\u0C32 \u0C2E\u0C4B\u0C24\u0C3E\u0C26\u0C41** (\u0C35\u0C30\u0C3F, \u0C2E\u0C3F\u0C30\u0C2A, \u0C2A\u0C24\u0C4D\u0C24\u0C3F, \u0C1F\u0C2E\u0C4B\u0C1F\u0C3E \u0C24\u0C26\u0C3F\u0C24\u0C30\u0C3E\u0C32\u0C41)
- \u{1F41B} **\u0C24\u0C46\u0C17\u0C41\u0C33\u0C4D\u0C32 \u0C28\u0C3F\u0C35\u0C3E\u0C30\u0C23 & \u0C06\u0C30\u0C4D\u0C17\u0C3E\u0C28\u0C3F\u0C15\u0C4D \u0C15\u0C37\u0C3E\u0C2F\u0C3E\u0C32\u0C41** (\u0C28\u0C40\u0C2E\u0C4D \u0C06\u0C2F\u0C3F\u0C32\u0C4D, \u0C1C\u0C40\u0C35\u0C3E\u0C2E\u0C43\u0C24\u0C02)
- \u{1F4A7} **\u0C28\u0C47\u0C32 \u0C24\u0C47\u0C2E & \u0C28\u0C40\u0C1F\u0C3F \u0C2F\u0C3E\u0C1C\u0C2E\u0C3E\u0C28\u0C4D\u0C2F\u0C02**
- \u{1F4B0} **\u0C2E\u0C02\u0C21\u0C3F \u0C27\u0C30\u0C32\u0C41 & \u0C2E\u0C3E\u0C30\u0C4D\u0C15\u0C46\u0C1F\u0C4D \u0C38\u0C2E\u0C3E\u0C1A\u0C3E\u0C30\u0C02**
- \u{1F3DB}\uFE0F **\u0C2A\u0C40\u0C0E\u0C02-\u0C15\u0C3F\u0C38\u0C3E\u0C28\u0C4D & \u0C21\u0C4D\u0C30\u0C3F\u0C2A\u0C4D \u0C38\u0C2C\u0C4D\u0C38\u0C3F\u0C21\u0C40 \u0C2A\u0C25\u0C15\u0C3E\u0C32\u0C41**
\u0C2E\u0C40 \u0C2A\u0C4D\u0C30\u0C36\u0C4D\u0C28\u0C28\u0C41 \u0C1F\u0C48\u0C2A\u0C4D \u0C1A\u0C47\u0C2F\u0C02\u0C21\u0C3F \u0C32\u0C47\u0C26\u0C3E \u0C2E\u0C48\u0C15\u0C4D \u0C2C\u0C1F\u0C28\u0C4D \u0C28\u0C4A\u0C15\u0C4D\u0C15\u0C3F \u0C2E\u0C3E\u0C1F\u0C4D\u0C32\u0C3E\u0C21\u0C02\u0C21\u0C3F!`;
      }
    } else if (language === "hi") {
      if (m.includes("\u0916\u093E\u0926") || m.includes("fertilizer") || m.includes("\u0927\u093E\u0928") || m.includes("paddy") || m.includes("\u092F\u0942\u0930\u093F\u092F\u093E")) {
        fallbackReply = `\u0928\u092E\u0938\u094D\u0924\u0947 \u0915\u093F\u0938\u093E\u0928 \u092D\u093E\u0908 \u{1F33E}

\u0927\u093E\u0928 \u0915\u0940 \u092B\u0938\u0932 \u0915\u0947 \u0932\u093F\u090F \u0938\u0902\u0924\u0941\u0932\u093F\u0924 \u0916\u093E\u0926 \u092A\u094D\u0930\u092C\u0902\u0927\u0928:
1. **\u092C\u0941\u0935\u093E\u0908/\u0930\u094B\u092A\u093E\u0908 \u0915\u0947 \u0938\u092E\u092F:** \u092A\u094D\u0930\u0924\u093F \u090F\u0915\u0921\u093C 50 \u0915\u093F\u0917\u094D\u0930\u093E DAP, 20 \u0915\u093F\u0917\u094D\u0930\u093E \u092A\u094B\u091F\u093E\u0936 (MOP) \u0914\u0930 10 \u0915\u093F\u0917\u094D\u0930\u093E \u091C\u093F\u0902\u0915 \u0938\u0932\u094D\u092B\u0947\u091F \u0921\u093E\u0932\u0947\u0902\u0964
2. **\u0915\u0932\u094D\u0932\u0947 \u092B\u0942\u091F\u0924\u0947 \u0938\u092E\u092F (20-25 \u0926\u093F\u0928):** 25-30 \u0915\u093F\u0917\u094D\u0930\u093E \u0928\u0940\u092E \u0915\u094B\u091F\u0947\u0921 \u092F\u0942\u0930\u093F\u092F\u093E \u0915\u0940 \u092A\u0939\u0932\u0940 \u091F\u0949\u092A \u0921\u094D\u0930\u0947\u0938\u093F\u0902\u0917 \u0915\u0930\u0947\u0902\u0964
3. **\u0917\u092D\u094B\u091F \u0905\u0935\u0938\u094D\u0925\u093E (45-50 \u0926\u093F\u0928):** 25 \u0915\u093F\u0917\u094D\u0930\u093E \u092F\u0942\u0930\u093F\u092F\u093E \u0914\u0930 10 \u0915\u093F\u0917\u094D\u0930\u093E \u092A\u094B\u091F\u093E\u0936 \u0915\u0940 \u0926\u0942\u0938\u0930\u0940 \u091F\u0949\u092A \u0921\u094D\u0930\u0947\u0938\u093F\u0902\u0917 \u0915\u0930\u0947\u0902\u0964
4. **\u0927\u094D\u092F\u093E\u0928 \u0926\u0947\u0902:** \u092F\u0942\u0930\u093F\u092F\u093E \u0915\u094B \u0939\u092E\u0947\u0936\u093E 3 \u092D\u093E\u0917\u094B\u0902 \u092E\u0947\u0902 \u092C\u093E\u0902\u091F\u0915\u0930 \u0926\u0947\u0902\u0964 \u090F\u0915 \u0938\u093E\u0925 \u0905\u0927\u093F\u0915 \u092F\u0942\u0930\u093F\u092F\u093E \u0921\u093E\u0932\u0928\u0947 \u0938\u0947 \u092C\u094D\u0932\u093E\u0938\u094D\u091F \u092C\u0940\u092E\u093E\u0930\u0940 \u0915\u093E \u0916\u0924\u0930\u093E \u092C\u0922\u093C \u091C\u093E\u0924\u093E \u0939\u0948\u0964

\u0905\u0927\u093F\u0915 \u091C\u093E\u0928\u0915\u093E\u0930\u0940 \u0915\u0947 \u0932\u093F\u090F \u0928\u091C\u0926\u0940\u0915\u0940 \u0915\u0943\u0937\u093F \u0935\u093F\u091C\u094D\u091E\u093E\u0928 \u0915\u0947\u0902\u0926\u094D\u0930 (KVK) \u092F\u093E \u0915\u093F\u0938\u093E\u0928 \u0915\u0949\u0932 \u0938\u0947\u0902\u091F\u0930 1800-180-1551 \u0938\u0947 \u0938\u0902\u092A\u0930\u094D\u0915 \u0915\u0930\u0947\u0902\u0964`;
      } else if (m.includes("\u092D\u093E\u0935") || m.includes("\u092E\u0902\u0921\u0940") || m.includes("\u0915\u0940\u092E\u0924") || m.includes("\u0930\u0947\u091F") || m.includes("\u091F\u092E\u093E\u091F\u0930")) {
        fallbackReply = `\u0928\u092E\u0938\u094D\u0924\u0947 \u0915\u093F\u0938\u093E\u0928 \u092D\u093E\u0908 \u{1F4C8}
\u0906\u091C \u0915\u0947 \u092A\u094D\u0930\u092E\u0941\u0916 \u0915\u0943\u0937\u093F \u0909\u092A\u091C \u092E\u0902\u0921\u0940 (APMC) \u0915\u0947 \u0924\u093E\u091C\u093E \u092D\u093E\u0935:
- **\u0927\u093E\u0928 (\u0915\u0949\u092E\u0928/\u092C\u093E\u0938\u092E\u0924\u0940):** \u20B92,300 - \u20B93,600 \u092A\u094D\u0930\u0924\u093F \u0915\u094D\u0935\u093F\u0902\u091F\u0932
- **\u0917\u0947\u0939\u0942\u0902 (\u0936\u0930\u092C\u0924\u0940/\u0932\u094B\u0915\u0935\u093E\u0928):** \u20B92,450 - \u20B92,750 \u092A\u094D\u0930\u0924\u093F \u0915\u094D\u0935\u093F\u0902\u091F\u0932
- **\u091F\u092E\u093E\u091F\u0930 (\u0926\u0947\u0938\u0940/\u0939\u093E\u0907\u092C\u094D\u0930\u093F\u0921):** \u20B918 - \u20B928 \u092A\u094D\u0930\u0924\u093F \u0915\u093F\u0932\u094B (\u092E\u0902\u0921\u0940 \u0905\u0928\u0941\u0938\u093E\u0930)
- **\u0915\u092A\u093E\u0938:** \u20B97,100 - \u20B97,500 \u092A\u094D\u0930\u0924\u093F \u0915\u094D\u0935\u093F\u0902\u091F\u0932
\u0915\u093F\u0938\u093E\u0928 \u092E\u093F\u0924\u094D\u0930 \u092E\u093E\u0930\u094D\u0915\u0947\u091F\u092A\u094D\u0932\u0947\u0938 \u092A\u0930 \u0905\u092A\u0928\u0940 \u0909\u092A\u091C \u092C\u093F\u0928\u093E \u092C\u093F\u091A\u094C\u0932\u093F\u092F\u094B\u0902 \u0915\u0947 \u0938\u0940\u0927\u0947 \u0916\u0930\u0940\u0926\u093E\u0930\u094B\u0902 \u0915\u094B \u092C\u0947\u091A\u0947\u0902\u0964`;
      } else {
        fallbackReply = `\u0928\u092E\u0938\u094D\u0924\u0947 \u0915\u093F\u0938\u093E\u0928 \u092D\u093E\u0908! \u{1F64F}
\u092E\u0948\u0902 \u0915\u093F\u0938\u093E\u0928 \u092E\u093F\u0924\u094D\u0930 AI \u0938\u0939\u093E\u092F\u0915 \u0939\u0942\u0901\u0964 \u0906\u092A \u092E\u0941\u091D\u0938\u0947 \u092B\u0938\u0932 \u0938\u0941\u0930\u0915\u094D\u0937\u093E, \u092A\u0924\u094D\u0924\u0940 \u0930\u094B\u0917 \u092A\u0939\u091A\u093E\u0928, \u0916\u093E\u0926 \u0915\u0940 \u0938\u0939\u0940 \u092E\u093E\u0924\u094D\u0930\u093E, \u0938\u093F\u0902\u091A\u093E\u0908 \u0938\u092E\u092F \u0914\u0930 \u0938\u0930\u0915\u093E\u0930\u0940 \u092F\u094B\u091C\u0928\u093E\u0913\u0902 (PM-KISAN, \u092B\u0938\u0932 \u092C\u0940\u092E\u093E) \u0915\u0947 \u092C\u093E\u0930\u0947 \u092E\u0947\u0902 \u092C\u0947\u091D\u093F\u091D\u0915 \u092A\u0942\u091B \u0938\u0915\u0924\u0947 \u0939\u0948\u0902\u0964 \u0906\u092A \u092C\u094B\u0932\u0915\u0930 \u092D\u0940 \u0938\u0935\u093E\u0932 \u092A\u0942\u091B \u0938\u0915\u0924\u0947 \u0939\u0948\u0902!`;
      }
    } else {
      fallbackReply = `Hello Farmer friend! \u{1F33E}

Here is practical farming guidance for your field:
- **Balanced Plant Nutrition:** Apply nitrogen in split doses rather than one heavy application to prevent leaching and fungal blight.
- **Current IoT Telemetry:** Soil moisture is currently ${latestSoilTelemetry.moisturePercent}% (${latestSoilTelemetry.status}).
- **Upcoming Weather:** Relative humidity is moderate; inspect lower leaf canopy during morning hours for early fungal spots.
- **Support Available:** Ask me about crop diagnostics, local APMC mandi market trends, or government drip irrigation subsidies.`;
    }
    return res.json({
      success: true,
      source: "kisan-engine",
      reply: fallbackReply,
      language,
      timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    });
  } catch (error) {
    console.error("Assistant Error:", error);
    return res.json({
      success: true,
      source: "fallback",
      reply: "\u0C28\u0C2E\u0C38\u0C4D\u0C15\u0C3E\u0C30\u0C02 \u0C30\u0C48\u0C24\u0C41 \u0C2E\u0C3F\u0C24\u0C4D\u0C30\u0C2E\u0C3E! \u0C2A\u0C4D\u0C30\u0C38\u0C4D\u0C24\u0C41\u0C24 \u0C35\u0C30\u0C3F \u0C2A\u0C4A\u0C32\u0C3E\u0C28\u0C3F\u0C15\u0C3F \u0C0E\u0C30\u0C41\u0C35\u0C41\u0C32 \u0C28\u0C3F\u0C37\u0C4D\u0C2A\u0C24\u0C4D\u0C24\u0C3F: \u0C0E\u0C15\u0C30\u0C3E\u0C28\u0C3F\u0C15\u0C3F 50 \u0C15\u0C47\u0C1C\u0C40\u0C32 \u0C21\u0C40\u0C0F\u0C2A\u0C40 (DAP) \u0C06\u0C16\u0C30\u0C3F \u0C26\u0C41\u0C15\u0C4D\u0C15\u0C3F\u0C32\u0C4B \u0C2E\u0C30\u0C3F\u0C2F\u0C41 25 \u0C15\u0C47\u0C1C\u0C40\u0C32 \u0C2F\u0C42\u0C30\u0C3F\u0C2F\u0C3E 20-25 \u0C30\u0C4B\u0C1C\u0C41\u0C32\u0C15\u0C41 \u0C35\u0C47\u0C2F\u0C02\u0C21\u0C3F. \u0C0F\u0C26\u0C48\u0C28\u0C3E \u0C38\u0C02\u0C26\u0C47\u0C39\u0C02 \u0C09\u0C02\u0C1F\u0C47 \u0C2A\u0C02\u0C1F \u0C21\u0C3E\u0C15\u0C4D\u0C1F\u0C30\u0C4D \u0C32\u0C4B \u0C06\u0C15\u0C41 \u0C2B\u0C4B\u0C1F\u0C4B \u0C38\u0C4D\u0C15\u0C3E\u0C28\u0C4D \u0C1A\u0C47\u0C2F\u0C02\u0C21\u0C3F!",
      language: req.body?.language || "te",
      timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    });
  }
});
app.get("/api/iot/soil-moisture", async (req, res) => {
  const farmId = String(req.query.farmId || process.env.DEFAULT_FARM_ID || "FARM001");
  let telemetry = latestSoilTelemetry;
  let history = soilHistory;
  let sensorDataAvailable = false;
  const client = getSupabase();
  if (client) {
    const { data, error } = await client.from("soil_telemetry").select("*").eq("farm_id", farmId).order("recorded_at", { ascending: false }).limit(10);
    if (error) {
      return res.status(503).json({ success: false, error: "SUPABASE_CONNECTION_ERROR", message: "Unable to read soil telemetry" });
    }
    if (data?.length) {
      sensorDataAvailable = true;
      const latest = data[0];
      telemetry = {
        ...latestSoilTelemetry,
        timestamp: latest.recorded_at,
        moisturePercent: Number(latest.moisture_percent),
        soilTempC: Number(latest.soil_temp_c ?? latestSoilTelemetry.soilTempC),
        airTempC: Number(latest.air_temp_c ?? latestSoilTelemetry.airTempC),
        humidityPercent: Number(latest.humidity_percent ?? latestSoilTelemetry.humidityPercent),
        status: latest.status || latestSoilTelemetry.status,
        nitrogenPpm: Number(latest.nitrogen_ppm ?? latestSoilTelemetry.nitrogenPpm),
        phosphorusPpm: Number(latest.phosphorus_ppm ?? latestSoilTelemetry.phosphorusPpm),
        potassiumPpm: Number(latest.potassium_ppm ?? latestSoilTelemetry.potassiumPpm),
        ecValue: Number(latest.ec_value ?? latestSoilTelemetry.ecValue)
      };
      history = [...data].reverse().map((reading) => ({
        time: reading.recorded_at,
        moisture: Number(reading.moisture_percent),
        temp: Math.round(Number(reading.soil_temp_c ?? 0)),
        humidity: Math.round(Number(reading.humidity_percent ?? 0))
      }));
    }
  }
  res.json({
    success: true,
    farmId,
    sensorDataAvailable,
    dataSource: sensorDataAvailable ? "supabase" : "demo",
    telemetry,
    history,
    hardwareConfig: {
      sensorType: "Capacitive Soil Moisture Sensor v1.2 + DS18B20 + DHT22",
      microcontroller: "ESP32 NodeMCU Wi-Fi / Arduino Mega",
      apiEndpoint: "/api/iot/soil-moisture",
      baudRate: 115200,
      reportingIntervalSeconds: 300
    },
    arduinoCodeSnippet: `/*
 * AgroVision AI - ESP32 Soil Moisture & Temp Telemetry
 * HTTP REST Client for Indian Farmers
 */
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "https://YOUR_APP_URL/api/iot/soil-moisture";

const int SOIL_PIN = 34; // ADC1 channel

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Connected!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    int rawValue = analogRead(SOIL_PIN);
    // Calibrate: Dry air ~3200, Water ~1400
    int moisture = map(rawValue, 3200, 1400, 0, 100);
    moisture = constrain(moisture, 0, 100);

    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<200> doc;
    doc["moisturePercent"] = moisture;
    doc["soilTempC"] = 28.5;
    doc["airTempC"] = 32.0;
    doc["humidityPercent"] = 65;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);
    Serial.printf("Telemetry sent! Code: %d\\n", httpResponseCode);
    http.end();
  }
  delay(60000); // 1 minute interval
}`
  });
});
app.post("/api/iot/soil-moisture", async (req, res) => {
  const { moisturePercent, soilTempC = 28.5, airTempC = 31, humidityPercent = 65, farmId = "FARM001" } = req.body;
  if (typeof moisturePercent !== "number" || !Number.isFinite(moisturePercent) || moisturePercent < 0 || moisturePercent > 100 || typeof soilTempC !== "number" || !Number.isFinite(soilTempC) || typeof airTempC !== "number" || !Number.isFinite(airTempC) || typeof humidityPercent !== "number" || !Number.isFinite(humidityPercent) || humidityPercent < 0 || humidityPercent > 100 || typeof farmId !== "string" || !farmId.trim()) {
    return res.status(400).json({ success: false, error: "VALIDATION_ERROR", message: "Invalid telemetry payload" });
  }
  const { status, recommendation } = deriveStatus(moisturePercent);
  setLatestSoilTelemetry({
    timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    moisturePercent,
    soilTempC,
    airTempC,
    humidityPercent,
    status,
    recommendation,
    nitrogenPpm: latestSoilTelemetry.nitrogenPpm,
    phosphorusPpm: latestSoilTelemetry.phosphorusPpm,
    potassiumPpm: latestSoilTelemetry.potassiumPpm,
    ecValue: latestSoilTelemetry.ecValue
  });
  executeAgentWorkflow({ farmer: { farmId } }, { autonomous: true }).catch(
    (err) => console.error("[agent] post-ingest run failed:", err)
  );
  return res.json({
    success: true,
    message: "Telemetry received successfully",
    current: latestSoilTelemetry
  });
});
app.post("/api/ai/fertilizer-recommend", async (req, res) => {
  try {
    const {
      crop = "Paddy (Rice)",
      soilType = "Black Cotton Soil",
      fieldSizeAcres = 2,
      growthStage = "Vegetative Stage",
      soilTestAvailable = false,
      availableNitrogen = "Medium",
      availablePhosphorus = "Low",
      availablePotassium = "Medium"
    } = req.body;
    const prompt = `You are a chief agronomist at an Indian Agricultural University.
Generate a tailored fertilizer recommendation for an Indian farmer with:
- Crop: ${crop}
- Soil Type: ${soilType}
- Land Size: ${fieldSizeAcres} Acres
- Current Growth Stage: ${growthStage}
- Soil Test Info Available: ${soilTestAvailable ? "Yes" : "No"} (N: ${availableNitrogen}, P: ${availablePhosphorus}, K: ${availablePotassium})

Return ONLY a valid JSON object matching this schema (do NOT use markdown backticks):
{
  "crop": "${crop}",
  "soilType": "${soilType}",
  "fieldSizeAcres": ${fieldSizeAcres},
  "growthStage": "${growthStage}",
  "nutrientRequirement": {
    "nitrogenKg": 80,
    "phosphorusKg": 40,
    "potassiumKg": 40
  },
  "recommendedFertilizers": [
    {
      "name": "Commercial Fertilizer Name (e.g. Urea, DAP, MOP, SSP)",
      "dosage": "e.g. 50 kg / acre",
      "stage": "Basal or Top dressing",
      "notes": "Specific application advice"
    }
  ],
  "applicationTiming": [
    "Stage 1 timing and method",
    "Stage 2 timing and method"
  ],
  "overApplicationWarnings": [
    "Specific warning on excess nitrogen or phosphorus"
  ],
  "organicSoilHealthSuggestions": [
    "Organic recommendation like Jeevamrutham, Neem cake, or Vermicompost"
  ],
  "disclaimer": "These fertilizer dosages are indicative. Please validate with your district Soil Health Card laboratory or KVK scientist before purchasing bulk fertilizers."
}`;
    const rawText = await callGemini({
      contents: prompt
    });
    if (rawText) {
      try {
        const clean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(clean);
        return res.json({
          success: true,
          source: "gemini",
          recommendation: {
            id: "fert-" + Date.now(),
            ...parsed
          }
        });
      } catch {
      }
    }
    const acres = Number(fieldSizeAcres) || 1;
    const isPaddy = crop.toLowerCase().includes("paddy") || crop.toLowerCase().includes("rice");
    const recommendation = {
      id: "fert-" + Date.now(),
      crop,
      soilType,
      fieldSizeAcres: acres,
      growthStage,
      nutrientRequirement: {
        nitrogenKg: Math.round(isPaddy ? 45 * acres : 40 * acres),
        phosphorusKg: Math.round(isPaddy ? 25 * acres : 20 * acres),
        potassiumKg: Math.round(isPaddy ? 20 * acres : 15 * acres)
      },
      recommendedFertilizers: [
        {
          name: "DAP (Di-Ammonium Phosphate 18:46:0)",
          dosage: `${Math.round(50 * acres)} kg total (${50} kg/acre)`,
          stage: "Basal Application at Sowing/Transplanting",
          notes: "Mix with topsoil during final ploughing. Supplies 100% of basal Phosphorus and starter Nitrogen."
        },
        {
          name: "Neem-Coated Urea (46% N)",
          dosage: `${Math.round(65 * acres)} kg total in 2 split top dressings`,
          stage: "1st Split at Active Tillering (20-25 days), 2nd Split at Panicle Initiation (45 days)",
          notes: "Apply in morning hours after dew evaporates. Drain excess standing water before application."
        },
        {
          name: "MOP (Muriate of Potash 60% K2O)",
          dosage: `${Math.round(25 * acres)} kg total (${25} kg/acre)`,
          stage: "Half at Basal, Half at Panicle emergence",
          notes: "Essential for grain weight, stem strength, and drought resilience."
        },
        {
          name: "Zinc Sulphate Monohydrate (33% Zn)",
          dosage: `${Math.round(6 * acres)} kg total`,
          stage: "Basal application",
          notes: 'Prevents "Khaira" disease and yellow bronzing in black and alluvial soils.'
        }
      ],
      applicationTiming: [
        "Basal Dose: Full DAP + 50% Potash + Zinc Sulphate before final puddling/sowing.",
        "1st Top Dressing (Day 25): 50% Neem-Coated Urea mixed with 5kg neem cake powder.",
        "2nd Top Dressing (Day 45-50): Remaining 50% Urea + 50% MOP for superior grain filling."
      ],
      overApplicationWarnings: [
        "\u26A0\uFE0F Never mix DAP directly with Zinc Sulphate in the same container; chemical reaction forms insoluble Zinc Phosphate.",
        "\u26A0\uFE0F Excessive Urea (>45kg/dose) causes rapid succulent green growth, attracting Brown Planthopper (BPH) and Leaf Blast fungal spores.",
        "\u26A0\uFE0F Avoid broadcasting fertilizers immediately prior to heavy forecasted rains to prevent chemical runoff into water bodies."
      ],
      organicSoilHealthSuggestions: [
        "Apply 2-3 tonnes of well-decomposed Farmyard Manure (FYM) or 500 kg Vermicompost per acre during land preparation.",
        "Spray Jeevamrutham (200 litres/acre) through irrigation water every 15 days to enrich beneficial mycorrhiza soil microbes.",
        "Apply 100 kg Neem Cake per acre to deter root nematodes and slow down nitrogen volatilization."
      ],
      disclaimer: "These recommendations are based on standard Indian Council of Agricultural Research (ICAR) guidelines. For precision farming, please calibrate against your official Soil Health Card."
    };
    return res.json({
      success: true,
      source: "icar-agronomy-engine",
      recommendation
    });
  } catch (_error) {
    return res.json({
      success: true,
      source: "icar-agronomy-engine",
      recommendation: {
        id: "fert-" + Date.now(),
        crop: req.body?.crop || "Paddy",
        soilType: req.body?.soilType || "Black Soil",
        fieldSizeAcres: Number(req.body?.fieldSizeAcres) || 1,
        growthStage: req.body?.growthStage || "Vegetative",
        nutrientRequirement: { nitrogenKg: 45, phosphorusKg: 25, potassiumKg: 20 },
        recommendedFertilizers: [
          { name: "DAP", dosage: "50 kg / acre", stage: "Basal", notes: "Apply at sowing" },
          { name: "Neem-Coated Urea", dosage: "30 kg / acre", stage: "Tillering", notes: "Split application" },
          { name: "MOP Potash", dosage: "25 kg / acre", stage: "Panicle emergence", notes: "Grain formation" }
        ],
        applicationTiming: ["Basal: DAP + Potash", "25 Days: Urea top-dress"],
        overApplicationWarnings: ["Avoid excess urea"],
        organicSoilHealthSuggestions: ["Apply FYM compost"],
        disclaimer: "Calibrate with district Soil Health Card."
      }
    });
  }
});
app.post("/api/ai/unified-recommendations", async (req, res) => {
  try {
    const {
      soilMoisture = latestSoilTelemetry.moisturePercent,
      crop = "Paddy (Rice)",
      growthStage = "Vegetative / Tillering Stage",
      weatherCondition = "Partly Cloudy, 25% rain in 48h",
      diseaseDetected = "None detected",
      language = "en"
    } = req.body || {};
    const prompt = `You are a Chief Agricultural Scientist generating a cross-ecosystem daily farm advisory for an Indian farmer with:
- Crop: ${crop}
- Growth Stage: ${growthStage}
- Current Soil Moisture: ${soilMoisture}% (Optimal range: 35-50%)
- Weather Forecast: ${weatherCondition}
- Crop Pathology Status: ${diseaseDetected}

Synthesize these interconnected factors and return ONLY a valid JSON object matching this schema (no markdown backticks):
{
  "summary": "Brief 1-sentence headline of today's field priority",
  "reasoning": "2-3 sentences explaining the interaction between soil moisture, weather forecast, and crop stage",
  "irrigationAction": "Specific water management advice (e.g. Drip duration or hold off due to rain)",
  "cropDoctorAction": "Crop health/fungal preventative advice based on weather & humidity",
  "fertilizerAction": "Nutrient or foliar spray advice aligned with stage and moisture"
}`;
    let advisory = null;
    const rawText = await callGemini({
      contents: prompt
    });
    if (rawText) {
      try {
        const clean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        advisory = JSON.parse(clean);
      } catch {
      }
    }
    if (!advisory || !advisory.summary) {
      const moistureNum = Number(soilMoisture) || 32;
      const isMoistureLow = moistureNum < 30;
      const isMoistureHigh = moistureNum > 75;
      advisory = {
        summary: isMoistureLow ? `Soil moisture is low (${moistureNum}%) \u2014 Scheduled evening irrigation recommended for ${crop}` : isMoistureHigh ? `Soil is saturated (${moistureNum}%) \u2014 Ensure field drainage channels are clear` : `Optimal soil moisture (${moistureNum}%) \u2014 Favorable vegetative growth conditions for ${crop}`,
        reasoning: `With current soil moisture at ${moistureNum}%, relative humidity rising, and forecasted conditions (${weatherCondition}), water uptake is active during tillering. Holding deep daytime watering prevents surface evaporation while evening micro-irrigation maximizes root absorption.`,
        irrigationAction: isMoistureLow ? `Run drip or furrow irrigation for 45 minutes this evening around 5:30 PM to restore root-zone field capacity.` : isMoistureHigh ? `Do NOT irrigate today. Open side bund drainage to prevent standing stagnant water and root rot.` : `Maintain current moisture level; light 20-minute cycle sufficient if top 2 inches dry out.`,
        cropDoctorAction: diseaseDetected && diseaseDetected !== "None detected" ? `Attention required: ${diseaseDetected} noted. Avoid foliar urea spray which exacerbates fungal spread; apply recommended bio-fungicide.` : `No acute infection active. High ambient humidity increases Blast/Blight risk; inspect leaf undersides during morning rounds.`,
        fertilizerAction: `Ensure soil is damp before applying top-dressing nitrogen. Split urea application into 2 doses to avoid nitrogen leaching.`
      };
    }
    return res.json({
      success: true,
      advisory,
      telemetry: latestSoilTelemetry
    });
  } catch (_error) {
    return res.json({
      success: true,
      advisory: {
        summary: "Soil moisture stable \u2014 Normal field management in progress",
        reasoning: "Field telemetry indicates stable vegetative growth conditions for your selected crop.",
        irrigationAction: "Monitor moisture gauge this evening; irrigate when moisture dips below 35%.",
        cropDoctorAction: "Inspect crop canopy for early fungal signs or stem borer presence.",
        fertilizerAction: "Schedule next split fertilizer top dressing at panicle emergence."
      },
      telemetry: latestSoilTelemetry
    });
  }
});
app.get("/api/ai/unified-recommendations", (_req, res) => {
  const recommendations = [
    {
      id: "rec-1",
      timestamp: "10 mins ago",
      title: "Irrigation Advisory for Paddy (Vegetative Stage)",
      message: `Your soil moisture is at ${latestSoilTelemetry.moisturePercent}% in Field A. Rain probability is 65% tomorrow afternoon. We recommend delaying deep irrigation until tomorrow night to conserve borewell electricity and capture natural rainwater.`,
      priority: latestSoilTelemetry.moisturePercent < 25 ? "urgent" : "high",
      icon: "Droplets",
      category: "irrigation",
      actionPrompt: "Check Soil Sensor",
      actionRoute: "soil"
    },
    {
      id: "rec-2",
      timestamp: "1 hour ago",
      title: "Foliar Fungicide Alert: Humidity Surge",
      message: "Relative humidity is climbing to 68% with overcast skies forecast for Wednesday. Apply preventive Pseudomonas fluorescens or bio-fungicide before the rainy spell to protect against Blast.",
      priority: "urgent",
      icon: "Stethoscope",
      category: "disease",
      actionPrompt: "Open Crop Doctor",
      actionRoute: "crop-doctor"
    },
    {
      id: "rec-3",
      timestamp: "Yesterday",
      title: "Market Opportunity: Chilli Mandi Rate Surge",
      message: "Guntur APMC benchmark price climbed +\u20B9400/Qtl today due to export demand. Your dry chilli stock has high buyer inquiries on the AgroVision Marketplace.",
      priority: "medium",
      icon: "TrendingUp",
      category: "market",
      actionPrompt: "View Marketplace",
      actionRoute: "marketplace"
    },
    {
      id: "rec-4",
      timestamp: "3 days ago",
      title: "PMKSY Micro-Irrigation Subsidy Window Open",
      message: "State Horticulture Department announced an additional 15% top-up subsidy on Drip Systems for small farmers in your district. Check your pre-qualified status.",
      priority: "low",
      icon: "Building2",
      category: "fertilizer",
      actionPrompt: "Explore Schemes",
      actionRoute: "schemes"
    }
  ];
  res.json({
    success: true,
    recommendations,
    advisory: {
      summary: "Optimal soil moisture (31%) \u2014 Growth conditions favorable for Paddy",
      reasoning: "Interconnection of IoT soil moisture with current weather indicates adequate root hydration.",
      irrigationAction: "Hold daytime irrigation; schedule 30m drip pulse if moisture drops below 28%.",
      cropDoctorAction: "Foliar humidity alert: inspect lower leaf blade for fungal spots.",
      fertilizerAction: "Ready 1st top dressing urea for active tillering."
    },
    telemetry: latestSoilTelemetry
  });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express3.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AgroVision AI Server running on http://0.0.0.0:${PORT}`);
  });
  if (isSupabaseConfigured()) {
    startAutonomousMonitor({
      farmId: process.env.DEFAULT_FARM_ID || "FARM001",
      name: "Kisan",
      primaryCrop: "Paddy (Rice)",
      district: "Guntur",
      state: "Andhra Pradesh",
      language: "te"
    });
  } else {
    console.log("[agent-automation] disabled: Supabase is not configured");
  }
}
startServer();
//# sourceMappingURL=server.cjs.map
