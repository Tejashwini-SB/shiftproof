export interface Metrics {
  forecast_mae_wh: number;
  forecast_r2: number;
  anomaly_tp: number;
  anomaly_fp: number;
  anomaly_fn: number;
  anomaly_precision: number;
  anomaly_recall: number;
  note: string;
}

export interface SimData {
  eligibleHours: number[];
  forecastWh: number[];
  solarActualWh: number[];
  metrics: Metrics;
  capWh: number;
  eventDay: number;
}

export interface ScenarioOutcome {
  status: 'rewarded' | 'rejected';
  rewardWh?: number;
  error?: string;
  args?: string[];
  firstRewardWh?: number;
}

export interface Scenario {
  id: number;
  title: string;
  story: string;
  attack: boolean;
  anchoredBaseline: number[];
  claimedBaseline: number[];
  actual: number[];
  eligibleHours: number[];
  capWh: number;
  outcome: ScenarioOutcome;
}

export interface ShiftProofData {
  sim: SimData;
  results: Scenario[];
}

export interface RewardCalculationResult {
  d: number; // Moved out of evening (drop)
  r: number; // Moved into solar hours (rise)
  c: number; // min(min(d, r), cap)
  rb: number; // rebound penalty (max(0, actualTotal - baselineTotal))
  reward: number; // max(0, c - rb)
}
