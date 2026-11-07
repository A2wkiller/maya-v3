/** Routing is computed from the current message, never recalled/merged history. */
export type MayaRoute = "local" | "private" | "fast";
export function mayaRoute(text: string): MayaRoute {
  const direct = text.replace(/```[\s\S]*?```/g, "").split("\n")
    .filter((line) => !/^\s*>/.test(line)).join("\n");
  const denied = /\b(?:not|no|don't|do not)\s+(?:use\s+)?local\b/i.test(direct);
  const local = /\blocal\b/i.test(direct) && !denied;
  return local ? "local" : /\bprivate\b/i.test(direct) ? "private" : "fast";
}
/** A local run must not escape to a different configured model endpoint on retry. */
export function mayaRouteFetch(route: MayaRoute, baseFetch: typeof fetch = fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const router = url.hostname === "172.18.0.1" && url.port === "8792";
    if (route === "local" && !router) throw new Error("Local model route cannot use a cloud endpoint");
    if (!router) return baseFetch(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((v,k) => headers.set(k,v));
    headers.set("X-Maya-Route", route);
    return baseFetch(input, { ...init, headers });
  }) as typeof fetch;
}

export function assertLocalEndpoint(route: MayaRoute | undefined, model: {baseUrl: string;api: string}): void {
  if (route !== "local") return;
  const url = new URL(model.baseUrl);
  if (url.hostname !== "172.18.0.1" || url.port !== "8792" || model.api !== "openai-completions") throw new Error("Local route requires the fixed VM router");
}
