import { describe, expect, it } from 'vitest'
import {
  err,
  fromPromise,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrapOr,
} from '@/modules/shared'

describe('Result', () => {
  it('narrows ok and err variants', () => {
    expect(isOk(ok(1))).toBe(true)
    expect(isErr(err('bad'))).toBe(true)
  })

  it('maps only the success value', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 })
    expect(map(err('bad'), (n: number) => n * 3)).toEqual({ ok: false, error: 'bad' })
  })

  it('maps only the error value', () => {
    expect(mapErr(err('bad'), (e) => `${e}!`)).toEqual({ ok: false, error: 'bad!' })
  })

  it('falls back when unwrapping an error', () => {
    expect(unwrapOr(err('bad'), 7)).toBe(7)
  })

  it('converts a rejected promise into an err', async () => {
    const result = await fromPromise(Promise.reject(new Error('nope')), () => 'wrapped')
    expect(result).toEqual({ ok: false, error: 'wrapped' })
  })
})
