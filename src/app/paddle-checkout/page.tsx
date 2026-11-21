import { PaddleCheckoutAutostart } from "@/components/paddle-checkout-autostart";

export default async function PaddleCheckoutPage({
  searchParams,
}: PageProps<"/paddle-checkout">) {
  const { transaction_id: transactionId, _ptxn: paymentLinkTransactionId } = await searchParams;
  const environment = process.env.PADDLE_ENVIRONMENT?.trim().toLowerCase() === "live"
    ? "live"
    : "sandbox";

  return (
    <PaddleCheckoutAutostart
      clientToken={process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim() ?? ""}
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
