import type { EntitlementPort } from "./types.js";

export async function resolvePaid(
  port: EntitlementPort,
  userId: string | null,
): Promise<boolean> {
  try {
    return await port.isPaid(userId);
  } catch {
    return false;
  }
}

export class KvEntitlementPort implements EntitlementPort {
  public constructor(
    private readonly getRecord: (userId: string) => Promise<unknown>,
  ) {}

  public async isPaid(userId: string | null): Promise<boolean> {
    if (!userId) {
      return false;
    }
    const record = await this.getRecord(userId);
    if (!record || typeof record !== "object") {
      return false;
    }
    const paid = (record as { paid?: unknown }).paid;
    return paid === true;
  }
}
