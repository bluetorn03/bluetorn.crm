import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next, handlerType, request }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    // Never return an HTML error page for server functions or API RPC calls.
    // Re-throwing preserves TanStack Start's expected RPC error serialization.
    if (handlerType === "serverFn") {
      console.error("[ServerFn Unhandled Error]", error);
      throw error;
    }

    const accept = request.headers.get("accept") ?? "";
    if (!accept.includes("text/html")) {
      console.error("[API Unhandled Error]", error);
      throw error;
    }

    console.error("[SSR Page Error]", error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
