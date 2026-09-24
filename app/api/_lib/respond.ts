import { NextResponse } from 'next/server'
import { httpStatusFor, type AppError } from '@/modules/shared'
import type { ApiSuccess, ApiFailure } from '@/types/api'

export function success<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data }, { status })
}

/**
 * `cause` stays server-side — it may carry upstream payloads or PII.
 *
 * The request id is deliberately *not* threaded through here. Measured: the
 * `x-request-id` the middleware sets on `NextResponse.next()` is merged into
 * the final response, including the ones route handlers build themselves — a
 * 401 from this function carries it. One mechanism, set in one place.
 */
export function failure(error: AppError): NextResponse<ApiFailure> {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, details: error.details } },
    { status: httpStatusFor(error.code) },
  )
}
