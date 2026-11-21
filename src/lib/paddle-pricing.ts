export type PaddlePlanCode = "STARTER" | "PROFESSIONAL";
export type PaddleBillingPeriod = "monthly" | "annual";

export type PaddlePriceIds = Record<PaddlePlanCode, Record<PaddleBillingPeriod, string>>;

export type PaddleCheckoutConfig = {
  clientToken: string;
  environment: "sandbox" | "live";
  priceIds: PaddlePriceIds;
};
