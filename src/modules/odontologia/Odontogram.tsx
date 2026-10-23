import { useRef, useState } from 'react'
import { Field, Notice, SelectField, TextAreaField } from '../../components/ui'
import { today } from '../../core/format'
import { conditions, conditionInfo, expandFaces, faceLabel, paintMark, quadrants, removeFaces, surfacePositions } from './model'
import type { Condition, DentitionView, Face, Mark, Odontogram } from './model'

const paths={top:'M9.4 9.4 A22 22 0 0 1 40.6 9.4 L32 18 A10 10 0 0 0 18 18 Z',bottom:'M40.6 40.6 A22 22 0 0 1 9.4 40.6 L18 32 A10 10 0 0 0 32 32 Z',left:'M9.4 40.6 A22 22 0 0 1 9.4 9.4 L18 18 A10 10 0 0 0 18 32 Z',right:'M40.6 9.4 A22 22 0 0 1 40.6 40.6 L32 32 A10 10 0 0 0 32 18 Z',center:'M35 25 A10 10 0 1 0 15 25 A10 10 0 1 0 35 25 Z'}
const coordinates={top:[25,12],bottom:[25,41],left:[10,27],right:[40,27],center:[25,27]}
export function Tooth({tooth,marks,large=false,onPaint}:{tooth:number;marks:Mark[];large?:boolean;onPaint?:(face:Face)=>void}) {
  const positions=surfacePositions(tooth)
  return <svg viewBox="0 0 50 50" aria-hidden={!large||undefined} role={large?'group':undefined} aria-label={large?`Caras de la pieza ${tooth}`:undefined}>
    {(Object.keys(paths) as (keyof typeof paths)[]).map(position=>{
      const face=positions[position],mark=marks.find(m=>conditionInfo(m.condition).target==='surface'&&expandFaces(m.faces).includes(face))
      const label=faceLabel(face,tooth),short=face==='inner'?label.slice(0,1):face==='center'?label.slice(0,1):label.slice(0,1)
      return <g key={position}><path d={paths[position]} data-surface={face} fill={mark?conditionInfo(mark.condition).color:'#fff'} stroke="#718478" strokeWidth=".8" className={onPaint?'dental-paintable':undefined} role={onPaint?'button':undefined} tabIndex={onPaint?0:undefined} aria-label={onPaint?`${label} de la pieza ${tooth}: ${mark?conditionInfo(mark.condition).label:'sin marca'}`:undefined} onClick={onPaint?()=>onPaint(face):undefined} onKeyDown={onPaint?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPaint(face)}}:undefined}><title>{label}</title></path>{large&&<text pointerEvents="none" x={coordinates[position][0]} y={coordinates[position][1]} textAnchor="middle" fontSize="5" fontWeight="600" fill={mark?'#fff':'#374a40'}>{short}</text>}</g>
    })}
    <circle pointerEvents="none" cx="25" cy="25" r="22" fill="none" stroke="#718478" strokeWidth="1"/>
    <g pointerEvents="none">{marks.filter(m=>conditionInfo(m.condition).target==='tooth').map(m=>{
      const c=conditionInfo(m.condition)
      if(c.id==='healthy')return <path key={m.id} d="M14 25L22 33L37 17" fill="none" stroke={c.color} strokeWidth="4"/>
      if(c.id==='absent')return <g key={m.id}><circle cx="25" cy="25" r="20" fill={c.color}/><path d="M14 25H36" stroke="white" strokeWidth="3"/></g>
      if(c.id==='extraction_plan')return <path key={m.id} d="M10 10L40 40M40 10L10 40" fill="none" stroke={c.color} strokeWidth="3"/>
      if(c.id==='crown_fit'||c.id==='crown_unfit')return <path key={m.id} d="M8 19L14 28L25 16L36 28L42 19L39 37L11 37Z" fill="none" stroke={c.color} strokeWidth="2.5"/>
      if(c.id==='endodontic'||c.id==='necrosis')return <path key={m.id} d="M14 39L36 11" stroke={c.color} strokeWidth="3"/>
      if(c.id==='prosthesis'||c.id==='prosthesis_plan')return <path key={m.id} d="M9 22H41M9 29H41" stroke={c.color} strokeWidth="2.5"/>
      return <text key={m.id} x="25" y="30" fill={c.color} textAnchor="middle" fontSize="10" fontWeight="bold">{c.symbol}</text>
    })}</g>
  </svg>
}

export function OdontogramBoard({value,onChange,birthDate='',disabled=false}:{value:Odontogram;onChange?:(value:Odontogram)=>void;birthDate?:string;disabled?:boolean}) {
  const [selected,setSelected]=useState(value.view==='temporary'?55:36),[condition,setCondition]=useState<Condition>('caries')
  const [eraser,setEraser]=useState(false),[error,setError]=useState(''),[undo,setUndo]=useState<Mark[][]>([])
  const [view,setView]=useState(value.view)
  const heading=useRef<HTMLHeadingElement>(null),readonly=!onChange||disabled,c=conditionInfo(condition)
  const selectedMarks=value.marks.filter(m=>m.tooth===selected)
  const visible=quadrants.filter(q=>view==='mixed'||(view==='permanent'?q.n<5:q.n>4))
  function changeMarks(marks:Mark[]) { if(readonly||marks===value.marks||JSON.stringify(marks)===JSON.stringify(value.marks))return;setUndo(current=>[...current.slice(-29),structuredClone(value.marks)]);onChange?.({...value,marks});setError('') }
  function paint(face:Face) {
    if(readonly)return
    try {
      if(eraser){changeMarks(removeFaces(value.marks,selected,[face]));return}
      changeMarks(paintMark(value.marks,selected,condition,[face]))
    } catch(err){setError((err as Error).message)}
  }
  function choose(id:Condition){setCondition(id);setEraser(false);setError('')}
  function selectTooth(tooth:number) { setSelected(tooth);setError('');if(heading.current){heading.current.focus({preventScroll:true});if(heading.current.getBoundingClientRect().top>window.innerHeight-150)heading.current.scrollIntoView({behavior:'smooth',block:'start'})} }
  return <div className="dental-board">
    <div className="field-grid settings-contact-grid"><Field label="Fecha del odontograma" type="date" min={birthDate||undefined} max={today()} required value={value.date} disabled={readonly} onChange={date=>onChange?.({...value,date})}/><SelectField label="Dentición visible" value={view} disabled={disabled} onChange={e=>{const view=e.target.value as DentitionView;setView(view);const allowed=quadrants.filter(q=>view==='mixed'||(view==='permanent'?q.n<5:q.n>4)).flatMap(q=>q.ids);if(!allowed.includes(selected))setSelected(allowed[0]);if(onChange)onChange({...value,view})}}><option value="mixed">Mixta · permanentes y temporales</option><option value="permanent">Permanente · 32 piezas</option><option value="temporary">Temporal · 20 piezas</option></SelectField></div>
    <p className="section-subtitle">Derecha del paciente a la izquierda del mapa. Una pieza sin marcas está sin evaluar.</p>
    <div className="dental-quadrants">{visible.map(q=><section className="dental-quadrant" key={q.n} aria-label={q.name}><h3>{q.name}</h3><div className={`dental-teeth ${q.n>4?'temporary':''}`}>{q.ids.map(tooth=>{
      const marks=value.marks.filter(m=>m.tooth===tooth)
      return <button key={tooth} type="button" data-tooth={tooth} className={`dental-tooth ${selected===tooth?'selected':''}`} aria-pressed={selected===tooth} aria-label={`Pieza ${tooth}: ${marks.length?marks.map(m=>`${conditionInfo(m.condition).label}, ${m.faces.map(f=>faceLabel(f,tooth)).join(', ')}`).join('; '):'sin evaluar'}`} onClick={()=>selectTooth(tooth)}><strong>{tooth}</strong><Tooth tooth={tooth} marks={marks}/><small>{marks.length?`${marks.length} reg.`:'·'}</small></button>
    })}</div></section>)}</div>
    <section className="dental-selection"><h3 ref={heading} tabIndex={-1}>Pieza {selected}</h3><div className="dental-paint-workspace"><div className="dental-large-tooth"><Tooth tooth={selected} marks={selectedMarks} large onPaint={!readonly?paint:undefined}/><p>{quadrants.find(q=>q.ids.includes(selected))?.name}</p></div><div>{!readonly?<><h3>{!eraser&&c.target==='tooth'?'Marcar la pieza completa':'Pintar cada cara'}</h3><div className="dental-brushes" role="group" aria-label="Pinceles y borrador">{(['caries','resin','amalgam'] as Condition[]).map(id=><button key={id} type="button" aria-pressed={!eraser&&condition===id} onClick={()=>choose(id)}><span style={{background:conditionInfo(id).color}}/>{conditionInfo(id).label}</button>)}<button type="button" aria-pressed={eraser} onClick={()=>{setEraser(true);setError('')}}>Borrador · una cara</button></div><button className="secondary-button" type="button" disabled={!undo.length} onClick={()=>{const previous=undo.at(-1);if(previous){onChange?.({...value,marks:previous});setUndo(undo.slice(0,-1));setError('')}}}>Deshacer última marca</button><p className="dental-tool-hint" aria-live="polite">{eraser?'Borrador: tocá la cara que querés limpiar.':`${c.label}: ${c.target==='tooth'?'tocá cualquier parte del diente para marcar la pieza completa.':'tocá la cara que querés pintar.'}`}</p><p className="section-subtitle">También podés usar Enter o espacio. Repintar una cara conserva las demás.</p></>:<p className="section-subtitle">Seleccioná una pieza del mapa para ampliar sus marcas y ver los registros de cada cara.</p>}</div></div>
    {error&&<Notice>{error}</Notice>}</section>
    <details className="dental-legend"><summary>{readonly?'Leyenda de símbolos':'Más símbolos y tratamientos'}</summary><div>{conditions.map(item=><button type="button" disabled={readonly} key={item.id} aria-pressed={readonly?undefined:!eraser&&condition===item.id} onClick={()=>{choose(item.id);heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({behavior:'smooth',block:'nearest'})}}><span style={{color:item.color}}>{item.symbol}</span>{item.label}</button>)}</div><p className="section-subtitle">El registro conserva el significado, la pieza y las caras, además del color. Las indicaciones pendientes se distinguen de tratamientos existentes.</p></details>
    <div className="dental-marks">{value.marks.map(mark=><article key={mark.id}><span style={{color:conditionInfo(mark.condition).color}}>{conditionInfo(mark.condition).symbol}</span><div><strong>Pieza {mark.tooth} · {conditionInfo(mark.condition).label}</strong><p>{mark.faces.map(f=>faceLabel(f,mark.tooth)).join(', ')} · {conditionInfo(mark.condition).kind}</p>{mark.note&&<p>{mark.note}</p>}</div>{!readonly&&<button type="button" className="text-button" aria-label={`Quitar ${conditionInfo(mark.condition).label} de la pieza ${mark.tooth}`} onClick={()=>changeMarks(value.marks.filter(m=>m.id!==mark.id))}>Quitar</button>}</article>)}</div>
    <TextAreaField label="Observaciones del odontograma" rows={3} maxLength={2000} value={value.notes} disabled={readonly} onChange={e=>onChange?.({...value,notes:e.target.value})}/>
    {value.authorName&&<p className="section-subtitle">Registrado por {value.authorName}{value.recordedAt?` · ${new Date(value.recordedAt).toLocaleString('es-AR')}`:''} · Leyenda {value.legendVersion}</p>}
  </div>
}
