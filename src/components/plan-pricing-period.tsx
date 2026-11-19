"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type BillingPeriod = "monthly" | "annual";

const BillingPeriodContext = createContext<BillingPeriod>("monthly");

export function PlanPricingPeriod({ children, header }: { children: ReactNode; header?: ReactNode }) {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const toggle = (
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
      </button>
      <span className="plan-pricing-save">Save 2 months</span>
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
  monthlyPriceCents,
  locale,
  className,
}: {
  monthlyPriceCents: number | null;
  locale: string;
  className: string;
}) {
  const period = useContext(BillingPeriodContext);
  const isFree = monthlyPriceCents === 0;
  const isAnnual = period === "annual" && monthlyPriceCents !== null && !isFree;
  const priceCents = monthlyPriceCents === null
    ? null
    : isAnnual
      ? monthlyPriceCents * 10
      : monthlyPriceCents;
  const price = priceCents === null
    ? "Contact us"
    : new Intl.NumberFormat(locale, { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(priceCents / 100);
  const unit = isFree ? "forever" : isAnnual ? "/ year" : monthlyPriceCents === null ? "" : "/ month";

  return (
    <div className={className}>
      <strong>{price}</strong>
      {unit && <span>{unit}</span>}
    </div>
  );
}
