import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { jsonBody } from '../server/common.mjs'

describe('API request body validation', () => {
  it('accepts JSON objects from Vercel, raw strings and streamed requests', async () => {
    expect(await jsonBody({ body: { ok: true } })).toEqual({ ok: true })
    expect(await jsonBody({ body: '{"ok":true}' })).toEqual({ ok: true })
    expect(await jsonBody(Readable.from(['{"ok":', 'true}']))).toEqual({ ok: true })
  })
  it('rejects arrays, null, primitives and malformed JSON in all input paths', async () => {
    for (const body of [null, [], 12, true, 'null', '[]', '123', 'true', '{']) await expect(jsonBody({ body })).rejects.toThrow('INVALID_BODY')
    await expect(jsonBody(Readable.from(['[1,2]']))).rejects.toThrow('INVALID_BODY')
  })
  it('enforces the byte limit even for preparsed objects and multibyte strings', async () => {
    for (const body of [{ text: 'x'.repeat(17000) }, JSON.stringify({ text: 'x'.repeat(17000) }), { text: 'á'.repeat(9000) }]) await expect(jsonBody({ body })).rejects.toThrow('INVALID_BODY')
    await expect(jsonBody(Readable.from(['x'.repeat(17000)]))).rejects.toThrow('INVALID_BODY')
  })
})
