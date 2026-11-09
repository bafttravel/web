/** Display labels only; stored payment identifiers remain unchanged. */
export function paymentMethodLabel(method: string): string {
  return ({ cash: 'Efectivo', efectivo: 'Efectivo', transfer: 'Transferencia', transferencia: 'Transferencia', card: 'Tarjeta', tarjeta: 'Tarjeta', mercadopago: 'Mercado Pago', wetravel: 'WeTravel', credit_balance: 'Saldo a favor', saldo_a_favor: 'Saldo a favor', admin: 'Medio por identificar' } as Record<string, string>)[method] ?? 'Otro medio';
}
