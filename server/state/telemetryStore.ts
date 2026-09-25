export interface SoilRecord {
  timestamp: string;
  moisturePercent: number;
  soilTempC: number;
  airTempC: number;
  humidityPercent: number;
  status: 'Optimal' | 'Soil is becoming dry' | 'Critical - Irrigation Required' | 'Waterlogged';
  recommendation: string;
  nitrogenPpm: number;
  phosphorusPpm: number;
  potassiumPpm: number;
  ecValue: number;
}

export let latestSoilTelemetry: SoilRecord = {
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  moisturePercent: 31,
  soilTempC: 28.4,
  airTempC: 32.1,
  humidityPercent: 68,
  status: 'Soil is becoming dry',
  recommendation: 'Soil moisture is dipping below 35% threshold. Recommend 40 minutes drip irrigation this evening around 5:30 PM.',
  nitrogenPpm: 185,
  phosphorusPpm: 24,
  potassiumPpm: 195,
  ecValue: 1.2,
};

export let soilHistory: { time: string; moisture: number; temp: number; humidity: number }[] = [
  { time: '06:00 AM', moisture: 42, temp: 24, humidity: 82 },
  { time: '08:00 AM', moisture: 39, temp: 26, humidity: 76 },
  { time: '10:00 AM', moisture: 36, temp: 29, humidity: 71 },
  { time: '12:00 PM', moisture: 33, temp: 33, humidity: 62 },
  { time: '02:00 PM', moisture: 31, temp: 34, humidity: 58 },
  { time: '04:00 PM', moisture: 31, temp: 31, humidity: 64 },
  { time: '06:00 PM', moisture: 31, temp: 28, humidity: 68 },
];

export function setLatestSoilTelemetry(record: SoilRecord) {
  latestSoilTelemetry = record;
  soilHistory.push({
    time: record.timestamp,
    moisture: record.moisturePercent,
    temp: Math.round(record.soilTempC),
    humidity: Math.round(record.humidityPercent),
  });
  if (soilHistory.length > 10) {
    soilHistory.shift();
  }
}

export function deriveStatus(moisturePercent: number): { status: SoilRecord['status']; recommendation: string } {
  if (moisturePercent < 20) {
    return {
      status: 'Critical - Irrigation Required',
      recommendation:
        'Urgent: Soil moisture is dangerously low (<20%). Crop is reaching permanent wilting point. Initiate irrigation immediately.',
    };
  }
  if (moisturePercent < 35) {
    return {
      status: 'Soil is becoming dry',
      recommendation:
        'Soil moisture is dipping below 35% threshold. Recommend 40-50 minutes drip irrigation this evening around 5:30 PM.',
    };
  }
  if (moisturePercent > 80) {
    return {
      status: 'Waterlogged',
      recommendation:
        'Soil is saturated/waterlogged (>80%). Open drainage channels to prevent root asphyxiation and collar rot.',
    };
  }
  return { status: 'Optimal', recommendation: 'Soil moisture is optimal. No irrigation required today.' };
}
