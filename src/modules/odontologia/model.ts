import type { ClinicalMetadata, PatientIdentity } from '../../core/types'
import { blankIdentity } from '../../core/types'
import { today, validDate } from '../../core/format'
import { dniError, phoneError } from '../../lib/validation'

export const conditions = [
  {id:'healthy',label:'Sano · evaluado sin hallazgos',symbol:'✓',color:'#2b8753',target:'tooth',kind:'Hallazgo'},
  {id:'caries',label:'Caries',symbol:'C',color:'#cc4242',target:'surface',kind:'Hallazgo'},
  {id:'resin',label:'Resina',symbol:'R',color:'#405ed6',target:'surface',kind:'Tratamiento existente'},
  {id:'amalgam',label:'Amalgama',symbol:'A',color:'#252525',target:'surface',kind:'Tratamiento existente'},
  {id:'crown_fit',label:'Corona adaptada',symbol:'CA',color:'#405ed6',target:'tooth',kind:'Tratamiento existente'},
  {id:'crown_unfit',label:'Corona desadaptada',symbol:'CD',color:'#cc4242',target:'tooth',kind:'Hallazgo'},
  {id:'prosthesis',label:'Prótesis',symbol:'P',color:'#405ed6',target:'tooth',kind:'Tratamiento existente'},
  {id:'prosthesis_plan',label:'Prótesis indicada',symbol:'PI',color:'#cc4242',target:'tooth',kind:'Indicación pendiente'},
  {id:'sealant',label:'Sellante',symbol:'S',color:'#405ed6',target:'surface',kind:'Tratamiento existente'},
  {id:'sealant_plan',label:'Sellante indicado',symbol:'SI',color:'#cc4242',target:'surface',kind:'Indicación pendiente'},
  {id:'endodontic',label:'Con endodoncia',symbol:'E',color:'#405ed6',target:'tooth',kind:'Tratamiento existente'},
  {id:'necrosis',label:'Necrosis pulpar',symbol:'NP',color:'#cc4242',target:'tooth',kind:'Hallazgo'},
  {id:'extraction_plan',label:'Extracción indicada',symbol:'XI',color:'#cc4242',target:'tooth',kind:'Indicación pendiente'},
  {id:'recession',label:'Recesión gingival',symbol:'RG',color:'#bc6680',target:'tooth',kind:'Hallazgo'},
  {id:'absent',label:'Clínicamente ausente',symbol:'×',color:'#888f97',target:'tooth',kind:'Hallazgo'},
] as const
export type Condition = typeof conditions[number]['id']
export type Face = 'all'|'vestibular'|'inner'|'mesial'|'distal'|'center'
export const surfaceKeys: Face[] = ['vestibular','inner','mesial','distal','center']
export type DentitionView = 'mixed'|'permanent'|'temporary'
export const quadrants = [
  {n:1,name:'Superior derecha · permanente',ids:[18,17,16,15,14,13,12,11]},
  {n:2,name:'Superior izquierda · permanente',ids:[21,22,23,24,25,26,27,28]},
  {n:5,name:'Superior derecha · temporal',ids:[55,54,53,52,51]},
  {n:6,name:'Superior izquierda · temporal',ids:[61,62,63,64,65]},
  {n:8,name:'Inferior derecha · temporal',ids:[85,84,83,82,81]},
  {n:7,name:'Inferior izquierda · temporal',ids:[71,72,73,74,75]},
  {n:4,name:'Inferior derecha · permanente',ids:[48,47,46,45,44,43,42,41]},
  {n:3,name:'Inferior izquierda · permanente',ids:[31,32,33,34,35,36,37,38]},
]
export const teeth = quadrants.flatMap(q=>q.ids)
export type Mark = {id:string;tooth:number;condition:Condition;faces:Face[];note:string}
export type Odontogram = {id:string;date:string;legendVersion:1;view:DentitionView;notes:string;marks:Mark[];authorId?:string;authorName?:string;recordedAt?:string}
export type Treatment = {id:string;tooth:number|null;description:string;status:'pending'|'in_progress'|'completed';date:string;completedDate:string}
export type DentalEvolution = {id:string;date:string;procedure:string}
export type DentalRecord = {
  patient:PatientIdentity&{date:string;reason:string;allergies:string;medication:string;medicalNotes:string;dentalNotes:string}
  clinical:{odontograms:Odontogram[];treatmentPlan:Treatment[]}
  evolutions:DentalEvolution[]
}
export type SavedDentalRecord = DentalRecord&ClinicalMetadata&{id:string;version:number;updatedAt:string}
export const blankDentalRecord = ():DentalRecord=>({patient:{...blankIdentity(),date:today(),reason:'',allergies:'',medication:'',medicalNotes:'',dentalNotes:''},clinical:{odontograms:[],treatmentPlan:[]},evolutions:[]})
export const blankOdontogram = ():Odontogram=>({id:crypto.randomUUID(),date:today(),legendVersion:1,view:'mixed',notes:'',marks:[]})
export function continueOdontogram(previous?:Odontogram):Odontogram {
  const next=blankOdontogram()
  return previous?{...next,view:previous.view,notes:previous.notes,marks:structuredClone(previous.marks)}:next
}
export const odontogramContent=(control:Odontogram)=>JSON.stringify({date:control.date,notes:control.notes,marks:control.marks})
export const conditionInfo = (id:Condition)=>conditions.find(c=>c.id===id)!
export const expandFaces = (faces:Face[])=>faces.includes('all')?surfaceKeys.slice():faces.slice()
export function faceLabel(face:Face,tooth:number) { return {all:'Pieza completa',vestibular:'Vestibular',inner:[1,2,5,6].includes(Math.floor(tooth/10))?'Palatina':'Lingual',mesial:'Mesial',distal:'Distal',center:tooth%10<=3?'Incisal':'Oclusal'}[face] }
export function surfacePositions(tooth:number):Record<'top'|'bottom'|'left'|'right'|'center',Face> {
  const q=Math.floor(tooth/10),upper=[1,2,5,6].includes(q),right=[1,4,5,8].includes(q)
  return {top:upper?'vestibular':'inner',bottom:upper?'inner':'vestibular',left:right?'distal':'mesial',right:right?'mesial':'distal',center:'center'}
}
export function removeFaces(marks:Mark[],tooth:number,faces:Face[]) {
  return marks.flatMap(mark=>{if(mark.tooth!==tooth||conditionInfo(mark.condition).target!=='surface')return [mark];const keep=expandFaces(mark.faces).filter(f=>!faces.includes(f));return keep.length?[{...mark,faces:keep.sort()}]:[]})
}
export function paintMark(marks:Mark[],tooth:number,condition:Condition,faces:Face[],note=''):Mark[] {
  const c=conditionInfo(condition)
  if(!c||!teeth.includes(tooth)||!faces.length||faces.some(f=>!['all',...surfaceKeys].includes(f)))throw new Error('Seleccioná una pieza y caras válidas.')
  if(note.length>500)throw new Error('El detalle admite hasta 500 caracteres.')
  const same=marks.filter(m=>m.tooth===tooth)
  if((condition==='healthy'&&same.some(m=>m.condition!=='healthy'))||(condition!=='healthy'&&same.some(m=>m.condition==='healthy')))throw new Error('La pieza está marcada sana o tiene otros registros. Revisá las marcas antes de cambiar su estado.')
  const selected=c.target==='tooth'?['all'] as Face[]:expandFaces(faces)
  if(c.target==='tooth'&&same.some(m=>m.condition===condition))return marks
  if(c.target==='surface'&&selected.every(f=>same.some(m=>m.condition===condition&&m.note===note&&expandFaces(m.faces).includes(f))))return marks
  const next=c.target==='surface'?removeFaces(marks,tooth,selected):marks.slice()
  const merge=c.target==='surface'?next.find(m=>m.tooth===tooth&&m.condition===condition&&m.note===note):undefined
  if(merge)return next.map(m=>m===merge?{...m,faces:[...new Set(expandFaces(m.faces).concat(selected))].sort()}:m)
  return [...next,{id:crypto.randomUUID(),tooth,condition,faces:selected,note:note.trim()}]
}
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v))
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const text=(v:unknown,max=2000)=>typeof v==='string'&&v.length<=max
export function validateOdontogram(value:unknown,birthDate='',reference=today()):string {
  if(!object(value)||!uuid(value.id)||!validDate(value.date as string)||(value.date as string)>reference||(birthDate&&(value.date as string)<birthDate))return 'Revisá la fecha del odontograma.'
  if(value.legendVersion!==1||!['mixed','permanent','temporary'].includes(value.view as string)||!text(value.notes)||!Array.isArray(value.marks)||value.marks.length>520)return 'El odontograma tiene una estructura o leyenda no válida.'
  if(!value.marks.length&&!(value.notes as string).trim())return 'Agregá una marca o una observación al odontograma.'
  const ids=new Set<string>(),occupied=new Set<string>(),healthy=new Set<number>(),other=new Set<number>()
  for(const m of value.marks){
    if(!object(m)||!uuid(m.id)||ids.has(m.id as string)||!teeth.includes(m.tooth as number)||!conditions.some(c=>c.id===m.condition)||!Array.isArray(m.faces)||!m.faces.length||m.faces.length>5||new Set(m.faces).size!==m.faces.length||m.faces.some(f=>!['all',...surfaceKeys].includes(f))||(m.faces.includes('all')&&m.faces.length!==1)||!text(m.note,500))return 'Revisá las piezas, caras y detalles del odontograma.'
    ids.add(m.id as string)
    const c=conditionInfo(m.condition as Condition),tooth=m.tooth as number
    if(c.target==='tooth'&&JSON.stringify(m.faces)!=='["all"]')return 'Ese símbolo debe aplicarse a la pieza completa.'
    const keys=c.target==='surface'?expandFaces(m.faces as Face[]).map(f=>`${tooth}:${f}`):[`${tooth}:${c.id}`]
    if(keys.some(k=>occupied.has(k)))return 'Hay marcas de superficie superpuestas o repetidas en el mismo control.'
    keys.forEach(k=>occupied.add(k));(c.id==='healthy'?healthy:other).add(tooth)
  }
  if([...healthy].some(t=>other.has(t)))return 'Una pieza sana no puede tener otro registro en el mismo control.'
  return ''
}
export function validateDentalRecord(value:unknown,reference=today()):string {
  if(!object(value)||!object(value.patient)||!object(value.clinical)||!Array.isArray(value.evolutions))return 'La ficha odontológica no tiene una estructura válida.'
  const p=value.patient,c=value.clinical
  if(!text(p.fullName,200)||(p.fullName as string).trim().length<2)return 'Completá el nombre y apellido del paciente.'
  if(!validDate(p.date as string)||(p.date as string)>reference)return 'Revisá la fecha de apertura de la ficha.'
  if(!text(p.birthDate,10)||(p.birthDate&&(!validDate(p.birthDate as string)||(p.birthDate as string)>(p.date as string))))return 'Revisá la fecha de nacimiento.'
  for(const key of ['reason','allergies','medication','medicalNotes','dentalNotes'])if(!text(p[key]))return 'Los antecedentes y observaciones admiten hasta 2.000 caracteres por campo.'
  for(const key of ['dni','historyNumber','address','phone','mobile','insurance','occupation','emergencyContact','emergencyPhone'])if(!text(p[key],key==='historyNumber'?40:200))return 'Revisá los datos administrativos del paciente.'
  if(dniError(p.dni as string))return dniError(p.dni as string)
  for(const key of ['phone','mobile','emergencyPhone'])if(phoneError(p[key] as string))return phoneError(p[key] as string)
  if(!Array.isArray(c.odontograms)||c.odontograms.length>100||!Array.isArray(c.treatmentPlan)||c.treatmentPlan.length>500||value.evolutions.length>500)return 'La ficha supera el límite de controles o consultas.'
  const controls=new Set<string>()
  for(const control of c.odontograms){const error=validateOdontogram(control,p.birthDate as string,reference);if(error)return error;if(controls.has(control.id))return 'Hay controles odontológicos repetidos.';controls.add(control.id)}
  const ids=new Set<string>()
  for(const e of value.evolutions){if(!object(e)||!uuid(e.id)||ids.has(e.id as string)||!validDate(e.date as string)||(e.date as string)>reference||(p.birthDate&&(e.date as string)<(p.birthDate as string))||!text(e.procedure,20000)||!(e.procedure as string).trim())return 'Cada consulta necesita una fecha válida y un procedimiento.';ids.add(e.id as string)}
  ids.clear()
  for(const t of c.treatmentPlan){if(!object(t)||!uuid(t.id)||ids.has(t.id as string)||(t.tooth!==null&&!teeth.includes(t.tooth as number))||!text(t.description)||!(t.description as string).trim()||!['pending','in_progress','completed'].includes(t.status as string)||!validDate(t.date as string)||(t.date as string)>reference||(p.birthDate&&(t.date as string)<(p.birthDate as string))||!text(t.completedDate,10))return 'Revisá las piezas, fechas y procedimientos del plan de tratamiento.';if(t.status==='completed'?(!validDate(t.completedDate as string)||(t.completedDate as string)<(t.date as string)||(t.completedDate as string)>reference):t.completedDate!=='')return 'Completá una fecha de realización válida solo para tratamientos realizados.';ids.add(t.id as string)}
  return ''
}
