import { z } from 'zod';

const bookingDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  enabled: z.boolean(),
});

const bookingPeopleCategorySchema = z
  .object({
    key: z.string().min(1).max(32),
    label: z.string().min(1).max(60),
    min: z.number().int().min(0).max(50),
    max: z.number().int().min(0).max(50),
  })
  .refine((data) => data.max >= data.min, { message: 'El máximo no puede ser menor al mínimo', path: ['max'] });

export const bookingConfigSchema = z
  .object({
    enabled: z.boolean(),
    title: z.string().max(200).default(''),
    subtitle1: z.string().max(400).default(''),
    subtitle2: z.string().max(400).default(''),
    hasSpecificDates: z.boolean(),
    peopleCategories: z.array(bookingPeopleCategorySchema).max(10).optional(),
    dates: z.array(bookingDateSchema),
    depositAmount: z.number().min(0),
    maxPeoplePerBooking: z.number().int().min(1).max(50).optional(),
    minLeadHours: z.number().int().min(0).max(720).optional(),
    currency: z.enum(['ars', 'brl', 'usd']).default('ars'),
    paymentMethods: z.object({
      mercadoPago: z.boolean(),
    }),
    referralCommission: z
      .object({
        type: z.enum(['percent', 'fixed']),
        value: z.number().min(0),
        currency: z.enum(['ars', 'brl', 'usd']),
      })
      .optional(),
  })
  .refine(
    (data) => data.paymentMethods.mercadoPago,
    { message: 'Elegí qué opciones mostrar en el checkout (al menos una)', path: ['paymentMethods'] }
  )
  .refine(
    (data) => {
      if (!data.hasSpecificDates) return true;
      const dates = data.dates.map((d) => d.date);
      return new Set(dates).size === dates.length;
    },
    { message: 'No se permiten fechas duplicadas', path: ['dates'] }
  )
  .refine(
    (data) => {
      if (!data.peopleCategories?.length) return true;
      const keys = data.peopleCategories.map((item) => item.key);
      return new Set(keys).size === keys.length;
    },
    { message: 'No se permiten categorías duplicadas', path: ['peopleCategories'] }
  )
  .refine(
    (data) => {
      if (!data.peopleCategories?.length) return true;
      const maxTotal = typeof data.maxPeoplePerBooking === 'number' ? data.maxPeoplePerBooking : 50;
      return data.peopleCategories.every((item) => item.max <= maxTotal);
    },
    { message: 'El máximo por categoría no puede superar el máximo por reserva', path: ['peopleCategories'] }
  )
  .refine(
    (data) => {
      if (!data.peopleCategories?.length) return true;
      const maxTotal = typeof data.maxPeoplePerBooking === 'number' ? data.maxPeoplePerBooking : 50;
      const sumMin = data.peopleCategories.reduce((acc, item) => acc + Math.max(0, item.min), 0);
      return sumMin <= maxTotal;
    },
    { message: 'La suma de mínimos supera el máximo por reserva', path: ['peopleCategories'] }
  );

export type BookingConfigInput = z.infer<typeof bookingConfigSchema>;
