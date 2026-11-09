import { z } from 'zod';
import { currencySchema } from './schemas.ts';

const id = z.string().regex(/^[\w-]{1,128}$/);
export const financeEntrySchema = z.object({
  requestId: z.string().uuid(), kind: z.enum(['hotel_payment', 'hotel_receipt', 'provider_payment', 'offset', 'reversal']),
  counterpartyId: z.union([id, z.literal('')]).default(''), reservationId: z.union([id, z.literal('')]).default(''),
  amount: z.number().int().positive().max(999999999999), currency: currencySchema,
  method: z.enum(['cash', 'transfer', 'card', 'credit_balance']), note: z.string().trim().max(1000).default(''),
  occurredAt: z.string().datetime(), receiptUrl: z.union([z.string().url().refine((v) => v.startsWith('https://')), z.literal('')]).default(''),
  reversalOf: z.union([id, z.literal('')]).default(''), pairedReservationId: z.union([id, z.literal('')]).default(''),
}).refine((entry) => entry.kind !== 'reversal' || entry.note.length >= 3, { path: ['note'], message: 'Indicá el motivo de la anulación (al menos 3 caracteres)' });

export const reservationPaymentSchema = z.object({
  requestId: z.string().uuid(), reservationId: id, amount: z.number().int().positive().max(999999999999), currency: currencySchema,
  method: z.enum(['cash', 'transfer', 'card']), movementType: z.enum(['payment', 'refund']),
  note: z.string().trim().max(500).default(''), occurredAt: z.string().datetime(),
});
