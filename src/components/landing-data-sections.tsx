import "server-only";

import { ArrowRight, Check, CreditCard, Star } from "lucide-react";
import { LandingAuthTrigger } from "@/components/landing-auth-modal";
import { PlanPrice, PlanPricingPeriod } from "@/components/plan-pricing-period";
import { localizeNode, type Locale } from "@/lib/localization";
import { getPlanFeatureLabels } from "@/lib/plan-features";
import { getPrisma } from "@/lib/prisma";

export async function LandingPricingSection({ locale }: { locale: Locale }) {
  const plans = await getPrisma().plan.findMany({
    where: { isActive: true },
    orderBy: { monthlyPriceCents: "asc" },
  });

  return localizeNode((
    <section className="section pricing-section" id="pricing">
      <div className="center-heading">
        <div className="section-kicker">SIMPLE, TRANSPARENT PRICING</div>
        <h2>A plan for every <span>event program.</span></h2>
        <p className="section-lead">Choose monthly or annual access for your team. Plans do not renew automatically; your paid features remain available until the access end date.</p>
      </div>
      <PlanPricingPeriod>
        <div className="pricing-plan-grid">
          {plans.map((plan) => {
            const monthlyPriceMinor = plan.monthlyPriceCents;
            const annualPriceMinor = plan.yearlyPriceCents;
            const currencyCode = "USD";

            return (
              <article className={`pricing-plan-card${plan.code === "PROFESSIONAL" ? " is-popular" : ""}`} key={plan.id}>
                <span className="pricing-plan-badge">{plan.code === "PROFESSIONAL" ? "MOST POPULAR" : `${plan.name.toUpperCase()} PLAN`}</span>
                <h3>{plan.name}</h3>
                <p>{plan.description}</p>
                <PlanPrice
                  annualPriceMinor={annualPriceMinor}
                  className="pricing-plan-monthly"
                  currencyCode={currencyCode}
                  locale={locale}
                  monthlyPriceMinor={monthlyPriceMinor}
                />
                <div className="pricing-plan-limits">
                  <span><strong>{plan.activeEventLimit ?? "Unlimited"}</strong> active events</span>
                  <span><strong>{plan.attendeePerEventLimit?.toLocaleString(locale) ?? "Unlimited"}</strong> attendees per event</span>
                </div>
                <ul className="pricing-plan-features">
                  {getPlanFeatureLabels(plan.features).map((feature) => <li key={feature}><Check size={14} />{feature}</li>)}
                </ul>
                {plan.code === "FREE"
                  ? <LandingAuthTrigger className="button button-dark pricing-cta pricing-plan-cta" mode="sign-up">Get started free <ArrowRight size={15} /></LandingAuthTrigger>
                  : <button className="button button-dark pricing-cta pricing-plan-cta" disabled type="button">Paid plan coming soon</button>}
              </article>
            );
          })}
        </div>
      </PlanPricingPeriod>
      <div className="pricing-plan-note">
        <CreditCard aria-hidden="true" className="pricing-plan-note-icon" size={12} />
        <span className="pricing-plan-note-copy">Find the plan that fits your events. Grow with tools designed for every stage.</span>
      </div>
    </section>
  ), locale);
}

export async function LandingReviewsSection({ locale }: { locale: Locale }) {
  const reviews = await getPrisma().platformReview.findMany({
    where: { rating: 5, status: "APPROVED", publicationConsent: true },
    select: { id: true, authorName: true, workspaceName: true, message: true },
    orderBy: [{ moderatedAt: "desc" }, { createdAt: "desc" }],
    take: 6,
  });

  return localizeNode((
    <section className="section reviews-section" id="reviews">
      <div className="center-heading">
        <div className="section-kicker">FROM EVENT TEAMS</div>
        <h2>Kind words from <span>our community.</span></h2>
        <p className="section-lead">Shared by workspace owners and published with their permission.</p>
      </div>
      {reviews.length ? (
        <div className="public-review-grid">
          {reviews.map((review) => (
            <article className="public-review-card" key={review.id}>
              <div aria-label="5 out of 5 stars" className="public-review-stars" role="img">
                {Array.from({ length: 5 }, (_, index) => <Star aria-hidden="true" fill="currentColor" key={index} size={15} />)}
              </div>
              <blockquote>{review.message}</blockquote>
              <div className="public-review-author">
                <strong>{review.authorName}</strong>
                <span>{review.workspaceName}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="public-review-empty">Owner reviews will appear here when shared and approved.</p>
      )}
    </section>
  ), locale);
}
