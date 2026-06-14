import crypto from "node:crypto";

const SHOPEE_BASE_URL = process.env.SHOPEE_BASE_URL ?? "https://partner.shopeemobile.com";
const SHOPEE_AUTH_BASE_URL = process.env.SHOPEE_AUTH_BASE_URL ?? SHOPEE_BASE_URL;

export type ShopeeConfig = {
  partnerId: number;
  partnerKey: string;
  redirectUri: string;
};

export type ShopeeTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expire_in?: number;
  shop_id?: number;
  merchant_id?: number;
  request_id?: string;
  error?: string;
  message?: string;
  raw: unknown;
};

export class ShopeeApiError extends Error {
  statusCode: number;
  details: unknown;

  constructor(message: string, statusCode: number, details: unknown) {
    super(message);
    this.name = "ShopeeApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function getShopeeConfig(): ShopeeConfig | null {
  const partnerId = Number(process.env.SHOPEE_PARTNER_ID ?? "");
  const partnerKey = process.env.SHOPEE_PARTNER_KEY ?? "";
  const redirectUri = process.env.SHOPEE_REDIRECT_URI ?? "";
  if (!Number.isFinite(partnerId) || partnerId <= 0 || !partnerKey || !redirectUri) return null;
  return { partnerId: Math.round(partnerId), partnerKey, redirectUri };
}

export function computeShopeeTokenExpiresAtIso(expireInSeconds?: number): string {
  const seconds = Math.max(60, Math.round(Number(expireInSeconds ?? 0) || 4 * 60 * 60));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function signShopeeRequest(params: {
  path: string;
  timestamp: number;
  accessToken?: string | null;
  shopId?: string | number | null;
}) {
  const config = getShopeeConfig();
  if (!config) {
    throw new Error("Shopee Open Platform não configurado.");
  }

  const baseString =
    params.accessToken && params.shopId
      ? `${config.partnerId}${params.path}${params.timestamp}${params.accessToken}${params.shopId}`
      : `${config.partnerId}${params.path}${params.timestamp}`;

  return crypto.createHmac("sha256", config.partnerKey).update(baseString).digest("hex");
}

export function buildShopeeAuthorizationUrl(state: string): string {
  const config = getShopeeConfig();
  if (!config) {
    throw new Error("Shopee Open Platform não configurado.");
  }

  const path = "/api/v2/shop/auth_partner";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = signShopeeRequest({ path, timestamp });
  const url = new URL(`${SHOPEE_AUTH_BASE_URL}${path}`);
  url.searchParams.set("partner_id", String(config.partnerId));
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);
  url.searchParams.set("redirect", config.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

async function parseShopeeResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => "");
}

function normalizeShopeeTokenPayload(payload: unknown): ShopeeTokenResponse {
  const body = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  return {
    access_token: typeof body.access_token === "string" ? body.access_token : undefined,
    refresh_token: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    expire_in: typeof body.expire_in === "number" ? body.expire_in : undefined,
    shop_id: typeof body.shop_id === "number" ? body.shop_id : undefined,
    merchant_id: typeof body.merchant_id === "number" ? body.merchant_id : undefined,
    request_id: typeof body.request_id === "string" ? body.request_id : undefined,
    error: typeof body.error === "string" ? body.error : undefined,
    message: typeof body.message === "string" ? body.message : undefined,
    raw: payload,
  };
}

export async function exchangeShopeeAuthorizationCode(params: {
  code: string;
  shopId?: string | number | null;
  merchantId?: string | number | null;
}): Promise<ShopeeTokenResponse> {
  const config = getShopeeConfig();
  if (!config) {
    throw new Error("Shopee Open Platform não configurado.");
  }

  const path = "/api/v2/auth/token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = signShopeeRequest({ path, timestamp });
  const url = new URL(`${SHOPEE_BASE_URL}${path}`);
  url.searchParams.set("partner_id", String(config.partnerId));
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);

  const body: Record<string, string | number> = {
    code: params.code,
    partner_id: config.partnerId,
  };
  if (params.shopId) body.shop_id = Number(params.shopId);
  if (params.merchantId) body.merchant_id = Number(params.merchantId);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await parseShopeeResponse(response);
  const token = normalizeShopeeTokenPayload(payload);
  if (!response.ok || token.error || !token.access_token || !token.refresh_token) {
    throw new ShopeeApiError("Shopee token exchange failed", response.status, payload);
  }
  return token;
}

export async function refreshShopeeAccessToken(params: {
  refreshToken: string;
  shopId: string | number;
}): Promise<ShopeeTokenResponse> {
  const config = getShopeeConfig();
  if (!config) {
    throw new Error("Shopee Open Platform não configurado.");
  }

  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = signShopeeRequest({ path, timestamp });
  const url = new URL(`${SHOPEE_BASE_URL}${path}`);
  url.searchParams.set("partner_id", String(config.partnerId));
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      refresh_token: params.refreshToken,
      partner_id: config.partnerId,
      shop_id: Number(params.shopId),
    }),
  });
  const payload = await parseShopeeResponse(response);
  const token = normalizeShopeeTokenPayload(payload);
  if (!response.ok || token.error || !token.access_token || !token.refresh_token) {
    throw new ShopeeApiError("Shopee token refresh failed", response.status, payload);
  }
  return token;
}

export async function shopeeSignedShopRequest(params: {
  accessToken: string;
  shopId: string | number;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string>;
  body?: string;
  headers?: Record<string, string>;
}) {
  const config = getShopeeConfig();
  if (!config) {
    throw new Error("Shopee Open Platform não configurado.");
  }

  const path = params.path.startsWith("/") ? params.path : `/${params.path}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = signShopeeRequest({
    path,
    timestamp,
    accessToken: params.accessToken,
    shopId: params.shopId,
  });
  const url = new URL(`${SHOPEE_BASE_URL}${path}`);
  url.searchParams.set("partner_id", String(config.partnerId));
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("access_token", params.accessToken);
  url.searchParams.set("shop_id", String(params.shopId));
  url.searchParams.set("sign", sign);
  for (const [key, value] of Object.entries(params.query ?? {})) {
    if (key.trim()) url.searchParams.set(key.trim(), value);
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    ...(params.headers ?? {}),
  };
  let body: string | undefined;
  if (params.method !== "GET" && params.method !== "DELETE" && params.body?.trim()) {
    body = params.body;
    headers["content-type"] = headers["content-type"] ?? "application/json";
  }

  const response = await fetch(url.toString(), {
    method: params.method,
    headers,
    body,
  });
  const data = await parseShopeeResponse(response);
  return { response, data, url: url.toString() };
}
