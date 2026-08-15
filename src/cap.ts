export function computeWriteCap(paid: boolean, maxResults: number): number {
  if (maxResults < 1) {
    return 1;
  }
  if (paid) {
    return maxResults;
  }
  return Math.min(maxResults, 10);
}

export function shouldWrite(writtenCount: number, cap: number): boolean {
  return writtenCount < cap;
}

export function isLimitedFreeTier(paid: boolean, requested: number): boolean {
  return !paid && requested > 10;
}
