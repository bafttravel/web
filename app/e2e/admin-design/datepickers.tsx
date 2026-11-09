'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import AdminDatePicker from '@/components/admin/AdminDatePicker';
import AdminTimePicker from '@/components/admin/AdminTimePicker';
import { Button } from '@/components/ui/button';

export default function DatePickersPreview() {
  const { control, handleSubmit, reset } = useForm({ defaultValues: { date: '' } });
  const [time, setTime] = useState('');
  const [saved, setSaved] = useState('');
  return <form className="space-y-6" onSubmit={handleSubmit(({ date }) => setSaved(`${date} ${time}`))}>
    <h1>Calendarios · vista de prueba</h1>
    <label className="block">Fecha obligatoria<Controller name="date" control={control} render={({ field }) => <AdminDatePicker id="preview-date" aria-label="Fecha obligatoria" name={field.name} ref={field.ref} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} min="2026-10-10" max="2026-10-20" allowedDates={['2026-10-15', '2026-10-18']} required />} /></label>
    <AdminTimePicker label="Horario de retiro" value={time} onValueChange={setTime} />
    <div className="flex gap-4"><Button type="submit">Probar formulario</Button><Button type="button" variant="outline" onClick={() => { reset(); setSaved(''); }}>Restablecer</Button></div>
    <output aria-label="Valores de prueba">{saved}</output>
  </form>;
}
