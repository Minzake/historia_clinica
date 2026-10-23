import { useId } from 'react'
import { Field,TextAreaField } from '../../components/ui'
import { today } from '../../core/format'
import type { DentalRecord } from './model'

type Patient=DentalRecord['patient']
export function DentalInitialFields({patient,onChange,disabled}:{patient:Patient;onChange:(key:keyof Patient,value:string)=>void;disabled:boolean}) {
  const id=useId()
  return <fieldset disabled={disabled} className="settings-fields dental-initial">
    <section className="dental-form-section" aria-labelledby={`${id}-identity`}>
      <header><h2 id={`${id}-identity`}>Identificación del paciente</h2><p>Datos compartidos con el directorio de pacientes.</p></header>
      <div className="dental-identity-grid">
        <Field label="Apellido y nombre" required minLength={2} maxLength={200} autoComplete="name" value={patient.fullName} onChange={value=>onChange('fullName',value)}/>
        <Field label="DNI" maxLength={16} inputMode="numeric" value={patient.dni} onChange={value=>onChange('dni',value)}/>
        <Field label="Fecha de nacimiento" type="date" max={patient.date||today()} value={patient.birthDate} onChange={value=>onChange('birthDate',value)}/>
        <Field label="Celular" type="tel" maxLength={40} autoComplete="tel" value={patient.mobile} onChange={value=>onChange('mobile',value)}/>
        <Field label="Historia clínica N.º" maxLength={40} placeholder="Automático al guardar" value={patient.historyNumber} onChange={value=>onChange('historyNumber',value)}/>
        <Field label="Fecha de apertura odontológica" required type="date" min={patient.birthDate||undefined} max={today()} value={patient.date} onChange={value=>onChange('date',value)}/>
      </div>
    </section>
    <section className="dental-form-section" aria-labelledby={`${id}-history`}>
      <header><h2 id={`${id}-history`}>Consulta y antecedentes</h2><p>Información clínica propia de odontología.</p></header>
      <TextAreaField label="Motivo de consulta" rows={2} maxLength={2000} value={patient.reason} onChange={event=>onChange('reason',event.target.value)}/>
      <div className="dental-history-grid">
        {([{key:'allergies',label:'Alergias'},{key:'medication',label:'Medicación actual'},{key:'medicalNotes',label:'Antecedentes de salud relevantes'},{key:'dentalNotes',label:'Antecedentes y evaluación odontológica'}] as const).map(field=><TextAreaField key={field.key} label={field.label} rows={2} maxLength={2000} value={patient[field.key]} onChange={event=>onChange(field.key,event.target.value)}/>)}
      </div>
    </section>
  </fieldset>
}
