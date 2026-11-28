import Image from "next/image";

export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <Image
      alt=""
      className={className}
      height={64}
      src="/vgp-logo-green-bg.png"
      style={{ borderRadius: 5 }}
      width={64}
    />
  );
}
