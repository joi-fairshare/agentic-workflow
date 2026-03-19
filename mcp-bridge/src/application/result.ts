/** Structured error type for all application-layer failures. */
export interface AppError {
  code: string;
  message: string;
  statusHint?: number;
  details?: unknown;
}

/** Discriminated union — every service returns this instead of throwing. */
export type AppResult<T> = { ok: true; data: T } | { ok: false; error: AppError };

export function ok<T>(data: T): AppResult<T> {
  return { ok: true, data };
}

export function err<T = never>(error: AppError): AppResult<T> {
  return { ok: false, error };
}

// Common error codes
export const ERROR_CODE = {
  notFound: "NOT_FOUND",
  validation: "VALIDATION_ERROR",
  internal: "INTERNAL_ERROR",
  conflict: "CONFLICT",
} as const;
