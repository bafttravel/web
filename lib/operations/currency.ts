/** Read legacy fields without assuming ARS or conflating two unknown currencies. */
export function currencyCode(value: unknown): string {
  if (typeof value !== 'string') return '';
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

/** Amounts must be known integer minor units; missing data is never displayed as zero. */
export function moneyLabel(amount: unknown, currency: unknown): string {
  const code = currencyCode(currency);
  if (!code || typeof amount !== 'number' || !Number.isSafeInteger(amount)) return 'Por completar';
  return `${(amount / 100).toLocaleString('es-AR')} ${code}`;
}

export function moneyTotalsLabel(items: Array<{ amount: unknown; currency: unknown }>): string {
  const totals = new Map<string, number>();
  for (const item of items) {
    const code = currencyCode(item.currency);
    if (!code || typeof item.amount !== 'number' || !Number.isSafeInteger(item.amount)) return 'Por completar';
    const total = (totals.get(code) ?? 0) + item.amount;
    if (!Number.isSafeInteger(total)) return 'Por completar';
    totals.set(code, total);
  }
  return [...totals].map(([code, amount]) => moneyLabel(amount, code)).join(' · ') || 'Sin registros';
}

export function currencyIssues(data: { reservations: Array<{ currency?: unknown }>; payments: Array<{ currency?: unknown }>; ledger: Array<{ currency?: unknown }> }) {
  return {
    reservations: data.reservations.filter((r) => !currencyCode(r.currency)).length,
    payments: data.payments.filter((p) => !currencyCode(p.currency)).length,
    ledger: data.ledger.filter((e) => !currencyCode(e.currency)).length,
  };
}

export function currencyWarning(issues?: ReturnType<typeof currencyIssues>): string {
  if (!issues || !(issues.reservations || issues.payments || issues.ledger)) return '';
  return `Hay registros sin una moneda válida: reservas (${issues.reservations}), cobros o devoluciones (${issues.payments}) y movimientos (${issues.ledger}). No se incluyen en los importes por moneda. Los totales pueden estar incompletos hasta revisar esos datos.`;
}
