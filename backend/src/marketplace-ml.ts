const ML_AUTH_BASE_URL = "https://auth.mercadolivre.com.br";
const ML_API_BASE_URL = "https://api.mercadolibre.com";
const ML_MIN_REQUEST_INTERVAL_MS = Math.max(
  50,
  Math.round(Number(process.env.ML_MIN_REQUEST_INTERVAL_MS ?? 450))
);
const ML_RATE_LIMIT_RETRY_MS = Math.max(
  250,
  Math.round(Number(process.env.ML_RATE_LIMIT_RETRY_MS ?? 2000))
);

let mlRequestQueue: Promise<void> = Promise.resolve();
let mlLastRequestAt = 0;

type MercadoLivreTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in: number;
  scope?: string;
  user_id?: number;
  refresh_token: string;
};

type MercadoLivreUserResponse = {
  id: number;
  nickname?: string;
  country_id?: string;
  site_id?: string;
};

type MercadoLivreSellerItemsSearchResponse = {
  results: string[];
  paging?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
};

type MercadoLivreMultiGetItemEntry = {
  code: number;
  body?: {
    id?: string;
    title?: string;
    status?: string;
    condition?: string;
    permalink?: string;
    thumbnail?: string;
    currency_id?: string;
    category_id?: string;
    listing_type_id?: string;
    price?: number;
    available_quantity?: number;
    sold_quantity?: number;
    site_id?: string;
    seller_id?: number;
  };
};

type MercadoLivreItemPricesResponse = {
  id?: string;
  prices?: Array<{
    id?: string;
    type?: string;
    amount?: number;
    regular_amount?: number | null;
    currency_id?: string;
    metadata?: {
      promotion_id?: string;
      promotion_type?: string;
    };
    conditions?: {
      start_time?: string | null;
      end_time?: string | null;
    };
  }>;
};

type MercadoLivreListingPriceResponse = {
  currency_id?: string;
  listing_fee_amount?: number;
  sale_fee_amount?: number;
  sale_fee_details?: {
    gross_amount?: number;
    fixed_fee?: number;
  };
};

type MercadoLivreItemVariationResponse = Array<{
  id?: number | string;
  price?: number;
  available_quantity?: number;
  sold_quantity?: number;
  attribute_combinations?: Array<{
    id?: string;
    name?: string;
    value_id?: string | null;
    value_name?: string | null;
  }>;
}>;

type MercadoLivreOrdersSearchResponse = {
  results?: Array<{
    id?: number;
    status?: string;
    status_detail?: string;
    total_amount?: number;
    paid_amount?: number;
    currency_id?: string;
    shipping?: {
      id?: number;
      status?: string;
    };
    date_created?: string;
    date_closed?: string;
    buyer?: {
      id?: number;
      nickname?: string;
    };
    seller?: {
      id?: number;
    };
  }>;
  paging?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
};

type MercadoLivreOrderDetailResponse = {
  id?: number;
  status?: string;
  status_detail?: string;
  total_amount?: number;
  paid_amount?: number;
  currency_id?: string;
  date_created?: string;
  date_closed?: string;
  buyer?: {
    id?: number;
    nickname?: string;
  };
  seller?: {
    id?: number;
  };
  shipping?: {
    id?: number | null;
  };
  order_items?: Array<{
    item?: {
      id?: string;
      title?: string;
    };
    quantity?: number;
    unit_price?: number;
    full_unit_price?: number;
    currency_id?: string;
    variation_id?: number | string | null;
  }>;
  payments?: Array<{
    id?: number | string;
    status?: string;
    transaction_amount?: number;
    total_paid_amount?: number;
    currency_id?: string;
  }>;
};

type MercadoLivreShipmentResponse = {
  id?: number;
  status?: string;
  substatus?: string;
  mode?: string;
  logistic_type?: string;
  tracking_number?: string;
  shipping_option?: {
    id?: number;
    name?: string;
    shipping_method_id?: number;
  };
};

type MercadoLivrePaymentDetailResponse = {
  id?: number;
  status?: string;
  transaction_amount?: number;
  total_paid_amount?: number;
  currency_id?: string;
  transaction_details?: {
    net_received_amount?: number;
    total_paid_amount?: number;
    shipping_cost?: number;
  };
  fee_details?: Array<{
    amount?: number;
    type?: string;
  }>;
  refunds?: Array<{
    amount?: number;
  }>;
};

type MercadoLivreShipmentCostsResponse = {
  receiver?: {
    cost?: number;
  };
  senders?: Array<{
    cost?: number;
    compensation?: {
      amount?: number;
    };
  }>;
};

export type MercadoLivreConfig = {
  appId: string;
  clientSecret: string;
  redirectUri: string;
};

export class MercadoLivreApiError extends Error {
  statusCode: number;
  details: unknown;

  constructor(message: string, statusCode: number, details: unknown) {
    super(message);
    this.name = "MercadoLivreApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export type MercadoLivreItemSnapshot = {
  id: string;
  title: string;
  status?: string;
  condition?: string;
  permalink?: string;
  thumbnail?: string;
  currencyId?: string;
  categoryId?: string;
  listingTypeId?: string;
  price?: number;
  availableQuantity?: number;
  soldQuantity?: number;
  siteId?: string;
  sellerId?: string;
  raw: unknown;
};

export type MercadoLivreItemPricingSnapshot = {
  baseAmount?: number;
  promotionAmount?: number;
  effectiveAmount?: number;
  regularAmount?: number;
  currencyId?: string;
  promotionId?: string;
  promotionType?: string;
  raw: unknown;
};

export type MercadoLivreListingFeeEstimate = {
  currencyId?: string;
  listingFeeAmount?: number;
  saleFeeAmount?: number;
  saleFeeGrossAmount?: number;
  saleFeeFixedAmount?: number;
  raw: unknown;
};

export type MercadoLivreItemVariationSnapshot = {
  id?: string;
  key: string;
  label?: string;
  price?: number;
  availableQuantity?: number;
  soldQuantity?: number;
  attributes: Array<{
    id: string;
    name: string;
    valueId?: string | null;
    valueName?: string | null;
  }>;
  raw: unknown;
};

export type MercadoLivreOrderSnapshot = {
  id: string;
  sellerId: string;
  buyerId?: string;
  buyerNickname?: string;
  status?: string;
  substatus?: string;
  totalAmount?: number;
  paidAmount?: number;
  currencyId?: string;
  shippingId?: string;
  shippingStatus?: string;
  dateCreated?: string;
  dateClosed?: string;
  raw: unknown;
};

export type MercadoLivreOrderItemSnapshot = {
  marketplaceItemId: string;
  marketplaceVariationId?: string;
  title: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  currencyId?: string;
  raw: unknown;
};

export type MercadoLivrePaymentFinancials = {
  grossReceived?: number;
  netReceived?: number;
  mlFeeTotal?: number;
  refundsTotal?: number;
  shippingCost?: number;
  raw: unknown;
};

export type MercadoLivreOrderBillingFinancials = {
  billedTotal?: number;
  saleFeeGross?: number;
  saleFeeNet?: number;
  saleFeeRebate?: number;
  saleFeeDiscount?: number;
  taxesTotal?: number;
  shippingCost?: number;
  shippingCompensation?: number;
  netAmount?: number;
  raw: unknown;
};

export type MercadoLivreShipmentSnapshot = {
  id: string;
  status?: string;
  substatus?: string;
  mode?: string;
  logisticType?: string;
  shippingType?: string;
  trackingNumber?: string;
  raw: unknown;
};

export function getMercadoLivreConfig(): MercadoLivreConfig | null {
  const appId = (process.env.ML_APP_ID ?? "").trim();
  const clientSecret = (process.env.ML_CLIENT_SECRET ?? "").trim();
  const redirectUri = (process.env.ML_REDIRECT_URI ?? "").trim();

  if (!appId || !clientSecret || !redirectUri) {
    return null;
  }

  return {
    appId,
    clientSecret,
    redirectUri,
  };
}

function assertMercadoLivreConfig(): MercadoLivreConfig {
  const config = getMercadoLivreConfig();
  if (!config) {
    throw new Error("Mercado Livre OAuth is not configured. Set ML_APP_ID, ML_CLIENT_SECRET and ML_REDIRECT_URI.");
  }
  return config;
}

function buildUrlEncodedBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

async function parseApiResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mercadoLivreFetch(url: string, init: RequestInit): Promise<Response> {
  let releaseQueue: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  const previousQueue = mlRequestQueue;
  mlRequestQueue = previousQueue.then(() => gate);

  await previousQueue;
  try {
    const elapsed = Date.now() - mlLastRequestAt;
    const waitMs = Math.max(0, ML_MIN_REQUEST_INTERVAL_MS - elapsed);
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    let response = await fetch(url, init);
    mlLastRequestAt = Date.now();

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      const retryMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.round(retryAfterSeconds * 1000)
          : ML_RATE_LIMIT_RETRY_MS;
      await sleep(retryMs);
      response = await fetch(url, init);
      mlLastRequestAt = Date.now();
    }

    return response;
  } finally {
    releaseQueue?.();
  }
}

function pickFirstBillingEntry(payload: unknown): Record<string, any> | null {
  if (Array.isArray(payload)) {
    const first = payload[0];
    return first && typeof first === "object" ? (first as Record<string, any>) : null;
  }
  if (!payload || typeof payload !== "object") return null;

  const root = payload as Record<string, any>;
  const candidates = [
    root.results,
    root.orders,
    root.order_details,
    root.data,
    root.details,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0 && candidate[0] && typeof candidate[0] === "object") {
      return candidate[0] as Record<string, any>;
    }
  }

  return root;
}

async function requestToken(
  grantType: "authorization_code" | "refresh_token",
  params: { code?: string; refreshToken?: string }
): Promise<MercadoLivreTokenResponse> {
  const config = assertMercadoLivreConfig();

  const body: Record<string, string> = {
    grant_type: grantType,
    client_id: config.appId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  };

  if (grantType === "authorization_code") {
    body.code = (params.code ?? "").trim();
  }

  if (grantType === "refresh_token") {
    body.refresh_token = (params.refreshToken ?? "").trim();
  }

  const response = await mercadoLivreFetch(`${ML_API_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: buildUrlEncodedBody(body),
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok) {
    throw new MercadoLivreApiError("Mercado Livre token request failed", response.status, parsed);
  }

  const token = parsed as Partial<MercadoLivreTokenResponse>;
  if (!token.access_token || !token.refresh_token || typeof token.expires_in !== "number") {
    throw new MercadoLivreApiError("Mercado Livre returned an invalid token payload", response.status, parsed);
  }

  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_in: token.expires_in,
    token_type: token.token_type,
    scope: token.scope,
    user_id: token.user_id,
  };
}

export function buildMercadoLivreAuthorizationUrl(state: string): string {
  const config = assertMercadoLivreConfig();
  const url = new URL(`${ML_AUTH_BASE_URL}/authorization`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeMercadoLivreAuthorizationCode(code: string): Promise<MercadoLivreTokenResponse> {
  return requestToken("authorization_code", { code });
}

export async function refreshMercadoLivreAccessToken(refreshToken: string): Promise<MercadoLivreTokenResponse> {
  return requestToken("refresh_token", { refreshToken });
}

export async function fetchMercadoLivreUser(accessToken: string): Promise<MercadoLivreUserResponse> {
  const response = await mercadoLivreFetch(`${ML_API_BASE_URL}/users/me`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok) {
    throw new MercadoLivreApiError("Mercado Livre user request failed", response.status, parsed);
  }

  const user = parsed as Partial<MercadoLivreUserResponse>;
  if (typeof user.id !== "number") {
    throw new MercadoLivreApiError("Mercado Livre returned an invalid user payload", response.status, parsed);
  }

  return {
    id: user.id,
    nickname: user.nickname,
    country_id: user.country_id,
    site_id: user.site_id,
  };
}

export async function fetchMercadoLivreSellerItemIds(params: {
  accessToken: string;
  sellerId: string;
  offset?: number;
  limit?: number;
}): Promise<{ itemIds: string[]; total: number; offset: number; limit: number }> {
  const offset = Math.max(0, Math.round(params.offset ?? 0));
  const limit = Math.max(1, Math.min(50, Math.round(params.limit ?? 50)));
  const url = new URL(`${ML_API_BASE_URL}/users/${encodeURIComponent(params.sellerId)}/items/search`);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));

  const response = await mercadoLivreFetch(url.toString(), {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "application/json",
    },
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok) {
    throw new MercadoLivreApiError("Mercado Livre seller items search failed", response.status, parsed);
  }

  const payload = parsed as MercadoLivreSellerItemsSearchResponse;
  return {
    itemIds: Array.isArray(payload.results) ? payload.results.filter((item) => typeof item === "string") : [],
    total: Number(payload.paging?.total ?? 0),
    offset: Number(payload.paging?.offset ?? offset),
    limit: Number(payload.paging?.limit ?? limit),
  };
}

export async function fetchMercadoLivreItems(params: {
  accessToken: string;
  itemIds: string[];
}): Promise<MercadoLivreItemSnapshot[]> {
  const validIds = params.itemIds.map((item) => item.trim()).filter(Boolean);
  if (validIds.length === 0) return [];

  const url = new URL(`${ML_API_BASE_URL}/items`);
  url.searchParams.set("ids", validIds.join(","));

  const response = await mercadoLivreFetch(url.toString(), {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "application/json",
    },
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok) {
    throw new MercadoLivreApiError("Mercado Livre items fetch failed", response.status, parsed);
  }

  const entries = Array.isArray(parsed) ? (parsed as MercadoLivreMultiGetItemEntry[]) : [];
  const snapshots: MercadoLivreItemSnapshot[] = [];

  for (const entry of entries) {
    if (entry.code < 200 || entry.code >= 300 || !entry.body?.id || !entry.body.title) continue;
    snapshots.push({
      id: entry.body.id,
      title: entry.body.title,
      status: entry.body.status,
      condition: entry.body.condition,
      permalink: entry.body.permalink,
      thumbnail: entry.body.thumbnail,
      currencyId: entry.body.currency_id,
      categoryId: entry.body.category_id,
      listingTypeId: entry.body.listing_type_id,
      price: typeof entry.body.price === "number" ? entry.body.price : undefined,
      availableQuantity:
        typeof entry.body.available_quantity === "number" ? Math.round(entry.body.available_quantity) : undefined,
      soldQuantity: typeof entry.body.sold_quantity === "number" ? Math.round(entry.body.sold_quantity) : undefined,
      siteId: entry.body.site_id,
      sellerId: typeof entry.body.seller_id === "number" ? String(entry.body.seller_id) : undefined,
      raw: entry.body,
    });
  }

  return snapshots;
}

export async function fetchMercadoLivreItemPricing(params: {
  accessToken: string;
  itemId: string;
}): Promise<MercadoLivreItemPricingSnapshot | null> {
  const response = await mercadoLivreFetch(`${ML_API_BASE_URL}/items/${encodeURIComponent(params.itemId)}/prices`, {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "application/json",
    },
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok) {
    throw new MercadoLivreApiError("Mercado Livre item prices fetch failed", response.status, parsed);
  }

  const payload = parsed as MercadoLivreItemPricesResponse;
  const prices = Array.isArray(payload.prices) ? payload.prices : [];
  if (!prices.length) return null;

  const promotion = prices.find((price) => price.type === "promotion");
  const standard = prices.find((price) => price.type === "standard");
  const winner = promotion ?? standard ?? prices[0];

  return {
    baseAmount: typeof standard?.amount === "number" ? standard.amount : undefined,
    promotionAmount: typeof promotion?.amount === "number" ? promotion.amount : undefined,
    effectiveAmount: typeof winner?.amount === "number" ? winner.amount : undefined,
    regularAmount: typeof winner?.regular_amount === "number" ? winner.regular_amount : undefined,
    currencyId: winner?.currency_id ?? standard?.currency_id ?? promotion?.currency_id,
    promotionId: promotion?.metadata?.promotion_id,
    promotionType: promotion?.metadata?.promotion_type,
    raw: payload,
  };
}

export async function fetchMercadoLivreListingFeeEstimate(params: {
  accessToken: string;
  siteId: string;
  price: number;
  listingTypeId?: string;
  categoryId?: string;
  currencyId?: string;
  shippingMode?: string;
  logisticType?: string;
  billableWeight?: number;
}): Promise<MercadoLivreListingFeeEstimate | null> {
  if (!Number.isFinite(params.price) || params.price <= 0) return null;

  const url = new URL(`${ML_API_BASE_URL}/sites/${encodeURIComponent(params.siteId)}/listing_prices`);
  url.searchParams.set("price", String(params.price));
  if (params.listingTypeId) url.searchParams.set("listing_type_id", params.listingTypeId);
  if (params.categoryId) url.searchParams.set("category_id", params.categoryId);
  if (params.currencyId) url.searchParams.set("currency_id", params.currencyId);
  if (params.shippingMode) url.searchParams.set("shipping_mode", params.shippingMode);
  if (params.logisticType) url.searchParams.set("logistic_type", params.logisticType);
  if (typeof params.billableWeight === "number" && Number.isFinite(params.billableWeight) && params.billableWeight > 0) {
    url.searchParams.set("billable_weight", String(params.billableWeight));
  }

  const response = await mercadoLivreFetch(url.toString(), {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "application/json",
    },
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok) {
    throw new MercadoLivreApiError("Mercado Livre listing fee estimate failed", response.status, parsed);
  }

  const body = Array.isArray(parsed)
    ? (parsed.find((entry) => {
        if (!entry || typeof entry !== "object") return false;
        if (!params.listingTypeId) return true;
        const listingTypeId = (entry as Record<string, unknown>).listing_type_id;
        return String(listingTypeId ?? "").trim() === params.listingTypeId;
      }) ?? parsed[0])
    : parsed;
  if (!body || typeof body !== "object") return null;
  const fee = body as MercadoLivreListingPriceResponse;

  return {
    currencyId: fee.currency_id,
    listingFeeAmount: asFiniteNumber(fee.listing_fee_amount),
    saleFeeAmount: asFiniteNumber(fee.sale_fee_amount),
    saleFeeGrossAmount: asFiniteNumber(fee.sale_fee_details?.gross_amount),
    saleFeeFixedAmount: asFiniteNumber(fee.sale_fee_details?.fixed_fee),
    raw: body,
  };
}

export async function fetchMercadoLivreItemVariations(params: {
  accessToken: string;
  itemId: string;
}): Promise<MercadoLivreItemVariationSnapshot[]> {
  const response = await mercadoLivreFetch(`${ML_API_BASE_URL}/items/${encodeURIComponent(params.itemId)}/variations`, {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "application/json",
    },
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new MercadoLivreApiError("Mercado Livre item variations fetch failed", response.status, parsed);
  }

  const variations = Array.isArray(parsed) ? (parsed as MercadoLivreItemVariationResponse) : [];
  return variations.map((variation, index) => {
    const attrs = Array.isArray(variation.attribute_combinations) ? variation.attribute_combinations : [];
    const normalizedAttrs = attrs.map((attr) => ({
      id: attr.id ?? "",
      name: attr.name ?? "",
      valueId: attr.value_id ?? null,
      valueName: attr.value_name ?? null,
    }));
    const label = normalizedAttrs
      .map((attr) => `${attr.name || attr.id}: ${attr.valueName || attr.valueId || "-"}`)
      .join(" | ");

    const id = variation.id !== undefined && variation.id !== null ? String(variation.id) : undefined;
    return {
      id,
      key: id ? `var:${id}` : `idx:${index}`,
      label: label || undefined,
      price: typeof variation.price === "number" ? variation.price : undefined,
      availableQuantity:
        typeof variation.available_quantity === "number" ? Math.round(variation.available_quantity) : undefined,
      soldQuantity: typeof variation.sold_quantity === "number" ? Math.round(variation.sold_quantity) : undefined,
      attributes: normalizedAttrs,
      raw: variation,
    };
  });
}

export async function fetchMercadoLivreSellerOrders(params: {
  accessToken: string;
  sellerId: string;
  offset?: number;
  limit?: number;
}): Promise<{ orders: MercadoLivreOrderSnapshot[]; total: number; offset: number; limit: number }> {
  const offset = Math.max(0, Math.round(params.offset ?? 0));
  const limit = Math.max(1, Math.min(50, Math.round(params.limit ?? 50)));
  const url = new URL(`${ML_API_BASE_URL}/orders/search`);
  url.searchParams.set("seller", params.sellerId);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "date_desc");

  const response = await mercadoLivreFetch(url.toString(), {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "application/json",
    },
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok) {
    throw new MercadoLivreApiError("Mercado Livre seller orders search failed", response.status, parsed);
  }

  const payload = parsed as MercadoLivreOrdersSearchResponse;
  const orders = (payload.results ?? [])
    .filter((item) => typeof item?.id === "number")
    .map((item) => ({
      id: String(item.id),
      sellerId:
        typeof item.seller?.id === "number" ? String(item.seller.id) : params.sellerId,
      buyerId: typeof item.buyer?.id === "number" ? String(item.buyer.id) : undefined,
      buyerNickname: item.buyer?.nickname,
      status: item.status,
      substatus: item.status_detail,
      totalAmount: typeof item.total_amount === "number" ? item.total_amount : undefined,
      paidAmount: typeof item.paid_amount === "number" ? item.paid_amount : undefined,
      currencyId: item.currency_id,
      shippingId: typeof item.shipping?.id === "number" ? String(item.shipping.id) : undefined,
      shippingStatus: item.shipping?.status,
      dateCreated: item.date_created,
      dateClosed: item.date_closed,
      raw: item,
    }));

  return {
    orders,
    total: Number(payload.paging?.total ?? 0),
    offset: Number(payload.paging?.offset ?? offset),
    limit: Number(payload.paging?.limit ?? limit),
  };
}

export async function fetchMercadoLivreOrderDetail(params: {
  accessToken: string;
  orderId: string;
}): Promise<{
  order: MercadoLivreOrderSnapshot;
  items: MercadoLivreOrderItemSnapshot[];
  paymentIds: string[];
}> {
  const response = await mercadoLivreFetch(`${ML_API_BASE_URL}/orders/${encodeURIComponent(params.orderId)}`, {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "application/json",
    },
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok) {
    throw new MercadoLivreApiError("Mercado Livre order detail fetch failed", response.status, parsed);
  }

  const order = parsed as MercadoLivreOrderDetailResponse;
  const orderId = typeof order.id === "number" ? String(order.id) : params.orderId;
  const sellerId = typeof order.seller?.id === "number" ? String(order.seller.id) : "";

  const items = (order.order_items ?? [])
    .filter((line) => line.item?.id)
    .map((line) => {
      const quantity = Math.max(1, Math.round(Number(line.quantity ?? 1)));
      const unitPrice = typeof line.unit_price === "number" ? line.unit_price : undefined;
      const totalPrice = typeof line.full_unit_price === "number"
        ? line.full_unit_price * quantity
        : unitPrice !== undefined
          ? unitPrice * quantity
          : undefined;

      return {
        marketplaceItemId: String(line.item?.id),
        marketplaceVariationId:
          line.variation_id !== undefined && line.variation_id !== null
            ? String(line.variation_id)
            : undefined,
        title: String(line.item?.title ?? "Sem título"),
        quantity,
        unitPrice,
        totalPrice,
        currencyId: line.currency_id ?? order.currency_id ?? undefined,
        raw: line,
      };
    });

  const paymentIds = (order.payments ?? [])
    .map((payment) =>
      payment.id !== undefined && payment.id !== null ? String(payment.id) : ""
    )
    .filter(Boolean);

  return {
    order: {
      id: orderId,
      sellerId,
      buyerId: typeof order.buyer?.id === "number" ? String(order.buyer.id) : undefined,
      buyerNickname: order.buyer?.nickname,
      status: order.status,
      substatus: order.status_detail,
      totalAmount: typeof order.total_amount === "number" ? order.total_amount : undefined,
      paidAmount: typeof order.paid_amount === "number" ? order.paid_amount : undefined,
      currencyId: order.currency_id,
      shippingId:
        typeof order.shipping?.id === "number"
          ? String(order.shipping.id)
          : undefined,
      dateCreated: order.date_created,
      dateClosed: order.date_closed,
      raw: order,
    },
    items,
    paymentIds,
  };
}

export async function fetchMercadoLivreShipmentDetail(params: {
  accessToken: string;
  shipmentId: string;
}): Promise<MercadoLivreShipmentSnapshot | null> {
  const response = await mercadoLivreFetch(`${ML_API_BASE_URL}/shipments/${encodeURIComponent(params.shipmentId)}`, {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "application/json",
    },
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new MercadoLivreApiError("Mercado Livre shipment detail fetch failed", response.status, parsed);
  }

  const shipment = parsed as MercadoLivreShipmentResponse;
  const shippingType = shipment.shipping_option?.name
    ?? (shipment.shipping_option?.shipping_method_id ? `method_${shipment.shipping_option.shipping_method_id}` : undefined);

  return {
    id: String(shipment.id ?? params.shipmentId),
    status: shipment.status,
    substatus: shipment.substatus,
    mode: shipment.mode,
    logisticType: shipment.logistic_type,
    shippingType,
    trackingNumber: shipment.tracking_number,
    raw: shipment,
  };
}

export async function fetchMercadoLivreShipmentCosts(params: {
  accessToken: string;
  shipmentId: string;
}): Promise<{ shippingCost?: number; shippingCompensation?: number; raw: unknown } | null> {
  const response = await mercadoLivreFetch(`${ML_API_BASE_URL}/shipments/${encodeURIComponent(params.shipmentId)}/costs`, {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "application/json",
    },
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new MercadoLivreApiError("Mercado Livre shipment costs fetch failed", response.status, parsed);
  }

  const costs = parsed as MercadoLivreShipmentCostsResponse;
  const senderCost = (costs.senders ?? []).reduce((sum, item) => {
    return sum + (typeof item.cost === "number" ? item.cost : 0);
  }, 0);
  const senderCompensation = (costs.senders ?? []).reduce((sum, item) => {
    return sum + (typeof item.compensation?.amount === "number" ? item.compensation.amount : 0);
  }, 0);
  const receiverCost = typeof costs.receiver?.cost === "number" ? costs.receiver.cost : 0;

  return {
    shippingCost: senderCost + receiverCost,
    shippingCompensation: senderCompensation,
    raw: costs,
  };
}

export async function fetchMercadoLivrePaymentDetail(params: {
  accessToken: string;
  paymentId: string;
}): Promise<MercadoLivrePaymentFinancials | null> {
  const response = await mercadoLivreFetch(`${ML_API_BASE_URL}/v1/payments/${encodeURIComponent(params.paymentId)}`, {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "application/json",
    },
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new MercadoLivreApiError("Mercado Livre payment detail fetch failed", response.status, parsed);
  }

  const payment = parsed as MercadoLivrePaymentDetailResponse;
  const mlFees = (payment.fee_details ?? []).reduce((sum, fee) => sum + (typeof fee.amount === "number" ? fee.amount : 0), 0);
  const refunds = (payment.refunds ?? []).reduce((sum, refund) => sum + (typeof refund.amount === "number" ? refund.amount : 0), 0);

  return {
    grossReceived:
      typeof payment.total_paid_amount === "number"
        ? payment.total_paid_amount
        : payment.transaction_details?.total_paid_amount,
    netReceived: payment.transaction_details?.net_received_amount,
    mlFeeTotal: mlFees,
    refundsTotal: refunds,
    shippingCost: payment.transaction_details?.shipping_cost,
    raw: payment,
  };
}

export async function fetchMercadoLivreOrderBillingDetail(params: {
  accessToken: string;
  orderId: string;
}): Promise<MercadoLivreOrderBillingFinancials | null> {
  const url = new URL(`${ML_API_BASE_URL}/billing/integration/group/ML/order/details`);
  url.searchParams.set("order_ids", params.orderId);

  const response = await mercadoLivreFetch(url.toString(), {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "application/json",
    },
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new MercadoLivreApiError("Mercado Livre billing order detail fetch failed", response.status, parsed);
  }

  const entry = pickFirstBillingEntry(parsed);
  if (!entry) return null;

  const saleFee = (entry.sale_fee && typeof entry.sale_fee === "object"
    ? entry.sale_fee
    : {}) as Record<string, unknown>;

  const taxDetails = Array.isArray(entry.tax_details) ? entry.tax_details : [];
  const taxesTotal = taxDetails.reduce((sum: number, tax: any) => {
    return sum + (asFiniteNumber(tax?.amount) ?? 0);
  }, 0);

  const details = Array.isArray(entry.details) ? entry.details : [];
  let shippingCost = 0;
  let shippingCompensation = 0;
  for (const detail of details) {
    if (!detail || typeof detail !== "object") continue;
    const detailObj = detail as Record<string, unknown>;
    const amount =
      asFiniteNumber(detailObj.amount) ??
      asFiniteNumber(detailObj.value) ??
      asFiniteNumber(detailObj.net) ??
      asFiniteNumber(detailObj.total_amount);
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0) continue;

    const text = [
      normalizeText(detailObj.type),
      normalizeText(detailObj.name),
      normalizeText(detailObj.description),
      normalizeText(detailObj.label),
      normalizeText(detailObj.reason),
    ]
      .filter(Boolean)
      .join(" ");

    const mentionsShipping =
      text.includes("frete") ||
      text.includes("envio") ||
      text.includes("shipping") ||
      text.includes("logistica") ||
      text.includes("logistic");

    if (!mentionsShipping) continue;

    const mentionsBonus =
      text.includes("bonus") ||
      text.includes("compens") ||
      text.includes("bonificacao") ||
      text.includes("bonificacion") ||
      text.includes("desconto") ||
      text.includes("discount") ||
      text.includes("reembolso") ||
      text.includes("rebate");

    if (amount > 0 || mentionsBonus) {
      shippingCompensation += Math.abs(amount);
    } else {
      shippingCost += Math.abs(amount);
    }
  }

  const billedTotal =
    asFiniteNumber(entry.total_amount) ??
    asFiniteNumber(entry.order_total_amount) ??
    asFiniteNumber(entry.paid_amount) ??
    asFiniteNumber(entry.payment_info?.total_paid_amount) ??
    asFiniteNumber(entry.payment_info?.transaction_amount);

  const netAmount =
    asFiniteNumber(entry.net_amount) ??
    asFiniteNumber(entry.net_received_amount) ??
    asFiniteNumber(entry.amount_released) ??
    asFiniteNumber(entry.receivable_amount);

  return {
    billedTotal,
    saleFeeGross: asFiniteNumber(saleFee.gross),
    saleFeeNet: asFiniteNumber(saleFee.net),
    saleFeeRebate: asFiniteNumber(saleFee.rebate),
    saleFeeDiscount: asFiniteNumber(saleFee.discount),
    taxesTotal: taxesTotal > 0 ? taxesTotal : undefined,
    shippingCost: shippingCost > 0 ? shippingCost : undefined,
    shippingCompensation: shippingCompensation > 0 ? shippingCompensation : undefined,
    netAmount,
    raw: parsed,
  };
}

export function computeTokenExpiresAtIso(expiresInSeconds: number): string {
  const safeSeconds = Number.isFinite(expiresInSeconds) ? Math.max(0, Math.round(expiresInSeconds)) : 0;
  return new Date(Date.now() + safeSeconds * 1000).toISOString();
}

export function isTokenExpiringSoon(expiresAtIso?: string | null, thresholdSeconds = 120): boolean {
  if (!expiresAtIso) return true;
  const expiresAtMs = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresAtMs)) return true;
  const thresholdMs = Math.max(0, thresholdSeconds) * 1000;
  return expiresAtMs - Date.now() <= thresholdMs;
}
