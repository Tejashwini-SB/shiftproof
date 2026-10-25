import { ethers } from 'ethers';
import { RewardCalculationResult, ScenarioOutcome } from '../types';

export const STEPS = [
  'Event is open and before its deadline',
  'This meter has not been settled for this event',
  'All four history days were recorded',
  'History was recorded before the event was announced',
  'History matches the hashes the oracle stored',
  "Event-day readings match the meter's hash",
  'Reward calculated by the fixed rules'
];

export const formatKwh = (w: number): string => (w / 1000).toFixed(2);

export const formatHour = (h: number): string => `${String(h).padStart(2, '0')}:00`;

export function calculateReward(
  baseline: number[],
  actual: number[],
  eligibleHours: number[],
  capWh: number
): RewardCalculationResult {
  let drop = 0;
  let rise = 0;
  let baseTotal = 0;
  let actTotal = 0;

  for (let h = 0; h < 24; h++) {
    const b = baseline[h];
    const a = actual[h];
    baseTotal += b;
    actTotal += a;

    if (eligibleHours.includes(h)) {
      if (a > b) rise += a - b;
    } else {
      if (b > a) drop += b - a;
    }
  }

  const shifted = Math.min(drop, rise);
  const capped = Math.min(shifted, capWh);
  const rebound = Math.max(0, actTotal - baseTotal);
  const reward = Math.max(0, capped - rebound);

  return {
    d: drop,
    r: rise,
    c: capped,
    rb: rebound,
    reward
  };
}

export function getFailStepIndex(outcome: ScenarioOutcome, eventDay: number = 100): number {
  if (outcome.status === 'rewarded') return -1;
  const err = outcome.error;
  if (err === 'AlreadySettled') return 1;
  if (err === 'HistoryNotAnchored') return 2;
  if (err === 'HistoryAnchoredLate') return 3;
  if (err === 'HashMismatch') {
    const arg0 = outcome.args && outcome.args[0] ? Number(outcome.args[0]) : 0;
    return arg0 === eventDay ? 5 : 4;
  }
  return 6;
}

export function getFailureExplanation(outcome: ScenarioOutcome, eventDay: number = 100): string {
  const err = outcome.error;
  const arg0 = outcome.args && outcome.args[0] ? outcome.args[0] : '';
  if (err === 'HashMismatch') {
    return Number(arg0) === eventDay
      ? 'The submitted readings differ from what the meter recorded.'
      : `Day ${arg0} was changed after it was recorded.`;
  }
  if (err === 'HistoryAnchoredLate') {
    return `Day ${arg0} was recorded after the event was announced.`;
  }
  if (err === 'AlreadySettled') {
    return 'Event 1 was already settled for this meter.';
  }
  return 'The contract refused this claim.';
}

export function getScenarioHeadline(
  outcome: ScenarioOutcome,
  calc: RewardCalculationResult,
  eventDay: number = 100
): string {
  if (outcome.status === 'rewarded') {
    return calc.rb > 0
      ? 'Reward cut: total energy use went up.'
      : `${formatKwh(outcome.rewardWh ?? calc.reward)} kWh moved into the sun. Reward calculated (simulated).`;
  }
  const err = outcome.error;
  const arg0 = outcome.args && outcome.args[0] ? outcome.args[0] : '';
  if (err === 'HashMismatch') {
    return Number(arg0) === eventDay
      ? "Blocked: the readings don't match the meter."
      : 'Blocked: the baseline was changed.';
  }
  if (err === 'HistoryAnchoredLate') {
    return 'Blocked: that history was recorded too late to trust.';
  }
  if (err === 'AlreadySettled') {
    return 'Blocked: this event was already settled.';
  }
  return 'Blocked by the contract.';
}

/**
 * Computes the exact on-chain Solidity hash:
 * keccak256(abi.encodePacked(bytes32 meterId, uint32 dayId, uint32[24] readings))
 */
export function computeSolidityHash(meterId: string, dayId: number, readings: number[]): string {
  try {
    const meterBytes32 = ethers.encodeBytes32String(meterId);
    return ethers.solidityPackedKeccak256(
      ['bytes32', 'uint32', 'uint32[24]'],
      [meterBytes32, dayId, readings]
    );
  } catch {
    return '0x' + '0'.repeat(64);
  }
}
