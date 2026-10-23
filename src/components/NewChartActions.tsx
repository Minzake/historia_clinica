import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Check,Plus } from 'lucide-react'
import { newChartUrl } from '../core/specialties'

type Props = {
  specialties: readonly {id:string;name:string}[]
  value:string
  onChange:(value:string)=>void
}

export function NewChartActions({specialties,value,onChange}:Props) {
  const name=useId()
  if(!specialties.length)return null
  return <div className="new-chart-actions">
    {specialties.length>1&&<fieldset className="specialty-choice" aria-label="Especialidad de la nueva ficha">
      <legend>Especialidad de la ficha</legend>
      <div className="specialty-options">{specialties.map(specialty=><label className="specialty-option" key={specialty.id}>
        <input className="sr-only" type="radio" name={name} value={specialty.id} checked={value===specialty.id} onChange={()=>onChange(specialty.id)}/>
        <span><Check size={14} aria-hidden="true"/><span>{specialty.name}</span></span>
      </label>)}</div>
    </fieldset>}
    <Link className="primary-button" to={newChartUrl(value)}><Plus size={17} aria-hidden="true"/>Nuevo paciente</Link>
  </div>
}
