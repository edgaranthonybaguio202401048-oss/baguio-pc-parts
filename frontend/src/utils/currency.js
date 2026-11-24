const fmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });

/** Display only – amounts are integer centavos from the server and are never recomputed for payment. */
export const formatPHP = (cents) => (Number.isFinite(cents) ? fmt.format(cents / 100) : '—');
export const pesosToCents = (pesos) => Math.round(Number(pesos) * 100);
export const centsToPesos = (cents) => (cents / 100).toFixed(2);
