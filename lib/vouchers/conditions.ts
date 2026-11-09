/** Text supplied and approved by the business in Voucher-5806-06112026031746.pdf.
 * This is document copy, not an implementation of automatic cancellation rules. */
export const voucherIssuer = {
  licence: 'EVyT 14449', disposition: 'Disposición 294/2010',
  address: '9 de Julio 57 (loc. 1)', email: 'info@baftravel.com', website: 'www.baftravel.com',
};
export const voucherConditions = [
  {
    esTitle: 'PROCESO DE RESERVA Y CONFIRMACION', enTitle: 'RESERVATION AND CONFIRMATION PROCESS',
    es: 'Para reservar un servicio se le pedirá al pasajero los datos identificatorios de cada uno de los pasajeros que harán la actividad y también elegir un medio de pago. Una vez completado el pago de forma exitosa y recibido el voucher se confirma la reserva.',
    en: 'To book a service, passengers will be asked for the identifying information of each person participating in the activity, as well as to choose a payment method. Once the payment is successfully completed and the voucher is received, the reservation is confirmed.',
  },
  {
    esTitle: 'POLITICAS DE PAGO', enTitle: 'PAYMENT POLICIES',
    es: 'El pago del servicio debe realizarse al menos 24hs antes del horario de inicio de la misma. De no estar el pago realizado al menos 24 hs antes la reserva se cancelará automáticamente.',
    en: 'Payment for the service must be made at least 24 hours before the scheduled start time. If payment is not made at least 24 hours in advance, the reservation will be automatically canceled.',
  },
  {
    esTitle: 'CANCELACIONES Y/O MODIFICACIONES', enTitle: 'CANCELLATIONS AND/OR MODIFICATIONS',
    es: 'La cancelación o modificación sin cargo de la reserva debe realizarse 24hs antes del horario del inicio del servicio. En caso de no-show (no presentación) al momento del inicio del servicio, se aplicarán gastos del 100 % de la reserva.',
    en: 'Cancellations or modifications of the reservation without charge must be made 24 hours before the scheduled start time of the service. In the case of a no-show at the time of the service, a 100% fee of the reservation will be applied.',
  },
  {
    esTitle: 'INFORMACION PERSONALES', enTitle: 'PERSONAL INFORMATION',
    es: 'Todos los pasajeros deben acreditar identidad mediante DNI o Pasaporte. En caso de haber menores en una reserva de un servicio, se deberá adjuntar imagen de DNI o Pasaporte.',
    en: 'All passengers must verify their identity with an ID or passport. If there are minors included in a service reservation, a copy of their ID or passport must be provided.',
  },
  {
    esTitle: 'RESTRICCIONES PARA EXCURSIONES', enTitle: 'RESTRICTIONS FOR EXCURSIONS',
    es: 'Al reservar un servicio el pasajero entiende y acepta los requerimientos específicos del mismo para su correcta realización.',
    en: 'By booking a service, the passenger understands and accepts the specific requirements for its proper execution.',
  },
] as const;
