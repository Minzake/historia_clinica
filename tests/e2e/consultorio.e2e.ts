import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { blankClinic } from '../../src/lib/model'
import type { RecordDraft, SavedRecord } from '../../src/lib/model'

const userId = '10000000-0000-4000-8000-000000000001'
const patientId = '30000000-0000-4000-8000-000000000001'

async function fakeBackend(page: Page) {
  let saved: SavedRecord | null = null
  const clinic = { ...blankClinic(), name: 'Consultorio de Podología', professional: 'Profesional de prueba', license: 'MP 12345' }
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'titular@example.com', email_confirmed_at:new Date().toISOString(), created_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {} }
  const payload = Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test-signature`, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }
  await page.route('https://test-clinic.supabase.co/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    let body: unknown
    const headers: Record<string, string> = { 'content-type': 'application/json', 'access-control-expose-headers': 'content-range' }
    if (url.pathname === '/auth/v1/token') body = session
    else if (url.pathname === '/auth/v1/user') body = user
    else if (url.pathname === '/auth/v1/logout') { await route.fulfill({ status: 204 }); return }
    else if (url.pathname === '/rest/v1/clinic_members') body = [{ clinic_id: '20000000-0000-4000-8000-000000000001', role: 'owner', clinics: { settings: clinic, version: 1 } }]
    else if (url.pathname === '/rest/v1/rpc/list_my_memberships') body=[{clinicId:'20000000-0000-4000-8000-000000000001',role:'owner',clinic,version:1,specialties:[{specialtyId:'podologia',name:'Podología',canRead:true,canWrite:true,canExport:true,scope:'all'}]}]
    else if (url.pathname === '/rest/v1/rpc/get_clinic_dashboard' || url.pathname === '/rest/v1/rpc/list_clinical_patients') body={patients:saved?[{id:saved.id,full_name:saved.patient.fullName,history_number:saved.patient.historyNumber,dni:saved.patient.dni,updated_at:saved.updatedAt}]:[],count:saved?1:0,evolutions:saved?.evolutions.length||0}
    else if (url.pathname === '/rest/v1/rpc/list_chart_versions') body=[]
    else if (url.pathname === '/rest/v1/patients') {
      body = saved ? [{ id: saved.id, full_name: saved.patient.fullName, history_number: saved.patient.historyNumber, dni: saved.patient.dni, updated_at: saved.updatedAt }] : []
      headers['content-range'] = saved ? '0-0/1' : '*/0'
    } else if (url.pathname === '/rest/v1/evolutions') {
      body = []
      headers['content-range'] = `*/${saved?.evolutions.length || 0}`
    } else if (url.pathname === '/rest/v1/rpc/save_patient_record') {
      const args = request.postDataJSON() as { p_record: RecordDraft; p_expected_version: number }
      saved = { ...args.p_record, id: patientId, version: args.p_expected_version + 1, updatedAt: new Date().toISOString() }
      saved.patient.historyNumber ||= 'HC-000001'
      body = saved
    } else if (url.pathname === '/rest/v1/rpc/get_patient_record' || url.pathname === '/rest/v1/rpc/get_clinical_chart') body = saved
    else if (url.pathname === '/rest/v1/clinical_record_versions') body = []
    else throw new Error(`Unexpected mocked endpoint: ${url.pathname}`)
    await route.fulfill({ status: 200, headers, body: request.method() === 'HEAD' ? '' : JSON.stringify(body) })
  })
}

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico').fill('titular@example.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password-long')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Tu consultorio, al día.' })).toBeVisible()
}

test('login, patient creation, persistence, search, continuous PDF and logout', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await fakeBackend(page)
  await login(page)
  await page.screenshot({ path: testInfo.outputPath('inicio.png'), fullPage: true })
  await page.getByRole('link', { name: 'Nuevo paciente', exact: true }).click()
  await page.getByLabel('Apellido y nombre *').fill('María Paciente de prueba')
  await page.getByLabel('DNI', { exact: true }).fill('12345678')
  await page.getByRole('button', { name: 'Guardar historia', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/historias/${patientId}$`))
  await expect(page.getByLabel('Historia clínica N.º')).toHaveValue('HC-000001')
  await page.getByRole('button', { name: 'Evoluciones: valores y consultas' }).click()
  await page.getByRole('button', { name: 'Agregar consulta' }).click()
  await page.getByLabel('Procedimiento / evaluación').fill('Evaluación podológica. Control y seguimiento de la evolución del paciente.')
  await page.getByRole('button', { name: 'Guardar historia', exact: true }).click()
  await expect(page.getByText('Historia clínica guardada correctamente.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Procedimiento / evaluación')).toHaveValue(/Evaluación podológica/)
  await page.getByLabel('Contenido del PDF').selectOption('blank-evolution')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('planilla-evolucion-HC-000001.pdf')
  const pdfPath = testInfo.outputPath('planilla-evolucion.pdf')
  await download.saveAs(pdfPath)
  expect((await readFile(pdfPath)).subarray(0, 5).toString()).toBe('%PDF-')
  await page.getByLabel('Contenido del PDF').selectOption('complete')
  const fullPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click()
  await (await fullPromise).saveAs(testInfo.outputPath('historia-completa.pdf'))
  await page.getByRole('link', { name: 'Historias clínicas', exact: true }).first().click()
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(page.getByRole('link', { name: 'María Paciente de prueba', exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('1 paciente')
  expect(await page.locator('.history-table').evaluate(table => table.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('pacientes-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByRole('searchbox', { name: 'Buscar por nombre, DNI o número de historia' }).fill('Maria')
  await page.getByRole('link', { name: 'Primera hoja', exact: true }).click()
  await expect(page.getByLabel('Apellido y nombre *')).toHaveValue('María Paciente de prueba')
  await page.screenshot({ path: testInfo.outputPath('ficha-inicial.png'), fullPage: true })
  await page.getByRole('button', { name: 'Salir', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible()
  expect(errors).toEqual([])
})

test('mobile forms and navigation stay within the viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await fakeBackend(page)
  await page.goto('/')
  await page.screenshot({ path: testInfo.outputPath('login-mobile.png'), fullPage: true })
  await login(page)
  await page.getByRole('link', { name: 'Nuevo paciente', exact: true }).click()
  await page.getByLabel('Apellido y nombre *').fill('Paciente móvil')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('ficha-mobile.png'), fullPage: true })
  await page.getByRole('link', { name: 'Inicio', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Hay cambios sin guardar' })).toBeVisible()
  await page.getByRole('button', { name: 'Seguir editando' }).click()
  await expect(page.getByLabel('Apellido y nombre *')).toHaveValue('Paciente móvil')
  await page.getByRole('button', { name: 'Evoluciones: valores y consultas' }).click()
  await page.getByRole('button', { name: 'Agregar consulta' }).click()
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
