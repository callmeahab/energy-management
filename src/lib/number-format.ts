// Utility formatting helpers for numeric display

export function formatCost(value: number | null | undefined): number {
  if (value == null || isNaN(value)) return 0;
  // Preserve cents for values below $10, whole dollars above
  if (Math.abs(value) < 1) return parseFloat(value.toFixed(3));
  if (Math.abs(value) < 10) return parseFloat(value.toFixed(2));
  return Math.round(value);
}

export function formatKWh(value: number | null | undefined): number {
  if (value == null || isNaN(value)) return 0;
  if (Math.abs(value) < 1) return parseFloat(value.toFixed(3));
  if (Math.abs(value) < 10) return parseFloat(value.toFixed(2));
  return Math.round(value);
}
