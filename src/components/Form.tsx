import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import type { FormHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { phoneError, validEmail } from '../lib/validation'

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
const FormErrors = createContext<Record<string, string>>({})
const isControl = (target: unknown): target is Control => target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement

function controlError(control: Control) {
  if (!control.willValidate) return ''
  const validity = control.validity
  if (validity.customError) return control.validationMessage
  if (validity.badInput) return 'Ingresá un número válido.'
  if (validity.valueMissing) return control.tagName === 'SELECT' ? 'Seleccioná una opción.' : 'Completá este campo.'
  if (control instanceof HTMLInputElement) {
    if (control.dataset.valueKind !== 'password' && control.required && !control.value.trim()) return 'Completá este campo.'
    if (control.type === 'email' && control.value && !validEmail(control.value)) return 'Ingresá un correo válido, por ejemplo nombre@correo.com.'
    if (control.type === 'tel' && control.value) return phoneError(control.value)
    if (validity.rangeUnderflow) return `El valor mínimo es ${control.min}.`
    if (validity.rangeOverflow) return `El valor máximo es ${control.max}.`
    if (validity.stepMismatch) return control.type === 'time' && Number(control.step) % 60 === 0 ? `Usá horarios en intervalos de ${Number(control.step) / 60} minutos.` : `Usá incrementos de ${control.step || '1'}.`
    if (validity.patternMismatch) return control.dataset.formatHint || 'Revisá el formato de este campo.'
  }
  if (validity.tooShort) return `Usá al menos ${(control as HTMLInputElement).minLength} caracteres.`
  if (validity.tooLong) return `Usá hasta ${(control as HTMLInputElement).maxLength} caracteres.`
  // Also check controlled values and pasted content in browsers that do not flag tooShort.
  if (control.tagName !== 'SELECT') {
    const text = control as HTMLInputElement | HTMLTextAreaElement
    const length = text.dataset.valueKind === 'password' ? text.value.length : text.value.trim().length
    if (text.minLength > 0 && text.value && length < text.minLength) return `Usá al menos ${text.minLength} caracteres.`
    if (text.maxLength > 0 && text.value.length > text.maxLength) return `Usá hasta ${text.maxLength} caracteres.`
  }
  return validity.valid ? '' : 'Revisá el valor de este campo.'
}

export function Form({ children, onSubmit, validateFields = true, ...props }: FormHTMLAttributes<HTMLFormElement> & { validateFields?: boolean }) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const prefix = useId()
  useEffect(() => {
    if (pendingFocus.current) {
      document.getElementById(pendingFocus.current)?.focus()
      pendingFocus.current = null
    }
  }, [errors])
  function collect() {
    const next: Record<string, string> = {}
    Array.from(form.current?.elements || []).forEach((element, index) => {
      if (!isControl(element)) return
      const error = controlError(element)
      if (!element.id) element.id = `${prefix}-${index}`
      if (error) next[element.id] = error
    })
    return next
  }
  function refresh(control?: Control) {
    const next = collect()
    if (submitted) setErrors(next)
    else setErrors(current => Object.fromEntries(
      [...new Set([...Object.keys(current), ...(control ? [control.id] : [])])]
        .filter(id => next[id]).map(id => [id, next[id]])
    ))
  }
  const entries = Object.entries(errors)
  return <FormErrors.Provider value={errors}><form {...props} ref={form} noValidate
    onBlurCapture={event => {
      // Showing a new error on pointer-down can move the button before pointer-up,
      // swallowing the click. Submit validates all fields after the click instead.
      const movingToButton = event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest('button')
      if (isControl(event.target) && !movingToButton) refresh(event.target)
      props.onBlurCapture?.(event)
    }}
    onChangeCapture={event => {
      if (isControl(event.target) && (submitted || Object.keys(errors).length > 0)) {
        // Wait for controlled values and cross-field custom validity to update.
        const control = event.target
        queueMicrotask(() => refresh(control))
      }
      props.onChangeCapture?.(event)
    }}
    onClickCapture={event => {
      // Adding/removing rows and revealing passwords may change which controls
      // are valid without dispatching an input change.
      if (event.target instanceof Element && event.target.closest('button')) queueMicrotask(() => refresh())
      props.onClickCapture?.(event)
    }}
    onSubmit={event => {
      event.preventDefault()
      if (validateFields) {
        const next = collect()
        setErrors(next); setSubmitted(true)
        const first = Object.keys(next)[0]
        if (first) { pendingFocus.current = first; return }
      }
      onSubmit?.(event)
    }}>
    {validateFields && submitted && entries.length > 0 && <div className="notice notice-error form-error-summary" role="alert"><strong>Revisá {entries.length === 1 ? 'el campo indicado' : `estos ${entries.length} campos`} para continuar.</strong><ul>{entries.map(([id, error]) => <li key={id}><button type="button" className="text-button" onClick={() => document.getElementById(id)?.focus()}>{(document.getElementById(id) as Control | null)?.labels?.[0]?.querySelector('span')?.textContent || 'Campo'}: {error}</button></li>)}</ul></div>}
    {children}
  </form></FormErrors.Provider>
}

type Shared = { label: string; hint?: string; error?: string; validationMessage?: string }
function useField(id: string | undefined, error: string | undefined) {
  const generated = useId()
  const fieldId = id || generated
  const errors = useContext(FormErrors)
  return { fieldId, message: error || errors[fieldId] || '' }
}
function FieldFrame({ label, id, hint, message, children }: { label: string; id: string; hint?: string; message: string; children: ReactNode }) {
  return <div className={`field ${message ? 'field-invalid' : ''}`}><label htmlFor={id}><span>{label}</span></label>{children}{hint && <small className="field-hint" id={`${id}-hint`}>{hint}</small>}{message && <small className="field-error" id={`${id}-error`}>{message}</small>}</div>
}
type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & Shared & { value: string; onChange?: (value: string) => void }
export function Field({ label, value, onChange, maxLength, hint, error, validationMessage = '', id, type = 'text', ...props }: FieldProps) {
  const { fieldId, message } = useField(id, error)
  const ref = useRef<HTMLInputElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => { ref.current?.setCustomValidity(validationMessage) }, [validationMessage])
  const limit = maxLength ?? (type === 'email' ? 254 : type === 'tel' ? 40 : 200)
  const input = <input {...props} id={fieldId} ref={ref} data-value-kind={type} type={type === 'password' && visible ? 'text' : type} maxLength={limit} value={value} onChange={event => onChange?.(event.target.value)} aria-invalid={message ? true : undefined} aria-describedby={[hint && `${fieldId}-hint`, message && `${fieldId}-error`, props['aria-describedby']].filter(Boolean).join(' ') || undefined} />
  const passwordLabel = label === 'Repetí la contraseña' ? 'confirmación de contraseña' : label.toLocaleLowerCase('es')
  return <FieldFrame label={label} id={fieldId} hint={hint} message={message}>{type === 'password' ? <div className="password-control">{input}<button type="button" className="password-toggle" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${passwordLabel}`} aria-controls={fieldId} aria-pressed={visible} disabled={props.disabled} onClick={() => setVisible(current => !current)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div> : input}</FieldFrame>
}

export function SelectField({ label, hint, error, validationMessage = '', id, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & Shared) {
  const { fieldId, message } = useField(id, error)
  const ref = useRef<HTMLSelectElement>(null)
  useEffect(() => { ref.current?.setCustomValidity(validationMessage) }, [validationMessage])
  return <FieldFrame label={label} id={fieldId} hint={hint} message={message}><select {...props} id={fieldId} ref={ref} aria-invalid={message ? true : undefined} aria-describedby={[hint && `${fieldId}-hint`, message && `${fieldId}-error`].filter(Boolean).join(' ') || undefined}>{children}</select></FieldFrame>
}

export function TextAreaField({ label, hint, error, validationMessage = '', id, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & Shared) {
  const { fieldId, message } = useField(id, error)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { ref.current?.setCustomValidity(validationMessage) }, [validationMessage])
  return <FieldFrame label={label} id={fieldId} hint={hint} message={message}><textarea {...props} id={fieldId} ref={ref} aria-invalid={message ? true : undefined} aria-describedby={[hint && `${fieldId}-hint`, message && `${fieldId}-error`].filter(Boolean).join(' ') || undefined}/>{typeof props.value === 'string' && props.maxLength && <small className="field-counter">{props.value.length.toLocaleString('es-AR')} / {props.maxLength.toLocaleString('es-AR')}</small>}</FieldFrame>
}
