import { useEffect,useLayoutEffect,useRef,useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { CalendarDays } from 'lucide-react'
import { dateInputDisplay,parseDateInput } from '../core/format'

type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'>&{value:string;onChange?:(value:string)=>void;type:'date'|'datetime-local';label:string;validationMessage:string}

function displayInput(raw:string,withTime:boolean) {
  if(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(raw))return dateInputDisplay(raw,withTime)
  if(!/^[\d/ :]*$/.test(raw))return raw
  const [date,time]=raw.split(' '),groups=date.split('/')
  if(groups.length>1&&(groups[0].length<2||groups[1].length<2))return raw
  if(time?.includes(':')&&time.split(':')[0].length<2)return raw
  const digits=raw.replace(/\D/g,'').slice(0,withTime?12:8)
  let text=digits.slice(0,2)
  if(digits.length>2)text+=`/${digits.slice(2,4)}`
  if(digits.length>4)text+=`/${digits.slice(4,8)}`
  if(withTime&&digits.length>8)text+=` ${digits.slice(8,10)}`
  if(withTime&&digits.length>10)text+=`:${digits.slice(10,12)}`
  return text
}

export function DateInput({value,onChange,type,label,validationMessage,min,max,...props}:Props) {
  const withTime=type==='datetime-local',lastEmitted=useRef(value)
  const [display,setDisplay]=useState(()=>dateInputDisplay(value,withTime))
  const input=useRef<HTMLInputElement>(null),picker=useRef<HTMLInputElement>(null)
  const pendingCaret=useRef<number|null>(null)
  const parsed=parseDateInput(display,withTime),minimum=String(min||''),maximum=String(max||'')
  const invalid=display&&!parsed?`Ingresá una fecha válida con formato DD/MM/AAAA${withTime?' HH:mm':''}.`:parsed&&minimum&&parsed<minimum?`La fecha mínima es ${dateInputDisplay(minimum,withTime)}.`:parsed&&maximum&&parsed>maximum?`La fecha máxima es ${dateInputDisplay(maximum,withTime)}.`:''
  useEffect(()=>{if(value!==lastEmitted.current){lastEmitted.current=value;setDisplay(dateInputDisplay(value,withTime))}},[value,withTime])
  useEffect(()=>{input.current?.setCustomValidity(invalid||validationMessage)},[invalid,validationMessage])
  useLayoutEffect(()=>{if(pendingCaret.current!==null){input.current?.setSelectionRange(pendingCaret.current,pendingCaret.current);pendingCaret.current=null}},[display])
  function change(raw:string,caret?:number|null) {
    const next=displayInput(raw,withTime),iso=parseDateInput(next,withTime)
    if(caret!==undefined&&caret!==null){
      if(next===raw)pendingCaret.current=caret
      else if(/^\d{4}-/.test(raw))pendingCaret.current=next.length
      else {const count=raw.slice(0,caret).replace(/\D/g,'').length;let digits=0,position=0;while(position<next.length&&digits<count){if(/\d/.test(next[position]))digits++;position++}pendingCaret.current=position}
    }
    setDisplay(next);lastEmitted.current=iso;onChange?.(iso)
  }
  return <div className="date-input-control">
    <input {...props} ref={input} type="text" inputMode="numeric" data-value-kind={type} min={min} max={max} placeholder={withTime?'DD/MM/AAAA HH:mm':'DD/MM/AAAA'} maxLength={withTime?16:10} value={display} onChange={event=>change(event.target.value,event.target.selectionStart)}/>
    <input ref={picker} type={type} className="date-calendar-input" data-calendar-picker="true" aria-hidden="true" tabIndex={-1} min={min} max={max} disabled={props.disabled||props.readOnly} value={parsed} onChange={event=>change(event.target.value)}/>
    <button className="date-calendar-button" type="button" aria-label="Abrir calendario" aria-description={label} disabled={props.disabled||props.readOnly} onClick={()=>{try{if(picker.current?.showPicker)picker.current.showPicker();else input.current?.focus()}catch{input.current?.focus()}}}><CalendarDays size={16} aria-hidden="true"/></button>
  </div>
}
