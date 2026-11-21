ALTER TYPE "SubscriptionStatus" ADD VALUE 'PAUSED';

ALTER TABLE "Subscription"
ADD COLUMN "providerEventAt" TIMESTAMP(3);

ALTER TABLE "Subscription"
ADD COLUMN "providerCheckoutId" TEXT;

ALTER TABLE "SubscriptionInvoice"
ADD COLUMN "providerTransactionId" TEXT;

CREATE UNIQUE INDEX "SubscriptionInvoice_providerTransactionId_key"
ON "SubscriptionInvoice"("providerTransactionId");
