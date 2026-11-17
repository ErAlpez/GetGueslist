"use client";

import { useEffect } from "react";
import "./dashboard-motion.css";

const revealSelector = [
  ".app-sidebar",
  ".app-topbar",
  ".app-sidebar :is(.sidebar-brand-row, .app-nav-link, .plan-nudge, .sidebar-footer)",
  ".app-topbar :is(.topbar-search, .topbar-right > *)",
  ".app-content .page-heading-row",
  ".app-content .event-editor-heading",
  ".app-content :is(section, article, form, nav, table, .app-panel, .form-field)",
  ".app-content :is(button, a[href], select, textarea, input:not([type=hidden]):not([type=file]))",
  ".app-content :is(.dashboard-event, .registration-row, .recent-checkin-row, .manual-attendee, .module-setting-row, .payment-method-row, .invoice-row, .registration-question-editor)",
  ".app-content :is(.event-metric-grid > div, .event-overview-links > a, .overview-chart-column, .registration-chart-column, tbody > tr)",
  ".app-content :is(.checkin-event-filter, .table-pagination, .form-save-actions, .event-form-actions, .profile-picture-actions, .billing-footer-note, .billing-back-link, .empty-state)",
].join(", ");

const horizontalBarSelector = ".app-content :is(.usage-bar, .attendance-summary-bar)";
const chartBarSelector = ".app-content :is(.overview-chart-column, .registration-chart-column) > div";
const statCircleSelector = ".app-content .statistic-circle";
const selector = `${revealSelector}, ${horizontalBarSelector}, ${chartBarSelector}, ${statCircleSelector}`;

export function DashboardMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".app-shell");
    if (!root || !("IntersectionObserver" in window) || !("animate" in Element.prototype)) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observed = new Set<Element>();
    const animations = new Map<Element, Animation>();
    const revealed = new Set<Element>();
    const cancel = (element: Element) => {
      animations.get(element)?.cancel();
      animations.delete(element);
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        const horizontal = target.matches(horizontalBarSelector);
        const chart = target.matches(chartBarSelector);
        const circle = target.matches(statCircleSelector);
        const progress = circle || horizontal || chart;
        if (!isIntersecting) {
          if (progress) cancel(target);
          else if (!animations.has(target)) revealed.delete(target);
          return;
        }
        if (!progress && revealed.has(target)) return;
        if (!progress) revealed.add(target);
        if (reducedMotion.matches || target.contains(document.activeElement)) return;

        cancel(target);
        const animatedElement = horizontal
          ? target.querySelector(":scope > span")
          : chart
            ? target.querySelector(":scope > i")
            : circle
              ? target.querySelector(":scope > svg > circle")
              : target;
        if (!animatedElement) return;
        const circleOffset = circle ? animatedElement.getAttribute("stroke-dashoffset") : null;
        if (circle && circleOffset === null) throw new Error("Statistic circle is missing its stroke-dashoffset.");
        const hiddenEdge = document.documentElement.dir === "rtl" ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)";
        const keyframes = horizontal
          ? [{ clipPath: hiddenEdge }, { clipPath: "inset(0 0 0 0)" }]
          : chart
            ? [{ clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0 0 0 0)" }]
            : circleOffset !== null
              ? [{ strokeDashoffset: "100" }, { strokeDashoffset: circleOffset }]
              : [{ opacity: 0.35, translate: "0 12px" }, { opacity: 1, translate: "0 0" }];
        const animation = animatedElement.animate(keyframes, {
          duration: circle ? 1400 : horizontal || chart ? 1200 : 500,
          delay: progress ? 200 : 0,
          fill: progress ? "backwards" : "none",
          easing: "cubic-bezier(.2, .7, .2, 1)",
        });
        animations.set(target, animation);
        animation.onfinish = () => {
          if (animations.get(target) !== animation) return;
          animations.delete(target);
          if (!progress && observed.has(target)) {
            observer.unobserve(target);
            observer.observe(target);
          }
        };
      });
    }, { threshold: 0.01 });

    const observeTree = (node: Node) => {
      if (!(node instanceof Element)) return;
      const candidates = node.matches(selector) ? [node] : [];
      candidates.push(...node.querySelectorAll(selector));
      candidates.forEach((element) => {
        if (observed.has(element)) return;
        observed.add(element);
        observer.observe(element);
      });
    };
    const removeTree = (node: Node) => {
      if (!(node instanceof Element) || node.isConnected) return;
      observed.forEach((element) => {
        if (element === node || node.contains(element)) {
          observer.unobserve(element);
          cancel(element);
          revealed.delete(element);
          observed.delete(element);
        }
      });
    };
    const onMotionChange = () => {
      if (reducedMotion.matches) {
        animations.forEach((animation, target) => {
          animation.cancel();
          if (revealed.has(target) && observed.has(target)) {
            observer.unobserve(target);
            observer.observe(target);
          }
        });
        animations.clear();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const focused = event.target;
      animations.forEach((_animation, target) => {
        if (!revealed.has(target) || !target.contains(focused)) return;
        cancel(target);
        observer.unobserve(target);
        observer.observe(target);
      });
    };

    observeTree(root);
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => {
        record.removedNodes.forEach(removeTree);
        record.addedNodes.forEach(observeTree);
      });
    });
    mutations.observe(root, { childList: true, subtree: true });
    reducedMotion.addEventListener("change", onMotionChange);
    root.addEventListener("focusin", onFocus);

    return () => {
      mutations.disconnect();
      observer.disconnect();
      reducedMotion.removeEventListener("change", onMotionChange);
      root.removeEventListener("focusin", onFocus);
      animations.forEach((animation) => animation.cancel());
    };
  }, []);

  return null;
}
