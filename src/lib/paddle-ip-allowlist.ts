import { isIPv4 } from "node:net";

type CachedCidrs = {
  cidrs: string[];
  expiresAt: number;
};

const cacheDurationMs = 5 * 60 * 1000;
const cachedCidrsByEndpoint = new Map<string, CachedCidrs>();

function ipv4ToNumber(address: string) {
  if (!isIPv4(address)) return null;
  return address.split(".").reduce((number, octet) => (number << 8) | Number(octet), 0) >>> 0;
}

function isValidIpv4Cidr(cidr: string) {
  const [network, prefixText, ...extra] = cidr.split("/");
  if (!network || extra.length > 0 || ipv4ToNumber(network) === null) return false;
  return prefixText === "32";
}

async function getPaddleIpv4Cidrs(endpoint: string) {
  const now = Date.now();
  const cached = cachedCidrsByEndpoint.get(endpoint);
  if (cached && cached.expiresAt > now) return cached.cidrs;

  const response = await fetch(endpoint, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Paddle IP endpoint returned HTTP ${response.status}.`);
  }

  const payload = await response.json() as {
    data?: { ipv4_cidrs?: unknown };
  };
  const cidrs = payload.data?.ipv4_cidrs;
  if (
    !Array.isArray(cidrs)
    || cidrs.length === 0
    || !cidrs.every((cidr) => typeof cidr === "string" && isValidIpv4Cidr(cidr))
  ) {
    throw new Error("Paddle IP endpoint returned an invalid IPv4 CIDR list.");
  }

  cachedCidrsByEndpoint.set(endpoint, { cidrs, expiresAt: now + cacheDurationMs });
  return cidrs;
}

export async function isPaddleWebhookIpAllowed(address: string, endpoint: string) {
  if (!isIPv4(address)) return false;
  const cidrs = await getPaddleIpv4Cidrs(endpoint);
  return cidrs.some((cidr) => cidr.slice(0, -3) === address);
}
