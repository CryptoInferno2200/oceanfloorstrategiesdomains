// Porkbun registrar. Checkout checks availability before charging; the Stripe webhook registers the name once paid.
// PORKBUN_API_KEY and PORKBUN_SECRET_API_KEY need the `purchase` scope, and the account needs prepaid credit.
import { getDatabase } from "@netlify/database";
import { TLD_CENTS } from "./pricing.mts";

const API = "https://api.porkbun.com/api/json/v3";
const MAX_ATTEMPTS = 6;

export const registrarConfigured = () => Boolean(Netlify.env.get("PORKBUN_API_KEY") && Netlify.env.get("PORKBUN_SECRET_API_KEY"));

async function call(path: string, body: Record<string, unknown> = {}, idempotencyKey = "") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`${API}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ apikey: Netlify.env.get("PORKBUN_API_KEY"), secretapikey: Netlify.env.get("PORKBUN_SECRET_API_KEY"), ...body }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, any>;
  return { ok: response.ok && data.status === "SUCCESS", status: response.status, data };
}

export type Availability =
  | { ok: true; costCents: number }
  | { ok: false; status: number; error: string };

// A name is sellable when the registry has it, it is not premium, and its first year fits inside what OFS charges.
export async function checkAvailability(fqdn: string): Promise<Availability> {
  if (!registrarConfigured()) return { ok: false, status: 503, error: "Domain registration is not configured yet." };
  const tld = fqdn.split(".").pop() || "";
  if (!(tld in TLD_CENTS)) return { ok: false, status: 400, error: `.${tld} names are not sold here yet.` };
  try {
    const { ok, status, data } = await call(`domain/checkDomain/${encodeURIComponent(fqdn)}`);
    if (status === 429) return { ok: false, status: 429, error: "Too many name checks right now. Try again in a few seconds." };
    if (!ok) return { ok: false, status: 502, error: "The registrar could not check this name. Try again." };
    const result = data.response || {};
    if (result.avail !== "yes") return { ok: false, status: 409, error: `${fqdn} is already registered. Try another name.` };
    if (result.premium === "yes") return { ok: false, status: 409, error: `${fqdn} is a premium name and cannot be claimed here.` };
    const costCents = Math.round(Number(result.price) * 100);
    if (!costCents || costCents > TLD_CENTS[tld]) return { ok: false, status: 409, error: `${fqdn} costs more than the listed .${tld} price. Try another name.` };
    return { ok: true, costCents };
  } catch (error) {
    console.error("Registrar availability check failed", error);
    return { ok: false, status: 502, error: "The registrar could not check this name. Try again." };
  }
}

// Queued and retrying names, oldest attempt first, for the retry schedule.
export async function pendingRegistrations(limit = 20) {
  const rows = await getDatabase().sql`
    SELECT purchase_id FROM domain_registrations
    WHERE status IN ('queued', 'retrying') AND attempts < ${MAX_ATTEMPTS}
      AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - INTERVAL '10 minutes')
    ORDER BY last_attempt_at NULLS FIRST
    LIMIT ${limit}
  `;
  return rows.map((row) => String(row.purchase_id));
}

// Queues the name for registration. One row per purchase, so Stripe retries never register twice.
export async function queueRegistration(purchaseId: string, email: string, fqdn: string) {
  await getDatabase().sql`
    INSERT INTO domain_registrations (purchase_id, user_email, fqdn)
    VALUES (${purchaseId}, ${email}, ${fqdn})
    ON CONFLICT (purchase_id) DO NOTHING
  `;
}

// Registers one queued name. The purchase id doubles as the Porkbun idempotency key, so a retry after a timeout cannot double-charge.
export async function attemptRegistration(purchaseId: string) {
  // Without keys the name stays queued without spending attempts.
  if (!registrarConfigured()) return;
  const db = getDatabase();
  const [row] = await db.sql`
    UPDATE domain_registrations
    SET attempts = attempts + 1, last_attempt_at = NOW(), updated_at = NOW()
    WHERE purchase_id = ${purchaseId} AND status IN ('queued', 'retrying') AND attempts < ${MAX_ATTEMPTS}
    RETURNING fqdn, attempts, user_email
  `;
  if (!row) return;
  const fqdn = String(row.fqdn);
  const finish = (status: string, error: string, orderId: string | null = null, cost: number | null = null) => db.sql`
    UPDATE domain_registrations
    SET status = ${status}, last_error = ${error || null}, registrar_order_id = COALESCE(${orderId}, registrar_order_id),
        cost_cents = COALESCE(${cost}, cost_cents), registered_at = CASE WHEN ${status} = 'registered' THEN NOW() ELSE registered_at END,
        updated_at = NOW()
    WHERE purchase_id = ${purchaseId}
  `;
  const fail = async (error: string) => {
    await finish("failed", error);
    // The buyer hears about it in Notifications; operators see the error in function logs.
    console.error(`Registration of ${fqdn} for purchase ${purchaseId} failed: ${error}`);
    await db.sql`
      INSERT INTO user_notifications (title, message, target_email, created_by)
      VALUES (${"Domain registration needs attention"}, ${`We could not register ${fqdn}. Our team has been alerted and will register it, offer another name, or refund you.`}, ${row.user_email}, ${"registrar"})
    `;
  };
  const retryOrFail = (error: string) => Number(row.attempts) >= MAX_ATTEMPTS ? fail(error) : finish("retrying", error);
  try {
    const check = await call(`domain/checkDomain/${encodeURIComponent(fqdn)}`);
    const result = check.data.response || {};
    // An earlier attempt whose reply was lost may already have registered it.
    if (check.ok && result.inYourAccount) return finish("registered", "");
    if (check.ok && result.avail !== "yes") return fail("Name was taken before registration.");
    const cost = Math.round(Number(result.price) * 100);
    if (!check.ok || !cost) return retryOrFail(`Availability check returned ${check.status}.`);
    const created = await call(`domain/create/${encodeURIComponent(fqdn)}`, { cost, agreeToTerms: "yes", whoisPrivacy: true }, `ofs-${purchaseId}`);
    if (created.ok) return finish("registered", "", String(created.data.orderId || ""), cost);
    const code = String(created.data.code || created.status);
    // Errors a retry cannot fix fail at once; funds, limits, and outages retry from the schedule.
    const permanent = ["DOMAIN_NOT_AVAILABLE", "PREMIUM_DOMAIN", "INVALID_DOMAIN", "INVALID_TLD", "ORDER_TOO_LARGE"].includes(code);
    const error = `${code}: ${String(created.data.message || "").slice(0, 300)}`;
    return permanent ? fail(error) : retryOrFail(error);
  } catch (error) {
    console.error(`Registration of ${fqdn} failed`, error);
    return retryOrFail(String((error as Error)?.message || error).slice(0, 300));
  }
}
