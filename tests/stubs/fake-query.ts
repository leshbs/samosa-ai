/**
 * A stand-in for a Supabase query builder: every method returns the builder,
 * awaiting it yields `result`, and each call is recorded so a test can assert
 * on what was filtered or written — `.eq('organization_id', ...)` is the tenant
 * boundary, so "which filters ran" is often the thing worth checking.
 */
export type RecordedCall = { method: string; args: unknown[] }

export type FakeQuery = PromiseLike<unknown> & {
  calls: RecordedCall[]
  [method: string]: unknown
}

export function fakeQuery(result: unknown): FakeQuery {
  const calls: RecordedCall[] = []
  const proxy: FakeQuery = new Proxy({} as FakeQuery, {
    get(_target, property) {
      if (property === 'then') {
        return (
          resolve: (value: unknown) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject)
      }
      if (property === 'calls') return calls
      return (...args: unknown[]) => {
        calls.push({ method: String(property), args })
        return proxy
      }
    },
  })
  return proxy
}

/** The arguments of the first call to `method`, for concise assertions. */
export function argsOf(query: FakeQuery, method: string): unknown[] | undefined {
  return query.calls.find((call) => call.method === method)?.args
}
