import type { Config } from "@netlify/functions";
import { attemptRegistration, pendingDns, pendingRegistrations, provisionDns, registrarConfigured } from "../lib/registrar.mts";

// Every 15 minutes: retries paid names and their OFS DNS zones the registrar could not take yet (low credit, spend limit, outages).
export default async () => {
  if (!registrarConfigured()) return;
  const pending = await pendingRegistrations();
  for (const purchaseId of pending) {
    await attemptRegistration(purchaseId).catch((error) => console.error(`Registration retry for ${purchaseId} failed`, error));
    // Porkbun allows one create attempt per second per account.
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  if (pending.length) console.log(`Registrar retry attempted ${pending.length} names`);
  // Registered names still waiting for their zone on OFS DNS.
  const dns = await pendingDns();
  for (const purchaseId of dns) {
    await provisionDns(purchaseId).catch((error) => console.error(`DNS retry for ${purchaseId} failed`, error));
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  if (dns.length) console.log(`DNS retry attempted ${dns.length} names`);
};

export const config: Config = { schedule: "*/15 * * * *" };
