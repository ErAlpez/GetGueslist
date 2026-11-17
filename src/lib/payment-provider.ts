export type CheckoutRequest = {
  workspaceId: string;
  planCode: string;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = {
  providerSessionId: string;
  redirectUrl: string;
};

export interface PaymentProvider {
  createCheckoutSession(input: CheckoutRequest): Promise<CheckoutSession>;
}

export class PaymentProviderUnavailableError extends Error {
  constructor() {
    super("Subscription checkout is not configured. Connect a payment provider before enabling upgrades.");
    this.name = "PaymentProviderUnavailableError";
  }
}

export function getPaymentProvider(): PaymentProvider {
  throw new PaymentProviderUnavailableError();
}
