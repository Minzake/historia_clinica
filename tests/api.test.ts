import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listPatients } from '../src/lib/api'

const query = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), or: vi.fn(), order: vi.fn(), range: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ database: () => query }))
beforeEach(() => {
  vi.resetAllMocks()
  for (const key of ['from', 'select', 'eq', 'or', 'order'] as const) query[key].mockReturnValue(query)
  query.range.mockResolvedValue({ data: [], error: null, count: 0 })
})

describe('patient search', () => {
  it('filters on the server by clinic, paginates and folds accents', async () => {
    await listPatients('clinic-id', 'María', 1, 12)
    expect(query.eq).toHaveBeenCalledWith('clinic_id', 'clinic-id')
    expect(query.range).toHaveBeenCalledWith(12, 23)
    expect(query.or.mock.calls[0][0]).toContain('full_name_search.ilike.%maria%')
  })
  it('normalizes formatted DNI and never adds an empty wildcard DNI condition', async () => {
    await listPatients('clinic-id', '12.345.678')
    expect(query.or.mock.calls[0][0]).toContain('dni.ilike.%12345678%')
    query.or.mockClear()
    await listPatients('clinic-id', '...')
    expect(query.or.mock.calls[0][0]).not.toContain('dni.ilike.%%')
  })
  it('strips PostgREST filter syntax and LIKE wildcards from user input', async () => {
    await listPatients('clinic-id', 'Maria),clinic_id.neq.x%_*')
    const filter = query.or.mock.calls[0][0] as string
    expect(filter).not.toContain(')')
    expect(filter).not.toContain('clinic_id')
    expect(filter).not.toContain('*')
    expect(filter.split(',')).toHaveLength(2)
  })
})
