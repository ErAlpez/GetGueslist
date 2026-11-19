import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  LayoutDashboard,
  Nfc,
  QrCode,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  UsersRound,
  Zap,
} from "lucide-react";
import { LandingFrameHeader } from "@/components/landing-frame-header";
import { LandingSections } from "@/components/landing-sections";
import { LandingAuthModal, LandingAuthTrigger } from "@/components/landing-auth-modal";
import { StatisticCircle } from "@/components/statistic-circle";
import { PlanPrice, PlanPricingPeriod } from "@/components/plan-pricing-period";
import { getPreferences } from "@/lib/preferences";
import { getCurrentSession } from "@/lib/auth";
import { landingNavigationItems } from "@/lib/landing-navigation";
import { getPlanFeatureLabels } from "@/lib/plan-features";
import { getPrisma } from "@/lib/prisma";
import { localizeNode, translate } from "@/lib/localization";
import "./landing.css";
import "./landing-experience.css";

const featureCards = [
  {
    icon: CalendarDays,
    title: "Events, all in one place",
    text: "Create, publish, and manage every event from one calm, clear workspace.",
    tone: "mint",
  },
  {
    icon: UsersRound,
    title: "A guestlist that stays in sync",
    text: "Keep registrations, RSVPs, categories, and guest details organized as they change.",
    tone: "lavender",
  },
  {
    icon: QrCode,
    title: "Tickets that check in fast",
    text: "Give every guest a unique QR ticket and welcome them with a quick scan.",
    tone: "peach",
  },
  {
    icon: ScanLine,
    title: "Attendance you can trust",
    text: "See who arrived, when they checked in, and how the event is moving.",
    tone: "blue",
  },
];

const faqs = [
  {
    question: "What is VenuGuestPass?",
    answer: "VenuGuestPass is an event operations workspace for organizing registrations, invitations, guestlists, tickets, and check-in in one place.",
  },
  {
    question: "Can I start for free?",
    answer: "Yes. The Free plan is designed to help you get started with one active event and up to 50 attendees per event.",
  },
  {
    question: "Does VenuGuestPass support QR check-in?",
    answer: "QR ticketing and attendance are part of the product foundation. The webcam scanner is being built as part of the initial release.",
  },
  {
    question: "Can my team manage events together?",
    answer: "Team workspaces and role-based access are part of the platform architecture. Team collaboration features will roll out in a later release.",
  },
];

function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link aria-label="VenuGuestPass home" className={`brand${light ? " brand-light" : ""}`} href="/">
      <BrandMark />
      <span>VenuGuestPass</span>
    </Link>
  );
}

const previewStats = [
  { label: "Total events", value: "6", note: "In your workspace", icon: CalendarDays, tone: "blue", progress: 100 },
  { label: "Active events", value: "1", note: "Published or ongoing", icon: ArrowUpRight, tone: "violet", progress: 17 },
  { label: "Upcoming events", value: "3", note: "Scheduled ahead", icon: CalendarDays, tone: "amber", progress: 50 },
  { label: "Completed events", value: "2", note: "In your workspace", icon: CheckCircle2, tone: "green", progress: 33 },
  { label: "Total attendees", value: "120", note: "Across all events", icon: UsersRound, tone: "pink", progress: 100 },
  { label: "Checked in", value: "84", note: "70% of registrations", icon: CheckCircle2, tone: "cyan", progress: 70 },
  { label: "Not checked in", value: "36", note: "Awaiting arrival", icon: Clock3, tone: "slate", progress: 30 },
  { label: "Attendance rate", value: "70%", note: "Checked in / registrations", icon: ArrowUpRight, tone: "purple", progress: 70 },
];

function ProductPreview({ locale }: { locale: Parameters<typeof localizeNode>[1] }) {
  return localizeNode((
    <div aria-label="Illustrative preview of the VenuGuestPass event dashboard" className="preview-frame" role="img">
      <div className="preview-dashboard">
        <aside className="preview-dashboard-sidebar">
          <div className="preview-dashboard-brand"><BrandMark className="mini-mark" /> VenuGuestPass</div>
          <span className="preview-dashboard-label">WORKSPACE</span>
          <span className="preview-dashboard-nav active"><LayoutDashboard size={11} /> Overview</span>
          <span className="preview-dashboard-nav"><CalendarDays size={11} /> My events</span>
          <span className="preview-dashboard-nav"><UsersRound size={11} /> Attendees</span>
          <span className="preview-dashboard-nav"><Ticket size={11} /> Tickets</span>
          <span className="preview-dashboard-nav"><ScanLine size={11} /> Check-in</span>
          <span className="preview-dashboard-nav"><BarChart3 size={11} /> Reports & analytics</span>
          <span className="preview-dashboard-label">MANAGE</span>
          <span className="preview-dashboard-nav"><CreditCard size={11} /> Subscription & billing</span>
          <span className="preview-dashboard-nav"><Settings2 size={11} /> Settings</span>
        </aside>
        <div className="preview-dashboard-workspace">
          <div className="preview-dashboard-topbar">
            <span className="preview-dashboard-search"><Search size={11} /> Search events...</span>
            <span className="preview-dashboard-topbar-actions"><Bell size={12} /><span className="preview-dashboard-avatar">A</span></span>
          </div>
          <div className="preview-dashboard-content">
            <div className="preview-dashboard-heading">
              <div><span className="preview-dashboard-kicker">OVERVIEW</span><h3>Good morning, Alex</h3><span>Here’s the latest from Studio North.</span></div>
              <span className="preview-dashboard-create">+ &nbsp; Create event</span>
            </div>
            <div className="preview-dashboard-stats">
              {previewStats.map(({ label, value, note, icon: Icon, tone, progress }) => (
                <div className={`preview-dashboard-stat preview-tone-${tone}`} key={label}>
                  <span className="preview-dashboard-stat-label">{label}</span>
                  <span className="preview-dashboard-stat-icon"><Icon size={10} /></span>
                  <strong className="preview-dashboard-ring">
                    <svg aria-hidden="true" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" pathLength="100" strokeDasharray="100 100" strokeDashoffset={100 - progress} /></svg>
                    {value}
                  </strong>
                  <span className="preview-dashboard-stat-note">{note}</span>
                </div>
              ))}
            </div>
            <div className="preview-dashboard-panels">
              <div className="preview-dashboard-panel">
                <div className="preview-dashboard-panel-heading"><strong>Upcoming events</strong><span>View all <ArrowRight size={9} /></span></div>
                <span className="preview-dashboard-panel-caption">Your next events at a glance.</span>
                <div className="preview-dashboard-event"><span className="preview-dashboard-date">MAY<br /><b>24</b></span><span><strong>Gather & Grow</strong><small>May 24 · The Greenhouse</small></span><span className="preview-dashboard-status">Registration open</span></div>
              </div>
              <div className="preview-dashboard-panel">
                <div className="preview-dashboard-panel-heading"><strong>Your plan</strong><span>Manage <ArrowRight size={9} /></span></div>
                <span className="preview-dashboard-panel-caption">Usage for the current plan.</span>
                <div className="preview-dashboard-plan"><span>✳</span><strong>Free plan</strong></div>
                <div className="preview-dashboard-usage"><span>Active events</span><strong>1 / 1</strong></div>
                <div className="preview-dashboard-progress"><span /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ), locale);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ locale }, session, params, plans, reviews] = await Promise.all([
    getPreferences(),
    getCurrentSession(),
    searchParams,
    getPrisma().plan.findMany({ where: { isActive: true }, orderBy: { monthlyPriceCents: "asc" } }),
    getPrisma().platformReview.findMany({
      where: { rating: 5, status: "APPROVED", publicationConsent: true },
      select: { id: true, authorName: true, workspaceName: true, message: true },
      orderBy: [{ moderatedAt: "desc" }, { createdAt: "desc" }],
      take: 6,
    }),
  ]);
  const authMode = params.auth === "sign-up" ? "sign-up" : "sign-in";
  const openAuthModal = params.auth === "sign-in" || params.auth === "sign-up";
  const showDemoAccount = params.demo === "account";

  return localizeNode((
    <main className="landing-page">
      <noscript><style>{".landing-page{height:auto!important;overflow:visible!important}.landing-page .landing-frame{height:auto!important;overflow:visible!important}.landing-page .landing-experience{display:block!important}.landing-page .landing-deck{overflow:visible!important}.landing-page .landing-slide{position:static!important;opacity:1!important;visibility:visible!important;transform:none!important;overflow:visible!important}"}</style></noscript>
      <LandingAuthModal authenticated={Boolean(session)} initialMode={authMode} openInitially={openAuthModal} showDemoAccount={showDemoAccount}>
      <div className="landing-frame">
      <LandingFrameHeader locale={locale} session={session} />

      <LandingSections labels={landingNavigationItems.map(({ label }) => translate(locale, label))}>
      <section className="hero" id="home">
        <div className="hero-grid" />
        <div className="hero-content">
          <div className="section-kicker hero-kicker">A calmer way to run events</div>
          <h1><span>Every guest.</span>{" "}<span>Every event.</span><br /><span>Under control.</span></h1>
          <p>Manage registrations, invitations, guestlists, tickets, and attendance in one powerful platform built for every kind of event.</p>
          <div className="hero-actions">
            <LandingAuthTrigger className="button button-dark button-large" mode="sign-up">Get started free <ArrowRight size={16} /></LandingAuthTrigger>
            <a className="button button-light button-large" href="#features">Explore features <ArrowDownRight size={16} /></a>
          </div>
          <div className="hero-note"><ShieldCheck size={15} /> Free to get started <span /> No card required</div>
        </div>
        <div className="hero-showcase">
          <div className="hero-aside hero-aside-start">
            <span className="hero-aside-index"><CalendarDays size={16} /> 01</span>
            <strong>Set the scene</strong>
            <p>Create your event, choose how guests register, and bring the important details together.</p>
          </div>
          <div className="hero-preview"><ProductPreview locale={locale} /></div>
          <div className="hero-aside hero-aside-end">
            <span className="hero-aside-index"><QrCode size={16} /> 02</span>
            <strong>Unique by design</strong>
            <p>Each ticket gets its own secure identifier.</p>
            <a href="#features">Explore features <ArrowUpRight size={14} /></a>
          </div>
        </div>
        <div className="hero-bottom">
          <span>ONE WORKSPACE FOR THE DETAILS THAT MAKE IT HAPPEN</span>
          <div><span><CalendarDays size={15} /> Plan</span><span><UsersRound size={15} /> Organize</span><span><QrCode size={15} /> Welcome</span><span><Sparkles size={15} /> Learn</span></div>
        </div>
      </section>

      <section className="section trust-section" id="features">
        <div className="section-kicker">LESS SPREADSHEETS. MORE IN-SYNC.</div>
        <h2>All the moving parts.<br /><span>Finally moving together.</span></h2>
        <p className="section-lead">The event is the experience. VenuGuestPass takes care of the coordination behind it, so the right details are there when you need them.</p>
        <div className="feature-grid">
          {featureCards.map(({ icon: Icon, title, text, tone }) => (
            <article className="feature-card" key={title}>
              <div className={`feature-icon ${tone}`}><Icon size={20} strokeWidth={1.8} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
              <a className="text-link" href="#how-it-works">Explore feature <ArrowRight size={14} /></a>
            </article>
          ))}
        </div>
      </section>

      <section className="section audience-section" id="solutions">
        <div className="audience-copy">
          <div className="section-kicker">BUILT FOR THE PEOPLE BRINGING PEOPLE TOGETHER</div>
          <h2>One platform.<br /><span>Every kind of gathering.</span></h2>
          <p className="section-lead">From a close-knit workshop to a room full of new ideas, organize the details without losing sight of the people.</p>
          <a className="text-link" href="#how-it-works">Find your event flow <ArrowRight size={14} /></a>
        </div>
        <div className="audience-grid">
          <div className="audience-card aqua"><span className="audience-emoji"><UsersRound aria-hidden="true" size={24} /></span><span className="audience-label">COMMUNITY</span><strong>Meetups &<br />workshops</strong><span className="audience-arrow"><ArrowUpRight size={18} /></span></div>
          <div className="audience-card peach-bg"><span className="audience-emoji">◒</span><span className="audience-label">CULTURE</span><strong>Private &<br />social events</strong><span className="audience-arrow"><ArrowUpRight size={18} /></span></div>
          <div className="audience-card lilac-bg"><span className="audience-emoji">✦</span><span className="audience-label">BUSINESS</span><strong>Conferences &<br />brand experiences</strong><span className="audience-arrow"><ArrowUpRight size={18} /></span></div>
          <div className="audience-card yellow-bg"><span className="audience-emoji">⌁</span><span className="audience-label">ORGANIZATIONS</span><strong>Team &<br />company events</strong><span className="audience-arrow"><ArrowUpRight size={18} /></span></div>
        </div>
      </section>

      <section className="section steps-section" id="how-it-works">
        <div className="center-heading">
          <div className="section-kicker">A LITTLE LESS TO JUGGLE</div>
          <h2>From idea to <span>“glad you came.”</span></h2>
          <p className="section-lead">A clear path from the first invite to the last guest through the door.</p>
        </div>
        <div className="steps-grid">
          <article className="step-card"><span className="step-number">01</span><div className="step-icon"><CalendarDays size={21} /></div><h3>Set the scene</h3><p>Create your event, choose how guests register, and bring the important details together.</p><span className="step-line" /></article>
          <article className="step-card"><span className="step-number">02</span><div className="step-icon lilac-step"><UsersRound size={21} /></div><h3>Know who’s coming</h3><p>Keep registrations and guest details organized, with a guestlist your team can trust.</p><span className="step-line" /></article>
          <article className="step-card"><span className="step-number">03</span><div className="step-icon peach-step"><QrCode size={21} /></div><h3>Make arrivals easy</h3><p>Give every guest a ticket and keep check-in moving with clear attendance records.</p><span className="step-line" /></article>
        </div>
      </section>

      <section className="module-section" id="modules">
        <div className="module-visual">
          <div className="module-network">
            <div className="module-orbit orbit-one" /><div className="module-orbit orbit-two" />
            <div className="module-node chip-registration"><div className="module-chip"><span className="chip-check"><Check size={11} /></span> Registration</div></div>
            <div className="module-node chip-invitations"><div className="module-chip">Invitations</div></div>
            <div className="module-node chip-nfc-checkin"><div className="module-chip">NFC Check-In</div></div>
            <div className="module-node chip-tickets"><div className="module-chip"><span className="chip-check"><Check size={11} /></span> QR tickets</div></div>
            <div className="module-node chip-custom-question"><div className="module-chip">Custom Question</div></div>
            <div className="module-node chip-active-events"><div className="module-chip">Active Events</div></div>
            <div className="module-node chip-export-venuguestpass"><div className="module-chip">Export attendees</div></div>
            <div className="module-node chip-attendance"><div className="module-chip"><span className="chip-check"><Check size={11} /></span> Attendance</div></div>
            <div className="module-node chip-rsvp"><div className="module-chip">RSVP <span className="chip-muted">optional</span></div></div>
            <div className="module-node chip-meals"><div className="module-chip">Meals <span className="chip-muted">optional</span></div></div>
            <div className="module-node chip-sessions"><div className="module-chip">Sessions <span className="chip-muted">optional</span></div></div>
          </div>
          <div className="module-core"><strong>One event</strong><small>your way</small></div>
        </div>
        <div className="module-copy">
          <div className="section-kicker">FLEXIBLE BY DESIGN</div>
          <h2>Your event.<br /><span>Your mix of modules.</span></h2>
          <p className="section-lead">Not every event needs the same toolkit. Turn on the pieces that fit, and keep everything else out of the way.</p>
          <div className="module-list"><span><Check size={15} /> Start with the essentials</span><span><Check size={15} /> Add modules when you need them</span><span><Check size={15} /> Keep your event data together</span></div>
          <LandingAuthTrigger className="text-link" mode="sign-up">Build your first event <ArrowRight size={14} /></LandingAuthTrigger>
        </div>
      </section>

      <section className="section checkin-section" id="check-in">
        <div className="checkin-copy">
          <div className="section-kicker">A WELCOME, NOT A WAIT</div>
          <h2>Check in with a<br /><span>little more confidence.</span></h2>
          <p className="section-lead">Unique QR tickets and clear validation help your team welcome guests quickly and keep attendance accurate.</p>
          <div className="checkin-points">
            <div><span className="point-icon"><QrCode size={17} /></span><span><strong>Unique by design</strong><small>Each ticket gets its own secure identifier.</small></span></div>
            <div><span className="point-icon lilac-point"><ScanLine size={17} /></span><span><strong>Clear at the door</strong><small>See valid, used, and cancelled tickets at a glance.</small></span></div>
            <div><span className="point-icon peach-point"><Clock3 size={17} /></span><span><strong>Recorded as it happens</strong><small>Keep a time-stamped attendance history.</small></span></div>
          </div>
          <p className="phase-note"><Nfc size={13} /> Write NFC tickets on Android and scan them at the door; Mac requires a compatible external reader.</p>
        </div>
        <div className="checkin-visual">
          <div className="phone-card">
            <div className="phone-top"><span className="phone-dot" /><span>VENUGUESTPASS CHECK-IN</span><span className="phone-more">···</span></div>
            <div className="scan-stage"><div className="scan-corner corner-tl" /><div className="scan-corner corner-tr" /><div className="scan-corner corner-bl" /><div className="scan-corner corner-br" /><QrCode size={106} strokeWidth={1.1} /><span className="scan-laser" /></div>
            <div className="checkin-toast"><span className="toast-check"><Check size={16} /></span><span><strong>You’re all set, Jamie!</strong><small>Checked in at 10:42 AM</small></span><BadgeCheck size={19} className="toast-badge" /></div>
            <div className="phone-footer"><span><span className="live-dot" /> SCANNER READY</span><span>Gather & Grow</span></div>
          </div>
          <div className="float-note"><span className="float-note-icon"><Zap size={14} /></span><span><strong>One quick scan</strong><small>and they’re on the list.</small></span></div>
        </div>
      </section>

      <section className="analytics-band" id="reports">
        <div className="analytics-copy"><div className="section-kicker">SEE THE SHAPE OF YOUR EVENT</div><h2>Make the next one<br /><span>even more you.</span></h2><p>Understand registrations and attendance with straightforward reporting, not another complicated spreadsheet.</p></div>
        <div className="analytics-card landing-report-preview" role="img" aria-label="Sample Reports and analytics dashboard for Gather and Grow">
          <div className="landing-report-header">
            <div><span className="landing-report-eyebrow">INSIGHTS</span><h3>Reports &amp; analytics</h3></div>
            <span className="landing-report-export"><ArrowDownRight aria-hidden="true" size={12} /> Export CSV</span>
          </div>
          <div className="landing-report-filters">
            <span className="landing-report-filter"><CalendarDays aria-hidden="true" size={12} /> Gather &amp; Grow</span>
            <span className="landing-report-filter"><Clock3 aria-hidden="true" size={12} /> Last 7 days</span>
            <span className="landing-report-sample-label">SAMPLE</span>
          </div>
          <div className="landing-report-stats">
            <div className="landing-report-stat stat-total-attendees"><span>Total registrations</span><StatisticCircle locale={locale} value={128} total={128} /><small>Across this event</small></div>
            <div className="landing-report-stat stat-checked-in"><span>Checked in</span><StatisticCircle locale={locale} value={84} total={128} /><small>Guests arrived</small></div>
            <div className="landing-report-stat stat-not-checked-in"><span>Not checked in</span><StatisticCircle locale={locale} value={44} total={128} /><small>Awaiting arrival</small></div>
            <div className="landing-report-stat stat-attendance-rate"><span>Attendance rate</span><StatisticCircle locale={locale} value={66} total={100} percentage /><small>Of registrations</small></div>
          </div>
          <div className="landing-report-grid">
            <div className="landing-report-panel">
              <div className="landing-report-panel-heading"><div><h4>Registration trend</h4><p>Daily registrations</p></div><BarChart3 aria-hidden="true" size={13} /></div>
              <div className="landing-report-chart" aria-hidden="true">
                <div><span>14</span><i style={{ height: "50%" }} /><small>Mon</small></div>
                <div><span>12</span><i style={{ height: "43%" }} /><small>Tue</small></div>
                <div><span>19</span><i style={{ height: "68%" }} /><small>Wed</small></div>
                <div><span>23</span><i style={{ height: "82%" }} /><small>Thu</small></div>
                <div><span>17</span><i style={{ height: "61%" }} /><small>Fri</small></div>
                <div><span>28</span><i style={{ height: "100%" }} /><small>Sat</small></div>
                <div><span>15</span><i style={{ height: "54%" }} /><small>Sun</small></div>
              </div>
            </div>
            <div className="landing-report-panel landing-report-attendance">
              <div className="landing-report-panel-heading"><div><h4>Attendance</h4><p>Check-in progress</p></div></div>
              <strong>66%</strong>
              <p>84 of 128 registrations checked in</p>
              <div className="landing-report-progress"><span /></div>
              <div className="landing-report-legend"><span>Checked in <b>84</b></span><span>Not checked in <b>44</b></span></div>
            </div>
          </div>
          <div className="landing-report-activity">
            <div className="landing-report-panel-heading"><div><h4>Recent attendance activity</h4><p>Latest check-ins</p></div><ArrowUpRight aria-hidden="true" size={12} /></div>
            <div className="landing-report-activity-row"><CheckCircle2 aria-hidden="true" size={14} /><span><strong>Guest checked in</strong><small>Gather &amp; Grow</small></span><time>10:42 AM</time></div>
            <div className="landing-report-activity-row"><CheckCircle2 aria-hidden="true" size={14} /><span><strong>Guest checked in</strong><small>Gather &amp; Grow</small></span><time>10:38 AM</time></div>
          </div>
        </div>
      </section>

      <section className="section pricing-section" id="pricing">
        <div className="center-heading">
          <div className="section-kicker">SIMPLE, TRANSPARENT PRICING</div>
          <h2>A plan for every <span>event program.</span></h2>
          <p className="section-lead">Choose the capacity and tools that fit your team, with clear monthly and annual pricing.</p>
        </div>
        <PlanPricingPeriod>
          <div className="pricing-plan-grid">
            {plans.map((plan) => (
              <article className={`pricing-plan-card${plan.code === "PROFESSIONAL" ? " is-popular" : ""}`} key={plan.id}>
                <span className="pricing-plan-badge">{plan.code === "PROFESSIONAL" ? "MOST POPULAR" : `${plan.name.toUpperCase()} PLAN`}</span>
                <h3>{plan.name}</h3>
                <p>{plan.description}</p>
                <PlanPrice className="pricing-plan-monthly" locale={locale} monthlyPriceCents={plan.monthlyPriceCents} />
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
            ))}
          </div>
        </PlanPricingPeriod>
        <p className="pricing-plan-note">Prices are in PHP. Annual plans include two months free. Paid plan checkout will open once billing is configured.</p>
      </section>

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

      <section className="section faq-section" id="faq">
        <div className="faq-heading"><div className="section-kicker">GOOD QUESTIONS</div><h2>Before the<br /><span>first guest arrives.</span></h2><p>Something else on your mind? <a href="mailto:hello@guestlist.app">Talk to us <ArrowUpRight size={13} /></a></p></div>
        <div className="faq-list">{faqs.map((faq, index) => <details className="faq-item" key={faq.question} name="landing-faq"><summary><span className="faq-index">0{index + 1}</span><span>{faq.question}</span><ChevronDown size={17} /></summary><p>{faq.answer}</p></details>)}</div>
      </section>

      <div className="landing-end" id="get-started">
      <section className="final-cta">
        <div className="cta-content"><span className="section-kicker">YOUR NEXT EVENT STARTS HERE</span><h2>Make room for<br />a better <em>gathering.</em></h2><p>Start with a free workspace. Bring your event details, your guestlist, and your team together.</p><LandingAuthTrigger className="button button-cream button-large" mode="sign-up">Create your free workspace <ArrowRight size={16} /></LandingAuthTrigger></div>
      </section>

      <footer className="site-footer">
        <div className="footer-main">
          <div className="footer-brand"><Brand light /><p>Good events have a lot of moving parts.<br />We help you bring them together.</p></div>
          <div className="footer-col"><span>EXPLORE</span><a href="#features">Features</a><a href="#solutions">Solutions</a><a href="#how-it-works">How it works</a><a href="#pricing">Pricing</a></div>
          <div className="footer-col"><span>VENUGUESTPASS</span><a href="#faq">About the platform</a><a href="#faq">FAQs</a><Link href="/login">Sign in</Link><Link href="/sign-up">Get started</Link></div>
          <div className="footer-note"><div className="footer-note-mark">✳</div><strong>Thoughtful events<br />start with thoughtful details.</strong><span>One guest at a time.</span></div>
        </div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} VenuGuestPass. All rights reserved.</span><div><Link href="/privacy">Privacy</Link><span aria-hidden="true">|</span><Link href="/terms">Terms</Link></div></div>
      </footer>
      </div>
      </LandingSections>
      </div>
      </LandingAuthModal>
    </main>
  ), locale);
}
