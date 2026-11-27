"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { formatCurrencyMinorUnits } from "@/lib/currency-format";

export type BillingPeriod = "monthly" | "annual";

const BillingPeriodContext = createContext<BillingPeriod>("monthly");

export function useBillingPeriod() {
  return useContext(BillingPeriodContext);
}

export function PlanPricingPeriod({
  children,
  header,
  initialPeriod = "monthly",
  lockPeriod = false,
}: {
  children: ReactNode;
  header?: ReactNode;
  initialPeriod?: BillingPeriod;
  lockPeriod?: boolean;
}) {
  const [period, setPeriod] = useState<BillingPeriod>(initialPeriod);
  const toggle = lockPeriod ? (
    <div aria-label="Current billing period" className="plan-pricing-toggle" role="group">
      <span className="plan-pricing-save">
        {period === "annual" ? "Annual billing · current cycle" : "Monthly billing · current cycle"}
      </span>
    </div>
  ) : (
    <div aria-label="Billing period" className="plan-pricing-toggle" role="group">
      <button
        aria-pressed={period === "monthly"}
        className="plan-pricing-toggle-label"
        onClick={() => setPeriod("monthly")}
        type="button"
      >
        Monthly
      </button>
      <button
        aria-checked={period === "annual"}
        aria-label="Annual billing"
        className="plan-pricing-toggle-switch"
        onClick={() => setPeriod((current) => current === "monthly" ? "annual" : "monthly")}
        role="switch"
        type="button"
      >
        <span />
      </button>
      <button
        aria-pressed={period === "annual"}
        className="plan-pricing-toggle-label"
        onClick={() => setPeriod("annual")}
        type="button"
      >
        Annual
        <span className="plan-pricing-save">2 months free</span>
      </button>
    </div>
  );

  return (
    <>
      {header
        ? <div className="plan-pricing-period-header">{header}{toggle}</div>
        : toggle}
      <BillingPeriodContext.Provider value={period}>{children}</BillingPeriodContext.Provider>
    </>
  );
}

export function PlanPrice({
  monthlyPriceMinor,
  annualPriceMinor,
  currencyCode,
  locale,
  className,
}: {
  monthlyPriceMinor: number | null;
  annualPriceMinor: number | null;
  currencyCode: string;
  locale: string;
  className: string;
}) {
  const period = useBillingPeriod();
  const isFree = monthlyPriceMinor === 0;
  const isAnnual = period === "annual" && !isFree;
  const priceMinor = isAnnual ? annualPriceMinor : monthlyPriceMinor;
  const price = isFree
    ? "0"
    : priceMinor === null
      ? "Unavailable"
      : formatCurrencyMinorUnits(locale, priceMinor, currencyCode);
  const unit = isFree
    ? "forever"
    : isAnnual
      ? "/ year"
      : "/ month";

  return (
    <div className={className}>
      <strong>{price}</strong>
      {unit && <span>{unit}</span>}
    </div>
  );
}
