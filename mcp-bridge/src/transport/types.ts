import type { z, ZodType } from "zod";

// ── Schema definition ──────────────────────────────────────

/** Defines the shape of a route's input and output for compile-time safety. */
export interface RouteSchema {
  body?: ZodType;
  params?: ZodType;
  querystring?: ZodType;
  response: ZodType;
}

// ── Type inference helpers ─────────────────────────────────

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;
type InferBody<S extends RouteSchema> = S["body"] extends ZodType ? z.infer<S["body"]> : undefined;
type InferParams<S extends RouteSchema> = S["params"] extends ZodType ? z.infer<S["params"]> : undefined;
type InferQuery<S extends RouteSchema> = S["querystring"] extends ZodType ? z.infer<S["querystring"]> : undefined;
export type InferResponseData<S extends RouteSchema> = Infer<S["response"]>;

// ── Request / Response ─────────────────────────────────────

export interface ApiRequest<TSchema extends RouteSchema = RouteSchema> {
  params: InferParams<TSchema>;
  query: InferQuery<TSchema>;
  body: InferBody<TSchema>;
  requestId: string;
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: unknown;
        statusHint?: number;
      };
    };

// ── Route definition ───────────────────────────────────────

export interface RouteEntry<TSchema extends RouteSchema = RouteSchema> {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  summary: string;
  schema: TSchema;
  handler: (req: ApiRequest<TSchema>) => Promise<ApiResponse<InferResponseData<TSchema>>>;
}

/** Identity function that captures TSchema for compile-time type linking. */
export function defineRoute<TSchema extends RouteSchema>(
  entry: RouteEntry<TSchema>,
): RouteEntry<TSchema> {
  return entry;
}

export interface ControllerDefinition {
  basePath: string;
  routes: RouteEntry[];
}

// ── Error helper ───────────────────────────────────────────

export function appErr<T = never>(error: {
  code: string;
  message: string;
  statusHint?: number;
  details?: unknown;
}): ApiResponse<T> {
  return { ok: false, error };
}
