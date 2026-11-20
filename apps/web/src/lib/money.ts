/** South African rand formatting for decimal strings from the API (never floats in storage). */
export const rand = (v: string | number): string =>
  `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
