import { ERROR_CODES, appError, type AppError, type ErrorCode } from '../errors'
import { err, ok, type Result } from '../result'

/**
 * `fetch` only rejects when the request never produced a response at all:
 * offline, DNS failure, a connection dropped mid-flight, a navigation that
 * aborted the request. None of those are the user's fault, and none of them
 * mean the action failed on the server — it may not have been attempted.
 */
const OFFLINE_MESSAGE = 'Koneksi ke server terputus. Periksa jaringanmu lalu coba lagi.'

/**
 * A body that is not our JSON envelope came from something in front of the
 * route handler — a platform 413 for an oversized upload, an HTML 502, a proxy
 * timeout. There is no `message` to show, so we supply one.
 */
const UNREADABLE_MESSAGE = 'Server tidak merespons dengan benar. Coba lagi sebentar lagi.'

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in ERROR_CODES
}

/** Reads the `{ error: { code, message } }` envelope every route handler returns. */
function readFailure(payload: unknown): AppError | undefined {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) return
  const { error } = payload as { error: unknown }
  if (typeof error !== 'object' || error === null) return

  const { code, message } = error as { code?: unknown; message?: unknown }
  if (typeof message !== 'string' || message.length === 0) return

  return appError(isErrorCode(code) ? code : ERROR_CODES.INTERNAL, message)
}

/**
 * Calls one of our own API routes and returns a `Result` instead of throwing.
 *
 * Every client call site needs the same three outcomes handled — transport
 * failure, an unreadable body, and our own error envelope — and a call site
 * that forgets one leaves its button spinning forever with nothing on screen.
 */
export async function requestJson<T>(
  input: string,
  init?: RequestInit,
): Promise<Result<T, AppError>> {
  let response: Response
  try {
    response = await fetch(input, init)
  } catch (cause) {
    return err(appError(ERROR_CODES.UPSTREAM, OFFLINE_MESSAGE, { cause }))
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (cause) {
    return err(appError(ERROR_CODES.UPSTREAM, UNREADABLE_MESSAGE, { cause }))
  }

  const failure = readFailure(payload)
  if (failure) return err(failure)

  if (!response.ok) return err(appError(ERROR_CODES.UPSTREAM, UNREADABLE_MESSAGE))

  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    return err(appError(ERROR_CODES.UPSTREAM, UNREADABLE_MESSAGE))
  }

  return ok((payload as { data: T }).data)
}
