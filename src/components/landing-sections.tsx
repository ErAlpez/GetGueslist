"use client";

import { Children, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { landingNavigationItems } from "@/lib/landing-navigation";

const sectionIds = landingNavigationItems.map(({ id }) => id);
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function sectionIndex(hash: string) {
  const id = hash.replace(/^#/, "");
  const index = landingNavigationItems.findIndex((item) => item.id === id);
  return index < 0 ? 0 : index;
}

export function LandingSections({ children, labels }: { children: ReactNode; labels: string[] }) {
  const [active, setActive] = useState(0);
  const enhanced = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const focusSlide = useRef(false);

  useEffect(() => {
    const syncHash = () => setActive(sectionIndex(window.location.hash));
    syncHash();
    window.addEventListener("popstate", syncHash);
    window.addEventListener("hashchange", syncHash);
    return () => {
      window.removeEventListener("popstate", syncHash);
      window.removeEventListener("hashchange", syncHash);
    };
  }, []);

  useEffect(() => {
    if (focusSlide.current) {
      slideRefs.current[active]?.focus({ preventScroll: true });
      focusSlide.current = false;
    }
  }, [active]);

  function navigate(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a");
    const href = link?.getAttribute("href");
    if (!href?.startsWith("#")) return;
    const id = href.slice(1);
    if (!landingNavigationItems.some((item) => item.id === id)) return;
    event.preventDefault();
    const next = sectionIndex(href);
    if (window.location.hash !== href) window.history.pushState(null, "", href);
    if (next !== active) {
      focusSlide.current = !link?.closest(".landing-navigation");
      setActive(next);
    }
  }

  return (
    <div className="landing-experience" data-enhanced={enhanced ? "true" : undefined} onClick={navigate}>
      <div className="landing-deck">
        {Children.toArray(children).map((child, index) => (
          <div
            aria-hidden={enhanced && index !== active}
            aria-label={labels[index]}
            className="landing-slide"
            data-position={index === active ? "current" : index < active ? "before" : "after"}
            inert={enhanced && index !== active}
            key={sectionIds[index]}
            ref={(element) => { slideRefs.current[index] = element; }}
            role="region"
            tabIndex={-1}
          >
            {child}
          </div>
        ))}
      </div>
      <nav aria-label="Main navigation" className="landing-navigation">
        {landingNavigationItems.map(({ id }, index) => (
          <a aria-current={index === active ? "page" : undefined} href={`#${id}`} key={id}>{labels[index]}</a>
        ))}
      </nav>
    </div>
  );
}
