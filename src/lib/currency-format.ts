export function formatCurrencyMinorUnits(locale: string, amountMinor: number, currencyCode: string) {
  const fractionDigits = new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
  }).resolvedOptions().maximumFractionDigits;
  if (fractionDigits === undefined) {
    throw new Error(`Could not determine the decimal precision for ${currencyCode}.`);
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: currencyCode === "USD" ? "narrowSymbol" : "code",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amountMinor / 10 ** fractionDigits);
}
