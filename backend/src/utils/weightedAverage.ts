export function calculateWeightedAverageMinor(
  oldQuantity: number,
  oldAverageMinor: number,
  receivedQuantity: number,
  receivedUnitPriceMinor: number
): number {
  if (receivedQuantity <= 0) {
    throw new Error("Received quantity must be positive");
  }

  const totalQuantity = oldQuantity + receivedQuantity;

  if (totalQuantity <= 0) {
    return 0;
  }

  const totalValue =
    oldQuantity * oldAverageMinor + receivedQuantity * receivedUnitPriceMinor;

  return Math.round(totalValue / totalQuantity);
}
