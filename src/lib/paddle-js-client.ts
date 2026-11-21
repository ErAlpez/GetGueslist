"use client";

type PaddleEvent = { name: string };

export type PaddleInstance = {
  Environment: { set: (environment: "sandbox") => void };
  Initialize: (options: {
    token: string;
    eventCallback: (event: PaddleEvent) => void;
  }) => void;
  Checkout: {
    open: (options: { transactionId: string }) => void;
    close: () => void;
  };
};

type PaddleIntegration = {
  token: string;
  environment: "sandbox" | "live";
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
) {
  const paddle = window.Paddle;
  if (!paddle) throw new Error("Paddle.js has not loaded.");

  let integration = window.__venuguestpassPaddle;
  if (integration && (integration.token !== token || integration.environment !== environment)) {
    throw new Error("Paddle.js was already initialized with a different environment or token.");
  }

  if (!integration) {
    integration = { token, environment, listeners: new Set() };
    window.__venuguestpassPaddle = integration;
    try {
      if (environment === "sandbox") paddle.Environment.set("sandbox");
      paddle.Initialize({
        token,
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
