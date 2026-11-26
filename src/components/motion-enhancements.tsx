"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function MotionEnhancements() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/dashboard")) return;

    const selector = ".hero-content, .hero-preview, .section, .module-section, .analytics-band, .final-cta, .app-panel, .stat-card, .auth-card, .event-detail-hero, .form-section, .ticket-card, .pricing-card, .feature-card, .step-card, .audience-card, .analytics-card, .faq-item, .preview-stat, .preview-panel, .module-chip, .checkin-visual, .page-heading-row, .checkin-event-filter";

    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        if (!element.closest(".app-shell")) element.classList.add("motion-visible");
      });
      return;
    }

    const observed = new WeakSet<Element>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("motion-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -48px 0px", threshold: 0.08 });

    const observeTree = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      const candidates = node.matches(selector) ? [node] : [];
      candidates.push(...node.querySelectorAll<HTMLElement>(selector));
      candidates.forEach((element) => {
        if (element.closest(".app-shell") || observed.has(element)) return;
        observed.add(element);
        const siblings = Array.from(element.parentElement?.children ?? []).filter(
          (sibling) => sibling instanceof HTMLElement && sibling.matches(selector),
        );
        const stagger = Math.min(Math.max(siblings.indexOf(element), 0), 5);
        element.style.setProperty("--motion-delay", `${stagger * 70}ms`);
        element.classList.add("motion-reveal");
        observer.observe(element);
      });
    };

    observeTree(document.body);
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(observeTree));
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
