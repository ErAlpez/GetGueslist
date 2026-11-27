export function getBackgroundJobBatchEnd(processedItems: number, totalItems: number, batchSize: number) {
  return Math.min(totalItems, processedItems + batchSize);
}
