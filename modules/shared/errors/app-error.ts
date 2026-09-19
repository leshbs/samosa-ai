export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM: 'UPSTREAM',
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM: 502,
  INTERNAL: 500,
}

export type AppError = {
  readonly code: ErrorCode
  /** Safe to show to the end user — never contains PII or raw upstream output. */
  readonly message: string
  readonly details?: Record<string, unknown>
  readonly cause?: unknown
}

export function appError(
  code: ErrorCode,
  message: string,
  options: { details?: Record<string, unknown>; cause?: unknown } = {},
): AppError {
  return { code, message, details: options.details, cause: options.cause }
}

export function httpStatusFor(code: ErrorCode): number {
  return STATUS_BY_CODE[code]
}
