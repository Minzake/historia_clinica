// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup,fireEvent,render,screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach,describe,expect,it,vi } from 'vitest'
import { Field,Form } from '../src/components/Form'

afterEach(cleanup)
function Example({save,type='date',initial='2026-01-02'}:{save:(value:string)=>void;type?:'date'|'datetime-local';initial?:string}){
  const [value,setValue]=useState(initial)
  return <Form onSubmit={()=>save(value)}><Field label="Fecha" type={type} required min={type==='date'?'1900-01-01':undefined} max={type==='date'?'2026-12-31':undefined} value={value} onChange={setValue}/><button>Guardar</button><button type="button" onClick={()=>setValue('2026-03-04')}>Cambiar fecha</button></Form>
}
describe('shared date and time field',()=>{
  it('shows DD/MM/YYYY and keeps ISO values when saving, including external changes',async()=>{
    const save=vi.fn(),user=userEvent.setup();render(<Example save={save}/>)
    expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('02/01/2026')
    await user.click(screen.getByRole('button',{name:'Guardar'}))
    expect(save).toHaveBeenLastCalledWith('2026-01-02')
    await user.click(screen.getByRole('button',{name:'Cambiar fecha'}))
    expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('04/03/2026')
  })
  it('accepts keyboard entry and pasted dates, with separators added automatically',async()=>{
    const save=vi.fn(),user=userEvent.setup();render(<Example save={save} initial=""/>)
    await user.type(screen.getByLabelText('Fecha'),'03022026')
    expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('03/02/2026')
    await user.click(screen.getByRole('button',{name:'Guardar'}))
    expect(save).toHaveBeenLastCalledWith('2026-02-03')
    await user.clear(screen.getByLabelText('Fecha'))
    await user.paste('2026-04-05')
    expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('05/04/2026')
  })
  it('blocks incomplete, impossible and out-of-range dates and displays bounds in the same format',async()=>{
    const save=vi.fn(),user=userEvent.setup();render(<Example save={save}/>)
    for(const value of ['31/02/2026','12/','01/01/2027']){
      fireEvent.change(screen.getByLabelText('Fecha'),{target:{value}})
      await user.click(screen.getByRole('button',{name:'Guardar'}))
      expect(save).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Fecha').getAttribute('aria-invalid')).toBe('true')
    }
    expect(screen.getByRole('alert').textContent).toContain('31/12/2026')
    fireEvent.change(screen.getByLabelText('Fecha'),{target:{value:'28/02/2026'}})
    await user.click(screen.getByRole('button',{name:'Guardar'}))
    expect(save).toHaveBeenLastCalledWith('2026-02-28')
  })
  it('allows replacing the day in an existing date without moving the month or year',async()=>{
    const save=vi.fn(),user=userEvent.setup();render(<Example save={save}/>)
    const input=screen.getByLabelText('Fecha') as HTMLInputElement
    await user.click(input);input.setSelectionRange(0,2)
    await user.keyboard('12')
    expect(input.value).toBe('12/01/2026')
    await user.click(screen.getByRole('button',{name:'Guardar'}))
    expect(save).toHaveBeenLastCalledWith('2026-01-12')
  })
  it('keeps the native calendar available and formats a calendar selection',async()=>{
    const save=vi.fn(),user=userEvent.setup(),{container}=render(<Example save={save}/>)
    const picker=container.querySelector<HTMLInputElement>('[data-calendar-picker]')!
    picker.showPicker=vi.fn()
    await user.click(screen.getByRole('button',{name:'Abrir calendario'}))
    expect(picker.showPicker).toHaveBeenCalledOnce()
    fireEvent.change(picker,{target:{value:'2026-05-06'}})
    expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('06/05/2026')
    await user.click(screen.getByRole('button',{name:'Guardar'}))
    expect(save).toHaveBeenLastCalledWith('2026-05-06')
  })
  it('formats dates with local times and rejects invalid hours',async()=>{
    const save=vi.fn(),user=userEvent.setup();render(<Example save={save} type="datetime-local" initial="2026-01-02T09:05"/>)
    expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('02/01/2026 09:05')
    fireEvent.change(screen.getByLabelText('Fecha'),{target:{value:'03/02/2026 25:00'}})
    await user.click(screen.getByRole('button',{name:'Guardar'}))
    expect(save).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Fecha'),{target:{value:'03/02/2026 15:30'}})
    await user.click(screen.getByRole('button',{name:'Guardar'}))
    expect(save).toHaveBeenLastCalledWith('2026-02-03T15:30')
  })
})
