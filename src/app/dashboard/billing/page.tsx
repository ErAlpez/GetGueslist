import Link from "next/link";
import { ArrowRight, CreditCard, ExternalLink, ReceiptText, ShieldCheck } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getDashboardSummary, requireWorkspaceContext } from "@/lib/workspace";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { AnimatedMetric } from "@/components/animated-metric";
import "./billing.css";

const money = (cents: number | null, locale: string, currency = "PHP") => {
  if (cents === null) return "Not configured";
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
};

export default async function BillingPage() {
  const { locale } = await getPreferences();
  const context = await requireWorkspaceContext();
  const prisma = getPrisma();
  const [summary, plans, subscription] = await Promise.all([
    getDashboardSummary(context.workspace.id),
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
  const eventLimit = subscription?.plan.activeEventLimit;
  const usagePercent = eventLimit
    ? Math.min(Math.round((summary.activeEvents / eventLimit) * 100), 100)
    : 0;

  return localizeNode((
    <div className="billing-page">
      <div className="page-heading-row"><div><div className="page-kicker">WORKSPACE</div><h1>Subscription & billing</h1><p>Review your plan, usage, and billing history.</p></div><span className="billing-secure"><ShieldCheck size={14} /> Secure billing foundation</span></div>
      <div className="billing-grid">
        <section className="app-panel current-plan-panel">
          <div className="panel-heading-row"><div><h2>Current plan</h2><p>Your workspace subscription.</p></div><span className="status-pill status-active">{subscription?.status.toLowerCase().replaceAll("_", " ") ?? "no plan"}</span></div>
          <div className="current-plan-name"><span className="plan-summary-mark">✳</span><span><strong>{subscription?.plan.name ?? "No plan assigned"}</strong><small>{money(subscription?.plan.monthlyPriceCents ?? null, locale)} / month</small></span></div>
          <div className="billing-usage">
            <div className="billing-usage-heading"><span>Active events</span><strong><AnimatedMetric locale={locale} value={summary.activeEvents} /> <small>/ {eventLimit ?? "Unlimited"}</small></strong></div>
            <div className="usage-bar"><span style={{ width: `${usagePercent}%` }} /></div>
            <div className="billing-usage-heading attendee-limit"><span>Attendee limit per event</span><strong>{subscription?.plan.attendeePerEventLimit != null ? <AnimatedMetric locale={locale} value={subscription.plan.attendeePerEventLimit} /> : "Unlimited"}</strong></div>
          </div>
          <div className="billing-period"><span>Billing period</span><strong>{subscription?.billingPeriodStart ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(subscription.billingPeriodStart) : "Not available"}{subscription?.billingPeriodEnd ? ` – ${new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(subscription.billingPeriodEnd)}` : ""}</strong></div>
          <div className="billing-period"><span>Renewal date</span><strong>{subscription?.renewalDate ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(subscription.renewalDate) : "Not scheduled"}</strong></div>
        </section>

        <section className="app-panel payment-method-panel">
          <div className="panel-heading-row"><div><h2>Payment methods</h2><p>Payment details are handled by your provider.</p></div><CreditCard size={16} /></div>
          {subscription?.paymentMethods.length ? subscription.paymentMethods.map((method) => (
            <div className="payment-method-row" key={method.id}><span className="payment-method-icon"><CreditCard size={16} /></span><span><strong>{method.brand ?? "Card"} ending in {method.last4 ?? "••••"}</strong><small>{method.expirationMonth && method.expirationYear ? `Expires ${method.expirationMonth}/${method.expirationYear}` : "Saved payment method"}</small></span>{method.isDefault && <span className="default-method">Default</span>}</div>
          )) : <div className="billing-empty"><CreditCard size={18} /><span>No payment method on file.</span></div>}
          <p className="provider-note">No payment provider is connected yet. Guest ticket payments and SaaS subscription billing remain separate.</p>
        </section>
      </div>

      <section className="app-panel plan-options-panel">
        <div className="panel-heading-row"><div><h2>Plans</h2><p>Plan names, prices, limits, and entitlements are stored in the database.</p></div></div>
        <div className="plan-options-grid">
          {plans.map((plan) => (
            <article className={`plan-option${plan.id === subscription?.planId ? " current" : ""}`} key={plan.id}>
              <span className="plan-option-tag">{plan.id === subscription?.planId ? "CURRENT PLAN" : plan.code}</span>
              <h3>{plan.name}</h3>
              <p>{plan.description}</p>
              <strong className="plan-option-price">{money(plan.monthlyPriceCents, locale)}<small> / month</small></strong>
              <span className="plan-option-limit">{plan.activeEventLimit ?? "Unlimited"} active events · {plan.attendeePerEventLimit?.toLocaleString() ?? "Unlimited"} attendees / event</span>
              <button className="plan-upgrade-button" disabled type="button">{plan.id === subscription?.planId ? "Current plan" : "Provider not configured"} <ExternalLink size={12} /></button>
            </article>
          ))}
        </div>
      </section>

      <section className="app-panel invoice-panel">
        <div className="panel-heading-row"><div><h2>Billing history</h2><p>Invoices and subscription charges.</p></div><ReceiptText size={16} /></div>
        {subscription?.invoices.length ? (
          <div className="invoice-list">{subscription.invoices.map((invoice) => (
            <div className="invoice-row" key={invoice.id}><span className="invoice-icon"><ReceiptText size={14} /></span><span><strong>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(invoice.issuedAt)}</strong><small>{invoice.status}</small></span><strong className="invoice-amount">{money(invoice.amountCents, locale, invoice.currency)}</strong>{invoice.invoiceUrl ? <a href={invoice.invoiceUrl} rel="noreferrer" target="_blank">View invoice <ArrowRight size={12} /></a> : <span className="invoice-unavailable">No invoice file</span>}</div>
          ))}</div>
        ) : <div className="billing-empty"><ReceiptText size={18} /><span>No billing history yet.</span></div>}
      </section>
      <p className="settings-security-note billing-footer-note"><ShieldCheck aria-hidden="true" size={14} /><span>Billing is not active until a payment provider is configured. No payment is simulated or charged from this page.</span></p>
      <Link className="billing-back-link" href="/dashboard"><ArrowRight size={13} /> Back to overview</Link>
    </div>
  ), locale);
}
