"use client";

import { QRCodeSVG } from "qrcode.react";

export function TicketQr({ value, size = 100 }: { value: string; size?: number }) {
  return (
    <div aria-label="QR ticket code" className="ticket-qr">
      <QRCodeSVG bgColor="#ffffff" fgColor="#244b3e" includeMargin level="M" size={size} value={value} />
    </div>
  );
}
