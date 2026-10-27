import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { authenticateDeployment, privateResponse } from "../server/deployment-access";
import { browserSession } from "../server/browser-session";
import { clientBucket, reserveBudget, UsageLimitError } from "../server/usage-limits";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let sessionCookie: string | undefined;
    let authenticated: Request | Response;
    if (env.AUTH_MODE === 'browser-session' && !import.meta.env.DEV) {
      if (!env.DB) return privateResponse(Response.json({error:'Case storage is not configured.'},{status:503}));
      const session = await browserSession(request, env.SESSION_SIGNING_KEY);
      if (session instanceof Response) return privateResponse(session);
      authenticated = session.request;
      sessionCookie = session.cookie;
      try {
        const ip = await clientBucket(request, env.SESSION_SIGNING_KEY!);
        const path = new URL(request.url).pathname;
        if (session.created) {
          await reserveBudget(env.DB, `session-ip:${ip}`, 30, 3600);
          await reserveBudget(env.DB, 'session-global', 1000, 86400);
        }
        if (path.startsWith('/api/')) await reserveBudget(env.DB, `api-ip:${ip}`, 120, 60);
        if (path === '/api/cases' && request.method === 'POST') {
          await reserveBudget(env.DB, `case-ip:${ip}`, 40, 86400);
          await reserveBudget(env.DB, 'case-global', 200, 86400);
        }
        ctx.waitUntil(env.DB.prepare('DELETE FROM usage_buckets WHERE expires_at<?').bind(Date.now()-86400000).run().catch(() => {}));
      } catch (error) {
        return privateResponse(Response.json({error:error instanceof UsageLimitError ? error.message : 'The workspace is temporarily unavailable.'},{status:error instanceof UsageLimitError ? 429 : 503}));
      }
    } else {
      authenticated = await authenticateDeployment(request, env, { development: import.meta.env.DEV });
    }
    if (authenticated instanceof Response) return authenticated;
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    try {
      const response = privateResponse(await runWithConnectorBinding(binding, () => handler.fetch(authenticated, env, ctx)));
      if (sessionCookie) response.headers.append('Set-Cookie', sessionCookie);
      return response;
    } catch {
      console.error("Application rendering failed");
      return privateResponse(new Response("This page could not be loaded. Please try again.", { status: 500 }));
    }
  },
};

export default worker;
