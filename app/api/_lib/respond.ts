import { NextResponse } from 'next/server'
import { httpStatusFor, type AppError } from '@/modules/shared'
import type { ApiFailure, ApiSuccess } from '@/types/api'

export function success<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data }, { status })
}

/** `cause` stays server-side — it may carry upstream payloads or PII. */
export function failure(error: AppError): NextResponse<ApiFailure> {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, details: error.details } },
    { status: httpStatusFor(error.code) },
  )
}
