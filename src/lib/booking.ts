import { database, errorMessage } from './supabase'

export const defaultTimezone='America/Argentina/Buenos_Aires'
export type ClientProfile={user_id:string;full_name:string;dni:string;phone:string;email:string}
export type Practitioner={user_id:string;email:string;role:'owner'|'professional'}
export type TeamMember=Practitioner&{active:boolean;confirmed:boolean;is_self:boolean}
export type OpeningHours={weekday:number;opens:string;closes:string}
export type BookingSettings={clinic_id:string;slug:string;enabled:boolean;provider_id:string|null;provider_name:string;timezone:string;advance_days:number;lead_minutes:number;cancel_hours:number;version:number}
export type BookingPage={slug:string;name:string;address:string;phone:string;provider_name:string;timezone:string;advance_days:number;lead_minutes:number;cancel_hours:number;duration_minutes:30}
export type AppointmentStatus='confirmed'|'cancelled'|'completed'|'no_show'
export type MyAppointment={id:string;starts_at:string;ends_at:string;status:AppointmentStatus;version:number;source:'web'|'staff';clinic_name:string;phone:string;address:string;timezone:string;slug:string;cancel_hours:number;notification_state:string|null}
export type Appointment={id:string;clinic_id:string;provider_id:string;client_user_id:string|null;patient_id:string|null;contact_name:string;contact_dni:string;contact_email:string;contact_phone:string;starts_at:string;ends_at:string;kind:'consultation'|'block';source:'web'|'staff';status:AppointmentStatus;private_notes:string;version:number;notification_state:string|null}
export type StaffAppointmentInput={provider_id:string;client_user_id?:string|null;starts_at:string;duration_minutes:number;kind:'consultation'|'block';status:AppointmentStatus;name:string;dni:string;email:string;phone:string;notes:string}

async function rpc<T>(name:string,args:Record<string,unknown>={}) {
  const {data,error}=await database().rpc(name,args)
  if(error)throw error
  return data as T
}
export const getClientProfile=()=>rpc<ClientProfile|null>('get_patient_account')
export const saveClientProfile=(name:string,dni:string,phone:string,slug?:string)=>rpc<ClientProfile>('save_patient_account',{p_name:name,p_dni:dni,p_phone:phone,p_slug:slug||null})
export const searchRegisteredPatients=(clinicId:string,query='')=>rpc<ClientProfile[]>('search_registered_patients',{p_clinic_id:clinicId,p_query:query})
export const getBookingPages=()=>rpc<BookingPage[]>('list_booking_pages')
export const getSlots=(slug:string,date:string)=>rpc<string[]>('get_booking_slots',{p_slug:slug,p_date:date})
export const getMyAppointments=()=>rpc<MyAppointment[]>('get_my_appointments')
export const getPractitioners=(clinicId:string)=>rpc<Practitioner[]>('list_practitioners',{p_clinic_id:clinicId})
export const getTeam=(clinicId:string)=>rpc<TeamMember[]>('list_team',{p_clinic_id:clinicId})
export const getAgenda=(clinicId:string,from:string,to:string)=>rpc<Appointment[]>('list_agenda',{p_clinic_id:clinicId,p_from:from,p_to:to})
export async function getBookingSettings(clinicId:string) {
  const [settings,hours,practitioners]=await Promise.all([
    database().from('booking_settings').select('*').eq('clinic_id',clinicId).single(),
    database().from('booking_hours').select('weekday,opens,closes').eq('clinic_id',clinicId).order('weekday').order('opens'),
    getPractitioners(clinicId),
  ])
  if(settings.error)throw settings.error
  if(hours.error)throw hours.error
  return {settings:settings.data as BookingSettings,hours:hours.data as OpeningHours[],practitioners}
}
export const saveBookingSettings=(settings:BookingSettings,hours:OpeningHours[])=>rpc<void>('save_booking_settings',{p_clinic_id:settings.clinic_id,p_version:settings.version,p_data:settings,p_hours:hours})

export async function serverRequest(path:string,body:Record<string,unknown>,method='POST') {
  const {data:{session}}=await database().auth.getSession()
  if(!session)throw new Error('UNAUTHORIZED')
  const response=await fetch(path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)})
  const result=await response.json().catch(()=>({error:'La API no está disponible. Revisá el despliegue o reiniciá el servidor local.'}))
  if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'No se pudo completar la solicitud.')
  return result
}
export async function sendAppointmentNotices(id?:string) {
  try {return await serverRequest('/api/notifications',id?{appointment_id:id}:{}) as {configured:boolean;sent:number;failed:number}}
  catch {return {configured:false,sent:0,failed:1}}
}
export async function bookAppointment(slug:string,start:string) {
  const id=await rpc<string>('book_appointment',{p_slug:slug,p_starts_at:start})
  const notification=await sendAppointmentNotices(id)
  return {id,notification}
}
export async function changeMyAppointment(appointment:MyAppointment,start:string|null) {
  await rpc<void>('change_my_appointment',{p_id:appointment.id,p_version:appointment.version,p_starts_at:start})
  await sendAppointmentNotices(appointment.id)
}
export async function saveStaffAppointment(clinicId:string,appointment:Appointment|null,data:StaffAppointmentInput) {
  const id=await rpc<string>('save_staff_appointment',{p_clinic_id:clinicId,p_id:appointment?.id||null,p_version:appointment?.version||0,p_data:data})
  await sendAppointmentNotices(id)
  return id
}

export function bookingError(error:unknown) {
  const item=error as {message?:string;code?:string}
  const message=item?.message||''
  const named:Record<string,string>={
    SLOT_UNAVAILABLE:'Ese horario ya no está disponible. Elegí otro.',BOOKING_CLOSED:'La agenda web está cerrada por el momento.',
    PROFILE_REQUIRED:'Completá tus datos de paciente antes de reservar.',EMAIL_NOT_VERIFIED:'Verificá tu correo antes de continuar.',
    BOOKING_LIMIT:'Podés tener hasta tres turnos futuros confirmados en el mismo consultorio.',
    BOOKING_RATE_LIMIT:'Realizaste varios cambios seguidos. Esperá una hora o contactá al consultorio.',
    CHANGE_DEADLINE:'Ya venció el plazo para cambiar este turno por la web. Contactá al consultorio.',
    DNI_IMMUTABLE:'El DNI no se puede cambiar desde el portal. Contactá al consultorio si hay un error.',
    OVERLAPPING_HOURS:'Las franjas horarias del mismo día no pueden superponerse.',
    FUTURE_ATTENDANCE:'No se puede marcar como atendido o ausente un turno futuro.',
    PARTICIPANT_IMMUTABLE:'No se puede cambiar la identidad del paciente de una reserva web. Cancelala y creá otro turno si corresponde.',
  }
  for(const [code,text] of Object.entries(named))if(message.includes(code))return text
  if(item?.code==='23P01')return 'Ese horario se superpone con otro turno o bloqueo. Actualizá la agenda y elegí otro.'
  if(item?.code==='23505')return 'No se pudieron guardar datos duplicados. Revisá el DNI o el enlace público; si el problema continúa, contactá al consultorio.'
  if(error instanceof Error&&!item.code&&message&&!['Failed to fetch','UNAUTHORIZED'].includes(message))return message
  return errorMessage(error)
}

function parts(date:Date,timezone:string) {
  const items=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date)
  return Object.fromEntries(items.map((part)=>[part.type,part.value]))
}
export function dateInZone(value:string|Date=new Date(),timezone=defaultTimezone) {
  const p=parts(new Date(value),timezone);return `${p.year}-${p.month}-${p.day}`
}
export function localDateTime(value:string,timezone=defaultTimezone) {
  const p=parts(new Date(value),timezone);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
export function zonedInstant(local:string,timezone=defaultTimezone) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw new Error('Ingresá una fecha y hora válidas.')
  const expected=Date.parse(`${local}:00Z`)
  if(!Number.isFinite(expected))throw new Error('Ingresá una fecha y hora válidas.')
  let instant=expected
  for(let i=0;i<3;i++) {
    const p=parts(new Date(instant),timezone)
    const represented=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)
    instant+=expected-represented
  }
  if(localDateTime(new Date(instant).toISOString(),timezone)!==local)throw new Error('Esa hora no existe en la zona horaria del consultorio.')
  return new Date(instant).toISOString()
}
export function plusDays(date:string,days:number) {return new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10)}
export function weekStart(date:string) {return plusDays(date,-((new Date(`${date}T12:00:00Z`).getUTCDay()+6)%7))}
export function displayTime(value:string,timezone=defaultTimezone) {return new Date(value).toLocaleTimeString('es-AR',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}
export const statusLabels:Record<AppointmentStatus,string>={confirmed:'Confirmado',cancelled:'Cancelado',completed:'Atendido',no_show:'Ausente'}
