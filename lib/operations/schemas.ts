import { z } from 'zod';
import { salesChannelValues } from '../admin/sales-channels.ts';

export const currencySchema = z.enum(['ARS', 'USD', 'BRL', 'EUR']);
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Fecha inválida');
export const commissionRuleSchema = z.object({
  type: z.enum(['percent', 'per_person', 'per_booking']),
  value: z.number().finite().min(0).max(999999999),
  currency: currencySchema,
}).refine((r) => r.type !== 'percent' || r.value <= 100, 'El porcentaje no puede superar 100');
export const packageOperationsSchema = z.object({
  hotels: z.array(z.object({ hotelId: z.string().min(1), cash: commissionRuleSchema.nullable(), deposit: commissionRuleSchema.nullable().optional(), creditCard: commissionRuleSchema.nullable().optional(), bank: commissionRuleSchema.nullable().optional() })).max(300),
  providers: z.array(z.object({ providerId: z.string().min(1), rule: commissionRuleSchema })).max(30),
  costsComplete: z.boolean(),
}).superRefine((v, ctx) => {
  for (const key of ['hotels', 'providers'] as const) {
    const ids = v[key].map((r) => 'hotelId' in r ? r.hotelId : r.providerId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'No se puede agregar el mismo hotel o proveedor más de una vez' });
  }
}).transform((v) => ({
  ...v,
  hotels: v.hotels.map((hotel) => {
    const { bank, ...rates } = hotel;
    const hasSeparateRates = hotel.deposit !== undefined || hotel.creditCard !== undefined;
    return {
      ...rates,
      deposit: hasSeparateRates ? hotel.deposit ?? null : bank ?? null,
      creditCard: hasSeparateRates ? hotel.creditCard ?? null : bank ?? null,
    };
  }),
}));
export type PackageOperationsFormValue = z.output<typeof packageOperationsSchema>;
export const counterpartySchema = z.object({
  kind: z.enum(['hotel', 'provider']), name: z.string().trim().min(2).max(160),
  taxId: z.string().trim().max(30), active: z.boolean(),
  email: z.union([z.string().email(), z.literal('')]), phone: z.string().trim().max(60),
  contact: z.string().trim().max(120), address: z.string().trim().max(300), notes: z.string().trim().max(2000),
  commissions: z.object({ cash: commissionRuleSchema, deposit: commissionRuleSchema.optional(), creditCard: commissionRuleSchema.optional(), bank: commissionRuleSchema.optional() }),
}).transform((v) => ({
  ...v,
  commissions: (() => {
    const deposit = v.commissions.deposit ?? v.commissions.bank;
    const creditCard = v.commissions.creditCard ?? v.commissions.bank ?? v.commissions.deposit;
    return { cash: v.commissions.cash, ...(deposit ? { deposit } : {}), ...(creditCard ? { creditCard } : {}) };
  })(),
}));
export const reservationOperationsSchema = z.object({
  serviceExecuted: z.boolean().default(false),
  channel: z.enum(salesChannelValues).default('front'),
  sellerHotelId: z.string().max(128), commissionMethod: z.enum(['cash', 'transfer', 'card']).or(z.literal('')).default(''), pickupType: z.enum(['hotel', 'other']), pickupHotelId: z.string().max(128),
  pickupAddress: z.string().trim().max(400), pickupTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal('')]),
  notes: z.string().trim().max(2000), diet: z.string().trim().max(1000), automaticEmails: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (v.pickupType === 'hotel' && !v.pickupHotelId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pickupHotelId'], message: 'Seleccioná un hotel de retiro' });
  if (v.sellerHotelId && !v.commissionMethod) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['commissionMethod'], message: 'Seleccioná el medio de pago de la reserva' });
});
