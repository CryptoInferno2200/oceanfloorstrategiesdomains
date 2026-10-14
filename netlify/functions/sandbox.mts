import type { Config, Context } from "@netlify/functions";
import { assemble, loadFiles, ownedProject } from "../lib/workspace.mts";

// Serves a project's sandbox to its owner. The CSP sandbox gives the page an opaque origin,
// so customer code can't read OFS cookies or call OFS APIs; data flows through the workspace bridge.
const SANDBOX_CSP = [
  "sandbox allow-scripts allow-forms allow-modals allow-popups",
  "default-src 'none'",
  "script-src 'unsafe-inline' https:",
  "style-src 'unsafe-inline' https:",
  "img-src data: blob: https:",
  "font-src data: https:",
  "media-src data: blob: https:",
  "connect-src https:",
  "frame-ancestors 'self'",
].join("; ");

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function notice(message: string, status: number) {
  return new Response(`<!doctype html><meta charset="utf-8"><title>Sandbox</title><p style="font:16px system-ui;padding:24px">${esc(message)}</p>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": SANDBOX_CSP, "Cache-Control": "no-store" },
  });
}

export default async (request: Request, context: Context) => {
  const { email, project } = await ownedProject(context.params.fqdn);
  if (!email) return notice("Sign in on OFS Domains to open this sandbox.", 401);
  if (!project) return notice("This sandbox belongs to another account or does not exist.", 404);
  const { files } = await loadFiles(project);
  return new Response(assemble(project, files, new URL(request.url).origin), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": SANDBOX_CSP,
      "X-Robots-Tag": "noindex",
      "Cache-Control": "no-store",
    },
  });
};

export const config: Config = { path: "/sandbox/:fqdn", method: "GET" };
