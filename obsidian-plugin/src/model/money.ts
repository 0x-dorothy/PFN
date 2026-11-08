/**
 * Денежные величины: снаружи — строки вида «1 234,56», внутри — целые копейки.
 */

/** «1 234,56» | «1234.56» | «-8» → копейки (может быть отрицательным). */
export function parseAmount(raw: string): number {
  const cleaned = raw
    .replace(/\s|\u00a0/g, "")
    .replace(",", ".")
    .replace(/[^\d.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) return 0;
  // Округление до копейки, а не отбрасывание: 0.005 должно стать 0.01.
  return Math.round(value * 100);
}

/** Копейки → «1234.56» (без разделителей тысяч — для записи в markdown). */
export function centsToString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const units = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}${units}.${String(rest).padStart(2, "0")}`;
}

/** Копейки → «1 234,56 ₽» для интерфейса. */
export function formatMoney(cents: number, currency: string, locale = "ru-RU"): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    // Неизвестный код валюты — не повод падать с исключением в интерфейсе.
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Компактный вид для плиток: 1 234 567 ₽ → 1,2 млн ₽. */
export function formatCompact(cents: number, currency: string, locale = "ru-RU"): string {
  const abs = Math.abs(cents) / 100;
  if (abs < 100_000) return formatMoney(cents, currency, locale);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(cents / 100);
  } catch {
    return formatMoney(cents, currency, locale);
  }
}

export function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

/** Доля part от whole в процентах; 0, если делить не на что. */
export function percent(part: number, whole: number): number {
  if (!whole) return 0;
  return (part / whole) * 100;
}
