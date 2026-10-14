// Function responses skip the netlify.toml header rules, so apply the site's security headers here.
// Headers a function already set (like the sandbox CSP) are kept.
const HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export default async (_request: Request, context: { next: () => Promise<Response> }) => {
  const upstream = await context.next();
  const response = new Response(upstream.body, upstream);
  for (const [name, value] of Object.entries(HEADERS)) {
    if (!response.headers.has(name)) response.headers.set(name, value);
  }
  return response;
};

export const config = { path: ["/api/*", "/s/*", "/sandbox/*"] };
