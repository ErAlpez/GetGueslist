"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export function AnimatedMetric({ value, locale }: { value: number; locale: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [animation, setAnimation] = useState<{ target: number; current: number } | null>(null);
  const formatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const formatted = formatter.format(value);
  const displayed = animation?.target === value ? formatter.format(animation.current) : formatted;

  useEffect(() => {
    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = false;
    const stop = () => {
      cancelAnimationFrame(frame);
      setAnimation(null);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      const started = performance.now();
      const duration = 450;
      const minimumFrameInterval = 1000 / 30;
      let lastUpdate = 0;
      let lastDisplayedValue = 0;
      setAnimation({ target: value, current: 0 });
      const tick = (now: number) => {
        const elapsed = now - started;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - (1 - progress) ** 3;
        const current = Math.round(value * eased);
        if (
          current !== lastDisplayedValue &&
          (elapsed - lastUpdate >= minimumFrameInterval || progress === 1)
        ) {
          lastDisplayedValue = current;
          lastUpdate = elapsed;
          setAnimation({ target: value, current });
        }
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible || reducedMotion.matches) stop();
      else start();
    }, { threshold: 0.01 });
    const onMotionChange = () => {
      if (reducedMotion.matches) stop();
      else if (visible) start();
    };

    observer.observe(element);
    reducedMotion.addEventListener("change", onMotionChange);
    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener("change", onMotionChange);
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <>
      <span aria-hidden="true" className="motion-metric-value" ref={ref}>{displayed}</span>
      <span className="sr-only">{formatted}</span>
    </>
  );
}
