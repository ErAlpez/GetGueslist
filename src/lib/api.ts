export type JsonObject = Record<string, unknown>;

export async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, init);
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<{ response: Response; payload: T }> {
  const response = await apiRequest(path, init);
  return { response, payload: await response.json() as T };
}

function apiPostResponse(path: string, body: JsonObject, init: RequestInit = {}): Promise<Response> {
  return apiRequest(path, {
    ...init,
    method: init.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
    body: JSON.stringify(body),
  });
}

export async function apiPost<T>(path: string, body: JsonObject, init: RequestInit = {}): Promise<{ response: Response; payload: T }> {
  const response = await apiPostResponse(path, body, init);
  return { response, payload: await response.json() as T };
}

export function validateCheckIn(body: JsonObject, init: RequestInit = {}): Promise<Response> {
  return apiPostResponse("/api/check-in/validate", body, init);
}

export function searchCheckIns(eventId: string, query: string, init: RequestInit = {}): Promise<Response> {
  return apiRequest(
    `/api/check-in/search?event=${encodeURIComponent(eventId)}&q=${encodeURIComponent(query)}`,
    init,
  );
}

export function pairMobileCheckIn(pairingToken: string): Promise<Response> {
  return apiPostResponse("/api/check-in/pair", { pairingToken });
}

export function endMobileCheckIn(): Promise<Response> {
  return apiRequest("/api/check-in/mobile-session", { method: "DELETE" });
}

export function getScannerAccesses(eventId: string, init: RequestInit = {}): Promise<Response> {
  return apiRequest(
    `/api/check-in/pairing?eventId=${encodeURIComponent(eventId)}`,
    { cache: "no-store", ...init },
  );
}

export function createScannerPairing(eventId: string, deviceName: string): Promise<Response> {
  return apiPostResponse("/api/check-in/pairing", { eventId, deviceName });
}

export function revokeScannerAccess(accessId: string): Promise<Response> {
  return apiPostResponse("/api/check-in/pairing", { accessId }, { method: "DELETE" });
}

export function syncOfflineCheckIn(body: JsonObject): Promise<Response> {
  return apiPostResponse("/api/check-in/validate", body);
}

export function syncOfflineGuest(body: JsonObject): Promise<Response> {
  return apiPostResponse("/api/guestlist/offline-sync", body, { cache: "no-store" });
}

export function getNotifications(init: RequestInit = {}): Promise<Response> {
  return apiRequest("/api/notifications", { cache: "no-store", ...init });
}

export function markNotificationsSeen(ids: string[]): Promise<Response> {
  return apiPostResponse("/api/notifications", { ids });
}

export function trackWebsiteAnalytics(path: string): Promise<Response> {
  return apiRequest("/api/website-analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
    keepalive: true,
  });
}

export function downloadResource(url: string | URL, init: RequestInit = {}): Promise<Response> {
  return apiRequest(url.toString(), { cache: "no-store", ...init });
}

export function sendResendEmail(apiKey: string, from: string, body: JsonObject, init: RequestInit = {}): Promise<Response> {
  return apiRequest("https://api.resend.com/emails", {
    ...init,
    method: init.method ?? "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    body: JSON.stringify({ from, ...body }),
  });
}

