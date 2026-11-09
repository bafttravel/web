type ReminderData = {
  customerName: string; experienceTitle: string; dateFormatted: string;
  pickupTime?: string; pickupHotel?: string; pickupAddress?: string;
  reservationCode?: string; lookupUrl?: string;
};
type Brand = { name: string; email: string; whatsapp: string };
const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const safeLookup = (value?: string) => {
  try { const url = new URL(value || ''); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
};

export function reminderText(data: ReminderData, brand: Brand): string {
  return [
    data.customerName ? `Hola ${data.customerName},` : 'Hola,', '',
    'Te adjuntamos el voucher de tu próxima excursión. Revisá los datos antes de la salida.', '',
    `Excursión: ${data.experienceTitle}`, `Fecha: ${data.dateFormatted}`,
    `Horario: ${data.pickupTime || 'A confirmar'}`,
    `Retiro: ${[data.pickupHotel, data.pickupAddress].filter(Boolean).join(' — ') || 'A confirmar'}`,
    ...(data.reservationCode ? [`Reserva: ${data.reservationCode}`] : []),
    ...(safeLookup(data.lookupUrl) ? [`Consultar reserva: ${safeLookup(data.lookupUrl)}`] : []), '',
    `Si tenés alguna consulta, respondé este correo o escribinos a ${brand.email}.`,
    ...(brand.whatsapp ? [`WhatsApp: https://wa.me/${brand.whatsapp.replace(/\D/g, '')}`] : []), '',
    '¡Que disfrutes tu día!', brand.name,
  ].join('\n');
}

export function reminderHtml(data: ReminderData, brand: Brand): string {
  const lines = reminderText(data, brand).split('\n');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#fff;color:#222;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6"><div style="max-width:560px;margin:0 auto;padding:28px 20px">${lines.map((line) => line ? `<div>${escape(line)}</div>` : '<div style="height:14px"></div>').join('')}</div></body></html>`;
}
