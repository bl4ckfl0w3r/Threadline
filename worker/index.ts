import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { authenticateDeployment, privateResponse } from "../server/deployment-access";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const authenticated = await authenticateDeployment(request, env, { development: import.meta.env.DEV });
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
      return privateResponse(await runWithConnectorBinding(binding, () => handler.fetch(authenticated, env, ctx)));
    } catch {
      console.error("Application rendering failed");
      return privateResponse(new Response("This page could not be loaded. Please try again.", { status: 500 }));
    }
  },
};

export default worker;
