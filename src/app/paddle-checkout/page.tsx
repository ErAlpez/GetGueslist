import { PaddleCheckoutAutostart } from "@/components/paddle-checkout-autostart";
import { getPaddleEnvironment } from "@/lib/payment-provider";
import { getPrisma } from "@/lib/prisma";

export default async function PaddleCheckoutPage({
  searchParams,
}: PageProps<"/paddle-checkout">) {
  const { transaction_id: transactionId, _ptxn: paymentLinkTransactionId } = await searchParams;
  const environment = getPaddleEnvironment();
  const checkoutTransactionId = typeof transactionId === "string"
    && /^txn_[a-z\d]{26}$/i.test(transactionId)
    ? transactionId
    : null;
  const subscription = checkoutTransactionId
    ? await getPrisma().subscription.findFirst({
        where: { provider: "paddle", providerCheckoutId: checkoutTransactionId },
        select: { providerCustomerId: true },
      })
    : null;

  return (
    <PaddleCheckoutAutostart
      clientToken={process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim() ?? ""}
      customerId={subscription?.providerCustomerId ?? null}
      environment={environment}
      transactionId={
        typeof transactionId === "string"
          ? transactionId
          : typeof paymentLinkTransactionId === "string"
            ? paymentLinkTransactionId
            : ""
      }
      usePaymentLink={typeof paymentLinkTransactionId === "string"}
    />
  );
}
