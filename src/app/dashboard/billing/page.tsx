import Link from "next/link";
import { ArrowRight, Check, CreditCard, ExternalLink, Gift, ReceiptText, ShieldCheck, Sparkles } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { requireWorkspaceSection } from "@/lib/workspace";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { getPlanFeatureLabels } from "@/lib/plan-features";
import {
  getPaddleBillingPeriodFromDates,
  getPaddleCheckoutConfig,
  isPaddleSubscriptionId,
} from "@/lib/payment-provider";
import {
  PlanPrice,
  PlanPricingPeriod,
} from "@/components/plan-pricing-period";
import { formatCurrencyMinorUnits } from "@/lib/currency-format";
import { AnimatedMetric } from "@/components/animated-metric";
import { PlanCheckoutForm } from "./plan-checkout-form";
import { PaddlePlanUpgradeForm } from "./paddle-plan-upgrade-form";
import { PaddleSubscriptionRenewalControl } from "./paddle-subscription-renewal-control";
import "./billing.css";

const money = (cents: number | null, locale: string, currency = "PHP") => {
  if (cents === null) return "Not configured";
  const fractionDigits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 10 ** fractionDigits);
};

export default async function BillingPage() {
  const { locale } = await getPreferences();
  const context = await requireWorkspaceSection("billing");
  const prisma = getPrisma();
  const [activeEvents, plans, subscription] = await Promise.all([
    prisma.event.count({
      where: {
        workspaceId: context.workspace.id,
        archivedAt: null,
        status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "ONGOING"] },
      },
    }),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { monthlyPriceCents: "asc" } }),
    prisma.subscription.findUnique({
      where: { workspaceId: context.workspace.id },
      include: {
        plan: true,
        invoices: { orderBy: { issuedAt: "desc" }, take: 10 },
        paymentMethods: { orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] },
      },
    }),
  ]);
  const paddleCheckoutConfig = getPaddleCheckoutConfig();
  const currentPaddleBillingPeriod = getPaddleBillingPeriodFromDates(
    subscription?.billingPeriodStart,
    subscription?.billingPeriodEnd,
  );
  const planPricingPeriod = currentPaddleBillingPeriod ?? "monthly";
  const currentPlanPriceMinor = subscription
    ? planPricingPeriod === "annual"
      ? subscription.plan.yearlyPriceCents
      : subscription.plan.monthlyPriceCents
    : undefined;
  const eventLimit = subscription?.plan.activeEventLimit;
  const hasActivePaddleSubscription = Boolean(subscription?.provider === "paddle"
    && isPaddleSubscriptionId(subscription.providerSubscriptionId)
    && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(subscription.status));
  const hasActiveManualPaddleTerm = Boolean(subscription?.provider === "paddle"
    && !isPaddleSubscriptionId(subscription.providerSubscriptionId)
    && ["ACTIVE", "TRIALING"].includes(subscription.status)
    && subscription.billingPeriodEnd
    && subscription.billingPeriodEnd > new Date());
  const manualPaddleRenewalDue = Boolean(subscription?.provider === "paddle"
    && (
      (!isPaddleSubscriptionId(subscription.providerSubscriptionId)
        && subscription?.billingPeriodEnd
        && subscription.billingPeriodEnd <= new Date())
      || (isPaddleSubscriptionId(subscription.providerSubscriptionId)
        && subscription.scheduledCancellationAt
        && subscription.scheduledCancellationAt <= new Date())
    )
    && !subscription.providerCheckoutId
    && subscription.status !== "PAST_DUE"
    && subscription.plan.code !== "FREE");
  const hasPendingPaddleCheckout = subscription?.provider === "paddle"
    && Boolean(subscription.providerCheckoutId);
  const canUpgradeStarterToMax = Boolean(
    hasActivePaddleSubscription &&
    subscription?.plan.code === "STARTER" &&
    ["ACTIVE", "TRIALING"].includes(subscription.status) &&
    (!subscription.scheduledCancellationAt || subscription.scheduledCancellationAt > new Date()) &&
    !hasPendingPaddleCheckout,
  );
  const paddleUpgradeConfigured = Boolean(
    (currentPaddleBillingPeriod === "annual"
      ? process.env.PADDLE_PRICE_PROFESSIONAL_ANNUAL?.trim()
      : currentPaddleBillingPeriod === "monthly"
        ? process.env.PADDLE_PRICE_PROFESSIONAL_MONTHLY?.trim()
        : undefined)?.startsWith("pri_") &&
    process.env.PADDLE_API_KEY?.trim() &&
    process.env.PADDLE_WEBHOOK_SECRET?.trim(),
  );
  const hasPaidPlanSyncIssue = hasActivePaddleSubscription && subscription?.plan.code === "FREE";
  const PlanIcon = subscription?.plan.code === "FREE" ? Gift : Sparkles;
  const usagePercent = eventLimit == null
    ? null
    : eventLimit === 0
      ? 0
      : Math.min(Math.round((activeEvents / eventLimit) * 100), 100);

  return localizeNode((
    <div className="billing-page">
      <div className="page-heading-row"><div><div className="page-kicker">WORKSPACE</div><h1>Subscription & billing</h1><p>Review your plan, usage, and billing history.</p></div><span className="billing-secure"><ShieldCheck size={14} /> Secure billing foundation</span></div>
      <div className="billing-grid">
        <section className="app-panel current-plan-panel">
          <div className="panel-heading-row"><div><h2>Current plan</h2><p>Your workspace subscription.</p></div><span className="status-pill status-active">{subscription?.status.toLowerCase().replaceAll("_", " ") ?? "no plan"}</span></div>
          <div className="current-plan-name"><span className="plan-summary-mark"><PlanIcon aria-hidden="true" size={21} /></span><span><strong>{subscription?.plan.name ?? "No plan assigned"}</strong><small>
            {subscription?.plan.code !== "FREE"
              ? currentPlanPriceMinor == null
                ? "Not configured"
                : formatCurrencyMinorUnits(locale, currentPlanPriceMinor, "USD")
              : money(subscription?.plan.monthlyPriceCents ?? null, locale)}
            {currentPaddleBillingPeriod === "annual" ? " / year" : " / month"}
          </small></span></div>
          <div className="billing-usage">
            <div className="billing-usage-heading"><span>Active events</span><strong><AnimatedMetric locale={locale} value={activeEvents} /> <small>/ {eventLimit ?? "Unlimited"}</small></strong></div>
            {usagePercent !== null && <div className="usage-bar"><span style={{ width: `${usagePercent}%` }} /></div>}
            <div className="billing-usage-heading attendee-limit"><span>Attendee limit per event</span><strong>{subscription?.plan.attendeePerEventLimit != null ? <AnimatedMetric locale={locale} value={subscription.plan.attendeePerEventLimit} /> : "Unlimited"}</strong></div>
          </div>
          <div className="billing-period"><span>Billing period</span><strong>{subscription?.billingPeriodStart ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(subscription.billingPeriodStart) : "Not available"}{subscription?.billingPeriodEnd ? ` – ${new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(subscription.billingPeriodEnd)}` : ""}</strong></div>
          <div className="billing-period"><span>Renewal date</span><strong>{subscription?.renewalDate ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(subscription.renewalDate) : "Not scheduled"}</strong></div>
          {hasActivePaddleSubscription && (
            <PaddleSubscriptionRenewalControl
              locale={locale}
              renewalDate={subscription?.renewalDate?.toISOString() ?? null}
              scheduledCancellationAt={subscription?.scheduledCancellationAt?.toISOString() ?? null}
            />
          )}
        </section>

        <section className="app-panel payment-method-panel">
          <div className="panel-heading-row"><div><h2>Payment methods</h2><p>Payment details are handled by your provider.</p></div><CreditCard size={16} /></div>
          {subscription?.paymentMethods.length ? subscription.paymentMethods.map((method) => (
            <div className="payment-method-row" key={method.id}><span className="payment-method-icon"><CreditCard size={16} /></span><span><strong>{method.brand ?? "Card"} ending in {method.last4 ?? "••••"}</strong><small>{method.expirationMonth && method.expirationYear ? `Expires ${method.expirationMonth}/${method.expirationYear}` : "Saved payment method"}</small></span>{method.isDefault && <span className="default-method">Default</span>}</div>
          )) : <div className="billing-empty"><CreditCard size={18} /><span>No payment method on file.</span></div>}
          <p className="provider-note">New Paddle plans use one-time prices and require manual renewal. Existing recurring subscriptions renew automatically unless auto-renew is turned off.</p>
        </section>
      </div>

      {hasPendingPaddleCheckout && (
        <div className="billing-subscription-notice" role="status">
          <ShieldCheck aria-hidden="true" size={17} />
          <p>
            Paddle updates your plan automatically through a secure webhook; no manual confirmation is needed. This checkout is still pending, so don’t retry until the notification reaches this app.
          </p>
        </div>
      )}

      {hasActivePaddleSubscription && (
        <div className="billing-subscription-notice" role="status">
          <ShieldCheck aria-hidden="true" size={17} />
          <p>
            {hasPaidPlanSyncIssue
              ? "Paddle reports an active subscription, but the plan is still Free. Check Paddle webhook delivery; cancellation remains available here to prevent future renewals."
              : subscription?.plan.code === "STARTER"
                ? "You can upgrade Starter to Max with an immediate prorated charge. Your current billing cycle stays the same, and Max access begins after Paddle confirms the update."
              : subscription?.scheduledCancellationAt
                ? "Auto-renew is off. Your plan remains active through the renewal date; make a manual payment after it ends to keep access."
                : "This existing subscription renews automatically through Paddle unless you turn off auto-renew in the billing period section above."}
          </p>
        </div>
      )}

      {hasActiveManualPaddleTerm && (
        <div className="billing-subscription-notice" role="status">
          <ShieldCheck aria-hidden="true" size={17} />
          <p>
            This plan was paid manually and will not renew automatically. Make another payment on or after the renewal date to continue access.
          </p>
        </div>
      )}

      <section className="app-panel plan-options-panel">
        <PlanPricingPeriod
          initialPeriod={planPricingPeriod}
          lockPeriod={hasActivePaddleSubscription && currentPaddleBillingPeriod !== null}
          header={
            <div className="panel-heading-row"><div><h2>Plans</h2><p>Compare plan limits and features. Paddle checkout uses its configured price IDs.</p></div></div>
          }
        >
          <div className="plan-options-grid">
            {plans.map((plan) => {
              const monthlyPriceMinor = plan.monthlyPriceCents;
              const annualPriceMinor = plan.yearlyPriceCents;
              const currencyCode = "USD";
              const checkoutDisabled = hasActivePaddleSubscription || hasActiveManualPaddleTerm
                || hasPendingPaddleCheckout
                || !paddleCheckoutConfig;
              const checkoutDisabledLabel = hasActivePaddleSubscription || hasActiveManualPaddleTerm || hasPendingPaddleCheckout
                ? "Manage current subscription first"
                : "Paddle checkout is not configured";
              const isStarterToMaxUpgrade = plan.code === "PROFESSIONAL"
                && hasActivePaddleSubscription
                && subscription?.plan.code === "STARTER";
              const upgradeDisabledLabel = hasPendingPaddleCheckout
                ? "Wait for pending checkout"
                : subscription?.status === "PAST_DUE"
                    ? "Resolve payment issue first"
                    : !currentPaddleBillingPeriod
                      ? "Waiting for billing period"
                      : !paddleUpgradeConfigured
                        ? "Paddle upgrades are not configured"
                        : "Upgrade unavailable";

              return (
                <article className={`plan-option${plan.id === subscription?.planId ? " current" : ""}`} key={plan.id}>
                  <span className="plan-option-tag">{plan.id === subscription?.planId ? "CURRENT PLAN" : plan.code}</span>
                  <h3>{plan.name}</h3>
                  <p>{plan.description}</p>
                  <PlanPrice
                    annualPriceMinor={annualPriceMinor}
                    className="plan-option-price-display"
                    currencyCode={currencyCode}
                    locale={locale}
                    monthlyPriceMinor={monthlyPriceMinor}
                  />
                  <span className="plan-option-limit">{plan.activeEventLimit ?? "Unlimited"} active events · {plan.attendeePerEventLimit?.toLocaleString(locale) ?? "Unlimited"} attendees / event</span>
                  <ul className="plan-option-features">
                    {getPlanFeatureLabels(plan.features).map((feature) => <li key={feature}><Check aria-hidden="true" size={13} />{feature}</li>)}
                  </ul>
                  {plan.id === subscription?.planId && manualPaddleRenewalDue ? (
                    <PlanCheckoutForm
                      buttonLabel="Pay for next period"
                      disabled={hasPendingPaddleCheckout || !paddleCheckoutConfig}
                      disabledLabel={hasPendingPaddleCheckout ? "Checkout pending" : "Paddle checkout is not configured"}
                      planCode={plan.code}
                    />
                  ) : plan.id === subscription?.planId ? (
                    <button className="plan-upgrade-button" disabled type="button">Current plan <ExternalLink size={12} /></button>
                  ) : plan.code === "FREE" ? (
                    <button className="plan-upgrade-button" disabled type="button">Not available <ExternalLink size={12} /></button>
                  ) : isStarterToMaxUpgrade ? (
                    <PaddlePlanUpgradeForm
                      disabled={!canUpgradeStarterToMax || !paddleUpgradeConfigured || !currentPaddleBillingPeriod}
                      disabledLabel={upgradeDisabledLabel}
                    />
                  ) : (
                    <PlanCheckoutForm
                      disabled={checkoutDisabled}
                      disabledLabel={checkoutDisabledLabel}
                      planCode={plan.code}
                    />
                  )}
                </article>
              );
            })}
          </div>
        </PlanPricingPeriod>
      </section>

      <section className="app-panel invoice-panel">
        <div className="panel-heading-row"><div><h2>Billing history</h2><p>Invoices and subscription charges.</p></div><ReceiptText size={16} /></div>
        {subscription?.invoices.length ? (
          <div className="invoice-list">{subscription.invoices.map((invoice) => (
            <div className="invoice-row" key={invoice.id}><span className="invoice-icon"><ReceiptText size={14} /></span><span><strong>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(invoice.issuedAt)}</strong><small>{invoice.status}</small></span><strong className="invoice-amount">{money(invoice.amountCents, locale, invoice.currency)}</strong>{invoice.invoiceUrl ? <a href={invoice.invoiceUrl} rel="noreferrer" target="_blank">View invoice <ArrowRight size={12} /></a> : <span className="invoice-unavailable">No invoice file</span>}</div>
          ))}</div>
        ) : <div className="billing-empty"><ReceiptText size={18} /><span>No billing history yet.</span></div>}
      </section>
      <p className="settings-security-note billing-footer-note"><ShieldCheck aria-hidden="true" size={14} /><span>
        Paddle plan access is granted only after its signed webhook confirms the subscription.
      </span></p>
      <Link className="billing-back-link" href="/dashboard"><ArrowRight size={13} /> Back to overview</Link>
    </div>
  ), locale);
}
