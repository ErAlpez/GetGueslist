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

export function getAnnualDiscountPercent(monthlyAmountMinor: number | null, annualAmountMinor: number | null) {
  if (
    monthlyAmountMinor === null ||
    annualAmountMinor === null ||
    monthlyAmountMinor <= 0 ||
    annualAmountMinor >= monthlyAmountMinor * 12
  ) {
    return null;
  }

  return Math.round(((monthlyAmountMinor * 12 - annualAmountMinor) / (monthlyAmountMinor * 12)) * 100);
}
