import { isIPv4 } from "node:net";

type CachedCidrs = {
  cidrs: string[];
  expiresAt: number;
};

const cacheDurationMs = 5 * 60 * 1000;
const cachedCidrsByEndpoint = new Map<string, CachedCidrs>();

function getPrefixLength(prefixText: string | undefined) {
  if (prefixText === undefined) return 32;
  if (!/^(0|[1-9]|[12]\d|3[0-2])$/.test(prefixText)) return null;
  return Number(prefixText);
}

function ipv4ToNumber(address: string) {
  if (!isIPv4(address)) return null;
  return address.split(".").reduce((number, octet) => (number << 8) | Number(octet), 0) >>> 0;
}

export function isIpv4InCidr(address: string, cidr: string) {
  const [network, prefixText, ...extra] = cidr.split("/");
  if (!network || extra.length > 0) return false;

  const prefixLength = getPrefixLength(prefixText);
  if (prefixLength === null) return false;

  const addressNumber = ipv4ToNumber(address);
  const networkNumber = ipv4ToNumber(network);
  if (addressNumber === null || networkNumber === null) return false;

  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return ((addressNumber & mask) >>> 0) === ((networkNumber & mask) >>> 0);
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
    !Array.isArray(cidrs) ||
    cidrs.length === 0 ||
    !cidrs.every((cidr) => typeof cidr === "string" && isValidIpv4Cidr(cidr))
  ) {
    throw new Error("Paddle IP endpoint returned an invalid IPv4 CIDR list.");
  }

  cachedCidrsByEndpoint.set(endpoint, { cidrs, expiresAt: now + cacheDurationMs });
  return cidrs;
}

function isValidIpv4Cidr(cidr: string) {
  const [network, prefixText, ...extra] = cidr.split("/");
  if (!network || extra.length > 0 || ipv4ToNumber(network) === null) return false;
  return getPrefixLength(prefixText) !== null;
}

export async function isPaddleWebhookIpAllowed(address: string, endpoint: string) {
  if (ipv4ToNumber(address) === null) return false;
  const cidrs = await getPaddleIpv4Cidrs(endpoint);
  return cidrs.some((cidr) => isIpv4InCidr(address, cidr));
}
