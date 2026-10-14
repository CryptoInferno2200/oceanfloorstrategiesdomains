import type { Config } from "@netlify/functions";
import { attemptRegistration, pendingRegistrations, registrarConfigured } from "../lib/registrar.mts";

// Every 15 minutes: retries paid names the registrar could not take yet (low credit, spend limit, outages).
export default async () => {
  if (!registrarConfigured()) return;
  const pending = await pendingRegistrations();
  for (const purchaseId of pending) {
    await attemptRegistration(purchaseId).catch((error) => console.error(`Registration retry for ${purchaseId} failed`, error));
    // Porkbun allows one create attempt per second per account.
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  if (pending.length) console.log(`Registrar retry attempted ${pending.length} names`);
};

export const config: Config = { schedule: "*/15 * * * *" };
