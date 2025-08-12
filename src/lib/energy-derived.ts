import { LocalEnergyData } from "@/contexts/DataContext";

/**
 * Derived renewable energy split calculation.
 * Without explicit renewable metrics from the backend, we approximate the renewable share
 * using efficiency as a proxy. This centralizes the logic so we can later replace it with
 * real data (e.g., when API exposes renewable_cost / renewable_consumption fields).
 */
export interface RenewableSplit {
  renewableCost: number;
  renewableConsumption: number;
  renewableCostShare: number; // 0-1
  renewableConsumptionShare: number; // 0-1
}

// Tunable constants to emulate earlier heuristic (~70-80% renewable portions)
const BASE_CONSUMPTION_SHARE = 0.45; // Base renewable share of consumption
const EFFICIENCY_INFLUENCE = 0.4; // Portion added based on efficiency (0-1)
const COST_DISCOUNT_FACTOR = 0.95; // Renewable cost share slightly lower (cheaper energy)

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Compute renewable split for a given energy record.
 * @param record LocalEnergyData row (aggregated interval)
 * @param fallbackEfficiency Optional fallback efficiency (e.g., from summary)
 */
export function computeRenewableSplit(
  record: LocalEnergyData,
  fallbackEfficiency?: number
): RenewableSplit {
  const totalCost = record.total_cost ?? record.avg_cost ?? 0;
  const totalConsumption =
    record.total_consumption ?? record.avg_consumption ?? 0;
  const efficiency = record.avg_efficiency ?? fallbackEfficiency ?? 75; // percent
  const effNorm = clamp(efficiency / 100, 0, 1);

  const consumptionShare = clamp(
    BASE_CONSUMPTION_SHARE + effNorm * EFFICIENCY_INFLUENCE,
    0,
    0.95
  ); // cap at 95%
  const costShare = clamp(consumptionShare * COST_DISCOUNT_FACTOR, 0, 0.95);

  return {
    renewableCost: totalCost * costShare,
    renewableConsumption: totalConsumption * consumptionShare,
    renewableCostShare: costShare,
    renewableConsumptionShare: consumptionShare,
  };
}
