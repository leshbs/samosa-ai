import { REQUEST_ID_HEADER, createRequestId } from '@/lib/observability/request-id'
import { logger } from '@/modules/shared'

/**
 * A logger stamped with this request's id, so every line a handler writes can
 * be joined back to the one request that produced it.
 *
 * The id itself is not returned: the middleware already puts it on the
 * response as `x-request-id`, and that header survives onto responses the
 * handlers build themselves (verified against a 401 from a route handler). A
 * handler that also set it by hand would be a second way to get it wrong.
 *
 * The fallback id only fires for a route the middleware matcher skips — better
 * a fresh id than a log line with no correlation field at all.
 *
 * Background work keeps correlating on `jobId` instead (see `job-runner`): an
 * analysis outlives the request that started it, so once `after()` takes over
 * the request id stops being the useful key.
 */
export function requestLog(request: Request, route: string) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? createRequestId()
  return logger.child({ requestId, route })
}
