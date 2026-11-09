/**
 * Plantillas HTML para emails de reserva (cliente y aviso a admin).
 * Usado desde los flujos de confirmación de pago.
 * Marca: dinámica vía SITE_NAME
 */

import { CONTACT_INFO, SITE_NAME, SITE_DESCRIPTION, LEGAL_INFO } from '@/lib/constants';
import { reminderHtml, reminderText } from './voucher-reminder';

type ReservaEmailData = {
  pickupAddress?: string;
  pickupTime?: string;
  pickupHotel?: string;
  customerName: string;
  experienceTitle: string;
  dateFormatted: string;
  peopleLabel: string;
  seatsLabel?: string;
  amountFormatted: string;
  /** Etiqueta del subtotal base, ej: "$ 660.000 (2 pasajeros)". */
  baseSubtotalLabel?: string;
  /** Desglose de extras/adicionales (adicionales, gastos administrativos, etc.). */
  extrasItems?: Array<{ label: string; amountFormatted: string }>;
  reservationCode?: string;
  lookupUrl?: string;
  sessionId: string;
  customerEmail: string;
  customerPhone?: string;
  customerCountry?: string;
  customerComments?: string;
};

const PRICE_ROW_STYLE = 'padding: 10px 0; font-size: 0.875rem; color: #64748b; border-bottom: 1px solid #e2e8f0;';
const PRICE_VALUE_STYLE = 'padding: 10px 0; font-size: 0.9375rem; font-weight: 700; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;';

/** Filas del desglose (subtotal + extras) para insertar antes del monto total. */
function buildPriceBreakdownRowsHtml(data: Pick<ReservaEmailData, 'baseSubtotalLabel' | 'extrasItems'>): string {
  const rows: string[] = [];
  if (data.baseSubtotalLabel) {
    rows.push(`<tr><td style="${PRICE_ROW_STYLE}">Subtotal</td><td style="${PRICE_VALUE_STYLE}">${data.baseSubtotalLabel}</td></tr>`);
  }
  for (const extra of data.extrasItems ?? []) {
    if (!extra.label) continue;
    rows.push(
      `<tr><td style="${PRICE_ROW_STYLE}">+ ${extra.label}</td><td style="${PRICE_VALUE_STYLE}">${extra.amountFormatted}</td></tr>`
    );
  }
  return rows.join('');
}

function buildPriceBreakdownLinesText(data: Pick<ReservaEmailData, 'baseSubtotalLabel' | 'extrasItems'>): string[] {
  const lines: string[] = [];
  if (data.baseSubtotalLabel) lines.push(`Subtotal: ${data.baseSubtotalLabel}`);
  for (const extra of data.extrasItems ?? []) {
    if (extra.label) lines.push(`+ ${extra.label}: ${extra.amountFormatted}`);
  }
  return lines;
}

export function buildClienteCompraConfirmadaHtml(data: ReservaEmailData): string {
  const {
    customerName,
    experienceTitle,
    dateFormatted,
    peopleLabel,
    seatsLabel,
    amountFormatted,
    reservationCode,
    lookupUrl,
    sessionId,
  } = data;
  const saludo = customerName ? `Hola ${customerName},` : 'Hola,';
  const whatsappUrl = `https://wa.me/${CONTACT_INFO.whatsapp}?text=${encodeURIComponent(
    `Hola ${SITE_NAME}, realicé una compra para ${experienceTitle}. Fecha: ${dateFormatted}. ${peopleLabel}. ¿Me confirman próximos pasos?`
  )}`;
  const code = reservationCode || sessionId;
  const title = experienceTitle || SITE_NAME;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compra confirmada - ${SITE_NAME}</title>
</head>
<body style="margin:0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background:#f8fafc; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background:#fff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e2e8f0;">

    <div style="padding: 32px 28px;">
      <div style="text-align: center; margin-bottom: 28px;">
        <div style="display: inline-block; background: #dcfce7; color: #166534; padding: 8px 16px; border-radius: 20px; font-size: 0.875rem; font-weight: 600; margin-bottom: 16px;">
          ✓ COMPRA CONFIRMADA
        </div>
        <h2 style="margin:0; font-size: 1.5rem; font-weight: 800; color: #0f172a;">Tu reserva está confirmada</h2>
        <p style="margin:10px 0 0; font-size: 0.9375rem; color: #64748b; line-height: 1.6;">Este email confirma tu compra y guarda tu código de reserva.</p>
      </div>

      <p style="margin:0 0 18px; font-size: 1rem; color: #475569; line-height: 1.6;">${saludo}</p>
      <div style="background:#f8fafc; border-radius: 12px; padding: 18px; margin-bottom: 18px; border: 1px solid #e2e8f0;">
        <table style="width:100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; font-size: 0.875rem; color: #64748b; border-bottom: 1px solid #e2e8f0;">Paquete</td>
            <td style="padding: 10px 0; font-size: 0.9375rem; font-weight: 700; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">${title}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-size: 0.875rem; color: #64748b; border-bottom: 1px solid #e2e8f0;">Fecha</td>
            <td style="padding: 10px 0; font-size: 0.9375rem; font-weight: 700; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0; text-transform: capitalize;">${dateFormatted}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-size: 0.875rem; color: #64748b; border-bottom: 1px solid #e2e8f0;">Pasajeros</td>
            <td style="padding: 10px 0; font-size: 0.9375rem; font-weight: 700; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">${peopleLabel}</td>
          </tr>
          ${seatsLabel
      ? `<tr>
            <td style="padding: 10px 0; font-size: 0.875rem; color: #64748b; border-bottom: 1px solid #e2e8f0;">Butacas</td>
            <td style="padding: 10px 0; font-size: 0.9375rem; font-weight: 700; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">${seatsLabel}</td>
          </tr>`
      : ''
    }
          ${buildPriceBreakdownRowsHtml(data)}
          <tr>
            <td style="padding: 10px 0; font-size: 0.875rem; color: #64748b; border-bottom: 1px solid #e2e8f0;">Monto</td>
            <td style="padding: 10px 0; font-size: 1rem; font-weight: 800; color: #059669; text-align: right; border-bottom: 1px solid #e2e8f0;">${amountFormatted}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-size: 0.875rem; color: #64748b;">Código</td>
            <td style="padding: 10px 0; font-size: 0.875rem; font-family: monospace; color: #475569; text-align: right;">${code}</td>
          </tr>
        </table>
      </div>

      <div style="background:#fff; border: 2px solid #0B6E4F; border-radius: 12px; padding: 16px; margin-bottom: 18px;">
        <p style="margin:0 0 8px; font-size: 0.875rem; font-weight: 800; color: #0B6E4F; text-transform: uppercase; letter-spacing: 0.05em;">Próximo paso</p>
        <p style="margin:0; font-size: 0.9375rem; color: #475569; line-height: 1.7;">
          Vas a recibir un <strong>voucher/recordatorio 48 hs antes</strong> con el <strong>horario</strong> y el <strong>punto de salida</strong> pactados.
        </p>
      </div>

      ${lookupUrl
      ? `<div style="background:#f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 18px; border: 1px solid #e2e8f0;">
        <p style="margin:0 0 8px; font-size: 0.875rem; font-weight: 800; color: #0f172a;">Consultar tu reserva</p>
        <a href="${lookupUrl}" style="display:inline-block; background:#0B6E4F; color:#fff; padding:10px 14px; border-radius: 8px; text-decoration:none; font-weight: 800; font-size: 0.875rem;">
          Ver estado
        </a>
        <p style="margin:12px 0 0; font-size: 0.75rem; color:#64748b; word-break: break-word;">${lookupUrl}</p>
      </div>`
      : ''
    }

      <div style="background:#0f172a; border-radius: 12px; padding: 16px; color: #fff;">
        <p style="margin:0 0 8px; font-size: 0.875rem; font-weight: 800;">¿Necesitás ayuda?</p>
        <p style="margin:0 0 12px; font-size: 0.875rem; color: rgba(255,255,255,0.85); line-height: 1.6;">Escribinos por WhatsApp y te respondemos a la brevedad.</p>
        <a href="${whatsappUrl}" style="display:inline-block; background:#22c55e; color:#052e16; padding:10px 14px; border-radius: 8px; text-decoration:none; font-weight: 900; font-size: 0.875rem;">
          WhatsApp
        </a>
      </div>

      <div style="margin-top: 18px; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 0.75rem; color: #64748b; line-height: 1.7;">
        <div>${LEGAL_INFO.legajoRnav ? `Legajo RNAV: <strong>${LEGAL_INFO.legajoRnav}</strong>` : ''}</div>
        <div>${CONTACT_INFO.email} · ${CONTACT_INFO.telefono}</div>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

export function buildClienteCompraConfirmadaText(data: ReservaEmailData): string {
  const { customerName, experienceTitle, dateFormatted, peopleLabel, seatsLabel, amountFormatted, sessionId, reservationCode, lookupUrl } = data;
  const saludo = customerName ? `Hola ${customerName},` : 'Hola,';
  return [
    `COMPRA CONFIRMADA - ${SITE_NAME}`,
    '',
    saludo,
    '',
    'Tu reserva está confirmada. Guardá este código de reserva.',
    '',
    `Paquete: ${experienceTitle}`,
    `Fecha: ${dateFormatted}`,
    `Pasajeros: ${peopleLabel}`,
    ...(seatsLabel ? [`Butacas: ${seatsLabel}`] : []),
    ...buildPriceBreakdownLinesText(data),
    `Monto: ${amountFormatted}`,
    `Código: ${reservationCode || sessionId}`,
    '',
    'Vas a recibir un voucher/recordatorio 48 hs antes con horario y punto de salida.',
    ...(lookupUrl ? ['', `Consultar: ${lookupUrl}`] : []),
  ].join('\n');
}

export function buildClienteVoucher48hsHtml(data: ReservaEmailData): string {
  return reminderHtml(data, { name: SITE_NAME, email: CONTACT_INFO.email, whatsapp: CONTACT_INFO.whatsapp });
}

export function buildClienteVoucher48hsText(data: ReservaEmailData): string {
  return reminderText(data, { name: SITE_NAME, email: CONTACT_INFO.email, whatsapp: CONTACT_INFO.whatsapp });
}

/** Email al cliente: VOUCHER de confirmación de reserva profesional. */
export function buildClienteReservaConfirmadaHtml(data: ReservaEmailData): string {
  const {
    customerName,
    experienceTitle,
    dateFormatted,
    peopleLabel,
    seatsLabel,
    amountFormatted,
    reservationCode,
    lookupUrl,
    sessionId,
  } = data;
  const saludo = customerName ? `Hola ${customerName},` : 'Hola,';
  const whatsappUrl = `https://wa.me/${CONTACT_INFO.whatsapp}?text=${encodeURIComponent(
    `Hola ${SITE_NAME}, confirmé mi reserva para ${experienceTitle}. Fecha: ${dateFormatted}. ${peopleLabel}. ¿Próximos pasos?`
  )}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Voucher de Reserva - ${SITE_NAME}</title>
</head>
<body style="margin:0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background:#f8fafc; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background:#fff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e2e8f0;">
    <!-- Header con marca -->
    
    <div style="padding: 32px 28px;">
      <!-- Título de confirmación -->
      <div style="text-align: center; margin-bottom: 28px;">
        <div style="display: inline-block; background: #dcfce7; color: #166534; padding: 8px 16px; border-radius: 20px; font-size: 0.875rem; font-weight: 600; margin-bottom: 16px;">
          ✓ RESERVA CONFIRMADA
        </div>
        <h2 style="margin:0; font-size: 1.5rem; font-weight: 700; color: #0f172a;">¡Tu voucher está listo!</h2>
      </div>
      
      <p style="margin:0 0 24px; font-size: 1rem; color: #475569; line-height: 1.6;">${saludo}</p>
      <p style="margin:0 0 24px; font-size: 0.9375rem; color: #64748b; line-height: 1.6;">Tu reserva ha sido confirmada y procesada exitosamente. Este email es tu <strong>comprobante oficial de reserva</strong>. Guardalo y presentalo el día de tu experiencia.</p>

      <!-- Detalle de reserva -->
      <div style="background:#f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
        <p style="margin:0 0 16px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b;">Detalle de tu reserva</p>
        
        <table style="width:100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; font-size: 0.875rem; color: #64748b; border-bottom: 1px solid #e2e8f0;">Paquete / Experiencia</td>
            <td style="padding: 10px 0; font-size: 0.9375rem; font-weight: 600; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">${experienceTitle}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-size: 0.875rem; color: #64748b; border-bottom: 1px solid #e2e8f0;">Fecha de salida</td>
            <td style="padding: 10px 0; font-size: 0.9375rem; font-weight: 600; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0; text-transform: capitalize;">${dateFormatted}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-size: 0.875rem; color: #64748b; border-bottom: 1px solid #e2e8f0;">Cantidad de pasajeros</td>
            <td style="padding: 10px 0; font-size: 0.9375rem; font-weight: 600; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">${peopleLabel}</td>
          </tr>
          ${seatsLabel
      ? `<tr>
            <td style="padding: 10px 0; font-size: 0.875rem; color: #64748b; border-bottom: 1px solid #e2e8f0;">Butacas</td>
            <td style="padding: 10px 0; font-size: 0.9375rem; font-weight: 600; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">${seatsLabel}</td>
          </tr>`
      : ''
    }
          <tr>
            <td style="padding: 10px 0; font-size: 0.875rem; color: #64748b; border-bottom: 1px solid #e2e8f0;">Monto abonado</td>
            <td style="padding: 10px 0; font-size: 1rem; font-weight: 700; color: #059669; text-align: right; border-bottom: 1px solid #e2e8f0;">${amountFormatted}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-size: 0.875rem; color: #64748b;">Código de reserva</td>
            <td style="padding: 10px 0; font-size: 0.875rem; font-family: monospace; color: #475569; text-align: right;">${reservationCode || sessionId}</td>
          </tr>
        </table>
      </div>

      ${lookupUrl
      ? `<div style="background:#f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
        <p style="margin:0 0 8px; font-size: 0.875rem; font-weight: 700; color: #0f172a;">Consultar estado de reserva</p>
        <p style="margin:0 0 12px; font-size: 0.875rem; color: #475569; line-height: 1.6;">
          Guardá tu código y consultá el estado cuando lo necesites desde nuestra web.
        </p>
        <a href="${lookupUrl}" style="display:inline-block; background:#0B6E4F; color:#fff; padding:10px 14px; border-radius: 8px; text-decoration:none; font-weight: 700; font-size: 0.875rem;">
          Consultar reserva
        </a>
        <p style="margin:12px 0 0; font-size: 0.75rem; color:#64748b; word-break: break-word;">${lookupUrl}</p>
      </div>`
      : ''
    }

      <!-- Próximos pasos -->
      <div style="background:#fff; border: 2px solid #0B6E4F; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin:0 0 12px; font-size: 0.875rem; font-weight: 700; color: #0B6E4F; text-transform: uppercase; letter-spacing: 0.05em;">¿Qué sigue?</p>
        <ul style="margin:0; padding-left: 20px; font-size: 0.9375rem; color: #475569; line-height: 1.7;">
          <li style="margin-bottom: 8px;">Te contactaremos por email o WhatsApp con los detalles finales del encuentro.</li>
          <li style="margin-bottom: 8px;">Recibirás información sobre el punto de encuentro y horarios exactos.</li>
          <li>Guardá este email como comprobante de tu reserva.</li>
        </ul>
      </div>

      <!-- Contacto -->
      <div style="text-align: center; padding: 24px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; margin-bottom: 24px;">
        <p style="margin:0 0 12px; font-size: 0.9375rem; color: #475590; font-weight: 600;">¿Tenés preguntas?</p>
        <a href="${whatsappUrl}" style="display: inline-block; background: #16A34A; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.9375rem;">💬 Escribinos por WhatsApp</a>
        <p style="margin:12px 0 0; font-size: 0.875rem; color: #64748b;">${CONTACT_INFO.email} | ${CONTACT_INFO.telefono}</p>
      </div>

      <!-- Footer -->
      <div style="text-align: center;">
        <p style="margin:0 0 8px; font-size: 0.8125rem; color: #94a3b8;">Agencia de Viajes habilitada | Legajo RNAV ${LEGAL_INFO.legajoRnav || '21835'}</p>
        <p style="margin:0; font-size: 0.75rem; color: #94a3b8;">© ${new Date().getFullYear()} ${SITE_NAME}. Todos los derechos reservados.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export function buildClienteReservaConfirmadaText(data: ReservaEmailData): string {
  const { customerName, experienceTitle, dateFormatted, peopleLabel, seatsLabel, amountFormatted, sessionId, reservationCode, lookupUrl } = data;
  const saludo = customerName ? `Hola ${customerName},` : 'Hola,';
  const whatsappUrl = `https://wa.me/${CONTACT_INFO.whatsapp}?text=${encodeURIComponent(
    `Hola ${SITE_NAME}, confirmé mi reserva para ${experienceTitle}. Fecha: ${dateFormatted}. ${peopleLabel}. ¿Próximos pasos?`
  )}`;

  return [
    `================================`,
    `VOUCHER DE RESERVA - ${SITE_NAME}`,
    `================================`,
    '',
    saludo,
    '',
    'Tu reserva ha sido confirmada exitosamente.',
    '',
    'DETALLE DE TU RESERVA:',
    `Paquete: ${experienceTitle}`,
    `Fecha: ${dateFormatted}`,
    `Pasajeros: ${peopleLabel}`,
    ...(seatsLabel ? [`Butacas: ${seatsLabel}`] : []),
    `Monto abonado: ${amountFormatted}`,
    `Código: ${reservationCode || sessionId}`,
    ...(lookupUrl ? [`Consultar: ${lookupUrl}`] : []),
    '',
    'PRÓXIMOS PASOS:',
    '- Te contactaremos con los detalles finales del encuentro',
    '- Guardá este email como comprobante',
    '',
    `¿Preguntas? Contactanos:`,
    `WhatsApp: ${whatsappUrl}`,
    `Email: ${CONTACT_INFO.email}`,
    `Teléfono: ${CONTACT_INFO.telefono}`,
    '',
    `© ${new Date().getFullYear()} ${SITE_NAME}`,
    'Agencia de Viajes habilitada',
  ].join('\n');
}

/** Email al admin: aviso de nueva reserva con todos los datos del cliente. */
export function buildAdminNuevaReservaHtml(data: ReservaEmailData): string {
  const {
    customerName,
    customerEmail,
    customerPhone,
    customerCountry,
    customerComments,
    experienceTitle,
    dateFormatted,
    peopleLabel,
    seatsLabel,
    amountFormatted,
    reservationCode,
    lookupUrl,
    sessionId,
  } = data;

  const rows: string[] = [
    `<tr><td style="padding: 10px 14px; font-size: 0.875rem; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Experiencia</td><td style="padding: 10px 14px; font-size: 0.875rem; font-weight: 600; color: #111827;">${experienceTitle}</td></tr>`,
    `<tr><td style="padding: 10px 14px; font-size: 0.875rem; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Fecha</td><td style="padding: 10px 14px; font-size: 0.875rem; color: #111827; text-transform: capitalize;">${dateFormatted}</td></tr>`,
    `<tr><td style="padding: 10px 14px; font-size: 0.875rem; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Personas</td><td style="padding: 10px 14px; font-size: 0.875rem; color: #111827;">${peopleLabel}</td></tr>`,
    ...(seatsLabel ? [`<tr><td style="padding: 10px 14px; font-size: 0.875rem; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Butacas</td><td style="padding: 10px 14px; font-size: 0.875rem; color: #111827;">${seatsLabel}</td></tr>`] : []),
    ...(data.baseSubtotalLabel
      ? [`<tr><td style="padding: 10px 14px; font-size: 0.875rem; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Subtotal</td><td style="padding: 10px 14px; font-size: 0.875rem; color: #111827;">${data.baseSubtotalLabel}</td></tr>`]
      : []),
    ...(data.extrasItems ?? [])
      .filter((extra) => extra.label)
      .map(
        (extra) =>
          `<tr><td style="padding: 10px 14px; font-size: 0.875rem; color: #6b7280; border-bottom: 1px solid #e5e7eb;">+ ${extra.label}</td><td style="padding: 10px 14px; font-size: 0.875rem; color: #111827;">${extra.amountFormatted}</td></tr>`
      ),
    `<tr><td style="padding: 10px 14px; font-size: 0.875rem; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Monto total</td><td style="padding: 10px 14px; font-size: 0.875rem; font-weight: 700; color: #111827;">${amountFormatted}</td></tr>`,
    `<tr><td style="padding: 10px 14px; font-size: 0.875rem; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Cliente</td><td style="padding: 10px 14px; font-size: 0.875rem; color: #111827;">${customerName || '—'}</td></tr>`,
    `<tr><td style="padding: 10px 14px; font-size: 0.875rem; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Email</td><td style="padding: 10px 14px; font-size: 0.875rem; color: #111827;">${customerEmail}</td></tr>`,
  ];
  if (customerPhone) {
    rows.push(`<tr><td style="padding: 10px 14px; font-size: 0.875rem; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Teléfono</td><td style="padding: 10px 14px; font-size: 0.875rem; color: #111827;">${customerPhone}</td></tr>`);
  }
  if (customerCountry) {
    rows.push(`<tr><td style="padding: 10px 14px; font-size: 0.875rem; color: #6b7280; border-bottom: 1px solid #e5e7eb;">País</td><td style="padding: 10px 14px; font-size: 0.875rem; color: #111827;">${customerCountry}</td></tr>`);
  }
  rows.push(`<tr><td style="padding: 10px 14px; font-size: 0.875rem; color: #6b7280;">Código</td><td style="padding: 10px 14px; font-size: 0.75rem; color: #6b7280;">${reservationCode || sessionId}</td></tr>`);
  if (lookupUrl) {
    rows.push(`<tr><td style="padding: 10px 14px; font-size: 0.875rem; color: #6b7280;">Consultar</td><td style="padding: 10px 14px; font-size: 0.75rem; color: #6b7280; word-break: break-word;">${lookupUrl}</td></tr>`);
  }

  const comentariosBlock = customerComments
    ? `<p style="margin: 16px 0 0; font-size: 0.875rem; color: #374151;"><strong>Comentarios del cliente:</strong><br>${customerComments}</p>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nueva reserva</title>
</head>
<body style="margin:0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background:#f3f4f6; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background:#fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
    <div style="padding: 24px;">
      <h1 style="margin:0 0 8px; font-size: 1.25rem; font-weight: 700; color: #111827;">Nueva reserva recibida</h1>
      <p style="margin:0 0 20px; font-size: 0.9375rem; color: #4b5563;">Se completó un pago y se registró la siguiente reserva.</p>
      <table style="width:100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        ${rows.join('')}
      </table>
      ${comentariosBlock}
      <p style="margin: 20px 0 0; font-size: 0.8125rem; color: #9ca3af;">Este email fue enviado automáticamente por el sistema de reservas.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export function buildAdminNuevaReservaText(data: ReservaEmailData): string {
  const {
    customerName,
    customerEmail,
    customerPhone,
    customerCountry,
    customerComments,
    experienceTitle,
    dateFormatted,
    peopleLabel,
    seatsLabel,
    amountFormatted,
    reservationCode,
    lookupUrl,
    sessionId,
  } = data;
  const lines: string[] = [
    'Nueva reserva recibida',
    '',
    `Experiencia: ${experienceTitle}`,
    `Fecha: ${dateFormatted}`,
    `Personas: ${peopleLabel}`,
    ...(seatsLabel ? [`Butacas: ${seatsLabel}`] : []),
    ...buildPriceBreakdownLinesText(data),
    `Monto total: ${amountFormatted}`,
    '',
    `Cliente: ${customerName || '—'}`,
    `Email: ${customerEmail}`,
  ];
  if (customerPhone) lines.push(`Teléfono: ${customerPhone}`);
  if (customerCountry) lines.push(`País: ${customerCountry}`);
  if (customerComments) {
    lines.push('', 'Comentarios del cliente:', customerComments);
  }
  lines.push('', `Código: ${reservationCode || sessionId}`);
  if (lookupUrl) lines.push(`Consultar: ${lookupUrl}`);
  return lines.join('\n');
}
