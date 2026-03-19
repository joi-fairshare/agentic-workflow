import Fastify from "fastify";
import type { ZodType } from "zod";
import { ZodError } from "zod";
import type { ControllerDefinition, RouteEntry } from "./transport/types.js";

export function createServer(controllers: ControllerDefinition[]) {
  const app = Fastify({ logger: true });

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  // Register all controller routes
  for (const controller of controllers) {
    for (const route of controller.routes) {
      registerRoute(app, controller.basePath, route);
    }
  }

  return app;
}

function registerRoute(
  app: ReturnType<typeof Fastify>,
  basePath: string,
  route: RouteEntry,
) {
  const fullPath = `${basePath}${route.path}`;
  const method = route.method.toLowerCase() as "get" | "post" | "put" | "delete";

  app[method](fullPath, async (request: { params: unknown; query: unknown; body: unknown; id: string; log: { error: (e: unknown) => void } }, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) => {
    try {
      // Validate and parse inputs
      const params = route.schema.params
        ? (route.schema.params as ZodType).parse(request.params)
        : undefined;

      const query = route.schema.querystring
        ? (route.schema.querystring as ZodType).parse(request.query)
        : undefined;

      const body = route.schema.body
        ? (route.schema.body as ZodType).parse(request.body)
        : undefined;

      // Build typed request
      const apiReq = {
        params,
        query,
        body,
        requestId: request.id,
      };

      // Call handler
      const result = await route.handler(apiReq as Parameters<typeof route.handler>[0]);

      if (result.ok) {
        const status = route.method === "POST" ? 201 : 200;
        return reply.status(status).send({ ok: true, data: result.data });
      }

      const httpStatus = result.error.statusHint ?? 500;
      return reply.status(httpStatus).send({
        ok: false,
        error: {
          code: result.error.code,
          message: result.error.message,
          details: result.error.details,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: error.issues,
          },
        });
      }

      request.log.error(error);
      return reply.status(500).send({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  });
}
