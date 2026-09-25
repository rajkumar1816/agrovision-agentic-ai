export interface FarmerContextInput {
  farmId: string;
  name?: string;
  primaryCrop?: string;
  secondaryCrop?: string;
  district?: string;
  state?: string;
  soilType?: string;
  language?: string;
}

export interface ToolResult {
  source: string;
  [key: string]: unknown;
}

export interface AgentTrace {
  step: number;
  label: string;
  timestamp: string;
}

export interface AgentDecision {
  actionType: 'IRRIGATE' | 'DELAY_IRRIGATION' | 'DISEASE_ALERT' | 'FERTILIZER_REMINDER' | 'MARKET_TIP' | 'NO_ACTION';
  decision: string;
  reasoning: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'irrigation' | 'disease' | 'fertilizer' | 'market' | 'weather' | 'general';
  sources: string[];
}

export interface AgentRunRequest {
  question?: string;
  farmer: FarmerContextInput;
}

export interface AgentRunResponse {
  reply: string;
  decision: AgentDecision;
  trace: AgentTrace[];
  toolResults: Record<string, ToolResult>;
  notified: boolean;
  timestamp: string;
}

export interface StoredNotification {
  id: string;
  farm_id: string;
  title: string;
  message: string;
  priority: AgentDecision['priority'];
  category: AgentDecision['category'];
  created_at: string;
}
