import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMemberships, listPatients, saveRecord } from '../src/lib/api'
import { blankRecord } from '../src/lib/model'

const query = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ database: () => query }))
beforeEach(() => {
  vi.resetAllMocks()
  query.rpc.mockResolvedValue({ data: {patients:[],count:0}, error: null })
})

describe('patient search', () => {
  it('filters on the server by clinic, paginates and folds accents', async () => {
    await listPatients('clinic-id', 'María', 1, 12)
    expect(query.rpc).toHaveBeenCalledWith('list_clinical_patients',{p_clinic_id:'clinic-id',p_query:'María',p_page:1,p_page_size:12})
  })
  it('passes formatted DNI as data for the database normalization', async () => {
    await listPatients('clinic-id', '12.345.678')
    expect(query.rpc.mock.calls[0][1].p_query).toBe('12.345.678')
    query.rpc.mockClear()
    await listPatients('clinic-id', '...')
    expect(query.rpc.mock.calls[0][1].p_query).toBe('...')
  })
  it('never interpolates search syntax into a query and caps its length', async () => {
    await listPatients('clinic-id', 'Maria),clinic_id.neq.x%_*')
    expect(query.rpc.mock.calls[0][1].p_query).toBe('Maria),clinic_id.neq.x%_*')
    await listPatients('clinic-id','x'.repeat(200))
    expect(query.rpc.mock.calls[1][1].p_query).toHaveLength(100)
  })
  it('requires explicit specialty permissions from the membership RPC',async()=>{
    query.rpc.mockResolvedValue({data:[{clinicId:'clinic',role:'owner',clinic:{},version:1}],error:null})
    await expect(getMemberships()).rejects.toThrow('INVALID_MEMBERSHIPS')
    query.rpc.mockResolvedValue({data:[{clinicId:'clinic',role:'owner',clinic:{},version:1,specialties:[]}],error:null})
    expect((await getMemberships())[0].specialties).toEqual([])
  })
  it('rejects unsupported clinical modules before sending a request',async()=>{
    const record=blankRecord();record.patient.fullName='Paciente'
    await expect(saveRecord('clinic',record,null,0,{specialtyId:'unknown',schemaVersion:1})).rejects.toThrow('UNSUPPORTED_CLINICAL_SCHEMA')
    expect(query.rpc).not.toHaveBeenCalled()
  })
})
