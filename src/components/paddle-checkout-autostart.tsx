"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { ArrowLeft, CheckCircle2, CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { initializePaddle } from "@/lib/paddle-js-client";
import "./paddle-checkout-autostart.css";

export function PaddleCheckoutAutostart({
  clientToken,
  environment,
  transactionId,
  usePaymentLink,
}: {
  clientToken: string;
  environment: "sandbox" | "live";
  transactionId: string;
  usePaymentLink: boolean;
}) {
  const [message, setMessage] = useState("Loading secure Paddle checkout…");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const initialized = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  if (!clientToken || !/^txn_[a-z\d]{26}$/i.test(transactionId)) {
    return (
      <main className="paddle-checkout-page">
        <div className="paddle-checkout-shell">
          <BrandMark className="paddle-checkout-brand-mark" />
          <section className="paddle-checkout-card" role="alert">
            <span className="paddle-checkout-status-icon paddle-checkout-error"><CircleAlert aria-hidden="true" size={25} /></span>
            <p className="paddle-checkout-eyebrow">PADDLE CHECKOUT</p>
            <h1 className="paddle-checkout-title">Checkout unavailable</h1>
            <p className="paddle-checkout-description">Paddle checkout is not configured or this checkout link is invalid.</p>
            <Link className="paddle-checkout-return" href="/dashboard/billing"><ArrowLeft aria-hidden="true" size={16} /> Return to billing</Link>
          </section>
          <p className="paddle-checkout-footer"><ShieldCheck aria-hidden="true" size={15} /> Secure checkout powered by Paddle</p>
        </div>
      </main>
    );
  }

  const initialize = () => {
    if (initialized.current) return;
    try {
      const { paddle, unsubscribe } = initializePaddle(clientToken, environment, (event) => {
        if (event.name === "checkout.completed") {
          setStatus("success");
          setMessage("Payment received. Your plan will update after Paddle confirms the subscription.");
          window.Paddle?.Checkout.close();
        }
      });
      unsubscribeRef.current = unsubscribe;
      initialized.current = true;
      if (!usePaymentLink) paddle.Checkout.open({ transactionId });
    } catch {
      setStatus("error");
      setMessage("Paddle checkout could not load. Please try again or return to billing.");
    }
  };

  return (
    <main className="paddle-checkout-page">
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="afterInteractive"
        onReady={initialize}
        onError={() => {
          setStatus("error");
          setMessage("Paddle checkout could not load. Please try again or return to billing.");
        }}
      />
      <div className="paddle-checkout-shell">
        <BrandMark className="paddle-checkout-brand-mark" />
        <section aria-live="polite" className="paddle-checkout-card">
          <span className={`paddle-checkout-status-icon ${status === "success" ? "paddle-checkout-success" : status === "error" ? "paddle-checkout-error" : "paddle-checkout-loading"}`}>
            {status === "success"
              ? <CheckCircle2 aria-hidden="true" size={25} />
              : status === "error"
                ? <CircleAlert aria-hidden="true" size={25} />
                : <LoaderCircle aria-hidden="true" className="paddle-checkout-spinner" size={25} />}
          </span>
          <p className="paddle-checkout-eyebrow">{status === "success" ? "PAYMENT CONFIRMED" : "PADDLE CHECKOUT"}</p>
          <h1 className="paddle-checkout-title">
            {status === "success" ? "Payment received" : status === "error" ? "Checkout unavailable" : "Secure checkout"}
          </h1>
          <p className="paddle-checkout-description">{message}</p>
          <Link className="paddle-checkout-return" href="/dashboard/billing"><ArrowLeft aria-hidden="true" size={16} /> Return to billing</Link>
        </section>
        <p className="paddle-checkout-footer"><ShieldCheck aria-hidden="true" size={15} /> Secure checkout powered by Paddle</p>
      </div>
    </main>
  );
}
