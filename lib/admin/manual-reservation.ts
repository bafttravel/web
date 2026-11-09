/** Creation has no assumed payment; editing never resets stored financial data. */
export function manualReservationPaymentFields(editing: boolean) {
  return editing ? {} : { initialPayment: { method: 'pending' as const } };
}
