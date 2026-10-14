// Writes must come from this exact origin. SameSite cookies alone treat every *.ofsdomains.com subdomain as same-site.
export function crossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin !== new URL(request.url).origin);
}

export function rejectCrossOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD" || !crossOrigin(request)) return null;
  return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
}
