"use client";

type PaddleEvent = { name: string };

export type PaddleInstance = {
  Environment: { set: (environment: "sandbox") => void };
  Initialize: (options: {
    token: string;
    eventCallback: (event: PaddleEvent) => void;
    pwCustomer?: { id: string };
  }) => void;
  Checkout: {
    open: (options: { transactionId: string }) => void;
    close: () => void;
  };
};

type PaddleIntegration = {
  token: string;
  environment: "sandbox" | "live";
  customerId: string | null;
  listeners: Set<(event: PaddleEvent) => void>;
};

declare global {
  interface Window {
    Paddle?: PaddleInstance;
    __venuguestpassPaddle?: PaddleIntegration;
  }
}

export function initializePaddle(
  token: string,
  environment: "sandbox" | "live",
  listener?: (event: PaddleEvent) => void,
  customerId?: string | null,
) {
  const paddle = window.Paddle;
  if (!paddle) throw new Error("Paddle.js has not loaded.");

  const normalizedCustomerId = customerId?.trim() || null;
  if (normalizedCustomerId && !/^ctm_[a-z\d]{26}$/i.test(normalizedCustomerId)) {
    throw new Error("The stored Paddle customer ID is invalid.");
  }

  let integration = window.__venuguestpassPaddle;
  if (integration && (
    integration.token !== token
    || integration.environment !== environment
    || (integration.customerId ?? null) !== normalizedCustomerId
  )) {
    throw new Error("Paddle.js was already initialized with a different environment, token, or customer.");
  }

  if (!integration) {
    integration = { token, environment, customerId: normalizedCustomerId, listeners: new Set() };
    window.__venuguestpassPaddle = integration;
    try {
      if (environment === "sandbox") paddle.Environment.set("sandbox");
      paddle.Initialize({
        token,
        ...(normalizedCustomerId ? { pwCustomer: { id: normalizedCustomerId } } : {}),
        eventCallback: (event) => {
          window.__venuguestpassPaddle?.listeners.forEach((activeListener) => activeListener(event));
        },
      });
    } catch (error) {
      delete window.__venuguestpassPaddle;
      throw error;
    }
  }

  if (listener) integration.listeners.add(listener);
  return {
    paddle,
    unsubscribe: () => {
      if (listener) integration?.listeners.delete(listener);
    },
  };
}
