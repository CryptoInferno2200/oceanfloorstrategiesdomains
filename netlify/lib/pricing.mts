// Server price sheet. Checkout and the Stripe webhook both read it, and it must match pricing.js in the browser.
export const PLANS: Record<string, { label: string; cents: number; monthly?: boolean }> = {
  claim: { label: "Claim · name only", cents: 1000 },
  one: { label: "OFS One", cents: 9900 },
  "abyss-one": { label: "OFS Abyss One", cents: 29900, monthly: true },
};
export const TLD_CENTS: Record<string, number> = { com: 1099, net: 1199, org: 1099, app: 1399, ai: 7999, io: 3999, studio: 1999, store: 1399, gg: 1399 };
const COM_CREDIT_CENTS = 1099;
// Claim covers .com and .org in full; any other TLD pays its year above the $10 claim credit.
const CLAIM_FLAT = new Set(["com", "org"]);

export const tldOf = (fqdn: string) => fqdn.split(".").pop() || "com";

// Cents charged on top of the plan for a name that costs more than the credit inside it.
export function surchargeCents(plan: string, tld: string) {
  const product = PLANS[plan];
  if (!product) return 0;
  if (plan === "claim" && CLAIM_FLAT.has(tld)) return 0;
  const credit = plan === "claim" ? product.cents : COM_CREDIT_CENTS;
  return Math.max(0, (TLD_CENTS[tld] ?? COM_CREDIT_CENTS) - credit);
}

// Total of the first payment: the plan plus any name surcharge.
export function firstChargeCents(plan: string, tld: string) {
  const product = PLANS[plan];
  return product ? product.cents + surchargeCents(plan, tld) : 0;
}
