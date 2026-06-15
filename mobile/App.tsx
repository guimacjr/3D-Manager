import React, { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StyleProp,
  Text,
  TextInput,
  TextStyle,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";

type ScreenKey =
  | "dashboard"
  | "marketplaces"
  | "marketplaceOrdersDashboard"
  | "marketplaceListings"
  | "marketplaceListingConfig"
  | "printers"
  | "printerForm"
  | "filaments"
  | "filamentForm"
  | "fixedCosts"
  | "quotes"
  | "quoteForm"
  | "quoteView"
  | "salesSkus"
  | "salesSkuForm"
  | "salesStock"
  | "salesPoints"
  | "salesPointForm"
  | "salesConsignment"
  | "salesPointsOverview"
  | "logs";

type CostSettings = {
  energyCostKwhCents: number;
  paybackMonths: number;
};

type Printer = {
  id: string;
  name: string;
  model: string;
  powerWatts: number;
  purchaseCostCents: number;
};

type Filament = {
  id: string;
  name: string;
  brand: string;
  color: string;
  materialType: string;
  purchaseLink: string;
  notes: string;
  purchaseCostCents: number;
  purchasedWeightGrams: number;
};

type QuoteFilamentUsage = {
  id: string;
  filamentName: string;
  usedWeightGrams: number;
};

type QuoteExtraCost = {
  id: string;
  itemName: string;
  itemCostCents: number;
};

type Quote = {
  id: string;
  printerId?: string;
  name: string;
  description: string;
  unitsProduced: number;
  printTimeMin: number;
  postProcessingMin: number;
  packagingCostCents: number;
  productionCostCents: number;
  taxCostCents: number;
  salePriceCents: number;
  contributionMarginCents?: number;
  contributionMarginBps?: number;
  media3mf: string[];
  mediaPhotos: string[];
  mediaVideos: string[];
  filamentUsages: QuoteFilamentUsage[];
  extraCosts: QuoteExtraCost[];
};

type ConfirmState = {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
};

type SalesSku = {
  id: string;
  skuCode: string;
  name: string;
  description: string;
  defaultSalePriceCents: number;
  presentialSalePriceCents: number;
  wholesaleConsignmentPriceCents: number;
  wholesaleCashPriceCents: number;
  productionCostCents: number;
  estimatedTaxCents?: number;
  taxRateBpsApplied?: number;
  contributionMarginCents?: number;
  contributionMarginBps?: number;
  syncWithQuotePricing: boolean;
  syncFinalSalePriceWithSuggested: boolean;
  syncPresentialSalePriceWithSuggested: boolean;
  syncWholesaleConsignmentPriceWithSuggested: boolean;
  syncWholesaleCashPriceWithSuggested: boolean;
  suggestedFinalPriceCents: number;
  suggestedPresentialPriceCents: number;
  suggestedWholesaleConsignmentPriceCents: number;
  suggestedWholesaleCashPriceCents: number;
  parentSkuId?: string;
  sourceQuoteId?: string;
  parentSkuName?: string;
  sourceQuoteName?: string;
  barcodes: string[];
  mediaPhotos: string[];
  mediaVideos: string[];
  media3mf: string[];
};

type SalesPoint = {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  commissionBps: number;
  contactPeriodDays: number;
  notes: string;
};

type SalesStockOverview = {
  skuId: string;
  skuCode: string;
  name: string;
  defaultSalePriceCents: number;
  productionCostCents: number;
  availableQuantity: number;
  consignedAtPoints: Array<{
    salesPointId: string;
    salesPointName: string;
    quantityRemaining: number;
  }>;
};

type StockMovementHistoryItem = {
  id: string;
  skuId: string;
  movementType: string;
  quantityDelta: number;
  occurredAt: string;
  referenceType: string;
  referenceId: string;
  notes: string;
  salesPointId?: string;
  salesPointName?: string;
};

type ConsignmentBatch = {
  id: string;
  salesPointId: string;
  salesPointName: string;
  dispatchedAt: string;
  expectedSettlementAt: string;
  status: "open" | "closed";
  notes: string;
  itemsCount: number;
};

type ConsignmentBatchItem = {
  id: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  quantitySent: number;
  soldQuantity: number;
  returnedQuantity: number;
  remainingQuantity: number;
  unitSalePriceCents: number;
  expectedRevenueCents: number;
  realizedRevenueCents: number;
};

type ConsignmentBatchDetail = {
  id: string;
  salesPointId: string;
  salesPointName: string;
  dispatchedAt: string;
  expectedSettlementAt: string;
  status: "open" | "closed";
  notes: string;
  items: ConsignmentBatchItem[];
};

type ConsignmentDashboardMovement = {
  movementType: "sent" | "sold" | "returned";
  batchItemId: string;
  batchId: string;
  salesPointId: string;
  salesPointName: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  quantity: number;
  eventAt: string;
  notes: string;
};

type ConsignmentDashboard = {
  generatedAt: string;
  totals: {
    soldItemsCount: number;
    availableItemsCount: number;
    activeSalesPointsCount: number;
  };
  movements: ConsignmentDashboardMovement[];
};

type SalesPointOverviewProduct = {
  skuId: string;
  skuCode: string;
  skuName: string;
  quantityRemaining: number;
  referenceUnitSalePriceCents: number;
  expectedRevenueCents: number;
  realizedRevenueCents: number;
};

type SalesPointOverview = {
  salesPointId: string;
  salesPointName: string;
  nextContactAt: string;
  expectedRevenueCents: number;
  realizedRevenueCents: number;
  activeProductsCount: number;
  productsAtPoint: SalesPointOverviewProduct[];
};

type OperationLogItem = {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  summary: string;
  payloadJson: string;
  payload: Record<string, any> | null;
  createdAt: string;
};

type MarketplaceOrdersSyncMode = "incremental" | "light" | "normal" | "full";

type MarketplaceScheduledOrderSync = {
  mode: "incremental" | "light" | "normal";
  label: string;
  enabled: boolean;
  interval_minutes: number;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_status: string | null;
  last_run_id: string | null;
  last_message: string | null;
  next_run_at: string | null;
};

type MarketplaceAccountStatus = {
  id: string;
  marketplace: string;
  account_label: string | null;
  marketplace_user_id: string;
  seller_nickname: string | null;
  country_id: string | null;
  scope: string | null;
  is_active: boolean;
  token_expires_at: string | null;
  token_status: "valid" | "expiring_soon" | "expired";
  created_at: string;
  updated_at: string;
  last_connected_at: string;
  last_token_refresh_at: string | null;
  scheduled_order_syncs?: MarketplaceScheduledOrderSync[];
};

type MarketplaceStatusResponse = {
  marketplace: string;
  configured: boolean;
  connected: boolean;
  accounts: MarketplaceAccountStatus[];
  refresh_errors?: Array<{
    account_id: string;
    message: string;
    status?: number;
    details?: unknown;
  }>;
};

type MarketplaceCustomRequestResponse = {
  marketplace: string;
  account_id: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  data: unknown;
};

type MarketplaceNormalizationRule = {
  id: string;
  marketplace: string;
  category: string;
  raw_value: string;
  normalized_label: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type MarketplaceCatalogVariationItem = {
  id: string;
  account_id: string;
  marketplace_item_id: string;
  marketplace_variation_id: string | null;
  variation_key: string;
  title: string;
  variation_label: string | null;
  status: string | null;
  currency_id: string | null;
  price_cents: number | null;
  effective_price_cents: number | null;
  estimated_sale_fee_cents: number | null;
  estimated_listing_fee_cents: number | null;
  estimated_net_proceeds_cents: number | null;
  listing_type_id: string | null;
  category_id: string | null;
  shipping_mode: string | null;
  shipping_logistic_type: string | null;
  shipping_free: number | null;
  shipping_tags_json: string | null;
  available_quantity: number | null;
  sold_quantity: number | null;
  is_ignored: number | null;
  linked_sku_id: string | null;
  linked_sku_code: string | null;
  linked_sku_name: string | null;
  linked_sku_is_active: number | null;
  last_seen_at: string;
  updated_at: string;
};

function normalizeMarketplaceIgnoredFlag(value: unknown): number {
  if (value === 1 || value === true || value === "1") {
    return 1;
  }
  return 0;
}

function isMarketplaceListingIgnored(item: MarketplaceCatalogVariationItem): boolean {
  return normalizeMarketplaceIgnoredFlag(item.is_ignored) === 1;
}

function isMarketplaceListingActive(item: MarketplaceCatalogVariationItem): boolean {
  return (item.status ?? "").trim().toLowerCase() === "active";
}

function normalizeMarketplaceCatalogVariationItem(
  item: MarketplaceCatalogVariationItem
): MarketplaceCatalogVariationItem {
  return {
    ...item,
    is_ignored: normalizeMarketplaceIgnoredFlag(item.is_ignored),
  };
}

function resolveMarketplaceNormalizedLabel(
  rules: MarketplaceNormalizationRule[],
  category: string,
  rawValue: string | null | undefined,
  fallback = "-"
) {
  const raw = (rawValue ?? "").trim();
  if (!raw) return fallback;
  const rule = rules.find(
    (item) =>
      item.category === category &&
      item.raw_value === raw &&
      item.is_active === 1 &&
      item.normalized_label.trim().length > 0
  );
  return rule?.normalized_label ?? raw;
}

type MarketplaceOrderItem = {
  id: string;
  account_id: string;
  marketplace_order_id: string;
  marketplace_order_ids?: string[];
  pack_id: string | null;
  seller_id: string;
  buyer_id: string | null;
  buyer_nickname: string | null;
  status: string | null;
  substatus: string | null;
  order_total_cents: number | null;
  paid_amount_cents: number | null;
  currency_id: string | null;
  shipping_id: string | null;
  shipping_status: string | null;
  shipping_substatus: string | null;
  shipping_mode: string | null;
  shipping_logistic_type: string | null;
  shipping_type: string | null;
  shipping_tracking_number: string | null;
  shipping_stage: string | null;
  billed_total_cents: number | null;
  gross_received_cents: number | null;
  net_received_cents: number | null;
  ml_fee_total_cents: number | null;
  refunds_total_cents: number | null;
  shipping_cost_cents: number | null;
  shipping_compensation_cents: number | null;
  date_created: string | null;
  date_closed: string | null;
  last_seen_at: string;
  updated_at: string;
  snapshot_status?: {
    code: "ok" | "pending" | "partial" | "ignored";
    label: string;
    summary: string;
    ok_items: number;
    pending_items: number;
    unresolved_items: number;
    reasons: Array<{
      code: "linked_sku_missing" | "production_cost_unavailable";
      count: number;
      label: string;
    }>;
  };
  metrics?: {
    itemsCount: number;
    itemsWithCostSnapshot: number;
    itemsWithoutCostSnapshot: number;
    unitsSold: number;
    grossRevenueCents: number;
    netReceivedCents: number | null;
    productionCostCents: number;
    energyCostCents: number;
    paybackCostCents: number;
    filamentCostCents: number;
    otherCostCents: number;
    grossProfitCents: number;
    netProfitCents: number | null;
    filamentMaterials: Array<{
      material_type: string;
      total_cost_cents: number;
      total_weight_grams: number;
    }>;
  };
  order_items: Array<{
    id: string;
    marketplace_item_id: string;
    marketplace_variation_id: string | null;
    variation_key: string;
    effective_marketplace_variation_id: string | null;
    effective_variation_key: string;
    title: string;
    quantity: number;
    unit_price_cents: number | null;
    total_price_cents: number | null;
    currency_id: string | null;
    linked_catalog_variation_id: string | null;
    linked_catalog_variation_label: string | null;
    current_linked_catalog_variation_id: string | null;
    current_linked_catalog_variation_label: string | null;
    current_linked_sku_id: string | null;
    current_linked_sku_code: string | null;
    current_linked_sku_name: string | null;
    cost_snapshot_sku_id: string | null;
    cost_snapshot_sku_code: string | null;
    cost_snapshot_sku_name: string | null;
    cost_snapshot_source_quote_id: string | null;
    unit_production_cost_cents: number | null;
    unit_energy_cost_cents: number | null;
    unit_payback_cost_cents: number | null;
    unit_filament_cost_cents: number | null;
    unit_other_cost_cents: number | null;
    cost_snapshot_at: string | null;
    stock_status?: {
      code: "missing_sku" | "ignored_fulfillment" | "ignored_cancelled" | "moved" | "pending_movement";
      label: string;
      summary: string;
      expected_delta: number;
      moved_delta: number;
    };
    filament_cost_breakdown: Array<{
      material_type: string;
      unit_cost_cents: number;
      total_cost_cents: number;
      used_weight_grams_per_unit: number;
      used_weight_grams_total: number;
    }>;
  }>;
};

type MarketplaceOrdersDashboardResponse = {
  marketplace: string;
  generated_at: string;
  product_ads?: {
    date_from: string;
    date_to: string;
    totals: {
      cost_cents: number;
      impressions: number;
      clicks: number;
      orders: number;
      revenue_cents: number;
    };
    daily: Array<{
      date: string;
      cost_cents: number;
      impressions: number;
      clicks: number;
      orders: number;
      revenue_cents: number;
    }>;
    accounts: Array<{
      account_id: string;
      seller_nickname: string | null;
      advertiser_id: string | null;
      status: "ok" | "unavailable" | "error";
      message: string | null;
      cost_cents: number;
    }>;
  };
  totals: {
    orders_count: number;
    orders_with_net_received: number;
    items_count: number;
    items_with_cost_snapshot: number;
    items_without_cost_snapshot: number;
    units_sold: number;
    gross_revenue_cents: number;
    net_received_cents: number;
    production_cost_cents: number;
    energy_cost_cents: number;
    payback_cost_cents: number;
    filament_cost_cents: number;
    other_cost_cents: number;
    gross_profit_cents: number;
    net_profit_cents: number;
  };
  accounts: Array<{
    account_id: string;
    seller_nickname: string | null;
    orders_count: number;
    units_sold: number;
    gross_revenue_cents: number;
    net_received_cents: number;
    production_cost_cents: number;
    gross_profit_cents: number;
    net_profit_cents: number;
  }>;
  filament_materials: Array<{
    material_type: string;
    total_cost_cents: number;
    total_weight_grams: number;
  }>;
  recent_orders: Array<{
    id: string;
    account_id: string;
    seller_nickname: string | null;
	    marketplace_order_id: string;
	    buyer_nickname: string | null;
	    status: string | null;
	    substatus: string | null;
	    shipping_status: string | null;
	    shipping_substatus: string | null;
	    shipping_mode: string | null;
	    shipping_logistic_type: string | null;
	    shipping_type: string | null;
	    shipping_stage: string | null;
	    date_created: string | null;
	    updated_at: string;
    itemsCount: number;
    itemsWithCostSnapshot: number;
    itemsWithoutCostSnapshot: number;
    unitsSold: number;
    grossRevenueCents: number;
    netReceivedCents: number | null;
    productionCostCents: number;
    energyCostCents: number;
    paybackCostCents: number;
    filamentCostCents: number;
    otherCostCents: number;
    grossProfitCents: number;
    netProfitCents: number | null;
    snapshot_status: {
      code: "ok" | "pending" | "partial" | "ignored";
      label: string;
      summary: string;
      ok_items: number;
      pending_items: number;
      unresolved_items: number;
      reasons: Array<{
        code: "linked_sku_missing" | "production_cost_unavailable";
        count: number;
        label: string;
      }>;
    };
    filamentMaterials: Array<{
      material_type: string;
      total_cost_cents: number;
      total_weight_grams: number;
    }>;
  }>;
};

const PRIVACY_MASK = "***";

type SelectOption = {
  label: string;
  value: string;
};

function maskSensitiveText(value: string | null | undefined, enabled: boolean, fallback = ""): string {
  if (!value) return fallback;
  return enabled ? PRIVACY_MASK : value;
}

function maskSensitiveComposite(
  parts: Array<string | null | undefined>,
  enabled: boolean,
  fallback = ""
): string {
  const text = parts.map((part) => (part ?? "").trim()).filter(Boolean).join(" - ");
  if (!text) return fallback;
  return enabled ? PRIVACY_MASK : text;
}

function maskNameKeepCode(code: string | null | undefined, name: string | null | undefined, enabled: boolean): string {
  const normalizedCode = (code ?? "").trim();
  const normalizedName = (name ?? "").trim();
  if (!normalizedCode && !normalizedName) return "";
  if (!enabled) return [normalizedCode, normalizedName].filter(Boolean).join(" - ");
  return normalizedCode ? `${normalizedCode} - ${PRIVACY_MASK}` : PRIVACY_MASK;
}

function maskNameOrCode(name: string | null | undefined, code: string | null | undefined, enabled: boolean): string {
  const normalizedName = (name ?? "").trim();
  const normalizedCode = (code ?? "").trim();
  const text = normalizedName || normalizedCode;
  if (!text) return "";
  return enabled ? PRIVACY_MASK : text;
}

function toSelectOptions(options: Array<string | SelectOption>): SelectOption[] {
  return options.map((option) =>
    typeof option === "string"
      ? { label: option, value: option }
      : option
  );
}

const costSettings: CostSettings = {
  energyCostKwhCents: 95,
  paybackMonths: 24,
};

const printersSeed: Printer[] = [
  {
    id: "p1",
    name: "Bambu A1",
    model: "A1 Combo",
    powerWatts: 120,
    purchaseCostCents: 420000,
  },
  {
    id: "p2",
    name: "Ender Lab",
    model: "Ender 3 V3 SE",
    powerWatts: 180,
    purchaseCostCents: 199000,
  },
];

const filamentsSeed: Filament[] = [
  {
    id: "f1",
    name: "PLA Silk Ouro",
    brand: "Voolt3D",
    color: "Ouro",
    materialType: "PLA",
    purchaseLink: "https://loja.exemplo/pla-ouro",
    notes: "",
    purchaseCostCents: 12900,
    purchasedWeightGrams: 1000,
  },
  {
    id: "f2",
    name: "PETG Preto",
    brand: "3DX",
    color: "Preto",
    materialType: "PETG",
    purchaseLink: "https://loja.exemplo/petg-preto",
    notes: "",
    purchaseCostCents: 14990,
    purchasedWeightGrams: 1000,
  },
];

const quotesSeed: Quote[] = [
  {
    id: "q1",
    printerId: "p1",
    name: "Suporte de Monitor",
    description: "Peça com reforço para mesa de home office",
    unitsProduced: 1,
    printTimeMin: 320,
    postProcessingMin: 25,
    packagingCostCents: 300,
    productionCostCents: 2350,
    taxCostCents: 188,
    salePriceCents: 4600,
    media3mf: ["suporte-monitor-v1.3mf"],
    mediaPhotos: [],
    mediaVideos: [],
    filamentUsages: [{ id: "uf1", filamentName: "PLA Silk Ouro", usedWeightGrams: 160 }],
    extraCosts: [{ id: "ue1", itemName: "Parafusos", itemCostCents: 250 }],
  },
  {
    id: "q2",
    printerId: "p2",
    name: "Organizador de Cabos",
    description: "Canaleta compacta para mesa",
    unitsProduced: 1,
    printTimeMin: 140,
    postProcessingMin: 15,
    packagingCostCents: 150,
    productionCostCents: 980,
    taxCostCents: 78,
    salePriceCents: 2200,
    media3mf: [],
    mediaPhotos: [],
    mediaVideos: [],
    filamentUsages: [{ id: "uf2", filamentName: "PETG Preto", usedWeightGrams: 80 }],
    extraCosts: [],
  },
];

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;

const generateInternalSkuCode = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SKU-${y}${m}${d}-${suffix}`;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3333";
const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const MARKETPLACE_ORDERS_CHARTS_VISIBLE_COOKIE = "marketplace_orders_dashboard_charts_visible";

function readCookieBoolean(key: string, fallback: boolean) {
  try {
    const documentRef = (globalThis as unknown as { document?: { cookie?: string } }).document;
    const cookies = documentRef?.cookie?.split(";").map((item) => item.trim()) ?? [];
    const cookie = cookies.find((item) => item.startsWith(`${encodeURIComponent(key)}=`));
    const value = cookie ? decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)) : null;
    if (value === "true") return true;
    if (value === "false") return false;
  } catch {
    return fallback;
  }
  return fallback;
}

function writeCookieBoolean(key: string, value: boolean) {
  try {
    const documentRef = (globalThis as unknown as { document?: { cookie?: string } }).document;
    if (!documentRef) return;
    const maxAgeSeconds = 60 * 60 * 24 * 365;
    documentRef.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
  } catch {
    // Cookie persistence is best-effort on non-web targets.
  }
}

function parseLocaleNumber(raw: string | number): number {
  if (typeof raw === "number") return raw;
  const value = raw.trim();
  if (!value) return Number.NaN;
  if (value.includes(",")) {
    // pt-BR style: 1.234,56 -> 1234.56
    return Number(value.replace(/\./g, "").replace(",", "."));
  }
  return Number(value);
}

function formatCurrencyInput(raw: string): string {
  const parsed = parseLocaleNumber(raw);
  if (!Number.isFinite(parsed)) return "";
  return parsed.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sanitizeCurrencyTyping(raw: string): string {
  const cleaned = raw.replace(/[^\d,.\s]/g, "").replace(/\s/g, "").replace(/\./g, ",");
  if (!cleaned) return "";

  const firstComma = cleaned.indexOf(",");
  if (firstComma === -1) {
    return cleaned.replace(/,/g, "");
  }

  const integerPart = cleaned.slice(0, firstComma).replace(/,/g, "") || "0";
  const decimalPart = cleaned
    .slice(firstComma + 1)
    .replace(/,/g, "")
    .slice(0, 2);

  return `${integerPart},${decimalPart}`;
}

function normalizeCurrencyValue(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const parsed = parseLocaleNumber(value);
  if (!Number.isFinite(parsed)) return "";
  return parsed.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = typeof init?.body !== "undefined";
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  const text = await response.text();
  if (!text.trim()) {
    return null as T;
  }
  return JSON.parse(text) as T;
}

async function pickFilesOnWeb(accept: string, multiple = true): Promise<File[]> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return [];
  }

  return await new Promise<File[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      resolve(files);
    };
    input.click();
  });
}

async function uploadMediaFile(
  file: File,
  mediaType: "photo" | "video" | "3mf",
  ownerType: "quotes" | "skus",
  ownerId: string
) {
  const form = new FormData();
  form.append("owner_type", ownerType);
  form.append("owner_id", ownerId);
  if (ownerType === "quotes") {
    // compatibilidade com backend antigo em alguns ambientes
    form.append("quote_id", ownerId);
  }
  form.append("media_type", mediaType);
  form.append("file", file);

  const response = await fetch(`${API_BASE_URL}/uploads`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Upload failed (${response.status}): ${body}`);
  }

  const json = await response.json();
  return json as { media_type: "photo" | "video" | "3mf"; local_uri: string; original_name: string };
}

function mediaUrlFromLocalUri(localUri: string): string {
  if (/^https?:\/\//i.test(localUri)) return localUri;
  return `${API_BASE_URL}/${localUri.replace(/^\/+/, "")}`;
}

async function downloadMediaOnWeb(localUri: string): Promise<void> {
  if (Platform.OS !== "web" || typeof document === "undefined") return;

  const url = mediaUrlFromLocalUri(localUri);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar arquivo (${response.status})`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const fileName = decodeURIComponent(url.split("/").pop() || "arquivo");
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

function mapPrinterFromApi(row: any): Printer {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    powerWatts: row.power_watts,
    purchaseCostCents: row.purchase_cost_cents,
  };
}

function mapFilamentFromApi(row: any): Filament {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    color: row.color,
    materialType: row.material_type,
    purchaseLink: row.purchase_link ?? "",
    notes: row.notes ?? "",
    purchaseCostCents: row.purchase_cost_cents,
    purchasedWeightGrams: row.purchased_weight_grams,
  };
}

function mapQuoteSummaryFromApi(row: any): Quote {
  return {
    id: row.id,
    printerId: undefined,
    name: row.print_name,
    description: "",
    unitsProduced: row.units_produced ?? 1,
    printTimeMin: row.print_time_minutes ?? 0,
    postProcessingMin: row.post_processing_minutes ?? 0,
    packagingCostCents: 0,
    productionCostCents: row.subtotal_cost_cents ?? 0,
    taxCostCents: row.tax_cost_cents ?? 0,
    salePriceCents: row.final_price_cents ?? 0,
    contributionMarginCents: row.contribution_margin_cents,
    contributionMarginBps: row.contribution_margin_bps,
    media3mf: [],
    mediaPhotos: [],
    mediaVideos: [],
    filamentUsages: [],
    extraCosts: [],
  };
}

function mapQuoteDetailFromApi(row: any): Quote {
  const media3mf = (row.media ?? [])
    .filter((item: any) => item.media_type === "3mf")
    .map((item: any) => item.local_uri);
  const mediaPhotos = (row.media ?? [])
    .filter((item: any) => item.media_type === "photo")
    .map((item: any) => item.local_uri);
  const mediaVideos = (row.media ?? [])
    .filter((item: any) => item.media_type === "video")
    .map((item: any) => item.local_uri);

  const filamentUsages = (row.filament_items ?? []).map((item: any) => ({
    id: item.id,
    filamentName: item.filament_name ?? item.filament_id,
    usedWeightGrams: item.used_weight_grams,
  }));

  const extraCosts = (row.extra_costs ?? []).map((item: any) => ({
    id: item.id,
    itemName: item.item_name,
    itemCostCents: item.item_cost_cents,
  }));

  return {
    id: row.id,
    printerId: row.printer_id,
    name: row.print_name,
    description: row.description ?? "",
    unitsProduced: row.units_produced ?? 1,
    printTimeMin: row.print_time_minutes ?? 0,
    postProcessingMin: row.post_processing_minutes ?? 0,
    packagingCostCents: row.packaging_cost_cents ?? 0,
    productionCostCents: row.subtotal_cost_cents ?? 0,
    taxCostCents: row.tax_cost_cents ?? 0,
    salePriceCents: row.final_price_cents ?? 0,
    contributionMarginCents: row.contribution_margin_cents,
    contributionMarginBps: row.contribution_margin_bps,
    media3mf,
    mediaPhotos,
    mediaVideos,
    filamentUsages,
    extraCosts,
  };
}

function mapSalesSkuFromApi(row: any): SalesSku {
  const media3mf = (row.media ?? [])
    .filter((item: any) => item.media_type === "3mf")
    .map((item: any) => item.local_uri);
  const mediaPhotos = (row.media ?? [])
    .filter((item: any) => item.media_type === "photo")
    .map((item: any) => item.local_uri);
  const mediaVideos = (row.media ?? [])
    .filter((item: any) => item.media_type === "video")
    .map((item: any) => item.local_uri);

  return {
    id: row.id,
    skuCode: row.sku_code,
    name: row.name,
    description: row.description ?? "",
    defaultSalePriceCents: row.default_sale_price_cents ?? 0,
    presentialSalePriceCents: row.presential_sale_price_cents ?? row.suggested_presential_price_cents ?? 0,
    wholesaleConsignmentPriceCents:
      row.wholesale_consignment_price_cents ?? row.suggested_wholesale_consignment_price_cents ?? 0,
    wholesaleCashPriceCents: row.wholesale_cash_price_cents ?? row.suggested_wholesale_cash_price_cents ?? 0,
    productionCostCents: row.production_cost_cents ?? 0,
    estimatedTaxCents: row.estimated_tax_cents,
    taxRateBpsApplied: row.tax_rate_bps_applied,
    contributionMarginCents: row.contribution_margin_cents,
    contributionMarginBps: row.contribution_margin_bps,
    syncWithQuotePricing: Number(row.sync_with_quote_pricing ?? 0) === 1,
    syncFinalSalePriceWithSuggested: Number(row.sync_final_sale_price_with_suggested ?? 1) === 1,
    syncPresentialSalePriceWithSuggested: Number(row.sync_presential_sale_price_with_suggested ?? 1) === 1,
    syncWholesaleConsignmentPriceWithSuggested:
      Number(row.sync_wholesale_consignment_price_with_suggested ?? 1) === 1,
    syncWholesaleCashPriceWithSuggested: Number(row.sync_wholesale_cash_price_with_suggested ?? 1) === 1,
    suggestedFinalPriceCents: row.suggested_final_price_cents ?? row.default_sale_price_cents ?? 0,
    suggestedPresentialPriceCents: row.suggested_presential_price_cents ?? 0,
    suggestedWholesaleConsignmentPriceCents: row.suggested_wholesale_consignment_price_cents ?? 0,
    suggestedWholesaleCashPriceCents: row.suggested_wholesale_cash_price_cents ?? 0,
    parentSkuId: row.parent_sku_id ?? undefined,
    sourceQuoteId: row.source_quote_id ?? undefined,
    parentSkuName: row.parent_sku_name ?? undefined,
    sourceQuoteName: row.source_quote_name ?? undefined,
    barcodes: Array.isArray(row.barcodes) ? row.barcodes : [],
    media3mf,
    mediaPhotos,
    mediaVideos,
  };
}

function mapSalesPointFromApi(row: any): SalesPoint {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    commissionBps: row.commission_bps ?? 0,
    contactPeriodDays: row.contact_period_days ?? 30,
    notes: row.notes ?? "",
  };
}

function mapSalesStockOverviewFromApi(row: any): SalesStockOverview {
  return {
    skuId: row.sku_id,
    skuCode: row.sku_code,
    name: row.name,
    defaultSalePriceCents: row.default_sale_price_cents ?? 0,
    productionCostCents: row.production_cost_cents ?? 0,
    availableQuantity: row.available_quantity ?? 0,
    consignedAtPoints: (row.consigned_at_points ?? []).map((item: any) => ({
      salesPointId: item.sales_point_id,
      salesPointName: item.sales_point_name,
      quantityRemaining: item.quantity_remaining ?? 0,
    })),
  };
}

function mapStockMovementHistoryFromApi(row: any): StockMovementHistoryItem {
  return {
    id: row.id,
    skuId: row.sku_id,
    movementType: row.movement_type ?? "",
    quantityDelta: row.quantity_delta ?? 0,
    occurredAt: row.occurred_at ?? "",
    referenceType: row.reference_type ?? "",
    referenceId: row.reference_id ?? "",
    notes: row.notes ?? "",
    salesPointId: row.sales_point_id ?? undefined,
    salesPointName: row.sales_point_name ?? undefined,
  };
}

function mapConsignmentBatchFromApi(row: any): ConsignmentBatch {
  return {
    id: row.id,
    salesPointId: row.sales_point_id,
    salesPointName: row.sales_point_name ?? "",
    dispatchedAt: row.dispatched_at ?? "",
    expectedSettlementAt: row.expected_settlement_at ?? "",
    status: row.status ?? "open",
    notes: row.notes ?? "",
    itemsCount: row.items_count ?? 0,
  };
}

function mapConsignmentBatchDetailFromApi(row: any): ConsignmentBatchDetail {
  return {
    id: row.id,
    salesPointId: row.sales_point_id,
    salesPointName: row.sales_point_name ?? "",
    dispatchedAt: row.dispatched_at ?? "",
    expectedSettlementAt: row.expected_settlement_at ?? "",
    status: row.status ?? "open",
    notes: row.notes ?? "",
    items: (row.items ?? []).map((item: any) => ({
      id: item.id,
      skuId: item.sku_id,
      skuCode: item.sku_code ?? "",
      skuName: item.sku_name ?? "",
      quantitySent: item.quantity_sent ?? 0,
      soldQuantity: item.sold_quantity ?? 0,
      returnedQuantity: item.returned_quantity ?? 0,
      remainingQuantity: item.remaining_quantity ?? 0,
      unitSalePriceCents: item.unit_sale_price_cents ?? 0,
      expectedRevenueCents: item.expected_revenue_cents ?? 0,
      realizedRevenueCents: item.realized_revenue_cents ?? 0,
    })),
  };
}

function mapConsignmentDashboardFromApi(row: any): ConsignmentDashboard {
  return {
    generatedAt: row.generated_at ?? "",
    totals: {
      soldItemsCount: row.totals?.sold_items_count ?? 0,
      availableItemsCount: row.totals?.available_items_count ?? 0,
      activeSalesPointsCount: row.totals?.active_sales_points_count ?? 0,
    },
    movements: (row.movements ?? []).map((item: any) => ({
      movementType: item.movement_type ?? "sent",
      batchItemId: item.batch_item_id ?? "",
      batchId: item.batch_id ?? "",
      salesPointId: item.sales_point_id ?? "",
      salesPointName: item.sales_point_name ?? "",
      skuId: item.sku_id ?? "",
      skuCode: item.sku_code ?? "",
      skuName: item.sku_name ?? "",
      quantity: item.quantity ?? 0,
      eventAt: item.event_at ?? "",
      notes: item.notes ?? "",
    })),
  };
}

function mapSalesPointOverviewFromApi(row: any): SalesPointOverview {
  return {
    salesPointId: row.sales_point_id,
    salesPointName: row.sales_point_name,
    nextContactAt: row.next_contact_at ?? "",
    expectedRevenueCents: row.expected_revenue_cents ?? 0,
    realizedRevenueCents: row.realized_revenue_cents ?? 0,
    activeProductsCount: row.active_products_count ?? 0,
    productsAtPoint: (row.products_at_point ?? []).map((item: any) => ({
      skuId: item.sku_id,
      skuCode: item.sku_code,
      skuName: item.sku_name,
      quantityRemaining: item.quantity_remaining ?? 0,
      referenceUnitSalePriceCents: item.reference_unit_sale_price_cents ?? 0,
      expectedRevenueCents: item.expected_revenue_cents ?? 0,
      realizedRevenueCents: item.realized_revenue_cents ?? 0,
    })),
  };
}

function mapOperationLogFromApi(row: any): OperationLogItem {
  const payloadJson = row.payload_json ?? "";
  let payload: Record<string, any> | null = null;
  try {
    const parsed = payloadJson ? JSON.parse(payloadJson) : null;
    payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    payload = null;
  }

  return {
    id: row.id,
    eventType: row.event_type ?? "",
    entityType: row.entity_type ?? "",
    entityId: row.entity_id ?? "",
    summary: row.summary ?? "",
    payloadJson,
    payload,
    createdAt: row.created_at ?? "",
  };
}

function computeQuoteDisplayTotals({
  quote,
  filaments,
  printers,
  laborHourCostCents,
  energyCostKwhCents,
  paybackMonths,
  taxRatePercent,
  markupPercent,
}: {
  quote: Quote;
  filaments: Filament[];
  printers: Printer[];
  laborHourCostCents: number;
  energyCostKwhCents: number;
  paybackMonths: number;
  taxRatePercent: number;
  markupPercent: number;
}) {
  const unitsProduced = Math.max(1, quote.unitsProduced || 1);
  const printer = printers.find((item) => item.id === quote.printerId) ?? printers[0];
  if (!printer) {
    return {
      subtotalUnitCents: quote.productionCostCents,
      taxUnitCents: quote.taxCostCents,
      finalUnitCents: quote.salePriceCents,
      subtotalBatchCents: quote.productionCostCents * unitsProduced,
      taxBatchCents: quote.taxCostCents * unitsProduced,
      finalBatchCents: quote.salePriceCents * unitsProduced,
    };
  }

  const totalPrintTimeMin = quote.printTimeMin;
  const totalPostProcessingMin = quote.postProcessingMin * unitsProduced;

  const energyPerHourCents = (printer.powerWatts / 1000) * energyCostKwhCents;
  const paybackPerHourCents =
    printer.purchaseCostCents / (Math.max(1, paybackMonths) * 20 * 30);

  const energyTotalCents = Math.round(energyPerHourCents * (totalPrintTimeMin / 60));
  const paybackTotalCents = Math.round(paybackPerHourCents * (totalPrintTimeMin / 60));
  const laborTotalCents = Math.round((totalPostProcessingMin / 60) * laborHourCostCents);

  const filamentBatchTotalCents = quote.filamentUsages.reduce((sum, line) => {
    const filament = filaments.find((item) => item.name === line.filamentName);
    const unitCostPerGramCents = filament
      ? filament.purchaseCostCents / filament.purchasedWeightGrams
      : 0;
    const lineTotalCents = Math.round(line.usedWeightGrams * unitCostPerGramCents);
    return sum + lineTotalCents;
  }, 0);

  const extrasUnitTotalCents = quote.extraCosts.reduce((sum, item) => sum + item.itemCostCents, 0);
  const extrasBatchTotalCents = extrasUnitTotalCents * unitsProduced;
  const packagingBatchTotalCents = quote.packagingCostCents * unitsProduced;

  const subtotalBatchCents =
    filamentBatchTotalCents +
    extrasBatchTotalCents +
    packagingBatchTotalCents +
    energyTotalCents +
    paybackTotalCents +
    laborTotalCents;
  const withMarkupBatchCents = Math.round(subtotalBatchCents * (1 + markupPercent / 100));
  const taxBatchCents = Math.round(withMarkupBatchCents * (taxRatePercent / 100));
  const finalBatchCents = withMarkupBatchCents + taxBatchCents;

  return {
    subtotalUnitCents: Math.round(subtotalBatchCents / unitsProduced),
    taxUnitCents: Math.round(taxBatchCents / unitsProduced),
    finalUnitCents: Math.round(finalBatchCents / unitsProduced),
    subtotalBatchCents,
    taxBatchCents,
    finalBatchCents,
  };
}

function computeContributionMargin(input: {
  revenueCents: number;
  variableCostCents: number;
  taxCents: number;
}) {
  const revenue = Math.max(0, Math.round(Number(input.revenueCents || 0)));
  const variableCost = Math.max(0, Math.round(Number(input.variableCostCents || 0)));
  const tax = Math.max(0, Math.round(Number(input.taxCents || 0)));
  const contribution = revenue - variableCost - tax;
  const bps = revenue > 0 ? Math.round((contribution * 10000) / revenue) : 0;
  return {
    contribution_margin_cents: contribution,
    contribution_margin_bps: bps,
  };
}

function computeQuoteCostWithoutPaybackAndTaxes({
  quote,
  filaments,
  printers,
  laborHourCostCents,
  energyCostKwhCents,
}: {
  quote: Quote;
  filaments: Filament[];
  printers: Printer[];
  laborHourCostCents: number;
  energyCostKwhCents: number;
}) {
  const unitsProduced = Math.max(1, quote.unitsProduced || 1);
  const printer = printers.find((item) => item.id === quote.printerId) ?? printers[0];
  const totalPrintTimeMin = quote.printTimeMin;
  const totalPostProcessingMin = quote.postProcessingMin * unitsProduced;

  const energyBatchCents = printer
    ? Math.round(((printer.powerWatts / 1000) * energyCostKwhCents * totalPrintTimeMin) / 60)
    : 0;
  const laborBatchCents = Math.round((totalPostProcessingMin / 60) * laborHourCostCents);
  const filamentBatchCents = quote.filamentUsages.reduce((sum, line) => {
    const filament = filaments.find((item) => item.name === line.filamentName);
    const unitCostPerGramCents = filament
      ? filament.purchaseCostCents / filament.purchasedWeightGrams
      : 0;
    return sum + Math.round(line.usedWeightGrams * unitCostPerGramCents);
  }, 0);
  const extrasUnitCents = quote.extraCosts.reduce((sum, item) => sum + item.itemCostCents, 0);
  const extrasBatchCents = extrasUnitCents * unitsProduced;
  const packagingBatchCents = quote.packagingCostCents * unitsProduced;

  const totalBatchCents =
    filamentBatchCents +
    energyBatchCents +
    laborBatchCents +
    extrasBatchCents +
    packagingBatchCents;
  return {
    totalBatchCents,
    totalUnitCents: Math.round(totalBatchCents / unitsProduced),
  };
}

const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const percentFromBps = (bps: number) =>
  (bps / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const dateOnly = (value: string) => {
  if (!value) return "-";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toISOString().slice(0, 10);
};

const dateTime = (value: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
};

const formatLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const parseLocalDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

const addLocalDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const buildCalendarCells = (cursor: Date): Array<Date | null> => {
  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const firstWeekDay = firstDay.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstWeekDay; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

const shippingStageLabel = (value: string | null | undefined) => {
  const stage = (value ?? "").toLowerCase();
  if (!stage) return "-";
  if (stage === "label_to_print") return "Etiqueta para imprimir";
  if (stage === "label_printed") return "Etiqueta impressa";
  if (stage === "in_transit") return "A caminho";
  if (stage === "delivered") return "Entregue";
  if (stage === "ready_to_ship") return "Pronto para envio";
  return stage;
};

const contactDateStatus = (value: string): "past" | "today" | "tomorrow" | "normal" => {
  if (!value) return "normal";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "normal";
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return "past";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return "normal";
};

const printerCostPerMinute = (printer: Printer, settings: CostSettings) => {
  const energyPerMin =
    (printer.powerWatts / 1000) * (settings.energyCostKwhCents / 60);
  const paybackPerMin =
    printer.purchaseCostCents / (settings.paybackMonths * 30 * 20 * 60);
  return energyPerMin + paybackPerMin;
};

type AppButtonVariant = "primary" | "secondary" | "small" | "danger" | "nav";

const APP_BUTTON_THEME: Record<
  AppButtonVariant,
  {
    active: ViewStyle;
    inactive: ViewStyle;
    disabled: ViewStyle;
    textActive: TextStyle;
    textInactive: TextStyle;
    textDisabled: TextStyle;
  }
> = {
  primary: {
    active: { backgroundColor: "#1e3a79", borderColor: "#1e3a79" },
    inactive: { backgroundColor: "#1e3a79", borderColor: "#1e3a79" },
    disabled: { opacity: 0.5 },
    textActive: { color: "#f5f8ff", fontSize: 13, fontWeight: "700" },
    textInactive: { color: "#f5f8ff", fontSize: 13, fontWeight: "700" },
    textDisabled: { color: "#f5f8ff" },
  },
  secondary: {
    active: { backgroundColor: "#e0eaff", borderColor: "#1e3a79" },
    inactive: { backgroundColor: "#ffffff", borderColor: "#9cb0d8" },
    disabled: { opacity: 0.5 },
    textActive: { color: "#1b376d", fontSize: 13, fontWeight: "700" },
    textInactive: { color: "#29467f", fontSize: 13, fontWeight: "700" },
    textDisabled: { color: "#6b768f" },
  },
  small: {
    active: { backgroundColor: "#1e3a79", borderColor: "#1e3a79" },
    inactive: { backgroundColor: "#eef3ff", borderColor: "#eef3ff" },
    disabled: { opacity: 0.5 },
    textActive: { color: "#f5f8ff", fontSize: 12, fontWeight: "700", textAlign: "center" },
    textInactive: { color: "#23407e", fontSize: 12, fontWeight: "700", textAlign: "center" },
    textDisabled: { color: "#6b768f" },
  },
  danger: {
    active: { backgroundColor: "#b42318", borderColor: "#b42318" },
    inactive: { backgroundColor: "#ffe8e8", borderColor: "#f2bcbc" },
    disabled: { opacity: 0.5 },
    textActive: { color: "#ffffff", fontSize: 12, fontWeight: "700", textAlign: "center" },
    textInactive: { color: "#902222", fontSize: 12, fontWeight: "700", textAlign: "center" },
    textDisabled: { color: "#7f1d1d" },
  },
  nav: {
    active: { backgroundColor: "#213b74", borderColor: "#213b74" },
    inactive: { backgroundColor: "#e8ecf7", borderColor: "#e8ecf7" },
    disabled: { opacity: 0.5 },
    textActive: { color: "#ffffff", fontSize: 12, lineHeight: 14, fontWeight: "700", textAlign: "center" },
    textInactive: { color: "#23314f", fontSize: 12, lineHeight: 14, fontWeight: "600", textAlign: "center" },
    textDisabled: { color: "#6b768f" },
  },
};

function AppButton({
  label,
  onPress,
  variant = "secondary",
  active = false,
  disabled = false,
  style,
  textStyle,
  activeStyle,
  inactiveStyle,
  disabledStyle,
  activeTextStyle,
  inactiveTextStyle,
  disabledTextStyle,
  numberOfLines = 1,
}: {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  active?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  activeStyle?: StyleProp<ViewStyle>;
  inactiveStyle?: StyleProp<ViewStyle>;
  disabledStyle?: StyleProp<ViewStyle>;
  activeTextStyle?: StyleProp<TextStyle>;
  inactiveTextStyle?: StyleProp<TextStyle>;
  disabledTextStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const theme = APP_BUTTON_THEME[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.appButtonBase,
        styles[`appButton${variant[0].toUpperCase()}${variant.slice(1)}` as keyof typeof styles] as ViewStyle,
        style,
        active ? theme.active : theme.inactive,
        active ? activeStyle : inactiveStyle,
        disabled && theme.disabled,
        disabled && styles.buttonDisabled,
        disabled && disabledStyle,
      ]}
    >
      <Text
        allowFontScaling={false}
        numberOfLines={numberOfLines}
        style={[
          styles.appButtonTextBase,
          textStyle,
          active ? theme.textActive : theme.textInactive,
          active ? activeTextStyle : inactiveTextStyle,
          disabled && theme.textDisabled,
          disabled && disabledTextStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function NavButton({
  active,
  label,
  onPress,
  compact,
  responsiveWidth,
}: {
  active?: boolean;
  label: string;
  onPress: () => void;
  compact?: boolean;
  responsiveWidth?: boolean;
}) {
  return (
    <AppButton
      label={label}
      onPress={onPress}
      variant="nav"
      active={active}
      style={responsiveWidth ? (compact ? styles.navButtonCompact : styles.navButtonFill) : styles.navButtonWide}
    />
  );
}

function NavDropdown({
  label,
  active,
  isOpen,
  onToggle,
  items,
  onSelectItem,
  compact,
}: {
  label: string;
  active?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  items: Array<{ label: string; active?: boolean; onPress: () => void }>;
  onSelectItem: (onPress: () => void) => void;
  compact?: boolean;
}) {
	  return (
	    <View style={[styles.navDropdownWrap, compact && styles.navDropdownWrapCompact]}>
	      <AppButton
	        label={`${label} v`}
	        onPress={onToggle}
	        variant="nav"
	        active={active}
	        style={[styles.navDropdownTrigger, compact ? styles.navButtonCompact : undefined]}
	      />
	      {isOpen && (
	        <View style={styles.navDropdownMenu}>
	          {items.map((item) => (
	            <AppButton
	              key={item.label}
	              label={item.label}
	              onPress={() => onSelectItem(item.onPress)}
	              variant="nav"
	              active={item.active}
	              style={styles.navDropdownItem}
	              textStyle={styles.navDropdownItemText}
	            />
	          ))}
	        </View>
	      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  multiline,
  editable,
  onSubmitEditing,
  keepFocusOnSubmit,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "numeric";
  multiline?: boolean;
  editable?: boolean;
  onSubmitEditing?: () => void;
  keepFocusOnSubmit?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const isCurrencyField = label.includes("R$");
  const [isFocused, setIsFocused] = useState(false);
  const displayValue = isCurrencyField && !isFocused ? normalizeCurrencyValue(value) : value;
  const resolvedKeyboardType = isCurrencyField ? "numeric" : keyboardType ?? "default";
  const resolvedInputMode = isCurrencyField || resolvedKeyboardType === "numeric" ? "numeric" : "text";

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={displayValue}
        onChangeText={(nextValue) => {
          if (isCurrencyField) {
            onChangeText(sanitizeCurrencyTyping(nextValue));
            return;
          }
          onChangeText(nextValue);
        }}
        onFocus={() => {
          if (isCurrencyField) {
            const parsed = parseLocaleNumber(value);
            if (Number.isFinite(parsed)) {
              if (Number.isInteger(parsed)) {
                onChangeText(String(parsed));
              } else {
                onChangeText(
                  parsed.toLocaleString("pt-BR", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })
                );
              }
            }
          }
          setIsFocused(true);
        }}
        onBlur={() => {
          if (isCurrencyField) {
            onChangeText(formatCurrencyInput(value));
          }
          setIsFocused(false);
        }}
        style={[styles.input, multiline && styles.textArea, editable === false && styles.inputDisabled]}
        keyboardType={resolvedKeyboardType}
        inputMode={resolvedInputMode}
        multiline={multiline}
        editable={editable !== false}
        blurOnSubmit={keepFocusOnSubmit ? false : undefined}
        onSubmitEditing={() => {
          onSubmitEditing?.();
          if (keepFocusOnSubmit) {
            requestAnimationFrame(() => inputRef.current?.focus());
          }
        }}
        returnKeyType={onSubmitEditing ? "done" : undefined}
        ref={inputRef}
      />
    </View>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  options,
  emptyText,
  isOpen,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: Array<string | SelectOption>;
  emptyText?: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  const normalizedOptions = toSelectOptions(options);

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.selectTrigger} onPress={onToggle}>
        <Text style={value ? styles.selectValueText : styles.selectPlaceholderText}>
          {value || placeholder}
        </Text>
      </Pressable>
      {isOpen && (
        <View style={styles.selectMenu}>
          {normalizedOptions.length === 0 && <Text style={styles.text}>{emptyText ?? "Nenhum item cadastrado."}</Text>}
          {normalizedOptions.map((option) => (
            <Pressable
              key={option.value}
              style={styles.selectItem}
              onPress={() => {
                onSelect(option.value);
              }}
            >
              <Text style={styles.text}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function DashboardScreen({ goTo }: { goTo: (key: ScreenKey) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Home</Text>
      <Text style={styles.pageSubtitle}>Atalhos do menu principal</Text>
      <Section title="Orçamentos">
        <View style={styles.dashboardNavRow}>
          <NavButton label="Impressoras" onPress={() => goTo("printers")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Filamentos" onPress={() => goTo("filaments")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Orçamentos" onPress={() => goTo("quotes")} />
        </View>
      </Section>
      <Section title="Estoque">
        <View style={styles.dashboardNavRow}>
          <NavButton label="Cadastro de SKU" onPress={() => goTo("salesSkus")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Movimentação de estoque" onPress={() => goTo("salesStock")} />
        </View>
      </Section>
      <Section title="Consignado">
        <View style={styles.dashboardNavRow}>
          <NavButton label="Visão dos pontos" onPress={() => goTo("salesPointsOverview")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Consignação" onPress={() => goTo("salesConsignment")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Pontos" onPress={() => goTo("salesPoints")} />
        </View>
      </Section>
      <Section title="Custos">
        <View style={styles.dashboardNavRow}>
          <NavButton label="Custos" onPress={() => goTo("fixedCosts")} />
        </View>
      </Section>
      <Section title="Marketplaces">
        <View style={styles.dashboardNavRow}>
          <NavButton label="Configurações" onPress={() => goTo("marketplaces")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Dashboard pedidos" onPress={() => goTo("marketplaceOrdersDashboard")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Anúncios" onPress={() => goTo("marketplaceListings")} />
        </View>
      </Section>
      <Section title="Logs">
        <View style={styles.dashboardNavRow}>
          <NavButton label="Logs" onPress={() => goTo("logs")} />
        </View>
      </Section>
    </ScrollView>
  );
}

function PrintersScreen({
  printers,
  onCreate,
  onEdit,
  onDelete,
}: {
  printers: Printer[];
  onCreate: () => void;
  onEdit: (printerId: string) => void;
  onDelete: (printerId: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Impressoras</Text>
      {printers.map((printer) => {
        const cpm = printerCostPerMinute(printer, costSettings);
        return (
          <View key={printer.id} style={styles.card}>
            <Text style={styles.cardTitle}>{printer.name}</Text>
            <Text style={styles.text}>Modelo: {printer.model}</Text>
            <Text style={styles.text}>Custo/min uso: {money(Math.round(cpm))}</Text>
            <View style={styles.row}>
              <Pressable style={styles.smallButton} onPress={() => onEdit(printer.id)}>
                <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                  Editar
                </Text>
              </Pressable>
              <Pressable style={styles.dangerButton} onPress={() => onDelete(printer.id)}>
                <Text allowFontScaling={false} numberOfLines={1} style={styles.dangerButtonText}>
                  Excluir
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      <Pressable style={styles.primaryButtonFixed} onPress={onCreate}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
          Cadastrar nova impressora
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function PrinterFormScreen({
  initialData,
  onSave,
  onCancel,
}: {
  initialData?: Printer;
  onSave: (printer: Printer) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [model, setModel] = useState(initialData?.model ?? "");
  const [purchaseCost, setPurchaseCost] = useState(
    initialData ? String(initialData.purchaseCostCents / 100) : ""
  );
  const [powerWatts, setPowerWatts] = useState(initialData ? String(initialData.powerWatts) : "");

  useEffect(() => {
    setName(initialData?.name ?? "");
    setModel(initialData?.model ?? "");
    setPurchaseCost(initialData ? String(initialData.purchaseCostCents / 100) : "");
    setPowerWatts(initialData ? String(initialData.powerWatts) : "");
  }, [initialData]);

  const handleSave = () => {
    const parsedPower = parseLocaleNumber(powerWatts);
    const parsedPurchaseCostCents = Math.round(parseLocaleNumber(purchaseCost) * 100);

    if (
      !name.trim() ||
      !model.trim() ||
      !Number.isFinite(parsedPower) ||
      !Number.isFinite(parsedPurchaseCostCents) ||
      parsedPower <= 0 ||
      parsedPurchaseCostCents < 0
    ) {
      return;
    }

    onSave({
      id: initialData?.id ?? createId("printer"),
      name: name.trim(),
      model: model.trim(),
      powerWatts: parsedPower,
      purchaseCostCents: parsedPurchaseCostCents,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>
        {initialData ? "Editar Impressora" : "Cadastro de Impressora"}
      </Text>
      <Field label="Impressora" value={name} onChangeText={setName} />
      <Field label="Modelo" value={model} onChangeText={setModel} />
      <Field label="Custo da impressora (R$)" value={purchaseCost} onChangeText={setPurchaseCost} keyboardType="numeric" />
      <Field label="Consumo de energia (W)" value={powerWatts} onChangeText={setPowerWatts} keyboardType="numeric" />

      <View style={styles.row}>
        <Pressable style={styles.primaryButtonFixed} onPress={handleSave}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
            Salvar
          </Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
            Cancelar
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function FilamentsScreen({
  filaments,
  onCreate,
  onEdit,
  onDelete,
}: {
  filaments: Filament[];
  onCreate: () => void;
  onEdit: (filamentId: string) => void;
  onDelete: (filamentId: string) => void;
}) {
  const sortedFilaments = [...filaments].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Filamentos</Text>
      <Pressable style={styles.primaryButtonFixed} onPress={onCreate}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
          Cadastrar novo filamento
        </Text>
      </Pressable>
      {sortedFilaments.map((f) => {
        const perGram = f.purchaseCostCents / f.purchasedWeightGrams;
        const perKg = perGram * 1000;
        return (
          <View key={f.id} style={styles.card}>
            <Text style={styles.cardTitle}>{f.name}</Text>
            <Text style={styles.text}>Marca: {f.brand}</Text>
            <Text style={styles.text}>Tipo: {f.materialType}</Text>
            <Text style={styles.text}>Cor: {f.color}</Text>
            <Text style={styles.text}>Link: {f.purchaseLink}</Text>
            <Text style={styles.text}>Preco/kg: {money(Math.round(perKg))}</Text>
            <Text style={styles.text}>Preco/g: {money(Math.round(perGram))}</Text>
            <View style={styles.row}>
              <Pressable style={styles.smallButton} onPress={() => onEdit(f.id)}>
                <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                  Editar
                </Text>
              </Pressable>
              <Pressable style={styles.dangerButton} onPress={() => onDelete(f.id)}>
                <Text allowFontScaling={false} numberOfLines={1} style={styles.dangerButtonText}>
                  Excluir
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function FilamentFormScreen({
  initialData,
  onSave,
  onCancel,
}: {
  initialData?: Filament;
  onSave: (filament: Filament) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [brand, setBrand] = useState(initialData?.brand ?? "");
  const [weight, setWeight] = useState(initialData ? String(initialData.purchasedWeightGrams) : "");
  const [cost, setCost] = useState(initialData ? String(initialData.purchaseCostCents / 100) : "");
  const [color, setColor] = useState(initialData?.color ?? "");
  const [material, setMaterial] = useState(initialData?.materialType ?? "");
  const [link, setLink] = useState(initialData?.purchaseLink ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  useEffect(() => {
    setName(initialData?.name ?? "");
    setBrand(initialData?.brand ?? "");
    setWeight(initialData ? String(initialData.purchasedWeightGrams) : "");
    setCost(initialData ? String(initialData.purchaseCostCents / 100) : "");
    setColor(initialData?.color ?? "");
    setMaterial(initialData?.materialType ?? "");
    setLink(initialData?.purchaseLink ?? "");
    setNotes(initialData?.notes ?? "");
  }, [initialData]);

  const handleSave = () => {
    const parsedWeight = parseLocaleNumber(weight);
    const parsedCostCents = Math.round(parseLocaleNumber(cost) * 100);

    if (
      !name.trim() ||
      !brand.trim() ||
      !material.trim() ||
      !Number.isFinite(parsedWeight) ||
      !Number.isFinite(parsedCostCents) ||
      parsedWeight <= 0 ||
      parsedCostCents < 0
    ) {
      return;
    }

    onSave({
      id: initialData?.id ?? createId("filament"),
      name: name.trim(),
      brand: brand.trim(),
      color: color.trim(),
      materialType: material.trim(),
      purchaseLink: link.trim(),
      notes: notes.trim(),
      purchaseCostCents: parsedCostCents,
      purchasedWeightGrams: parsedWeight,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>
        {initialData ? "Editar Filamento" : "Cadastro de Filamento"}
      </Text>
      <Field label="Nome" value={name} onChangeText={setName} />
      <Field label="Marca" value={brand} onChangeText={setBrand} />
      <Field label="Quantidade comprada (g)" value={weight} onChangeText={setWeight} keyboardType="numeric" />
      <Field label="Valor pago (R$)" value={cost} onChangeText={setCost} keyboardType="numeric" />
      <Field label="Cor" value={color} onChangeText={setColor} />
      <Field label="Tipo de material" value={material} onChangeText={setMaterial} />
      <Field label="Link de compra" value={link} onChangeText={setLink} />
      <Field label="Notas" value={notes} onChangeText={setNotes} multiline />

      <View style={styles.row}>
        <Pressable style={styles.primaryButtonFixed} onPress={handleSave}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
            Salvar
          </Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
            Cancelar
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function FixedCostsScreen({
  laborHourCost,
  taxRate,
  energyCostKwh,
  paybackMonths,
  markupFinalSale,
  markupPresentialSale,
  markupWholesaleConsignment,
  markupWholesaleCash,
  onChangeLaborHourCost,
  onChangeTaxRate,
  onChangeEnergyCostKwh,
  onChangePaybackMonths,
  onChangeMarkupFinalSale,
  onChangeMarkupPresentialSale,
  onChangeMarkupWholesaleConsignment,
  onChangeMarkupWholesaleCash,
  onSave,
  savedItems,
}: {
  laborHourCost: string;
  taxRate: string;
  energyCostKwh: string;
  paybackMonths: string;
  markupFinalSale: string;
  markupPresentialSale: string;
  markupWholesaleConsignment: string;
  markupWholesaleCash: string;
  onChangeLaborHourCost: (value: string) => void;
  onChangeTaxRate: (value: string) => void;
  onChangeEnergyCostKwh: (value: string) => void;
  onChangePaybackMonths: (value: string) => void;
  onChangeMarkupFinalSale: (value: string) => void;
  onChangeMarkupPresentialSale: (value: string) => void;
  onChangeMarkupWholesaleConsignment: (value: string) => void;
  onChangeMarkupWholesaleCash: (value: string) => void;
  onSave: () => void;
  savedItems: string[];
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Custos</Text>

      <Field
        label="Hora/homem (R$)"
        value={laborHourCost}
        onChangeText={onChangeLaborHourCost}
        keyboardType="numeric"
      />
      <Field
        label="Custo de energia por kWh (centavos)"
        value={energyCostKwh}
        onChangeText={onChangeEnergyCostKwh}
        keyboardType="numeric"
      />
      <Field
        label="Aliquota de imposto (%)"
        value={taxRate}
        onChangeText={onChangeTaxRate}
        keyboardType="numeric"
      />
      <Field
        label="Payback das impressoras (meses)"
        value={paybackMonths}
        onChangeText={onChangePaybackMonths}
        keyboardType="numeric"
      />
      <Field
        label="Markup venda final (%)"
        value={markupFinalSale}
        onChangeText={onChangeMarkupFinalSale}
        keyboardType="numeric"
      />
      <Field
        label="Markup venda presencial (%)"
        value={markupPresentialSale}
        onChangeText={onChangeMarkupPresentialSale}
        keyboardType="numeric"
      />
      <Field
        label="Markup atacado consignado (%)"
        value={markupWholesaleConsignment}
        onChangeText={onChangeMarkupWholesaleConsignment}
        keyboardType="numeric"
      />
      <Field
        label="Markup atacado a vista (%)"
        value={markupWholesaleCash}
        onChangeText={onChangeMarkupWholesaleCash}
        keyboardType="numeric"
      />

      <Pressable style={styles.primaryButtonFixed} onPress={onSave}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
          Salvar
        </Text>
      </Pressable>

      {savedItems.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Custos salvos</Text>
          {savedItems.map((item) => (
            <Text style={styles.text} key={item}>
              - {item}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function QuotesScreen({
  quotes,
  filaments,
  printers,
  laborHourCostCents,
  energyCostKwhCents,
  paybackMonths,
  taxRatePercent,
  markupPercent,
  onCreate,
  onEdit,
  onView,
  onDelete,
  isPrivacyMode,
}: {
  quotes: Quote[];
  filaments: Filament[];
  printers: Printer[];
  laborHourCostCents: number;
  energyCostKwhCents: number;
  paybackMonths: number;
  taxRatePercent: number;
  markupPercent: number;
  onCreate: () => void;
  onEdit: (quoteId: string) => void;
  onView: (quoteId: string) => void;
  onDelete: (quoteId: string) => void;
  isPrivacyMode: boolean;
}) {
  const [expandedQuoteIds, setExpandedQuoteIds] = useState<Record<string, boolean>>({});
  const sortedQuotes = [...quotes].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Orçamentos</Text>
      <Pressable style={styles.primaryButtonFixed} onPress={onCreate}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
          Adicionar novo orçamento
        </Text>
      </Pressable>
      {sortedQuotes.map((q) => {
        const totals = computeQuoteDisplayTotals({
          quote: q,
          filaments,
          printers,
          laborHourCostCents,
          energyCostKwhCents,
          paybackMonths,
          taxRatePercent,
          markupPercent,
        });
        const noPaybackNoTax = computeQuoteCostWithoutPaybackAndTaxes({
          quote: q,
          filaments,
          printers,
          laborHourCostCents,
          energyCostKwhCents,
        });
        const contribution = computeContributionMargin({
          revenueCents: totals.finalUnitCents,
          variableCostCents: totals.subtotalUnitCents,
          taxCents: totals.taxUnitCents,
        });
        const contributionCents = contribution.contribution_margin_cents;
        const contributionBps = contribution.contribution_margin_bps;
        const isExpanded = Boolean(expandedQuoteIds[q.id]);
        const unitsProduced = Math.max(1, q.unitsProduced || 1);
        return (
          <Pressable
            key={q.id}
            style={styles.marketplaceCompactOrderCard}
            onPress={() => setExpandedQuoteIds((prev) => ({ ...prev, [q.id]: !isExpanded }))}
          >
            <View style={styles.marketplaceCompactOrderHeader}>
              <View style={styles.marketplaceCompactOrderBuyer}>
                <Text style={styles.cardTitle}>{maskSensitiveText(q.name, isPrivacyMode, PRIVACY_MASK)}</Text>
                <Text style={styles.text}>
                  {q.printTimeMin} min impressão | {q.postProcessingMin} min pós | {unitsProduced} un.
                </Text>
              </View>
              <View style={styles.marketplaceCompactOrderNumbers}>
                <Text style={styles.marketplaceOrderRevenue}>{money(totals.finalUnitCents)}</Text>
                <Text style={styles.marketplaceMetricPrevious}>Preço un.</Text>
              </View>
            </View>

            {isExpanded ? (
              <View style={styles.marketplaceOrderDetails}>
                <Text style={styles.text}>Custo produção (un): {money(totals.subtotalUnitCents)}</Text>
                <Text style={styles.text}>Custo produção (lote): {money(totals.subtotalBatchCents)}</Text>
                <Text style={styles.text}>Custo sem payback/imp. (un): {money(noPaybackNoTax.totalUnitCents)}</Text>
                <Text style={styles.text}>Custo sem payback/imp. (lote): {money(noPaybackNoTax.totalBatchCents)}</Text>
                <Text style={styles.text}>Preço venda (un): {money(totals.finalUnitCents)}</Text>
                <Text style={styles.text}>Preço venda (lote): {money(totals.finalBatchCents)}</Text>
                <Text style={styles.text}>
                  Margem contribuição (un): {money(contributionCents)} ({percentFromBps(contributionBps)}%)
                </Text>
                <View style={styles.row}>
                  <Pressable style={styles.smallButton} onPress={() => onEdit(q.id)}>
                    <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                      Editar
                    </Text>
                  </Pressable>
                  <Pressable style={styles.smallButton} onPress={() => onView(q.id)}>
                    <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                      Ver orçamento
                    </Text>
                  </Pressable>
                  <Pressable style={styles.dangerButton} onPress={() => onDelete(q.id)}>
                    <Text allowFontScaling={false} numberOfLines={1} style={styles.dangerButtonText}>
                      Excluir
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function QuoteViewScreen({
  quote,
  filaments,
  printers,
  laborHourCostCents,
  energyCostKwhCents,
  paybackMonths,
  taxRatePercent,
  markupPercent,
  onBack,
}: {
  quote?: Quote;
  filaments: Filament[];
  printers: Printer[];
  laborHourCostCents: number;
  energyCostKwhCents: number;
  paybackMonths: number;
  taxRatePercent: number;
  markupPercent: number;
  onBack: () => void;
}) {
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [openFormulaKeys, setOpenFormulaKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setIsDescriptionOpen(false);
    setOpenFormulaKeys({});
  }, [quote?.id]);

  if (!quote) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Orçamento não encontrado</Text>
        <Pressable style={styles.secondaryButton} onPress={onBack}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
            Voltar
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  const unitsProduced = Math.max(1, quote.unitsProduced || 1);
  const printer = printers.find((item) => item.id === quote.printerId) ?? printers[0];
  const energyPerHourCents = printer
    ? (printer.powerWatts / 1000) * energyCostKwhCents
    : 0;
  const totalPrintTimeMin = quote.printTimeMin;
  const totalPostProcessingMin = quote.postProcessingMin * unitsProduced;
  const energyTotalCents = Math.round(energyPerHourCents * (totalPrintTimeMin / 60));

  const paybackPerHourCents = printer
    ? printer.purchaseCostCents / (paybackMonths * 30 * 20)
    : 0;
  const paybackTotalCents = Math.round(paybackPerHourCents * (totalPrintTimeMin / 60));

  const laborTotalCents = Math.round((totalPostProcessingMin / 60) * laborHourCostCents);

  const filamentLines = quote.filamentUsages.map((line) => {
    const filament = filaments.find((item) => item.name === line.filamentName);
    const unitCostPerGramCents = filament
      ? filament.purchaseCostCents / filament.purchasedWeightGrams
      : 0;
    const lineTotalCents = Math.round(unitCostPerGramCents * line.usedWeightGrams);
    return {
      ...line,
      unitCostPerGramCents,
      lineTotalCents,
      batchTotalCents: lineTotalCents,
    };
  });

  const filamentUnitTotalCents = Math.round(
    filamentLines.reduce((sum, line) => sum + line.lineTotalCents, 0) / unitsProduced
  );
  const filamentBatchTotalCents = filamentLines.reduce((sum, line) => sum + line.batchTotalCents, 0);
  const extrasUnitTotalCents = quote.extraCosts.reduce((sum, item) => sum + item.itemCostCents, 0);
  const extrasBatchTotalCents = extrasUnitTotalCents * unitsProduced;
  const packagingBatchTotalCents = quote.packagingCostCents * unitsProduced;

  const totals = computeQuoteDisplayTotals({
    quote,
    filaments,
    printers,
    laborHourCostCents,
    energyCostKwhCents,
    paybackMonths,
    taxRatePercent,
    markupPercent,
  });
  const withMarkupBatchCents = Math.round(totals.subtotalBatchCents * (1 + markupPercent / 100));
  const contribution = computeContributionMargin({
    revenueCents: totals.finalUnitCents,
    variableCostCents: totals.subtotalUnitCents,
    taxCents: totals.taxUnitCents,
  });
  const contributionCents = contribution.contribution_margin_cents;
  const contributionBps = contribution.contribution_margin_bps;

  const mediaItems = [
    ...quote.media3mf.map((uri) => ({ mediaType: "3mf", uri })),
    ...quote.mediaPhotos.map((uri) => ({ mediaType: "photo", uri })),
    ...quote.mediaVideos.map((uri) => ({ mediaType: "video", uri })),
  ];

  const toggleFormula = (key: string) => {
    setOpenFormulaKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Orçamento Finalizado</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{quote.name}</Text>
        <Text style={styles.text}>Impressora: {printer ? `${printer.name} (${printer.model})` : "Nao definida"}</Text>
        <Text style={styles.text}>Unidades produzidas: {unitsProduced}</Text>
      </View>
      <View style={styles.card}>
        <Pressable style={styles.selectTrigger} onPress={() => setIsDescriptionOpen((prev) => !prev)}>
          <Text style={styles.selectValueText}>
            {isDescriptionOpen ? "Ocultar descrição" : "Ver descrição"}
          </Text>
        </Pressable>
        {isDescriptionOpen ? (
          <Text style={styles.text}>{quote.description?.trim() ? quote.description : "Sem descrição."}</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Mídias</Text>
        {mediaItems.length === 0 && <Text style={styles.text}>Sem mídias anexadas.</Text>}
        {mediaItems.map((item) => {
          const fileName = item.uri.split("/").pop() || item.uri;
          return (
            <View key={`${item.mediaType}-${item.uri}`} style={styles.row}>
              <Text style={styles.text}>
                {item.mediaType.toUpperCase()}: {fileName}
              </Text>
              <Pressable
                style={styles.smallButton}
                onPress={() => {
                  void downloadMediaOnWeb(item.uri);
                }}
              >
                <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                  Baixar
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Filamentos (lote)</Text>
        {filamentLines.length === 0 && <Text style={styles.text}>Sem filamentos informados.</Text>}
        {filamentLines.map((line) => (
          <Text key={line.id} style={styles.text}>
            - {line.filamentName}: {line.usedWeightGrams}g x {money(Math.round(line.unitCostPerGramCents))}/g ={" "}
            {money(line.lineTotalCents)} no lote | {money(Math.round(line.lineTotalCents / unitsProduced))} por unidade
          </Text>
        ))}
        <Text style={styles.text}>Total filamentos no lote: {money(filamentBatchTotalCents)}</Text>
        <Text style={styles.text}>Total filamentos por unidade: {money(filamentUnitTotalCents)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Custo de impressao (por hora)</Text>
        <Text style={styles.text}>Tempo total de impressão contabilizado: {totalPrintTimeMin} min</Text>
        <Text style={styles.text}>Energia por hora (kWh): {money(Math.round(energyPerHourCents))}</Text>
        <Text style={styles.text}>Energia total no lote: {money(energyTotalCents)}</Text>
        <Text style={styles.text}>Payback por hora: {money(Math.round(paybackPerHourCents))}</Text>
        <Text style={styles.text}>Payback total no lote: {money(paybackTotalCents)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Mao de obra</Text>
        <Text style={styles.text}>Hora/homem: {money(laborHourCostCents)}</Text>
        <Text style={styles.text}>Total mao de obra no lote: {money(laborTotalCents)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Insumos extras</Text>
        {quote.extraCosts.length === 0 && <Text style={styles.text}>Sem insumos extras.</Text>}
        {quote.extraCosts.map((item) => (
          <Text key={item.id} style={styles.text}>
            - {item.itemName}: {money(item.itemCostCents)} por unidade
          </Text>
        ))}
        <Text style={styles.text}>Total extras no lote: {money(extrasBatchTotalCents)}</Text>
        <Text style={styles.text}>Total extras por unidade: {money(extrasUnitTotalCents)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Resumo final</Text>
        <Text style={styles.text}>Extras por unidade: {money(extrasUnitTotalCents)}</Text>
        <Text style={styles.text}>Extras no lote: {money(extrasBatchTotalCents)}</Text>
        <View style={styles.row}>
          <Text style={styles.text}>Custo final de producao: {money(totals.subtotalUnitCents)} por unidade</Text>
          <Pressable style={styles.formulaButton} onPress={() => toggleFormula("subtotalUnit")}>
            <Text style={styles.formulaButtonText}>Fórmula</Text>
          </Pressable>
        </View>
        {openFormulaKeys.subtotalUnit ? (
          <Text style={styles.formulaText}>
            custo_producao_lote = filamentos_lote + extras_lote + embalagem_lote + energia_lote + payback_lote +
            mao_de_obra_lote{"\n"}
            custo_producao_lote = {money(filamentBatchTotalCents)} + {money(extrasBatchTotalCents)} +{" "}
            {money(packagingBatchTotalCents)} + {money(energyTotalCents)} + {money(paybackTotalCents)} +{" "}
            {money(laborTotalCents)} = {money(totals.subtotalBatchCents)}
            {"\n"}
            custo_producao_un = arred(custo_producao_lote / unidades) = arred({money(totals.subtotalBatchCents)} /{" "}
            {unitsProduced}) = {money(totals.subtotalUnitCents)}
          </Text>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.text}>Custo de imposto: {money(totals.taxUnitCents)} por unidade</Text>
          <Pressable style={styles.formulaButton} onPress={() => toggleFormula("taxUnit")}>
            <Text style={styles.formulaButtonText}>Fórmula</Text>
          </Pressable>
        </View>
        {openFormulaKeys.taxUnit ? (
          <Text style={styles.formulaText}>
            base_com_markup_lote = arred(custo_producao_lote x (1 + markup)){"\n"}
            base_com_markup_lote = arred({money(totals.subtotalBatchCents)} x (1 + {markupPercent}%)) ={" "}
            {money(withMarkupBatchCents)}
            {"\n"}
            imposto_lote = arred(base_com_markup_lote x imposto) = arred({money(withMarkupBatchCents)} x{" "}
            {taxRatePercent}%) = {money(totals.taxBatchCents)}
            {"\n"}
            imposto_un = arred(imposto_lote / unidades) = arred({money(totals.taxBatchCents)} / {unitsProduced}) ={" "}
            {money(totals.taxUnitCents)}
          </Text>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.text}>Valor final com markup: {money(totals.finalUnitCents)} por unidade</Text>
          <Pressable style={styles.formulaButton} onPress={() => toggleFormula("finalUnit")}>
            <Text style={styles.formulaButtonText}>Fórmula</Text>
          </Pressable>
        </View>
        {openFormulaKeys.finalUnit ? (
          <Text style={styles.formulaText}>
            base_com_markup_lote = arred(custo_producao_lote x (1 + markup)) = {money(withMarkupBatchCents)}
            {"\n"}
            preco_final_lote = base_com_markup_lote + imposto_lote = {money(withMarkupBatchCents)} +{" "}
            {money(totals.taxBatchCents)} = {money(totals.finalBatchCents)}
            {"\n"}
            preco_final_un = arred(preco_final_lote / unidades) = arred({money(totals.finalBatchCents)} /{" "}
            {unitsProduced}) = {money(totals.finalUnitCents)}
          </Text>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.text}>Total de producao no lote: {money(totals.subtotalBatchCents)}</Text>
          <Pressable style={styles.formulaButton} onPress={() => toggleFormula("subtotalBatch")}>
            <Text style={styles.formulaButtonText}>Fórmula</Text>
          </Pressable>
        </View>
        {openFormulaKeys.subtotalBatch ? (
          <Text style={styles.formulaText}>
            custo_producao_lote = filamentos_lote + extras_lote + embalagem_lote + energia_lote + payback_lote +
            mao_de_obra_lote{"\n"}
            filamentos_lote = {money(filamentBatchTotalCents)}{"\n"}
            extras_lote = extras_un x unidades = {money(extrasUnitTotalCents)} x {unitsProduced} ={" "}
            {money(extrasBatchTotalCents)}{"\n"}
            embalagem_lote = embalagem_un x unidades = {money(quote.packagingCostCents)} x {unitsProduced} ={" "}
            {money(packagingBatchTotalCents)}{"\n"}
            energia_lote = {money(energyTotalCents)}{"\n"}
            payback_lote = {money(paybackTotalCents)}{"\n"}
            mao_de_obra_lote = {money(laborTotalCents)}{"\n"}
            custo_producao_lote = {money(totals.subtotalBatchCents)}
          </Text>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.text}>Total de imposto no lote: {money(totals.taxBatchCents)}</Text>
          <Pressable style={styles.formulaButton} onPress={() => toggleFormula("taxBatch")}>
            <Text style={styles.formulaButtonText}>Fórmula</Text>
          </Pressable>
        </View>
        {openFormulaKeys.taxBatch ? (
          <Text style={styles.formulaText}>
            base_com_markup_lote = arred(custo_producao_lote x (1 + markup)){"\n"}
            base_com_markup_lote = arred({money(totals.subtotalBatchCents)} x (1 + {markupPercent}%)) ={" "}
            {money(withMarkupBatchCents)}
            {"\n"}
            imposto_lote = arred(base_com_markup_lote x imposto) = arred({money(withMarkupBatchCents)} x{" "}
            {taxRatePercent}%) = {money(totals.taxBatchCents)}
          </Text>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.text}>Total com markup no lote: {money(totals.finalBatchCents)}</Text>
          <Pressable style={styles.formulaButton} onPress={() => toggleFormula("finalBatch")}>
            <Text style={styles.formulaButtonText}>Fórmula</Text>
          </Pressable>
        </View>
        {openFormulaKeys.finalBatch ? (
          <Text style={styles.formulaText}>
            base_com_markup_lote = arred(custo_producao_lote x (1 + markup)) = {money(withMarkupBatchCents)}
            {"\n"}
            preco_final_lote = base_com_markup_lote + imposto_lote = {money(withMarkupBatchCents)} +{" "}
            {money(totals.taxBatchCents)} = {money(totals.finalBatchCents)}
          </Text>
        ) : null}
        <Text style={styles.text}>
          Margem contribuição (un): {money(contributionCents)} ({percentFromBps(contributionBps)}%)
        </Text>
      </View>

      <Pressable style={styles.secondaryButton} onPress={onBack}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
          Voltar para orçamentos
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function QuoteFormScreen({
  initialData,
  filaments,
  printers,
  laborHourCostCents,
  energyCostKwhCents,
  paybackMonths,
  taxRatePercent,
  markupPercent,
  onSave,
  onCancel,
}: {
  initialData?: Quote;
  filaments: Filament[];
  printers: Printer[];
  laborHourCostCents: number;
  energyCostKwhCents: number;
  paybackMonths: number;
  taxRatePercent: number;
  markupPercent: number;
  onSave: (quote: Quote) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [quoteDraftId, setQuoteDraftId] = useState(initialData?.id ?? createId("quote"));
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [selectedPrinterId, setSelectedPrinterId] = useState(initialData?.printerId ?? printers[0]?.id ?? "");
  const [isPrinterDropdownOpen, setIsPrinterDropdownOpen] = useState(false);
  const [unitsProduced, setUnitsProduced] = useState(String(initialData?.unitsProduced ?? 1));
  const [printTime, setPrintTime] = useState(initialData ? String(initialData.printTimeMin) : "");
  const [postTime, setPostTime] = useState(initialData ? String(initialData.postProcessingMin) : "");
  const [packagingCost, setPackagingCost] = useState(
    initialData ? String(initialData.packagingCostCents / 100) : ""
  );

  const [media3mfList, setMedia3mfList] = useState<string[]>(initialData?.media3mf ?? []);
  const [mediaPhotos, setMediaPhotos] = useState<string[]>(initialData?.mediaPhotos ?? []);
  const [mediaVideos, setMediaVideos] = useState<string[]>(initialData?.mediaVideos ?? []);

  const [filamentName, setFilamentName] = useState(filaments[0]?.name ?? "");
  const [isFilamentDropdownOpen, setIsFilamentDropdownOpen] = useState(false);
  const [filamentWeight, setFilamentWeight] = useState("");
  const [filamentList, setFilamentList] = useState<QuoteFilamentUsage[]>(initialData?.filamentUsages ?? []);
  const [editingFilamentLineId, setEditingFilamentLineId] = useState<string | null>(null);

  const [extraName, setExtraName] = useState("");
  const [extraCost, setExtraCost] = useState("");
  const [extraList, setExtraList] = useState<QuoteExtraCost[]>(initialData?.extraCosts ?? []);
  const [editingExtraId, setEditingExtraId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);

  useEffect(() => {
    setQuoteDraftId(initialData?.id ?? createId("quote"));
    setName(initialData?.name ?? "");
    setDescription(initialData?.description ?? "");
    setSelectedPrinterId(initialData?.printerId ?? printers[0]?.id ?? "");
    setIsPrinterDropdownOpen(false);
    setUnitsProduced(String(initialData?.unitsProduced ?? 1));
    setPrintTime(initialData ? String(initialData.printTimeMin) : "");
    setPostTime(initialData ? String(initialData.postProcessingMin) : "");
    setPackagingCost(initialData ? String(initialData.packagingCostCents / 100) : "");
    setMedia3mfList(initialData?.media3mf ?? []);
    setMediaPhotos(initialData?.mediaPhotos ?? []);
    setMediaVideos(initialData?.mediaVideos ?? []);
    setFilamentList(initialData?.filamentUsages ?? []);
    setExtraList(initialData?.extraCosts ?? []);
    setEditingFilamentLineId(null);
    setEditingExtraId(null);
    setFilamentName(filaments[0]?.name ?? "");
    setIsFilamentDropdownOpen(false);
    setFilamentWeight("");
    setExtraName("");
    setExtraCost("");
    setFormError(null);
    setIsPreviewVisible(true);
  }, [initialData, filaments, printers]);

  const addMediaFromPicker = async (type: "photo" | "video" | "3mf") => {
    if (Platform.OS !== "web") {
      return;
    }

    const accept =
      type === "3mf"
        ? ".3mf,model/3mf,application/octet-stream"
        : type === "photo"
          ? "image/*"
          : "video/*";

    const files = await pickFilesOnWeb(accept, true);
    if (!files.length) return;

    setFormError(null);
    try {
      for (const file of files) {
        const uploaded = await uploadMediaFile(file, type, "quotes", quoteDraftId);
        if (type === "3mf") {
          setMedia3mfList((prev) => [...prev, uploaded.local_uri]);
        } else if (type === "photo") {
          setMediaPhotos((prev) => [...prev, uploaded.local_uri]);
        } else {
          setMediaVideos((prev) => [...prev, uploaded.local_uri]);
        }
      }
    } catch (error: any) {
      setFormError(error?.message ?? "Falha ao enviar mídia.");
    }
  };

  const addFilament = () => {
    const parsedWeight = parseLocaleNumber(filamentWeight);
    if (!filamentName.trim() || !Number.isFinite(parsedWeight) || parsedWeight <= 0) return;
    if (editingFilamentLineId) {
      setFilamentList((prev) =>
        prev.map((line) =>
          line.id === editingFilamentLineId
            ? {
                ...line,
                filamentName: filamentName.trim(),
                usedWeightGrams: parsedWeight,
              }
            : line
        )
      );
      setEditingFilamentLineId(null);
    } else {
      setFilamentList((prev) => [
        ...prev,
        {
          id: createId("qf"),
          filamentName: filamentName.trim(),
          usedWeightGrams: parsedWeight,
        },
      ]);
    }
    setFilamentWeight("");
  };

  const removeFilamentLine = (id: string) => {
    setFilamentList((prev) => prev.filter((line) => line.id !== id));
    if (editingFilamentLineId === id) {
      setEditingFilamentLineId(null);
      setFilamentWeight("");
    }
  };

  const editFilamentLine = (line: QuoteFilamentUsage) => {
    setFilamentName(line.filamentName);
    setFilamentWeight(String(line.usedWeightGrams));
    setEditingFilamentLineId(line.id);
    setIsFilamentDropdownOpen(false);
  };

  const cancelFilamentEdit = () => {
    setEditingFilamentLineId(null);
    setFilamentName(filaments[0]?.name ?? "");
    setFilamentWeight("");
    setIsFilamentDropdownOpen(false);
  };

  const addExtra = () => {
    const parsedCost = Math.round(parseLocaleNumber(extraCost) * 100);
    if (!extraName.trim() || !Number.isFinite(parsedCost) || parsedCost < 0) return;
    if (editingExtraId) {
      setExtraList((prev) =>
        prev.map((item) =>
          item.id === editingExtraId
            ? {
                ...item,
                itemName: extraName.trim(),
                itemCostCents: parsedCost,
              }
            : item
        )
      );
      setEditingExtraId(null);
    } else {
      setExtraList((prev) => [
        ...prev,
        {
          id: createId("qe"),
          itemName: extraName.trim(),
          itemCostCents: parsedCost,
        },
      ]);
    }
    setExtraName("");
    setExtraCost("");
  };

  const removeExtraItem = (id: string) => {
    setExtraList((prev) => prev.filter((item) => item.id !== id));
    if (editingExtraId === id) {
      setEditingExtraId(null);
      setExtraName("");
      setExtraCost("");
    }
  };

  const editExtraItem = (item: QuoteExtraCost) => {
    setExtraName(item.itemName);
    setExtraCost(String(item.itemCostCents / 100));
    setEditingExtraId(item.id);
  };

  const cancelExtraEdit = () => {
    setEditingExtraId(null);
    setExtraName("");
    setExtraCost("");
  };

  const selectedPrinter = printers.find((item) => item.id === selectedPrinterId) ?? printers[0];
  const isWebSplitLayout = Platform.OS === "web";
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const canPinPreview = isWebSplitLayout && windowWidth >= 1180;
  const shouldPinPreview = canPinPreview && isPreviewVisible;
  const contentMaxWidth = 1400;
  const contentWidth = Math.min(windowWidth, contentMaxWidth);
  const contentRightGutter = Math.max(0, (windowWidth - contentWidth) / 2);
  const previewFixedWidth = Math.min(360, Math.max(280, windowWidth - 48));
  const previewFixedMaxHeight = Math.max(240, windowHeight - 120);
  const previewRightOffset = Math.max(12, contentRightGutter + 12);
  const previewSummaryCard = (extraStyle?: any) => (
    <View style={[styles.card, styles.quoteFormPreviewSticky, extraStyle]}>
      <View style={styles.summaryHeader}>
        <Text style={styles.cardTitle}>Resumo em tempo real</Text>
        <Pressable style={styles.summaryToggleButton} onPress={() => setIsPreviewVisible(false)}>
          <Text allowFontScaling={false} style={styles.summaryToggleButtonText}>
            X
          </Text>
        </Pressable>
      </View>
      <Text style={styles.pageSubtitle}>Atualiza conforme você altera os campos.</Text>
      <Text style={styles.text}>
        Impressora: {selectedPrinter ? `${selectedPrinter.name} (${selectedPrinter.model})` : "Nao definida"}
      </Text>
      <Text style={styles.text}>Unidades no lote: {previewQuote.unitsProduced}</Text>
      <Text style={styles.text}>Filamentos no lote: {money(filamentBatchTotalCents)}</Text>
      <Text style={styles.text}>Extras no lote: {money(extrasBatchTotalCents)}</Text>
      <Text style={styles.text}>Embalagem no lote: {money(packagingBatchTotalCents)}</Text>
      <Text style={styles.text}>Energia no lote: {money(energyTotalCents)}</Text>
      <Text style={styles.text}>Payback no lote: {money(paybackTotalCents)}</Text>
      <Text style={styles.text}>Mao de obra no lote: {money(laborTotalCents)}</Text>
      <Text style={styles.text}>Subtotal no lote: {money(previewTotals.subtotalBatchCents)}</Text>
      <Text style={styles.text}>Custo sem payback/imp. no lote: {money(previewNoPaybackNoTaxBatchCents)}</Text>
      <Text style={styles.text}>Imposto no lote: {money(previewTotals.taxBatchCents)}</Text>
      <Text style={styles.text}>Final no lote: {money(previewTotals.finalBatchCents)}</Text>
      <Text style={styles.text}>
        Margem contribuição no lote: {money(previewContributionBatchCents)} ({percentFromBps(previewContributionBatchBps)}%)
      </Text>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Por unidade</Text>
        <Text style={styles.text}>Subtotal: {money(previewTotals.subtotalUnitCents)}</Text>
        <Text style={styles.text}>Custo sem payback/imp.: {money(previewNoPaybackNoTaxUnitCents)}</Text>
        <Text style={styles.text}>Imposto: {money(previewTotals.taxUnitCents)}</Text>
        <Text style={styles.text}>Preço final: {money(previewTotals.finalUnitCents)}</Text>
        <Text style={styles.text}>
          Margem contribuição: {money(previewContributionUnitCents)} ({percentFromBps(previewContributionUnitBps)}%)
        </Text>
      </View>
    </View>
  );

  const parsedPrintTimePreview = parseLocaleNumber(printTime);
  const parsedPostTimePreview = parseLocaleNumber(postTime);
  const parsedPackagingValuePreview = packagingCost.trim() === "" ? 0 : parseLocaleNumber(packagingCost);
  const parsedUnitsProducedPreview = Math.max(1, Math.round(parseLocaleNumber(unitsProduced) || 1));

  const safePrintTime = Number.isFinite(parsedPrintTimePreview) && parsedPrintTimePreview >= 0 ? parsedPrintTimePreview : 0;
  const safePostTime = Number.isFinite(parsedPostTimePreview) && parsedPostTimePreview >= 0 ? parsedPostTimePreview : 0;
  const safePackaging =
    Number.isFinite(parsedPackagingValuePreview) && parsedPackagingValuePreview >= 0
      ? Math.round(parsedPackagingValuePreview * 100)
      : 0;

  const previewQuote: Quote = {
    id: quoteDraftId,
    printerId: selectedPrinterId,
    name: name.trim(),
    description: description.trim(),
    unitsProduced: parsedUnitsProducedPreview,
    printTimeMin: safePrintTime,
    postProcessingMin: safePostTime,
    packagingCostCents: safePackaging,
    productionCostCents: 0,
    taxCostCents: 0,
    salePriceCents: 0,
    media3mf: media3mfList,
    mediaPhotos,
    mediaVideos,
    filamentUsages: filamentList,
    extraCosts: extraList,
  };

  const previewTotals = computeQuoteDisplayTotals({
    quote: previewQuote,
    filaments,
    printers,
    laborHourCostCents,
    energyCostKwhCents,
    paybackMonths,
    taxRatePercent,
    markupPercent,
  });

  const totalPrintTimeMin = previewQuote.printTimeMin;
  const totalPostProcessingMin = previewQuote.postProcessingMin * previewQuote.unitsProduced;
  const energyPerHourCents = selectedPrinter ? (selectedPrinter.powerWatts / 1000) * energyCostKwhCents : 0;
  const paybackPerHourCents = selectedPrinter
    ? selectedPrinter.purchaseCostCents / (Math.max(1, paybackMonths) * 30 * 20)
    : 0;
  const energyTotalCents = Math.round(energyPerHourCents * (totalPrintTimeMin / 60));
  const paybackTotalCents = Math.round(paybackPerHourCents * (totalPrintTimeMin / 60));
  const laborTotalCents = Math.round((totalPostProcessingMin / 60) * laborHourCostCents);
  const filamentBatchTotalCents = filamentList.reduce((sum, line) => {
    const filament = filaments.find((item) => item.name === line.filamentName);
    const unitCostPerGramCents = filament ? filament.purchaseCostCents / filament.purchasedWeightGrams : 0;
    return sum + Math.round(line.usedWeightGrams * unitCostPerGramCents);
  }, 0);
  const extrasUnitTotalCents = extraList.reduce((sum, item) => sum + item.itemCostCents, 0);
  const extrasBatchTotalCents = extrasUnitTotalCents * previewQuote.unitsProduced;
  const packagingBatchTotalCents = previewQuote.packagingCostCents * previewQuote.unitsProduced;
  const previewNoPaybackNoTaxBatchCents =
    filamentBatchTotalCents +
    energyTotalCents +
    laborTotalCents +
    extrasBatchTotalCents +
    packagingBatchTotalCents;
  const previewNoPaybackNoTaxUnitCents = Math.round(
    previewNoPaybackNoTaxBatchCents / Math.max(1, previewQuote.unitsProduced)
  );
  const previewContributionUnit = computeContributionMargin({
    revenueCents: previewTotals.finalUnitCents,
    variableCostCents: previewTotals.subtotalUnitCents,
    taxCents: previewTotals.taxUnitCents,
  });
  const previewContributionBatch = computeContributionMargin({
    revenueCents: previewTotals.finalBatchCents,
    variableCostCents: previewTotals.subtotalBatchCents,
    taxCents: previewTotals.taxBatchCents,
  });
  const previewContributionUnitCents = previewContributionUnit.contribution_margin_cents;
  const previewContributionBatchCents = previewContributionBatch.contribution_margin_cents;
  const previewContributionUnitBps = previewContributionUnit.contribution_margin_bps;
  const previewContributionBatchBps = previewContributionBatch.contribution_margin_bps;

  const handleSave = () => {
    const parsedPrintTime = parseLocaleNumber(printTime);
    const parsedPostTime = parseLocaleNumber(postTime);
    const parsedPackagingValue = packagingCost.trim() === "" ? 0 : parseLocaleNumber(packagingCost);
    const parsedPackaging = Math.round(parsedPackagingValue * 100);
    const parsedUnitsProduced = Math.max(1, Math.round(parseLocaleNumber(unitsProduced) || 1));

    if (
      !name.trim() ||
      !Number.isFinite(parsedPrintTime) ||
      !Number.isFinite(parsedPostTime) ||
      !Number.isFinite(parsedPackaging) ||
      !selectedPrinterId ||
      parsedPrintTime < 0 ||
      parsedPostTime < 0 ||
      parsedPackaging < 0
    ) {
      setFormError(
        "Preencha nome, impressora, tempos válidos e custo de embalagem válido (use 0 se não houver)."
      );
      return;
    }
    setFormError(null);

    onSave({
      id: quoteDraftId,
      printerId: selectedPrinterId,
      name: name.trim(),
      description: description.trim(),
      unitsProduced: parsedUnitsProduced,
      printTimeMin: parsedPrintTime,
      postProcessingMin: parsedPostTime,
      packagingCostCents: parsedPackaging,
      productionCostCents: previewTotals.subtotalUnitCents,
      taxCostCents: previewTotals.taxUnitCents,
      salePriceCents: previewTotals.finalUnitCents,
      media3mf: media3mfList,
      mediaPhotos,
      mediaVideos,
      filamentUsages: filamentList,
      extraCosts: extraList,
    });
  };

  return (
    <View style={styles.quoteFormScreenRoot}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          isWebSplitLayout && styles.quoteFormContentWeb,
          shouldPinPreview ? { paddingRight: previewFixedWidth + 20 } : null,
        ]}
      >
        <Text style={styles.pageTitle}>{initialData ? "Editar Orçamento" : "Novo Orçamento"}</Text>
        <View style={[styles.quoteFormSplit, isWebSplitLayout && styles.quoteFormSplitWeb]}>
          <View style={[styles.quoteFormMainColumn, isWebSplitLayout && styles.quoteFormMainColumnWeb]}>
          <Field label="Nome do objeto" value={name} onChangeText={setName} />
          <Field label="Descrição" value={description} onChangeText={setDescription} multiline />
          <SelectField
            label="Impressora"
            value={printers.find((item) => item.id === selectedPrinterId)?.name ?? ""}
            placeholder="Selecione uma impressora"
            options={printers.map((item) => item.name)}
            emptyText="Nenhuma impressora cadastrada."
            isOpen={isPrinterDropdownOpen}
            onToggle={() => setIsPrinterDropdownOpen((prev) => !prev)}
            onSelect={(printerName) => {
              const selected = printers.find((item) => item.name === printerName);
              if (!selected) return;
              setSelectedPrinterId(selected.id);
              setIsPrinterDropdownOpen(false);
            }}
          />
          <Field
            label="Unidades produzidas"
            value={unitsProduced}
            onChangeText={setUnitsProduced}
            keyboardType="numeric"
          />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Mídias</Text>
            <Pressable style={styles.wideButton} onPress={() => void addMediaFromPicker("3mf")}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.wideButtonText}>
                Selecionar arquivo .3mf
              </Text>
            </Pressable>
            <Pressable style={styles.wideButton} onPress={() => void addMediaFromPicker("photo")}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.wideButtonText}>
                Selecionar imagens
              </Text>
            </Pressable>
            <Pressable style={styles.wideButton} onPress={() => void addMediaFromPicker("video")}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.wideButtonText}>
                Selecionar videos
              </Text>
            </Pressable>
            <Text style={styles.text}>Arquivos 3mf:</Text>
            {media3mfList.map((item) => (
              <Text key={item} style={styles.text}>
                - {item}
              </Text>
            ))}
            <Text style={styles.text}>Imagens:</Text>
            {mediaPhotos.map((item) => (
              <Text key={item} style={styles.text}>
                - {item}
              </Text>
            ))}
            <Text style={styles.text}>Videos:</Text>
            {mediaVideos.map((item) => (
              <Text key={item} style={styles.text}>
                - {item}
              </Text>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Filamentos</Text>
            <SelectField
              label="Filamento"
              value={filamentName}
              placeholder="Selecione um filamento"
              options={filaments.map((item) => item.name)}
              emptyText="Nenhum filamento cadastrado."
              isOpen={isFilamentDropdownOpen}
              onToggle={() => setIsFilamentDropdownOpen((prev) => !prev)}
              onSelect={(value) => {
                setFilamentName(value);
                setIsFilamentDropdownOpen(false);
              }}
            />
            <Field
              label="Quantidade usada (g) (por lote)"
              value={filamentWeight}
              onChangeText={setFilamentWeight}
              keyboardType="numeric"
            />
            <Pressable style={styles.primaryButtonFixed} onPress={addFilament}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
                {editingFilamentLineId ? "Salvar filamento" : "Adicionar filamento"}
              </Text>
            </Pressable>
            {editingFilamentLineId && (
              <Pressable style={styles.secondaryButton} onPress={cancelFilamentEdit}>
                <Text allowFontScaling={false} style={styles.secondaryButtonText}>
                  Cancelar edicao
                </Text>
              </Pressable>
            )}
            {filamentList.map((line) => (
              <View key={line.id} style={styles.card}>
                <Text style={styles.text}>
                  {line.filamentName}: {line.usedWeightGrams}g
                </Text>
                <View style={styles.row}>
                  <Pressable style={styles.smallButton} onPress={() => editFilamentLine(line)}>
                    <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                      Editar
                    </Text>
                  </Pressable>
                  <Pressable style={styles.dangerButton} onPress={() => removeFilamentLine(line.id)}>
                    <Text allowFontScaling={false} numberOfLines={1} style={styles.dangerButtonText}>
                      Remover
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tempos</Text>
            <Field
              label="Tempo de impressao (min) (por lote)"
              value={printTime}
              onChangeText={setPrintTime}
              keyboardType="numeric"
            />
            <Field
              label="Tempo de pós-produção (min) (por unidade)"
              value={postTime}
              onChangeText={setPostTime}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Itens extras</Text>
            <Field label="Nome do item" value={extraName} onChangeText={setExtraName} />
            <Field
              label="Custo (R$) (por unidade)"
              value={extraCost}
              onChangeText={setExtraCost}
              keyboardType="numeric"
            />
            <Pressable style={styles.primaryButtonFixed} onPress={addExtra}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
                {editingExtraId ? "Salvar item extra" : "Adicionar item extra"}
              </Text>
            </Pressable>
            {editingExtraId && (
              <Pressable style={styles.secondaryButton} onPress={cancelExtraEdit}>
                <Text allowFontScaling={false} style={styles.secondaryButtonText}>
                  Cancelar edicao
                </Text>
              </Pressable>
            )}
            {extraList.map((item) => (
              <View key={item.id} style={styles.card}>
                <Text style={styles.text}>
                  {item.itemName}: {money(item.itemCostCents)}
                </Text>
                <View style={styles.row}>
                  <Pressable style={styles.smallButton} onPress={() => editExtraItem(item)}>
                    <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                      Editar
                    </Text>
                  </Pressable>
                  <Pressable style={styles.dangerButton} onPress={() => removeExtraItem(item.id)}>
                    <Text allowFontScaling={false} numberOfLines={1} style={styles.dangerButtonText}>
                      Remover
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

          <Field
            label="Custo de embalagem (R$) (por unidade)"
            value={packagingCost}
            onChangeText={setPackagingCost}
            keyboardType="numeric"
          />
          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

          <View style={styles.row}>
            <Pressable style={styles.primaryButtonFixed} onPress={handleSave}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
                Salvar
              </Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={onCancel}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
                Cancelar
              </Text>
            </Pressable>
          </View>
        </View>

          {isPreviewVisible && !canPinPreview && (
            <View style={[styles.quoteFormPreviewColumn, isWebSplitLayout && styles.quoteFormPreviewColumnWeb]}>
              {previewSummaryCard()}
            </View>
          )}
          {!isPreviewVisible && !canPinPreview && (
            <View style={[styles.quoteFormPreviewColumn, isWebSplitLayout && styles.quoteFormPreviewColumnWeb]}>
              <Pressable style={styles.summaryRevealButton} onPress={() => setIsPreviewVisible(true)}>
                <Text allowFontScaling={false} style={styles.summaryRevealButtonText}>
                  {"<-"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      {isPreviewVisible && shouldPinPreview && (
        <View pointerEvents="box-none" style={styles.quoteFormFloatingHost}>
          <View
            style={[
              styles.quoteFormPreviewFloating,
              { width: previewFixedWidth, maxHeight: previewFixedMaxHeight, right: previewRightOffset },
            ]}
          >
            {previewSummaryCard({ maxHeight: previewFixedMaxHeight, overflow: "auto" })}
          </View>
        </View>
      )}
      {!isPreviewVisible && canPinPreview && (
        <View pointerEvents="box-none" style={styles.quoteFormFloatingHost}>
          <View style={[styles.quoteFormRevealFloating, { right: previewRightOffset }]}>
            <Pressable style={styles.summaryRevealButton} onPress={() => setIsPreviewVisible(true)}>
              <Text allowFontScaling={false} style={styles.summaryRevealButtonText}>
                {"<-"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function SalesSkusScreen({
  skus,
  stock,
  onCreate,
  onEdit,
  onDelete,
  isPrivacyMode,
}: {
  skus: SalesSku[];
  stock: SalesStockOverview[];
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  isPrivacyMode: boolean;
}) {
  const [expandedSkuIds, setExpandedSkuIds] = useState<Record<string, boolean>>({});
  const stockBySku = useMemo(() => {
    const map = new Map<string, SalesStockOverview>();
    for (const item of stock) {
      map.set(item.skuId, item);
    }
    return map;
  }, [stock]);
  const sortedSkus = useMemo(
    () =>
      [...skus].sort((a, b) =>
        (a.name || a.skuCode).localeCompare(b.name || b.skuCode, "pt-BR", { sensitivity: "base" })
      ),
    [skus]
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>SKUs</Text>
      <Text style={styles.pageSubtitle}>Cadastro de produtos para vendas em consignação</Text>
      <Pressable style={styles.primaryButtonFixed} onPress={onCreate}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
          Novo SKU
        </Text>
      </Pressable>
      {sortedSkus.map((sku) => {
        const isExpanded = Boolean(expandedSkuIds[sku.id]);
        const stockRow = stockBySku.get(sku.id);
        const estimatedTaxCents = sku.estimatedTaxCents ?? 0;
        const contribution = computeContributionMargin({
          revenueCents: sku.defaultSalePriceCents,
          variableCostCents: sku.productionCostCents,
          taxCents: estimatedTaxCents,
        });
        const contributionCents = contribution.contribution_margin_cents;
        const contributionBps = contribution.contribution_margin_bps;
        const priceWarnings = [
          sku.defaultSalePriceCents < sku.suggestedFinalPriceCents,
          sku.presentialSalePriceCents < sku.suggestedPresentialPriceCents,
          sku.wholesaleConsignmentPriceCents < sku.suggestedWholesaleConsignmentPriceCents,
          sku.wholesaleCashPriceCents < sku.suggestedWholesaleCashPriceCents,
        ];
        const hasPriceWarning = priceWarnings.some(Boolean);

        return (
          <Pressable
            key={sku.id}
            style={[styles.marketplaceCompactOrderCard, hasPriceWarning && styles.skuPriceWarningCard]}
            onPress={() => setExpandedSkuIds((prev) => ({ ...prev, [sku.id]: !isExpanded }))}
          >
            <View style={styles.marketplaceCompactOrderHeader}>
              <View style={styles.marketplaceCompactOrderBuyer}>
                <Text style={styles.cardTitle}>{maskNameOrCode(sku.name, sku.skuCode, isPrivacyMode)}</Text>
                <Text style={styles.text}>Estoque disponível: {stockRow?.availableQuantity ?? 0}</Text>
                {hasPriceWarning ? (
                  <Text style={styles.skuPriceWarningText}>Preço abaixo da sugestão</Text>
                ) : null}
              </View>
              <View style={styles.marketplaceCompactOrderNumbers}>
                <Text style={styles.marketplaceOrderRevenue}>{money(sku.defaultSalePriceCents)}</Text>
                <Text style={styles.marketplaceMetricPrevious}>Preço final</Text>
              </View>
            </View>

            {isExpanded ? (
              <View style={styles.marketplaceOrderDetails}>
                {sku.parentSkuName ? (
                  <Text style={styles.text}>
                    Derivado de: {maskSensitiveText(sku.parentSkuName, isPrivacyMode, PRIVACY_MASK)}
                  </Text>
                ) : null}
                {sku.sourceQuoteName ? (
                  <Text style={styles.text}>
                    Orçamento base: {maskSensitiveText(sku.sourceQuoteName, isPrivacyMode, PRIVACY_MASK)}
                  </Text>
                ) : null}
                <Text style={styles.text}>Sync preço com orçamento: {sku.syncWithQuotePricing ? "Ativo" : "Inativo"}</Text>
                {sku.barcodes.length > 0 ? (
                  <Text style={styles.text}>
                    Códigos de barras:{" "}
                    {sku.barcodes.map((barcode) => maskSensitiveText(barcode, isPrivacyMode, PRIVACY_MASK)).join(", ")}
                  </Text>
                ) : null}
                <Text style={styles.text}>Preço final: {money(sku.defaultSalePriceCents)}</Text>
                <Text style={sku.defaultSalePriceCents < sku.suggestedFinalPriceCents ? styles.skuPriceWarningText : styles.text}>
                  Preço final sugerido: {money(sku.suggestedFinalPriceCents)}
                </Text>
                <Text style={styles.text}>Preço presencial: {money(sku.presentialSalePriceCents)}</Text>
                <Text style={sku.presentialSalePriceCents < sku.suggestedPresentialPriceCents ? styles.skuPriceWarningText : styles.text}>
                  Preço presencial sugerido: {money(sku.suggestedPresentialPriceCents)}
                </Text>
                <Text style={styles.text}>Preço atacado consignado: {money(sku.wholesaleConsignmentPriceCents)}</Text>
                <Text
                  style={
                    sku.wholesaleConsignmentPriceCents < sku.suggestedWholesaleConsignmentPriceCents
                      ? styles.skuPriceWarningText
                      : styles.text
                  }
                >
                  Preço atacado consignado sugerido: {money(sku.suggestedWholesaleConsignmentPriceCents)}
                </Text>
                <Text style={styles.text}>Preço atacado à vista: {money(sku.wholesaleCashPriceCents)}</Text>
                <Text
                  style={
                    sku.wholesaleCashPriceCents < sku.suggestedWholesaleCashPriceCents
                      ? styles.skuPriceWarningText
                      : styles.text
                  }
                >
                  Preço atacado à vista sugerido: {money(sku.suggestedWholesaleCashPriceCents)}
                </Text>
                <Text style={styles.text}>Custo produção: {money(sku.productionCostCents)}</Text>
                <Text style={styles.text}>Imposto estimado: {money(estimatedTaxCents)}</Text>
                <Text style={styles.text}>
                  Margem contribuição: {money(contributionCents)} ({percentFromBps(contributionBps)}%)
                </Text>
                <Text style={styles.text}>Consignado em pontos: {stockRow?.consignedAtPoints.length ?? 0}</Text>
                {sku.description ? <Text style={styles.text}>Descrição: {sku.description}</Text> : null}
                <View style={styles.row}>
                  <Pressable style={styles.smallButton} onPress={() => onEdit(sku.id)}>
                    <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                      Editar
                    </Text>
                  </Pressable>
                  <Pressable style={styles.dangerButton} onPress={() => onDelete(sku.id)}>
                    <Text allowFontScaling={false} numberOfLines={1} style={styles.dangerButtonText}>
                      Excluir
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SalesSkuFormScreen({
  initialData,
  quotes,
  allSkus,
  onEnsureQuoteDetail,
  wholesaleConsignmentMarkupPercent,
  wholesaleCashMarkupPercent,
  onSave,
  onCancel,
  isPrivacyMode,
}: {
  initialData?: SalesSku;
  quotes: Quote[];
  allSkus: SalesSku[];
  onEnsureQuoteDetail?: (quoteId: string) => Promise<Quote | undefined>;
  wholesaleConsignmentMarkupPercent: number;
  wholesaleCashMarkupPercent: number;
  onSave: (
    sku: SalesSku,
    options: {
      copyFromQuote: boolean;
      copyMediaFromQuote: boolean;
      suggestSalePriceFromQuote: boolean;
      suggestProductionCostFromQuote: boolean;
    }
  ) => void;
  onCancel: () => void;
  isPrivacyMode: boolean;
}) {
  const [skuDraftId, setSkuDraftId] = useState(initialData?.id ?? createId("sales-sku"));
  const [skuCode, setSkuCode] = useState(initialData?.skuCode ?? generateInternalSkuCode());
  const [barcodeDraft, setBarcodeDraft] = useState("");
  const [barcodes, setBarcodes] = useState<string[]>(initialData?.barcodes ?? []);
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [finalSalePrice, setFinalSalePrice] = useState(
    initialData ? String(initialData.defaultSalePriceCents / 100) : ""
  );
  const [presentialSalePrice, setPresentialSalePrice] = useState(
    initialData ? String(initialData.presentialSalePriceCents / 100) : ""
  );
  const [productionCost, setProductionCost] = useState(
    initialData ? String(initialData.productionCostCents / 100) : ""
  );
  const [wholesaleConsignmentPrice, setWholesaleConsignmentPrice] = useState(
    initialData ? String(initialData.wholesaleConsignmentPriceCents / 100) : ""
  );
  const [wholesaleCashPrice, setWholesaleCashPrice] = useState(
    initialData ? String(initialData.wholesaleCashPriceCents / 100) : ""
  );
  const [parentSkuId, setParentSkuId] = useState(initialData?.parentSkuId ?? "");
  const [isParentSkuOpen, setIsParentSkuOpen] = useState(false);
  const [linkedQuoteId, setLinkedQuoteId] = useState(initialData?.sourceQuoteId ?? "");
  const [isLinkedQuoteOpen, setIsLinkedQuoteOpen] = useState(false);
  const [copyQuoteId, setCopyQuoteId] = useState(initialData?.sourceQuoteId ?? "");
  const [isCopyQuoteOpen, setIsCopyQuoteOpen] = useState(false);
  const [copyFromQuote, setCopyFromQuote] = useState(Boolean(initialData?.sourceQuoteId));
  const [copyMediaFromQuote, setCopyMediaFromQuote] = useState(Boolean(initialData?.sourceQuoteId));
  const [syncWithQuotePricing, setSyncWithQuotePricing] = useState(initialData?.syncWithQuotePricing ?? false);
  const [syncFinalSalePriceWithSuggested, setSyncFinalSalePriceWithSuggested] = useState(
    initialData?.syncFinalSalePriceWithSuggested ?? true
  );
  const [syncPresentialSalePriceWithSuggested, setSyncPresentialSalePriceWithSuggested] = useState(
    initialData?.syncPresentialSalePriceWithSuggested ?? true
  );
  const [syncWholesaleConsignmentPriceWithSuggested, setSyncWholesaleConsignmentPriceWithSuggested] = useState(
    initialData?.syncWholesaleConsignmentPriceWithSuggested ?? true
  );
  const [syncWholesaleCashPriceWithSuggested, setSyncWholesaleCashPriceWithSuggested] = useState(
    initialData?.syncWholesaleCashPriceWithSuggested ?? true
  );
  const [media3mfList, setMedia3mfList] = useState<string[]>(initialData?.media3mf ?? []);
  const [mediaPhotos, setMediaPhotos] = useState<string[]>(initialData?.mediaPhotos ?? []);
  const [mediaVideos, setMediaVideos] = useState<string[]>(initialData?.mediaVideos ?? []);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setSkuDraftId(initialData?.id ?? createId("sales-sku"));
    setSkuCode(initialData?.skuCode ?? generateInternalSkuCode());
    setBarcodeDraft("");
    setBarcodes(initialData?.barcodes ?? []);
    setName(initialData?.name ?? "");
    setDescription(initialData?.description ?? "");
    setFinalSalePrice(initialData ? String(initialData.defaultSalePriceCents / 100) : "");
    setPresentialSalePrice(initialData ? String(initialData.presentialSalePriceCents / 100) : "");
    setProductionCost(initialData ? String(initialData.productionCostCents / 100) : "");
    setWholesaleConsignmentPrice(initialData ? String(initialData.wholesaleConsignmentPriceCents / 100) : "");
    setWholesaleCashPrice(initialData ? String(initialData.wholesaleCashPriceCents / 100) : "");
    setParentSkuId(initialData?.parentSkuId ?? "");
    setLinkedQuoteId(initialData?.sourceQuoteId ?? "");
    setCopyQuoteId(initialData?.sourceQuoteId ?? "");
    setCopyFromQuote(Boolean(initialData?.sourceQuoteId));
    setCopyMediaFromQuote(Boolean(initialData?.sourceQuoteId));
    setSyncWithQuotePricing(initialData?.syncWithQuotePricing ?? false);
    setSyncFinalSalePriceWithSuggested(initialData?.syncFinalSalePriceWithSuggested ?? true);
    setSyncPresentialSalePriceWithSuggested(initialData?.syncPresentialSalePriceWithSuggested ?? true);
    setSyncWholesaleConsignmentPriceWithSuggested(initialData?.syncWholesaleConsignmentPriceWithSuggested ?? true);
    setSyncWholesaleCashPriceWithSuggested(initialData?.syncWholesaleCashPriceWithSuggested ?? true);
    setMedia3mfList(initialData?.media3mf ?? []);
    setMediaPhotos(initialData?.mediaPhotos ?? []);
    setMediaVideos(initialData?.mediaVideos ?? []);
    setFormError(null);
  }, [initialData]);

  const skuOptions = allSkus.filter((item) => item.id !== initialData?.id);
  const selectedParentSkuName =
    parentSkuId
      ? maskSensitiveText(skuOptions.find((item) => item.id === parentSkuId)?.name ?? "", isPrivacyMode)
      : "";
  const quoteOptions = useMemo(() => {
    const occurrences = new Map<string, number>();
    return quotes.map((item) => {
      const seen = (occurrences.get(item.name) ?? 0) + 1;
      occurrences.set(item.name, seen);
      return {
        id: item.id,
        label: seen > 1 ? `${item.name} (${seen})` : item.name,
        maskedLabel: PRIVACY_MASK,
      };
    });
  }, [quotes]);
  const quoteOptionLabels = quoteOptions.map((item) => ({
    value: item.id,
    label: isPrivacyMode ? item.maskedLabel : item.label,
  }));
  const selectedLinkedQuoteName =
    linkedQuoteId
      ? (() => {
          const q = quoteOptions.find((item) => item.id === linkedQuoteId);
          return maskSensitiveText(q?.label ?? "", isPrivacyMode);
        })()
      : "";

  const selectedCopyQuoteName =
    copyQuoteId
      ? (() => {
          const q = quoteOptions.find((item) => item.id === copyQuoteId);
          return maskSensitiveText(q?.label ?? "", isPrivacyMode);
        })()
      : "";

  const applyQuoteSuggestion = async ({
    mode = "overwrite",
    copyName = false,
    copyDescription = false,
    copyPricing = false,
    copyMedia = false,
    quoteIdOverride,
  }: {
    mode?: "fill-empty" | "overwrite";
    copyName?: boolean;
    copyDescription?: boolean;
    copyPricing?: boolean;
    copyMedia?: boolean;
    quoteIdOverride?: string;
  }) => {
    const quoteId = quoteIdOverride ?? copyQuoteId;
    const quote = quotes.find((item) => item.id === quoteId);
    if (!quote) {
      setFormError("Selecione um orçamento base para copiar dados.");
      return;
    }

    let resolvedQuote = quote;
    const seemsSummaryOnly =
      !quote.description?.trim() &&
      (quote.media3mf?.length ?? 0) === 0 &&
      (quote.mediaPhotos?.length ?? 0) === 0 &&
      (quote.mediaVideos?.length ?? 0) === 0;

    if (seemsSummaryOnly && onEnsureQuoteDetail) {
      try {
        const fullQuote = await onEnsureQuoteDetail(quoteId);
        if (fullQuote) {
          resolvedQuote = fullQuote;
        }
      } catch {
        // Mantem o quote atual se falhar ao carregar detalhe.
      }
    }

    setFormError(null);

    if (copyName) {
      setName((prev) =>
        mode === "overwrite" ? resolvedQuote.name : prev.trim() ? prev : resolvedQuote.name
      );
    }
    if (copyDescription) {
      setDescription((prev) =>
        mode === "overwrite"
          ? resolvedQuote.description
          : prev.trim()
            ? prev
            : resolvedQuote.description
      );
    }
    if (copyPricing) {
      setFinalSalePrice((prev) =>
        mode === "overwrite"
          ? String((resolvedQuote.salePriceCents ?? 0) / 100)
          : prev.trim()
            ? prev
            : String((resolvedQuote.salePriceCents ?? 0) / 100)
      );
      setPresentialSalePrice((prev) =>
        mode === "overwrite"
          ? String((resolvedQuote.salePriceCents ?? 0) / 100)
          : prev.trim()
            ? prev
            : String((resolvedQuote.salePriceCents ?? 0) / 100)
      );
      setProductionCost((prev) =>
        mode === "overwrite"
          ? String((resolvedQuote.productionCostCents ?? 0) / 100)
          : prev.trim()
            ? prev
            : String((resolvedQuote.productionCostCents ?? 0) / 100)
      );

      const costBase = Number(resolvedQuote.productionCostCents ?? 0);
      const consignment = Math.round(costBase * (1 + wholesaleConsignmentMarkupPercent / 100));
      const cash = Math.round(costBase * (1 + wholesaleCashMarkupPercent / 100));
      setWholesaleConsignmentPrice((prev) =>
        mode === "overwrite" ? String(consignment / 100) : prev.trim() ? prev : String(consignment / 100)
      );
      setWholesaleCashPrice((prev) =>
        mode === "overwrite" ? String(cash / 100) : prev.trim() ? prev : String(cash / 100)
      );
    }

    if (copyMedia) {
      setMedia3mfList((prev) =>
        Array.from(new Set([...prev, ...(resolvedQuote.media3mf ?? [])]))
      );
      setMediaPhotos((prev) =>
        Array.from(new Set([...prev, ...(resolvedQuote.mediaPhotos ?? [])]))
      );
      setMediaVideos((prev) =>
        Array.from(new Set([...prev, ...(resolvedQuote.mediaVideos ?? [])]))
      );
    }
  };

  const addMediaFromPicker = async (type: "photo" | "video" | "3mf") => {
    if (Platform.OS !== "web") return;
    const accept =
      type === "3mf"
        ? ".3mf,model/3mf,application/octet-stream"
        : type === "photo"
          ? "image/*"
          : "video/*";
    const files = await pickFilesOnWeb(accept, true);
    if (!files.length) return;

    setFormError(null);
    try {
      for (const file of files) {
        const uploaded = await uploadMediaFile(file, type, "skus", skuDraftId);
        if (type === "3mf") {
          setMedia3mfList((prev) => [...prev, uploaded.local_uri]);
        } else if (type === "photo") {
          setMediaPhotos((prev) => [...prev, uploaded.local_uri]);
        } else {
          setMediaVideos((prev) => [...prev, uploaded.local_uri]);
        }
      }
    } catch (error: any) {
      setFormError(error?.message ?? "Falha ao enviar mídia de SKU.");
    }
  };

  const addBarcode = () => {
    const value = barcodeDraft.trim();
    if (!value) return;
    setBarcodes((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setBarcodeDraft("");
  };

  const handleSave = () => {
    const parsedDefaultPrice = Math.round(parseLocaleNumber(finalSalePrice) * 100);
    const parsedPresentialPrice = Math.round(parseLocaleNumber(presentialSalePrice) * 100);
    const parsedProductionCost = Math.round(parseLocaleNumber(productionCost) * 100);
    const parsedWholesaleConsignmentPrice = Math.round(parseLocaleNumber(wholesaleConsignmentPrice) * 100);
    const parsedWholesaleCashPrice = Math.round(parseLocaleNumber(wholesaleCashPrice) * 100);
    const suggestSalePriceFromQuote = !finalSalePrice.trim() && Boolean(linkedQuoteId);
    const suggestProductionCostFromQuote = !productionCost.trim() && Boolean(linkedQuoteId);

    if (
      (!name.trim() && !copyFromQuote) ||
      (!Number.isFinite(parsedDefaultPrice) && !suggestSalePriceFromQuote) ||
      (!Number.isFinite(parsedPresentialPrice) && !syncPresentialSalePriceWithSuggested) ||
      (!Number.isFinite(parsedProductionCost) && !suggestProductionCostFromQuote) ||
      (!Number.isFinite(parsedWholesaleConsignmentPrice) && !syncWholesaleConsignmentPriceWithSuggested) ||
      (!Number.isFinite(parsedWholesaleCashPrice) && !syncWholesaleCashPriceWithSuggested) ||
      (!suggestSalePriceFromQuote && parsedDefaultPrice < 0) ||
      (!syncPresentialSalePriceWithSuggested && parsedPresentialPrice < 0) ||
      (!suggestProductionCostFromQuote && parsedProductionCost < 0) ||
      (!syncWholesaleConsignmentPriceWithSuggested && parsedWholesaleConsignmentPrice < 0) ||
      (!syncWholesaleCashPriceWithSuggested && parsedWholesaleCashPrice < 0)
    ) {
      setFormError("Preencha nome (ou habilite cópia do orçamento).");
      return;
    }

    setFormError(null);

    onSave(
      {
        id: skuDraftId,
        skuCode: skuCode.trim() || generateInternalSkuCode(),
        name: name.trim(),
        description: description.trim(),
        defaultSalePriceCents: Number.isFinite(parsedDefaultPrice) ? parsedDefaultPrice : 0,
        presentialSalePriceCents: Number.isFinite(parsedPresentialPrice) ? parsedPresentialPrice : 0,
        wholesaleConsignmentPriceCents: Number.isFinite(parsedWholesaleConsignmentPrice)
          ? parsedWholesaleConsignmentPrice
          : 0,
        wholesaleCashPriceCents: Number.isFinite(parsedWholesaleCashPrice) ? parsedWholesaleCashPrice : 0,
        productionCostCents: Number.isFinite(parsedProductionCost) ? parsedProductionCost : 0,
        syncWithQuotePricing,
        syncFinalSalePriceWithSuggested,
        syncPresentialSalePriceWithSuggested,
        syncWholesaleConsignmentPriceWithSuggested,
        syncWholesaleCashPriceWithSuggested,
        suggestedFinalPriceCents: Number.isFinite(parsedDefaultPrice) ? parsedDefaultPrice : 0,
        suggestedPresentialPriceCents: Number.isFinite(parsedPresentialPrice) ? parsedPresentialPrice : 0,
        suggestedWholesaleConsignmentPriceCents: Number.isFinite(parsedWholesaleConsignmentPrice)
          ? parsedWholesaleConsignmentPrice
          : 0,
        suggestedWholesaleCashPriceCents: Number.isFinite(parsedWholesaleCashPrice) ? parsedWholesaleCashPrice : 0,
        parentSkuId: parentSkuId || undefined,
        sourceQuoteId: linkedQuoteId || undefined,
        barcodes,
        media3mf: media3mfList,
        mediaPhotos,
        mediaVideos,
      },
      { copyFromQuote, copyMediaFromQuote, suggestSalePriceFromQuote, suggestProductionCostFromQuote }
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>{initialData ? "Editar SKU" : "Cadastro de SKU"}</Text>
      <Field label="Codigo SKU" value={skuCode} onChangeText={setSkuCode} />
      <Pressable
        style={styles.secondaryButton}
        onPress={() => setSkuCode(generateInternalSkuCode())}
      >
        <Text style={styles.secondaryButtonText}>Gerar novo codigo</Text>
      </Pressable>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Códigos de barras</Text>
        <Field
          label="Código de barras"
          value={barcodeDraft}
          onChangeText={setBarcodeDraft}
          keyboardType="numeric"
        />
        <Pressable style={styles.secondaryButton} onPress={addBarcode}>
          <Text style={styles.secondaryButtonText}>Adicionar código</Text>
        </Pressable>
        {barcodes.length === 0 ? (
          <Text style={styles.text}>Nenhum código cadastrado.</Text>
        ) : (
          barcodes.map((barcode) => (
            <View key={barcode} style={styles.row}>
              <Text style={styles.text}>{maskSensitiveText(barcode, isPrivacyMode, PRIVACY_MASK)}</Text>
              <Pressable
                style={styles.dangerButton}
                onPress={() => setBarcodes((prev) => prev.filter((item) => item !== barcode))}
              >
                <Text allowFontScaling={false} numberOfLines={1} style={styles.dangerButtonText}>
                  Remover
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
      <Field label="Nome" value={name} onChangeText={setName} />
      <Field label="Descricao" value={description} onChangeText={setDescription} multiline />
      <SelectField
        label="SKU derivado de"
        value={selectedParentSkuName}
        placeholder="Nenhum (SKU raiz)"
        options={skuOptions.map((item) => ({
          value: item.id,
          label: maskSensitiveText(item.name, isPrivacyMode, PRIVACY_MASK),
        }))}
        isOpen={isParentSkuOpen}
        emptyText="Nenhum SKU pai disponível."
        onToggle={() => setIsParentSkuOpen((prev) => !prev)}
        onSelect={(value) => {
          const parent = skuOptions.find((item) => item.id === value);
          if (!parent) return;
          setParentSkuId(parent.id);
          setIsParentSkuOpen(false);
        }}
      />
      <View style={styles.card}>
        <Text style={styles.text}>
          Sincronização de preços: {syncWithQuotePricing ? "Ativa" : "Desativada"}
        </Text>
        <Pressable
          style={syncWithQuotePricing ? styles.smallButton : styles.secondaryButton}
          onPress={() => {
            const next = !syncWithQuotePricing;
            setSyncWithQuotePricing(next);
            if (next && linkedQuoteId) {
              void applyQuoteSuggestion({
                mode: "overwrite",
                copyName: false,
                copyDescription: false,
                copyPricing: true,
                copyMedia: false,
                quoteIdOverride: linkedQuoteId,
              });
            }
          }}
        >
          <Text style={syncWithQuotePricing ? styles.smallButtonText : styles.secondaryButtonText}>
            {syncWithQuotePricing ? "Desativar sincronização de preços" : "Ativar sincronização de preços"}
          </Text>
        </Pressable>
      </View>
      <SelectField
        label="Orçamento vinculado (preço)"
        value={selectedLinkedQuoteName}
        placeholder="Nenhum orçamento vinculado"
        options={quoteOptionLabels}
        isOpen={isLinkedQuoteOpen}
        emptyText="Sem orçamentos cadastrados."
        onToggle={() => setIsLinkedQuoteOpen((prev) => !prev)}
        onSelect={(value) => {
          const quote = quoteOptions.find((item) => item.id === value);
          if (!quote) return;
          setLinkedQuoteId(quote.id);
          setIsLinkedQuoteOpen(false);
          if (syncWithQuotePricing) {
            void applyQuoteSuggestion({
              mode: "overwrite",
              copyName: false,
              copyDescription: false,
              copyPricing: true,
              copyMedia: false,
              quoteIdOverride: quote.id,
            });
          }
        }}
      />
      <SelectField
        label="Orçamento para copiar dados/mídias"
        value={selectedCopyQuoteName}
        placeholder="Selecione o orçamento para cópia"
        options={quoteOptionLabels}
        isOpen={isCopyQuoteOpen}
        emptyText="Sem orçamentos cadastrados."
        onToggle={() => setIsCopyQuoteOpen((prev) => !prev)}
        onSelect={(value) => {
          const quote = quoteOptions.find((item) => item.id === value);
          if (!quote) return;
          setCopyQuoteId(quote.id);
          setIsCopyQuoteOpen(false);
        }}
      />
      <View style={styles.row}>
        <Pressable
          style={copyFromQuote ? styles.smallButton : styles.secondaryButton}
          onPress={() => {
            const next = !copyFromQuote;
            setCopyFromQuote(next);
            if (next) {
              void applyQuoteSuggestion({
                mode: "overwrite",
                copyName: true,
                copyDescription: true,
                copyPricing: true,
                copyMedia: false,
              });
            }
          }}
        >
          <Text style={copyFromQuote ? styles.smallButtonText : styles.secondaryButtonText}>
            Copiar nome/descrição do orçamento
          </Text>
        </Pressable>
        <Pressable
          style={copyMediaFromQuote ? styles.smallButton : styles.secondaryButton}
          onPress={() => {
            const next = !copyMediaFromQuote;
            setCopyMediaFromQuote(next);
            if (next) {
              void applyQuoteSuggestion({
                mode: "overwrite",
                copyName: false,
                copyDescription: true,
                copyPricing: false,
                copyMedia: true,
              });
            }
          }}
        >
          <Text style={copyMediaFromQuote ? styles.smallButtonText : styles.secondaryButtonText}>
            Copiar mídias + descrição
          </Text>
        </Pressable>
      </View>
      <Field
        label="Custo (R$)"
        value={productionCost}
        onChangeText={setProductionCost}
        keyboardType="numeric"
        editable={!syncWithQuotePricing}
      />
      <Field
        label="Preço venda final (R$)"
        value={finalSalePrice}
        onChangeText={setFinalSalePrice}
        keyboardType="numeric"
        editable={!syncFinalSalePriceWithSuggested}
      />
      <Pressable
        style={syncFinalSalePriceWithSuggested ? styles.smallButton : styles.secondaryButton}
        onPress={() => setSyncFinalSalePriceWithSuggested((prev) => !prev)}
      >
        <Text style={syncFinalSalePriceWithSuggested ? styles.smallButtonText : styles.secondaryButtonText}>
          {syncFinalSalePriceWithSuggested ? "Preço final igual ao sugerido" : "Preço final manual"}
        </Text>
      </Pressable>
      <Field
        label="Preço venda presencial (R$)"
        value={presentialSalePrice}
        onChangeText={setPresentialSalePrice}
        keyboardType="numeric"
        editable={!syncPresentialSalePriceWithSuggested}
      />
      <Pressable
        style={syncPresentialSalePriceWithSuggested ? styles.smallButton : styles.secondaryButton}
        onPress={() => setSyncPresentialSalePriceWithSuggested((prev) => !prev)}
      >
        <Text style={syncPresentialSalePriceWithSuggested ? styles.smallButtonText : styles.secondaryButtonText}>
          {syncPresentialSalePriceWithSuggested ? "Preço presencial igual ao sugerido" : "Preço presencial manual"}
        </Text>
      </Pressable>
      <Field
        label="Preço venda atacado consignado (R$)"
        value={wholesaleConsignmentPrice}
        onChangeText={setWholesaleConsignmentPrice}
        keyboardType="numeric"
        editable={!syncWholesaleConsignmentPriceWithSuggested}
      />
      <Pressable
        style={syncWholesaleConsignmentPriceWithSuggested ? styles.smallButton : styles.secondaryButton}
        onPress={() => setSyncWholesaleConsignmentPriceWithSuggested((prev) => !prev)}
      >
        <Text style={syncWholesaleConsignmentPriceWithSuggested ? styles.smallButtonText : styles.secondaryButtonText}>
          {syncWholesaleConsignmentPriceWithSuggested ? "Consignado igual ao sugerido" : "Consignado manual"}
        </Text>
      </Pressable>
      <Field
        label="Preço venda atacado a vista (R$)"
        value={wholesaleCashPrice}
        onChangeText={setWholesaleCashPrice}
        keyboardType="numeric"
        editable={!syncWholesaleCashPriceWithSuggested}
      />
      <Pressable
        style={syncWholesaleCashPriceWithSuggested ? styles.smallButton : styles.secondaryButton}
        onPress={() => setSyncWholesaleCashPriceWithSuggested((prev) => !prev)}
      >
        <Text style={syncWholesaleCashPriceWithSuggested ? styles.smallButtonText : styles.secondaryButtonText}>
          {syncWholesaleCashPriceWithSuggested ? "Atacado à vista igual ao sugerido" : "Atacado à vista manual"}
        </Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Mídias do SKU</Text>
        <Pressable style={styles.wideButton} onPress={() => void addMediaFromPicker("3mf")}>
          <Text style={styles.wideButtonText}>Selecionar arquivo .3mf</Text>
        </Pressable>
        <Pressable style={styles.wideButton} onPress={() => void addMediaFromPicker("photo")}>
          <Text style={styles.wideButtonText}>Selecionar imagens</Text>
        </Pressable>
        <Pressable style={styles.wideButton} onPress={() => void addMediaFromPicker("video")}>
          <Text style={styles.wideButtonText}>Selecionar videos</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => {
            setMedia3mfList([]);
            setMediaPhotos([]);
            setMediaVideos([]);
          }}
        >
          <Text style={styles.secondaryButtonText}>Limpar mídias</Text>
        </Pressable>

        <Text style={styles.text}>Arquivos 3mf:</Text>
        {media3mfList.map((item) => (
          <Text key={item} style={styles.text}>
            - {item}
          </Text>
        ))}
        <Text style={styles.text}>Imagens:</Text>
        {mediaPhotos.map((item) => (
          <Text key={item} style={styles.text}>
            - {item}
          </Text>
        ))}
        <Text style={styles.text}>Videos:</Text>
        {mediaVideos.map((item) => (
          <Text key={item} style={styles.text}>
            - {item}
          </Text>
        ))}
      </View>

      {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
      <View style={styles.row}>
        <Pressable style={styles.primaryButtonFixed} onPress={handleSave}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
            Salvar
          </Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
            Cancelar
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function SalesPointsScreen({
  points,
  onCreate,
  onEdit,
  onDelete,
}: {
  points: SalesPoint[];
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Pontos de Venda</Text>
      {points.map((point) => (
        <View key={point.id} style={styles.card}>
          <Text style={styles.cardTitle}>{point.name}</Text>
          <Text style={styles.text}>Contato: {point.contactName || "-"}</Text>
          <Text style={styles.text}>Telefone: {point.phone || "-"}</Text>
          <Text style={styles.text}>Periodicidade de contato: {point.contactPeriodDays} dia(s)</Text>
          <View style={styles.row}>
            <Pressable style={styles.smallButton} onPress={() => onEdit(point.id)}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                Editar
              </Text>
            </Pressable>
            <Pressable style={styles.dangerButton} onPress={() => onDelete(point.id)}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.dangerButtonText}>
                Excluir
              </Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Pressable style={styles.primaryButtonFixed} onPress={onCreate}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
          Novo ponto de venda
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function SalesPointFormScreen({
  initialData,
  onSave,
  onCancel,
}: {
  initialData?: SalesPoint;
  onSave: (point: SalesPoint) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [contactName, setContactName] = useState(initialData?.contactName ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [address, setAddress] = useState(initialData?.address ?? "");
  const [commissionPercent, setCommissionPercent] = useState(
    initialData ? String((initialData.commissionBps || 0) / 100) : "0"
  );
  const [contactPeriodDays, setContactPeriodDays] = useState(
    initialData ? String(initialData.contactPeriodDays || 30) : "30"
  );
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  useEffect(() => {
    setName(initialData?.name ?? "");
    setContactName(initialData?.contactName ?? "");
    setPhone(initialData?.phone ?? "");
    setEmail(initialData?.email ?? "");
    setAddress(initialData?.address ?? "");
    setCommissionPercent(initialData ? String((initialData.commissionBps || 0) / 100) : "0");
    setContactPeriodDays(initialData ? String(initialData.contactPeriodDays || 30) : "30");
    setNotes(initialData?.notes ?? "");
  }, [initialData]);

  const handleSave = () => {
    const commissionBps = Math.round((parseLocaleNumber(commissionPercent) || 0) * 100);
    const parsedContactPeriodDays = Math.max(1, Math.round(parseLocaleNumber(contactPeriodDays) || 30));
    if (!name.trim() || !Number.isFinite(commissionBps) || commissionBps < 0 || !Number.isFinite(parsedContactPeriodDays)) return;

    onSave({
      id: initialData?.id ?? createId("sales-point"),
      name: name.trim(),
      contactName: contactName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      commissionBps,
      contactPeriodDays: parsedContactPeriodDays,
      notes: notes.trim(),
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>{initialData ? "Editar ponto de venda" : "Cadastro de ponto de venda"}</Text>
      <Field label="Nome" value={name} onChangeText={setName} />
      <Field label="Contato" value={contactName} onChangeText={setContactName} />
      <Field label="Telefone" value={phone} onChangeText={setPhone} />
      <Field label="Email" value={email} onChangeText={setEmail} />
      <Field label="Endereço" value={address} onChangeText={setAddress} multiline />
      <Field
        label="Comissão (%)"
        value={commissionPercent}
        onChangeText={setCommissionPercent}
        keyboardType="numeric"
      />
      <Field
        label="Periodicidade de contato (dias)"
        value={contactPeriodDays}
        onChangeText={setContactPeriodDays}
        keyboardType="numeric"
      />
      <Field label="Notas" value={notes} onChangeText={setNotes} multiline />
      <View style={styles.row}>
        <Pressable style={styles.primaryButtonFixed} onPress={handleSave}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
            Salvar
          </Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
            Cancelar
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function SalesStockScreen({
  stock,
  skus,
  onCreateMovement,
  onFetchSkuMovements,
  isPrivacyMode,
}: {
  stock: SalesStockOverview[];
  skus: SalesSku[];
  onCreateMovement: (args: {
    skuId: string;
    movementType: "adjustment_in" | "adjustment_out";
    quantityDelta: number;
    occurredAt: string;
    notes: string;
  }) => Promise<void>;
  onFetchSkuMovements: (skuId: string) => Promise<StockMovementHistoryItem[]>;
  isPrivacyMode: boolean;
}) {
  const [skuId, setSkuId] = useState(skus[0]?.id ?? "");
  const [isSkuOpen, setIsSkuOpen] = useState(false);
  const [movementType, setMovementType] = useState<"adjustment_in" | "adjustment_out">("adjustment_in");
  const [isMovementOpen, setIsMovementOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => dateOnly(new Date().toISOString()));
  const [isDateModalVisible, setIsDateModalVisible] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkMovementType, setBulkMovementType] = useState<"adjustment_in" | "adjustment_out">("adjustment_in");
  const [bulkItems, setBulkItems] = useState<Array<{ skuId: string; quantity: string }>>([]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [isMovementHistoryVisible, setIsMovementHistoryVisible] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySkuLabel, setHistorySkuLabel] = useState("");
  const [movementHistory, setMovementHistory] = useState<StockMovementHistoryItem[]>([]);

  useEffect(() => {
    if (!skuId && skus[0]) {
      setSkuId(skus[0].id);
    }
  }, [skuId, skus]);

  const selectedSkuName = maskSensitiveText(skus.find((item) => item.id === skuId)?.name ?? "", isPrivacyMode);
  const movementLabelMap: Record<string, string> = {
    adjustment_in: "Ajuste entrada",
    adjustment_out: "Ajuste saída",
  };
  const findSkuForBulkSearch = (raw: string): SalesSku | undefined => {
    const query = raw.trim().toLowerCase();
    if (!query) return undefined;

    return (
      skus.find((item) => item.skuCode.toLowerCase() === query) ??
      skus.find((item) => item.barcodes.some((barcode) => barcode.toLowerCase() === query)) ??
      skus.find((item) => item.name.toLowerCase() === query) ??
      skus.find((item) => item.name.toLowerCase().includes(query) || item.skuCode.toLowerCase().includes(query))
    );
  };
  const addBulkItemFromSearch = () => {
    const sku = findSkuForBulkSearch(bulkSearch);
    if (!sku) {
      setFormError("Produto não encontrado pelo nome, SKU ou código de barras.");
      return;
    }

    setBulkItems((prev) => {
      const existing = prev.find((item) => item.skuId === sku.id);
      if (existing) {
        const nextQuantity = Math.max(1, Math.round(parseLocaleNumber(existing.quantity) || 0) + 1);
        return prev.map((item) => (item.skuId === sku.id ? { ...item, quantity: String(nextQuantity) } : item));
      }
      return [...prev, { skuId: sku.id, quantity: "1" }];
    });
    setBulkSearch("");
    setFormError(null);
  };
  const submitBulkMovements = async () => {
    if (bulkItems.length === 0 || isBulkSubmitting) return;

    const parsedItems = bulkItems.map((item) => ({
      ...item,
      quantityNumber: Math.round(parseLocaleNumber(item.quantity)),
    }));
    if (parsedItems.some((item) => !Number.isFinite(item.quantityNumber) || item.quantityNumber <= 0)) {
      setFormError("Informe quantidades válidas para todos os produtos da movimentação em massa.");
      return;
    }

    setIsBulkSubmitting(true);
    setFormError(null);
    try {
      for (const item of parsedItems) {
        const quantityDelta =
          bulkMovementType === "adjustment_out" ? -Math.abs(item.quantityNumber) : Math.abs(item.quantityNumber);
        await onCreateMovement({
          skuId: item.skuId,
          movementType: bulkMovementType,
          quantityDelta,
          occurredAt: occurredAt.trim(),
          notes: notes.trim(),
        });
      }
      setBulkItems([]);
      setBulkSearch("");
    } catch (error: any) {
      setFormError(error?.message ?? "Falha ao registrar movimentações em massa.");
    } finally {
      setIsBulkSubmitting(false);
    }
  };
  const historyTypeLabel: Record<string, string> = {
    adjustment_in: "Entrada",
    adjustment_out: "Saída",
    consignment_out: "Consignado (saída)",
    consignment_return: "Retorno consignado",
    marketplace_sale_out: "Venda marketplace",
    marketplace_sale_reversal: "Reversão marketplace",
    initial: "Inicial",
  };
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const monthLabel = `${calendarCursor.toLocaleString("pt-BR", { month: "long" })} ${calendarCursor.getFullYear()}`;
  const firstDay = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
  const firstWeekDay = firstDay.getDay();
  const daysInMonth = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 0).getDate();
  const calendarCells: Array<Date | null> = [];
  for (let i = 0; i < firstWeekDay; i += 1) calendarCells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    calendarCells.push(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), day));
  }
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Estoque Geral</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Novo movimento</Text>
        <SelectField
          label="SKU"
          value={selectedSkuName}
          placeholder="Selecione um SKU"
          options={skus.map((item) => ({
            value: item.id,
            label: PRIVACY_MASK,
          }))}
          emptyText="Cadastre SKUs primeiro."
          isOpen={isSkuOpen}
          onToggle={() => setIsSkuOpen((prev) => !prev)}
          onSelect={(value) => {
            const sku = skus.find((item) => item.id === value);
            if (!sku) return;
            setSkuId(sku.id);
            setIsSkuOpen(false);
          }}
        />
        <SelectField
          label="Tipo"
          value={movementLabelMap[movementType]}
          placeholder="Selecione o tipo"
          options={["Ajuste entrada", "Ajuste saída"]}
          isOpen={isMovementOpen}
          onToggle={() => setIsMovementOpen((prev) => !prev)}
          onSelect={(selected) => {
            if (selected === "Ajuste entrada") setMovementType("adjustment_in");
            if (selected === "Ajuste saída") setMovementType("adjustment_out");
            setIsMovementOpen(false);
          }}
        />
        <Field label="Quantidade" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Data do movimento</Text>
          <Pressable
            style={styles.selectTrigger}
            onPress={() => {
              const selected = dateOnly(occurredAt) === "-" ? dateOnly(new Date().toISOString()) : dateOnly(occurredAt);
              const [y, m, d] = selected.split("-").map(Number);
              setCalendarCursor(new Date(y, (m || 1) - 1, d || 1));
              setIsDateModalVisible(true);
            }}
          >
            <Text style={styles.selectValueText}>{dateOnly(occurredAt) === "-" ? "Selecionar data" : dateOnly(occurredAt)}</Text>
          </Pressable>
        </View>
        <Field label="Notas" value={notes} onChangeText={setNotes} multiline />
        <Pressable
          style={styles.primaryButtonFixed}
          onPress={() => {
            const parsedQuantity = Math.round(parseLocaleNumber(quantity));
            if (!skuId || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;

            const signedQuantity = movementType === "adjustment_out" ? -Math.abs(parsedQuantity) : parsedQuantity;
            void onCreateMovement({
              skuId,
              movementType,
              quantityDelta: signedQuantity,
              occurredAt: occurredAt.trim(),
              notes: notes.trim(),
            });
            setQuantity("");
            setOccurredAt(dateOnly(new Date().toISOString()));
            setNotes("");
          }}
        >
          <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
            Registrar movimento
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Movimentação em massa</Text>
        <Field
          label="Produto, SKU ou código de barras"
          value={bulkSearch}
          onChangeText={setBulkSearch}
          onSubmitEditing={addBulkItemFromSearch}
          keepFocusOnSubmit
        />
        <Pressable style={styles.secondaryButton} onPress={addBulkItemFromSearch}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
            Adicionar produto
          </Text>
        </Pressable>
        {bulkItems.length === 0 ? (
          <Text style={styles.text}>Nenhum produto na lista.</Text>
        ) : (
          bulkItems.map((item) => {
            const sku = skus.find((candidate) => candidate.id === item.skuId);
            const label = maskSensitiveComposite([sku?.skuCode, sku?.name], isPrivacyMode, PRIVACY_MASK);
            return (
              <View key={item.skuId} style={styles.bulkMovementRow}>
                <Text numberOfLines={1} ellipsizeMode="tail" style={styles.bulkMovementProductText}>
                  {label}
                </Text>
                <TextInput
                  value={item.quantity}
                  onChangeText={(value) =>
                    setBulkItems((prev) =>
                      prev.map((candidate) =>
                        candidate.skuId === item.skuId ? { ...candidate, quantity: value } : candidate
                      )
                    )
                  }
                  keyboardType="numeric"
                  inputMode="numeric"
                  style={styles.bulkMovementQuantityInput}
                />
                <Pressable
                  style={styles.bulkMovementRemoveButton}
                  onPress={() => setBulkItems((prev) => prev.filter((candidate) => candidate.skuId !== item.skuId))}
                >
                  <Text allowFontScaling={false} numberOfLines={1} style={styles.dangerButtonText}>
                    Remover
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}
        <View style={styles.row}>
          <Pressable
            style={bulkMovementType === "adjustment_in" ? styles.smallButton : styles.secondaryButton}
            onPress={() => setBulkMovementType("adjustment_in")}
          >
            <Text style={bulkMovementType === "adjustment_in" ? styles.smallButtonText : styles.secondaryButtonText}>
              Entrada
            </Text>
          </Pressable>
          <Pressable
            style={bulkMovementType === "adjustment_out" ? styles.smallButton : styles.secondaryButton}
            onPress={() => setBulkMovementType("adjustment_out")}
          >
            <Text style={bulkMovementType === "adjustment_out" ? styles.smallButtonText : styles.secondaryButtonText}>
              Saída
            </Text>
          </Pressable>
        </View>
        <Pressable style={styles.primaryButtonFixed} onPress={() => void submitBulkMovements()}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
            {isBulkSubmitting ? "Registrando..." : "Registrar movimentações em massa"}
          </Text>
        </Pressable>
        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
      </View>

      <Modal
        transparent
        visible={isDateModalVisible}
        animationType="fade"
        onRequestClose={() => setIsDateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Selecionar data do movimento</Text>
            <View style={styles.calendarHeaderRow}>
              <Pressable
                style={styles.smallButton}
                onPress={() =>
                  setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                }
              >
                <Text style={styles.smallButtonText}>{"<"}</Text>
              </Pressable>
              <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
              <Pressable
                style={styles.smallButton}
                onPress={() =>
                  setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                }
              >
                <Text style={styles.smallButtonText}>{">"}</Text>
              </Pressable>
            </View>
            <View style={styles.calendarGrid}>
              {weekDays.map((dayName) => (
                <Text key={dayName} style={styles.calendarWeekDay}>
                  {dayName}
                </Text>
              ))}
              {calendarCells.map((cell, index) => {
                if (!cell) {
                  return <View key={`stock-empty-${index}`} style={styles.calendarDayEmpty} />;
                }
                const dayKey = `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, "0")}-${String(
                  cell.getDate()
                ).padStart(2, "0")}`;
                const isSelected = dayKey === dateOnly(occurredAt);
                return (
                  <Pressable
                    key={`stock-${dayKey}`}
                    style={[styles.calendarDayButton, isSelected && styles.calendarDayButtonSelected]}
                    onPress={() => setOccurredAt(dayKey)}
                  >
                    <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected]}>
                      {cell.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.modalMessage}>Data selecionada: {dateOnly(occurredAt) === "-" ? "-" : dateOnly(occurredAt)}</Text>
            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => setIsDateModalVisible(false)}>
                <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
                  Fechar
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Saldo por SKU</Text>
        {stock.length === 0 && <Text style={styles.text}>Sem SKUs cadastrados.</Text>}
        {stock.map((item) => (
          <View key={item.skuId} style={styles.card}>
            <Text style={styles.text}>
              {maskSensitiveComposite([item.skuCode, item.name], isPrivacyMode, PRIVACY_MASK)}
            </Text>
            <Text style={styles.text}>Saldo disponível: {item.availableQuantity}</Text>
            <Text style={styles.text}>Preco padrão: {money(item.defaultSalePriceCents)}</Text>
            <Text style={styles.text}>Consignado por ponto:</Text>
            {item.consignedAtPoints.length === 0 && (
              <Text style={styles.text}>- Nenhum estoque em consignação.</Text>
            )}
            {item.consignedAtPoints.map((consigned) => (
              <Text key={`${item.skuId}-${consigned.salesPointId}`} style={styles.text}>
                - {consigned.salesPointName}: {consigned.quantityRemaining}
              </Text>
            ))}
            <Pressable
              style={styles.smallButton}
              onPress={() => {
                void (async () => {
                  setHistoryError(null);
                  setHistoryLoading(true);
                  setHistorySkuLabel(maskSensitiveComposite([item.skuCode, item.name], isPrivacyMode, PRIVACY_MASK));
                  setIsMovementHistoryVisible(true);
                  try {
                    const rows = await onFetchSkuMovements(item.skuId);
                    setMovementHistory(rows);
                  } catch (error: any) {
                    setHistoryError(error?.message ?? "Falha ao carregar movimentações");
                    setMovementHistory([]);
                  } finally {
                    setHistoryLoading(false);
                  }
                })();
              }}
            >
              <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                Ver movimentações
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Modal
        transparent
        visible={isMovementHistoryVisible}
        animationType="fade"
        onRequestClose={() => setIsMovementHistoryVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Movimentações do SKU</Text>
            <Text style={styles.modalMessage}>{historySkuLabel}</Text>
            {historyLoading && <Text style={styles.text}>Carregando...</Text>}
            {historyError ? <Text style={styles.errorText}>{historyError}</Text> : null}
            {!historyLoading && !historyError && movementHistory.length === 0 && (
              <Text style={styles.text}>Sem movimentações.</Text>
            )}
            {!historyLoading && !historyError && movementHistory.length > 0 && (
              <ScrollView style={{ maxHeight: 360 }}>
                {movementHistory.map((row) => (
                  <View key={row.id} style={styles.card}>
                    <Text style={styles.text}>
                      {historyTypeLabel[row.movementType] ?? row.movementType} | qtd: {row.quantityDelta}
                    </Text>
                    <Text style={styles.text}>Data: {dateOnly(row.occurredAt)}</Text>
                    {row.salesPointName ? <Text style={styles.text}>Ponto: {row.salesPointName}</Text> : null}
                    {row.notes ? <Text style={styles.text}>Notas: {row.notes}</Text> : null}
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => setIsMovementHistoryVisible(false)}>
                <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
                  Fechar
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ConsignmentDashboardPanel({
  dashboard,
  points,
  onFetchDashboard,
  isPrivacyMode,
}: {
  dashboard: ConsignmentDashboard | null;
  points: SalesPoint[];
  onFetchDashboard: (filters: { dateFrom: string; dateTo: string; salesPointId: string }) => Promise<void>;
  isPrivacyMode: boolean;
}) {
  const [dashboardDateFrom, setDashboardDateFrom] = useState("");
  const [dashboardDateTo, setDashboardDateTo] = useState("");
  const [dashboardPointId, setDashboardPointId] = useState("");
  const [isDashboardPointOpen, setIsDashboardPointOpen] = useState(false);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setIsDashboardLoading(true);
        setDashboardError(null);
        await onFetchDashboard({ dateFrom: dashboardDateFrom, dateTo: dashboardDateTo, salesPointId: dashboardPointId });
      } catch (error: any) {
        setDashboardError(error?.message ?? "Falha ao carregar dashboard de consignação.");
      } finally {
        setIsDashboardLoading(false);
      }
    })();
  }, []);

  const selectedDashboardPointName =
    dashboardPointId
      ? maskSensitiveText(points.find((item) => item.id === dashboardPointId)?.name ?? "", isPrivacyMode)
      : "";
  const movementLabelMap: Record<ConsignmentDashboardMovement["movementType"], string> = {
    sent: "Envio",
    sold: "Venda",
    returned: "Devolução",
  };
  const refreshDashboard = async () => {
    setIsDashboardLoading(true);
    setDashboardError(null);
    try {
      await onFetchDashboard({ dateFrom: dashboardDateFrom, dateTo: dashboardDateTo, salesPointId: dashboardPointId });
    } catch (error: any) {
      setDashboardError(error?.message ?? "Falha ao carregar dashboard de consignação.");
    } finally {
      setIsDashboardLoading(false);
    }
  };
  const clearDashboardFilters = async () => {
    setDashboardDateFrom("");
    setDashboardDateTo("");
    setDashboardPointId("");
    setIsDashboardLoading(true);
    setDashboardError(null);
    try {
      await onFetchDashboard({ dateFrom: "", dateTo: "", salesPointId: "" });
    } catch (error: any) {
      setDashboardError(error?.message ?? "Falha ao carregar dashboard de consignação.");
    } finally {
      setIsDashboardLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Dashboard</Text>
      <View style={styles.metricGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Itens vendidos</Text>
          <Text style={styles.metricValue}>{dashboard?.totals.soldItemsCount ?? 0}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Itens disponíveis</Text>
          <Text style={styles.metricValue}>{dashboard?.totals.availableItemsCount ?? 0}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Pontos ativos</Text>
          <Text style={styles.metricValue}>{dashboard?.totals.activeSalesPointsCount ?? 0}</Text>
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.filterField}>
          <Field label="Data inicial" value={dashboardDateFrom} onChangeText={setDashboardDateFrom} />
        </View>
        <View style={styles.filterField}>
          <Field label="Data final" value={dashboardDateTo} onChangeText={setDashboardDateTo} />
        </View>
      </View>
      <SelectField
        label="Ponto de consignação"
        value={selectedDashboardPointName}
        placeholder="Todos os pontos"
        options={points.map((item) => ({
          value: item.id,
          label: maskSensitiveText(item.name, isPrivacyMode, PRIVACY_MASK),
        }))}
        isOpen={isDashboardPointOpen}
        emptyText="Cadastre pontos de venda primeiro."
        onToggle={() => setIsDashboardPointOpen((prev) => !prev)}
        onSelect={(value) => {
          const point = points.find((item) => item.id === value);
          if (!point) return;
          setDashboardPointId(point.id);
          setIsDashboardPointOpen(false);
        }}
      />
      <View style={styles.row}>
        <Pressable style={styles.smallButton} onPress={() => void refreshDashboard()}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
            Aplicar filtros
          </Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void clearDashboardFilters()}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
            Limpar filtros
          </Text>
        </Pressable>
      </View>
      {isDashboardLoading ? <Text style={styles.text}>Carregando dashboard...</Text> : null}
      {dashboardError ? <Text style={styles.errorText}>{dashboardError}</Text> : null}
      <Text style={styles.cardTitle}>Movimentações recentes</Text>
      {!isDashboardLoading && (dashboard?.movements.length ?? 0) === 0 ? (
        <Text style={styles.text}>Sem movimentações no período.</Text>
      ) : null}
      {(dashboard?.movements ?? []).map((movement, index) => (
        <View key={`${movement.movementType}-${movement.batchItemId}-${movement.eventAt}-${index}`} style={styles.dashboardMovementRow}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.dashboardMovementMainText}>
            {movementLabelMap[movement.movementType]} | {maskSensitiveComposite([movement.skuCode, movement.skuName], isPrivacyMode, PRIVACY_MASK)}
          </Text>
          <Text style={styles.dashboardMovementMetaText}>Qtd: {movement.quantity}</Text>
          <Text style={styles.dashboardMovementMetaText}>{dateOnly(movement.eventAt)}</Text>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.dashboardMovementPointText}>
            {maskSensitiveText(movement.salesPointName, isPrivacyMode, PRIVACY_MASK)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SalesConsignmentScreen({
  skus,
  points,
  batches,
  selectedBatchDetail,
  onSelectBatch,
  onCreateBatch,
  onRegisterSale,
  onRegisterReturn,
  isPrivacyMode,
}: {
  skus: SalesSku[];
  points: SalesPoint[];
  batches: ConsignmentBatch[];
  selectedBatchDetail?: ConsignmentBatchDetail;
  onSelectBatch: (batchId: string) => void;
  onCreateBatch: (payload: {
    salesPointId: string;
    dispatchedAt: string;
    notes: string;
    items: Array<{ skuId: string; quantitySent: number; unitSalePriceCents: number }>;
  }) => void;
  onRegisterSale: (batchItemId: string, soldQuantity: number, soldAt: string, notes: string) => void;
  onRegisterReturn: (batchItemId: string, returnedQuantity: number, returnedAt: string, notes: string) => void;
  isPrivacyMode: boolean;
}) {
  const [salesPointId, setSalesPointId] = useState(points[0]?.id ?? "");
  const [isPointOpen, setIsPointOpen] = useState(false);
  const [skuId, setSkuId] = useState(skus[0]?.id ?? "");
  const [isSkuOpen, setIsSkuOpen] = useState(false);
  const [quantitySent, setQuantitySent] = useState("");
  const [unitSalePrice, setUnitSalePrice] = useState("");
  const [dispatchedAt, setDispatchedAt] = useState(() => dateOnly(new Date().toISOString()));
  const [isDispatchDateModalVisible, setIsDispatchDateModalVisible] = useState(false);
  const [dispatchCalendarCursor, setDispatchCalendarCursor] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [draftItems, setDraftItems] = useState<
    Array<{ skuId: string; skuLabel: string; quantitySent: number; unitSalePriceCents: number }>
  >([]);
  const [saleQtyByItem, setSaleQtyByItem] = useState<Record<string, string>>({});
  const [returnQtyByItem, setReturnQtyByItem] = useState<Record<string, string>>({});
  const [eventDateByItem, setEventDateByItem] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!salesPointId && points[0]) setSalesPointId(points[0].id);
    if (!skuId && skus[0]) setSkuId(skus[0].id);
  }, [points, skus, salesPointId, skuId]);

  const selectedPointName = maskSensitiveText(points.find((item) => item.id === salesPointId)?.name ?? "", isPrivacyMode);
  const selectedSkuName = maskSensitiveText(skus.find((item) => item.id === skuId)?.name ?? "", isPrivacyMode);
  const dispatchMonthLabel = `${dispatchCalendarCursor.toLocaleString("pt-BR", { month: "long" })} ${dispatchCalendarCursor.getFullYear()}`;
  const dispatchWeekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const dispatchFirstDay = new Date(dispatchCalendarCursor.getFullYear(), dispatchCalendarCursor.getMonth(), 1);
  const dispatchFirstWeekDay = dispatchFirstDay.getDay();
  const dispatchDaysInMonth = new Date(dispatchCalendarCursor.getFullYear(), dispatchCalendarCursor.getMonth() + 1, 0).getDate();
  const dispatchCalendarCells: Array<Date | null> = [];
  for (let i = 0; i < dispatchFirstWeekDay; i += 1) dispatchCalendarCells.push(null);
  for (let day = 1; day <= dispatchDaysInMonth; day += 1) {
    dispatchCalendarCells.push(new Date(dispatchCalendarCursor.getFullYear(), dispatchCalendarCursor.getMonth(), day));
  }
  while (dispatchCalendarCells.length % 7 !== 0) dispatchCalendarCells.push(null);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Consignação</Text>
      <Text style={styles.pageSubtitle}>Envio para pontos e registro de venda/devolução</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Novo envio de consignação</Text>
        <SelectField
          label="Ponto de venda"
          value={selectedPointName}
          placeholder="Selecione um ponto"
          options={points.map((item) => ({
            value: item.id,
            label: PRIVACY_MASK,
          }))}
          isOpen={isPointOpen}
          emptyText="Cadastre pontos de venda primeiro."
          onToggle={() => setIsPointOpen((prev) => !prev)}
          onSelect={(value) => {
            const point = points.find((item) => item.id === value);
            if (!point) return;
            setSalesPointId(point.id);
            setIsPointOpen(false);
          }}
        />
        <SelectField
          label="SKU do item"
          value={selectedSkuName}
          placeholder="Selecione um SKU"
          options={skus.map((item) => ({
            value: item.id,
            label: PRIVACY_MASK,
          }))}
          isOpen={isSkuOpen}
          emptyText="Cadastre SKUs primeiro."
          onToggle={() => setIsSkuOpen((prev) => !prev)}
          onSelect={(value) => {
            const sku = skus.find((item) => item.id === value);
            if (!sku) return;
            setSkuId(sku.id);
            setIsSkuOpen(false);
          }}
        />
        <Field
          label="Quantidade enviada"
          value={quantitySent}
          onChangeText={setQuantitySent}
          keyboardType="numeric"
        />
        <Field
          label="Preço unitário no ponto (R$)"
          value={unitSalePrice}
          onChangeText={setUnitSalePrice}
          keyboardType="numeric"
        />
        <Pressable
          style={styles.smallButton}
          onPress={() => {
            const qty = Math.round(parseLocaleNumber(quantitySent));
            const unitCents = Math.round(parseLocaleNumber(unitSalePrice) * 100);
            if (!skuId || !Number.isFinite(qty) || !Number.isFinite(unitCents) || qty <= 0 || unitCents < 0) return;
            const sku = skus.find((item) => item.id === skuId);
            setDraftItems((prev) => [
              ...prev,
              {
                skuId,
                skuLabel: sku ? `${sku.skuCode} - ${sku.name}` : skuId,
                quantitySent: qty,
                unitSalePriceCents: unitCents,
              },
            ]);
            setQuantitySent("");
            setUnitSalePrice("");
          }}
        >
          <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
            Adicionar item ao envio
          </Text>
        </Pressable>
        {draftItems.map((item, idx) => (
          <View key={`${item.skuId}-${idx}`} style={styles.card}>
            <Text style={styles.text}>
              {maskSensitiveText(item.skuLabel, isPrivacyMode, PRIVACY_MASK)} | qtd: {item.quantitySent} | valor: {money(item.unitSalePriceCents)}
            </Text>
          </View>
        ))}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Data de envio</Text>
          <Pressable
            style={styles.selectTrigger}
            onPress={() => {
              const selected = dateOnly(dispatchedAt) === "-" ? dateOnly(new Date().toISOString()) : dateOnly(dispatchedAt);
              const [y, m, d] = selected.split("-").map(Number);
              setDispatchCalendarCursor(new Date(y, (m || 1) - 1, d || 1));
              setIsDispatchDateModalVisible(true);
            }}
          >
            <Text style={styles.selectValueText}>{dateOnly(dispatchedAt) === "-" ? "Selecionar data" : dateOnly(dispatchedAt)}</Text>
          </Pressable>
        </View>
        <Field label="Notas" value={notes} onChangeText={setNotes} multiline />
        <Pressable
          style={styles.primaryButtonFixed}
          onPress={() => {
            if (!salesPointId || draftItems.length === 0) return;
            onCreateBatch({
              salesPointId,
              dispatchedAt: dispatchedAt.trim(),
              notes: notes.trim(),
              items: draftItems.map((item) => ({
                skuId: item.skuId,
                quantitySent: item.quantitySent,
                unitSalePriceCents: item.unitSalePriceCents,
              })),
            });
            setDraftItems([]);
            setDispatchedAt(dateOnly(new Date().toISOString()));
            setNotes("");
          }}
        >
          <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
            Registrar envio
          </Text>
        </Pressable>
      </View>
      <Modal
        transparent
        visible={isDispatchDateModalVisible}
        animationType="fade"
        onRequestClose={() => setIsDispatchDateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Selecionar data de envio</Text>
            <View style={styles.calendarHeaderRow}>
              <Pressable
                style={styles.smallButton}
                onPress={() =>
                  setDispatchCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                }
              >
                <Text style={styles.smallButtonText}>{"<"}</Text>
              </Pressable>
              <Text style={styles.calendarMonthLabel}>{dispatchMonthLabel}</Text>
              <Pressable
                style={styles.smallButton}
                onPress={() =>
                  setDispatchCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                }
              >
                <Text style={styles.smallButtonText}>{">"}</Text>
              </Pressable>
            </View>
            <View style={styles.calendarGrid}>
              {dispatchWeekDays.map((dayName) => (
                <Text key={`dispatch-week-${dayName}`} style={styles.calendarWeekDay}>
                  {dayName}
                </Text>
              ))}
              {dispatchCalendarCells.map((cell, index) => {
                if (!cell) {
                  return <View key={`dispatch-empty-${index}`} style={styles.calendarDayEmpty} />;
                }
                const dayKey = `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, "0")}-${String(
                  cell.getDate()
                ).padStart(2, "0")}`;
                const isSelected = dayKey === dateOnly(dispatchedAt);
                return (
                  <Pressable
                    key={`dispatch-${dayKey}`}
                    style={[styles.calendarDayButton, isSelected && styles.calendarDayButtonSelected]}
                    onPress={() => setDispatchedAt(dayKey)}
                  >
                    <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected]}>
                      {cell.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.modalMessage}>
              Data selecionada: {dateOnly(dispatchedAt) === "-" ? "-" : dateOnly(dispatchedAt)}
            </Text>
            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => setIsDispatchDateModalVisible(false)}>
                <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
                  Fechar
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Envios registrados</Text>
        {batches.length === 0 && <Text style={styles.text}>Nenhum envio registrado.</Text>}
        {batches.map((batch) => (
          <View key={batch.id} style={styles.card}>
            <Text style={styles.text}>{maskSensitiveText(batch.salesPointName, isPrivacyMode, PRIVACY_MASK)}</Text>
            <Text style={styles.text}>Data envio: {batch.dispatchedAt || "-"}</Text>
            <Text style={styles.text}>Itens: {batch.itemsCount}</Text>
            <Text style={styles.text}>Status: {batch.status}</Text>
            <Pressable style={styles.smallButton} onPress={() => onSelectBatch(batch.id)}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                Ver detalhes
              </Text>
            </Pressable>
          </View>
        ))}
      </View>

      {selectedBatchDetail ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Detalhes do envio - {maskSensitiveText(selectedBatchDetail.salesPointName, isPrivacyMode, PRIVACY_MASK)}
          </Text>
          {selectedBatchDetail.items.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.text}>
                {maskSensitiveComposite([item.skuCode, item.skuName], isPrivacyMode, PRIVACY_MASK)}
              </Text>
              <Text style={styles.text}>
                Enviado: {item.quantitySent} | Vendido: {item.soldQuantity} | Devolvido: {item.returnedQuantity} |
                Saldo: {item.remainingQuantity}
              </Text>
              <Text style={styles.text}>Renda esperada: {money(item.expectedRevenueCents)}</Text>
              <Text style={styles.text}>Renda realizada: {money(item.realizedRevenueCents)}</Text>

              <Field
                label="Data do evento (opcional, ISO)"
                value={eventDateByItem[item.id] ?? ""}
                onChangeText={(value) => setEventDateByItem((prev) => ({ ...prev, [item.id]: value }))}
              />
              <Field
                label="Qtd vendida"
                value={saleQtyByItem[item.id] ?? ""}
                onChangeText={(value) => setSaleQtyByItem((prev) => ({ ...prev, [item.id]: value }))}
                keyboardType="numeric"
              />
              <Pressable
                style={styles.smallButton}
                onPress={() => {
                  const qty = Math.round(parseLocaleNumber(saleQtyByItem[item.id] ?? ""));
                  if (!Number.isFinite(qty) || qty <= 0) return;
                  onRegisterSale(item.id, qty, eventDateByItem[item.id] ?? "", "");
                  setSaleQtyByItem((prev) => ({ ...prev, [item.id]: "" }));
                }}
              >
                <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                  Registrar venda
                </Text>
              </Pressable>

              <Field
                label="Qtd devolvida"
                value={returnQtyByItem[item.id] ?? ""}
                onChangeText={(value) => setReturnQtyByItem((prev) => ({ ...prev, [item.id]: value }))}
                keyboardType="numeric"
              />
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  const qty = Math.round(parseLocaleNumber(returnQtyByItem[item.id] ?? ""));
                  if (!Number.isFinite(qty) || qty <= 0) return;
                  onRegisterReturn(item.id, qty, eventDateByItem[item.id] ?? "", "");
                  setReturnQtyByItem((prev) => ({ ...prev, [item.id]: "" }));
                }}
              >
                <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
                  Registrar devolução
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function SalesPointsOverviewScreen({
  overview,
  dashboard,
  skus,
  points,
  onFetchDashboard,
  onCreateConsignmentBatch,
  onRegisterPointSale,
  onRegisterPointReturn,
  onMarkContactToday,
  onSetNextContact,
  isPrivacyMode,
}: {
  overview: SalesPointOverview[];
  dashboard: ConsignmentDashboard | null;
  skus: SalesSku[];
  points: SalesPoint[];
  onFetchDashboard: (filters: { dateFrom: string; dateTo: string; salesPointId: string }) => Promise<void>;
  onCreateConsignmentBatch: (payload: {
    salesPointId: string;
    dispatchedAt: string;
    notes: string;
    items: Array<{ skuId: string; quantitySent: number; unitSalePriceCents: number }>;
  }) => void;
  onRegisterPointSale: (salesPointId: string, skuId: string, soldQuantity: number, soldAt: string, notes: string) => void;
  onRegisterPointReturn: (
    salesPointId: string,
    skuId: string,
    returnedQuantity: number,
    returnedAt: string,
    notes: string
  ) => void;
  onMarkContactToday: (salesPointId: string) => void;
  onSetNextContact: (salesPointId: string, nextContactDate: string) => void;
  isPrivacyMode: boolean;
}) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingPointId, setEditingPointId] = useState("");
  const [nextContactDateInput, setNextContactDateInput] = useState("");
  const [calendarCursor, setCalendarCursor] = useState(new Date());
  const [actionPointId, setActionPointId] = useState("");
  const [actionMode, setActionMode] = useState<"" | "sale" | "return" | "send">("");
  const [actionSkuId, setActionSkuId] = useState("");
  const [isActionSkuOpen, setIsActionSkuOpen] = useState(false);
  const [actionQuantity, setActionQuantity] = useState("");
  const [actionUnitSalePrice, setActionUnitSalePrice] = useState("");
  const [actionDate, setActionDate] = useState(() => dateOnly(new Date().toISOString()));
  const [actionNotes, setActionNotes] = useState("");

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const monthLabel = `${calendarCursor.toLocaleString("pt-BR", { month: "long" })} ${calendarCursor.getFullYear()}`;
  const firstDay = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
  const firstWeekDay = firstDay.getDay();
  const daysInMonth = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 0).getDate();
  const calendarCells: Array<Date | null> = [];
  for (let i = 0; i < firstWeekDay; i += 1) calendarCells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    calendarCells.push(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), day));
  }
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const openNextContactModal = (point: SalesPointOverview) => {
    setEditingPointId(point.salesPointId);
    const existing = dateOnly(point.nextContactAt);
    const selected = existing === "-" ? dateOnly(new Date().toISOString()) : existing;
    setNextContactDateInput(selected);
    const [y, m, d] = selected.split("-").map(Number);
    setCalendarCursor(new Date(y, (m || 1) - 1, d || 1));
    setIsModalVisible(true);
  };

  const resetPointAction = () => {
    setActionMode("");
    setActionSkuId("");
    setIsActionSkuOpen(false);
    setActionQuantity("");
    setActionUnitSalePrice("");
    setActionDate(dateOnly(new Date().toISOString()));
    setActionNotes("");
  };

  const openPointAction = (pointId: string) => {
    if (actionPointId === pointId) {
      setActionPointId("");
      resetPointAction();
      return;
    }
    setActionPointId(pointId);
    resetPointAction();
  };

  const selectActionMode = (mode: "sale" | "return" | "send", point: SalesPointOverview) => {
    setActionMode(mode);
    setIsActionSkuOpen(false);
    setActionQuantity("");
    setActionNotes("");
    setActionDate(dateOnly(new Date().toISOString()));
    const firstSkuId = mode === "send" ? skus[0]?.id ?? "" : point.productsAtPoint[0]?.skuId ?? "";
    setActionSkuId(firstSkuId);
    const selectedSku = skus.find((item) => item.id === firstSkuId);
    setActionUnitSalePrice(
      mode === "send" && selectedSku ? String(selectedSku.suggestedWholesaleConsignmentPriceCents / 100) : ""
    );
  };

  const submitPointAction = (point: SalesPointOverview) => {
    const qty = Math.round(parseLocaleNumber(actionQuantity));
    if (!actionMode || !actionSkuId || !Number.isFinite(qty) || qty <= 0) return;

    if (actionMode === "sale") {
      onRegisterPointSale(point.salesPointId, actionSkuId, qty, actionDate.trim(), actionNotes.trim());
      resetPointAction();
      setActionPointId("");
      return;
    }

    if (actionMode === "return") {
      onRegisterPointReturn(point.salesPointId, actionSkuId, qty, actionDate.trim(), actionNotes.trim());
      resetPointAction();
      setActionPointId("");
      return;
    }

    const unitCents = Math.round(parseLocaleNumber(actionUnitSalePrice) * 100);
    if (!Number.isFinite(unitCents) || unitCents < 0) return;
    onCreateConsignmentBatch({
      salesPointId: point.salesPointId,
      dispatchedAt: actionDate.trim(),
      notes: actionNotes.trim(),
      items: [{ skuId: actionSkuId, quantitySent: qty, unitSalePriceCents: unitCents }],
    });
    resetPointAction();
    setActionPointId("");
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Visão Geral dos Pontos</Text>
      <ConsignmentDashboardPanel
        dashboard={dashboard}
        points={points}
        onFetchDashboard={onFetchDashboard}
        isPrivacyMode={isPrivacyMode}
      />
      {overview.length === 0 && <Text style={styles.text}>Sem dados de consignação ainda.</Text>}
      {overview.map((point) => (
        <View key={point.salesPointId} style={styles.card}>
          <Text style={styles.cardTitle}>{maskSensitiveText(point.salesPointName, isPrivacyMode, PRIVACY_MASK)}</Text>
          <Text
            style={[
              styles.text,
              contactDateStatus(point.nextContactAt) === "past" && styles.contactDatePast,
              contactDateStatus(point.nextContactAt) === "today" && styles.contactDateToday,
              contactDateStatus(point.nextContactAt) === "tomorrow" && styles.contactDateTomorrow,
            ]}
          >
            Próximo contato: {dateOnly(point.nextContactAt)}
          </Text>
          <View style={styles.row}>
            <Pressable style={styles.smallButton} onPress={() => onMarkContactToday(point.salesPointId)}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                Fiz contato hoje
              </Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => openNextContactModal(point)}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
                Editar próximo contato
              </Text>
            </Pressable>
            <Pressable style={styles.primaryButtonFixed} onPress={() => openPointAction(point.salesPointId)}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
                Registrar movimentação
              </Text>
            </Pressable>
          </View>
          {actionPointId === point.salesPointId && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Movimentação do ponto</Text>
              <View style={styles.row}>
                <Pressable
                  style={[styles.smallButton, actionMode === "sale" && styles.selectedButton]}
                  onPress={() => selectActionMode("sale", point)}
                >
                  <Text
                    allowFontScaling={false}
                    numberOfLines={1}
                    style={[styles.smallButtonText, actionMode === "sale" && styles.selectedButtonText]}
                  >
                    Registrar venda
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryButton, actionMode === "return" && styles.selectedButton]}
                  onPress={() => selectActionMode("return", point)}
                >
                  <Text
                    allowFontScaling={false}
                    numberOfLines={1}
                    style={[styles.secondaryButtonText, actionMode === "return" && styles.selectedButtonText]}
                  >
                    Registrar retirada
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryButton, actionMode === "send" && styles.selectedButton]}
                  onPress={() => selectActionMode("send", point)}
                >
                  <Text
                    allowFontScaling={false}
                    numberOfLines={1}
                    style={[styles.secondaryButtonText, actionMode === "send" && styles.selectedButtonText]}
                  >
                    Registrar envio de estoque
                  </Text>
                </Pressable>
              </View>
              {actionMode ? (
                <>
                  <SelectField
                    label="Produto"
                    value={
                      actionMode === "send"
                        ? maskSensitiveComposite(
                            [
                              skus.find((item) => item.id === actionSkuId)?.skuCode ?? "",
                              skus.find((item) => item.id === actionSkuId)?.name ?? "",
                            ].filter(Boolean),
                            isPrivacyMode,
                            PRIVACY_MASK
                          )
                        : maskSensitiveComposite(
                            [
                              point.productsAtPoint.find((item) => item.skuId === actionSkuId)?.skuCode ?? "",
                              point.productsAtPoint.find((item) => item.skuId === actionSkuId)?.skuName ?? "",
                            ].filter(Boolean),
                            isPrivacyMode,
                            PRIVACY_MASK
                          )
                    }
                    placeholder="Selecione um produto"
                    options={(actionMode === "send" ? skus : point.productsAtPoint).map((item) => {
                      const skuCode = "skuCode" in item ? item.skuCode : "";
                      const skuName = "skuName" in item ? item.skuName : item.name;
                      return {
                        value: "skuId" in item ? item.skuId : item.id,
                        label: maskSensitiveComposite([skuCode, skuName], isPrivacyMode, PRIVACY_MASK),
                      };
                    })}
                    emptyText={
                      actionMode === "send" ? "Cadastre SKUs primeiro." : "Este ponto não possui estoque disponível."
                    }
                    isOpen={isActionSkuOpen}
                    onToggle={() => setIsActionSkuOpen((prev) => !prev)}
                    onSelect={(value) => {
                      setActionSkuId(value);
                      setIsActionSkuOpen(false);
                      if (actionMode === "send") {
                        const sku = skus.find((item) => item.id === value);
                        setActionUnitSalePrice(
                          sku ? String(sku.suggestedWholesaleConsignmentPriceCents / 100) : actionUnitSalePrice
                        );
                      }
                    }}
                  />
                  <Field
                    label="Quantidade"
                    value={actionQuantity}
                    onChangeText={setActionQuantity}
                    keyboardType="numeric"
                  />
                  {actionMode === "send" && (
                    <Field
                      label="Preço unitário no ponto (R$)"
                      value={actionUnitSalePrice}
                      onChangeText={setActionUnitSalePrice}
                      keyboardType="numeric"
                    />
                  )}
                  <Field
                    label={actionMode === "send" ? "Data de envio" : "Data da movimentação"}
                    value={actionDate}
                    onChangeText={setActionDate}
                  />
                  <Field label="Notas" value={actionNotes} onChangeText={setActionNotes} multiline />
                  <Pressable style={styles.primaryButtonFixed} onPress={() => submitPointAction(point)}>
                    <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
                      Salvar movimentação
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          )}
          <Text style={styles.text}>Produtos ativos no ponto: {point.activeProductsCount}</Text>
          <Text style={styles.text}>Renda esperada: {money(point.expectedRevenueCents)}</Text>
          <Text style={styles.text}>Renda realizada: {money(point.realizedRevenueCents)}</Text>
          {point.productsAtPoint.map((product) => (
            <View key={`${point.salesPointId}-${product.skuId}`} style={styles.card}>
              <Text style={styles.text}>
                {maskSensitiveComposite([product.skuCode, product.skuName], isPrivacyMode, PRIVACY_MASK)}
              </Text>
              <Text style={styles.text}>Saldo no ponto: {product.quantityRemaining}</Text>
              <Text style={styles.text}>Valor unitario: {money(product.referenceUnitSalePriceCents)}</Text>
              <Text style={styles.text}>Esperado: {money(product.expectedRevenueCents)}</Text>
              <Text style={styles.text}>Realizado: {money(product.realizedRevenueCents)}</Text>
            </View>
          ))}
        </View>
      ))}
      <Modal
        transparent
        visible={isModalVisible}
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Editar próximo contato</Text>
            <Text style={styles.modalMessage}>Selecione a data no calendário</Text>
            <View style={styles.calendarHeaderRow}>
              <Pressable
                style={styles.smallButton}
                onPress={() =>
                  setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                }
              >
                <Text style={styles.smallButtonText}>{"<"}</Text>
              </Pressable>
              <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
              <Pressable
                style={styles.smallButton}
                onPress={() =>
                  setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                }
              >
                <Text style={styles.smallButtonText}>{">"}</Text>
              </Pressable>
            </View>
            <View style={styles.calendarGrid}>
              {weekDays.map((dayName) => (
                <Text key={dayName} style={styles.calendarWeekDay}>
                  {dayName}
                </Text>
              ))}
              {calendarCells.map((cell, index) => {
                if (!cell) {
                  return <View key={`empty-${index}`} style={styles.calendarDayEmpty} />;
                }
                const dayKey = `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, "0")}-${String(
                  cell.getDate()
                ).padStart(2, "0")}`;
                const isSelected = dayKey === nextContactDateInput;
                return (
                  <Pressable
                    key={dayKey}
                    style={[styles.calendarDayButton, isSelected && styles.calendarDayButtonSelected]}
                    onPress={() => setNextContactDateInput(dayKey)}
                  >
                    <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected]}>
                      {cell.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.modalMessage}>Data selecionada: {nextContactDateInput || "-"}</Text>
            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => setIsModalVisible(false)}>
                <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
                  Cancelar
                </Text>
              </Pressable>
              <Pressable
                style={styles.primaryButtonFixed}
                onPress={() => {
                  if (!editingPointId || !nextContactDateInput.trim()) return;
                  onSetNextContact(editingPointId, nextContactDateInput.trim());
                  setIsModalVisible(false);
                }}
              >
                <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
                  Salvar data
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function LogsScreen({
  logs,
  onCancelMarketplaceSync,
  cancelingRunIds,
}: {
  logs: OperationLogItem[];
  onCancelMarketplaceSync: (runId: string) => void;
  cancelingRunIds: Record<string, boolean>;
}) {
  const typeLabels: Record<string, string> = {
    stock_movement_created: "Movimentação de estoque",
    consignment_batch_created: "Envio de consignação",
    consignment_sale_registered: "Venda em consignação",
    consignment_return_registered: "Devolução em consignação",
    sales_point_contact_today: "Contato realizado",
    sales_point_next_contact_override: "Próximo contato ajustado",
    filament_created: "Filamento criado",
    filament_updated: "Filamento atualizado",
    filament_deleted: "Filamento desativado",
    cost_settings_created: "Configuração de custos criada",
    quote_created: "Orçamento criado",
    quote_updated: "Orçamento atualizado",
    quote_deleted: "Orçamento excluído",
    marketplace_catalog_read_started: "Sync de anúncios iniciado",
    marketplace_catalog_read_finished: "Sync de anúncios concluído",
    marketplace_catalog_read_cancelled: "Sync de anúncios interrompido",
    marketplace_catalog_read_failed: "Sync de anúncios falhou",
    marketplace_orders_read_started: "Sync de vendas iniciado",
    marketplace_orders_read_finished: "Sync de vendas concluído",
    marketplace_orders_read_cancelled: "Sync de vendas interrompido",
    marketplace_orders_read_failed: "Sync de vendas falhou",
    marketplace_product_ads_read_started: "Sync de Product Ads iniciado",
    marketplace_product_ads_read_finished: "Sync de Product Ads concluído",
    marketplace_product_ads_read_failed: "Sync de Product Ads falhou",
    marketplace_sync_cancel_requested: "Interrupção solicitada",
  };
  const finishedRunIds = new Set(
    logs
      .filter((log) => ["finished", "cancelled", "error"].includes(String(log.payload?.phase ?? "")))
      .map((log) => String(log.payload?.run_id ?? log.entityId ?? ""))
      .filter(Boolean)
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Logs</Text>
      <Text style={styles.pageSubtitle}>Histórico de movimentações e ações</Text>
      {logs.length === 0 && <Text style={styles.text}>Sem logs até o momento.</Text>}
      {logs.map((log) => {
        const runId = String(log.payload?.run_id ?? log.entityId ?? "");
        const logMessage = String(log.payload?.message ?? log.payload?.reason ?? "").trim();
        const logStatus = log.payload?.error_status ?? log.payload?.status_code;
        const logDetails =
          log.payload?.error_details !== undefined && log.payload?.error_details !== null
            ? JSON.stringify(log.payload.error_details)
            : "";
        const syncWindow = String(log.payload?.sync_window ?? "").trim();
        const syncMode = String(log.payload?.sync_mode ?? "").trim();
        const recordsRead = log.payload?.records_read;
        const recordsUpserted = log.payload?.records_upserted;
        const recordsFailed = log.payload?.records_failed;
        const isMarketplaceSyncStart =
          log.entityType === "marketplace_sync_run" &&
          String(log.payload?.phase ?? "") === "started" &&
          runId &&
          !finishedRunIds.has(runId);

        return (
          <View key={log.id} style={styles.card}>
            <Text style={styles.cardTitle}>{typeLabels[log.eventType] ?? log.eventType}</Text>
            <Text style={styles.text}>Resumo: {log.summary}</Text>
            <Text style={styles.text}>Data/hora: {dateTime(log.createdAt)}</Text>
            <Text style={styles.text}>Entidade: {log.entityType}{log.entityId ? ` (${log.entityId})` : ""}</Text>
            {logMessage ? <Text style={styles.errorText}>Mensagem: {logMessage}</Text> : null}
            {logStatus ? <Text style={styles.errorText}>Status: {String(logStatus)}</Text> : null}
            {logDetails ? <Text style={styles.text}>Detalhes: {logDetails}</Text> : null}
            {syncWindow || syncMode ? (
              <Text style={styles.text}>
                Sincronia: {[syncWindow, syncMode].filter(Boolean).join(" | ")}
              </Text>
            ) : null}
            {[recordsRead, recordsUpserted, recordsFailed].some((value) => value !== undefined && value !== null) ? (
              <Text style={styles.text}>
                Registros: lidos {Number(recordsRead ?? 0)}, salvos {Number(recordsUpserted ?? 0)}, falhas{" "}
                {Number(recordsFailed ?? 0)}
              </Text>
            ) : null}
            {isMarketplaceSyncStart ? (
              <View style={styles.row}>
                <Pressable
                  style={[styles.dangerButton, cancelingRunIds[runId] && styles.buttonDisabled]}
                  onPress={() => onCancelMarketplaceSync(runId)}
                  disabled={cancelingRunIds[runId]}
                >
                  <Text allowFontScaling={false} numberOfLines={1} style={styles.dangerButtonText}>
                    {cancelingRunIds[runId] ? "Interrompendo..." : "Interromper sincronia"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

type MarketplaceOrdersComparisonMode = "previous" | "same_30_days_before";
type MarketplaceOrdersRangeSelection = "start" | "end";
type MarketplaceOrdersQuickRange = "today" | "yesterday" | "7d" | "15d" | "30d" | null;
type MarketplaceOrdersMetricKey =
  | "revenue"
  | "productionCost"
  | "grossProfit"
  | "ordersCount"
  | "averageTicket"
  | "unitsSold";
type MarketplaceOrdersSortKey = "total_desc" | "total_asc" | "profit_desc" | "profit_asc" | "date_desc" | "date_asc";

type MarketplaceOrdersSummary = {
  revenueCents: number;
  productionCostCents: number;
  ordersCount: number;
  averageTicketCents: number;
  unitsSold: number;
  grossProfitCents: number;
};

type MarketplaceOrderSkuLinkTarget = {
  accountId: string;
  marketplaceItemId: string;
  marketplaceVariationId: string | null;
  variationKey: string;
  catalogVariationId: string | null;
};

function MarketplaceOrdersDashboardSection({
  orderItems,
  accounts,
  ordersDashboard,
  normalizationRules,
  isBusy,
  taxRatePercent,
  onFetchOrdersDashboard,
  onRecalculateAllOrderSnapshots,
  onRecalculateSingleOrderSnapshot,
  onOpenSkuLinking,
  isPrivacyMode,
}: {
  orderItems: MarketplaceOrderItem[];
  accounts: MarketplaceAccountStatus[];
  ordersDashboard: MarketplaceOrdersDashboardResponse | null;
  normalizationRules: MarketplaceNormalizationRule[];
  isBusy: boolean;
  taxRatePercent: number;
  onFetchOrdersDashboard: (filters: { dateFrom: string; dateTo: string }) => Promise<void>;
  onRecalculateAllOrderSnapshots: () => void;
  onRecalculateSingleOrderSnapshot: (orderId: string) => void;
  onOpenSkuLinking: (target: MarketplaceOrderSkuLinkTarget) => void;
  isPrivacyMode: boolean;
}) {
  const todayKey = formatLocalDateKey(new Date());
  const [rangeStart, setRangeStart] = useState(() => formatLocalDateKey(addLocalDays(new Date(), -29)));
  const [rangeEnd, setRangeEnd] = useState(() => todayKey);
  const [activeQuickRange, setActiveQuickRange] = useState<MarketplaceOrdersQuickRange>("30d");
  const [comparisonMode, setComparisonMode] = useState<MarketplaceOrdersComparisonMode>("previous");
  const [logisticFilter, setLogisticFilter] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [hideCancelled, setHideCancelled] = useState(true);
  const [ordersSortKey, setOrdersSortKey] = useState<MarketplaceOrdersSortKey>("date_desc");
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});
  const [isRangeModalVisible, setIsRangeModalVisible] = useState(false);
  const [rangeSelection, setRangeSelection] = useState<MarketplaceOrdersRangeSelection>("start");
  const [calendarCursor, setCalendarCursor] = useState(() => parseLocalDateKey(rangeStart));
  const [areChartsVisible, setAreChartsVisible] = useState(() =>
    readCookieBoolean(MARKETPLACE_ORDERS_CHARTS_VISIBLE_COOKIE, true)
  );
  const [areStockStatusesVisible, setAreStockStatusesVisible] = useState(true);
  const [selectedMetricChart, setSelectedMetricChart] = useState<MarketplaceOrdersMetricKey | null>(null);
  const [hoveredMetricPoint, setHoveredMetricPoint] = useState<{
    x: number;
    y: number;
    label: string;
    value: number;
    seriesLabel: string;
    color: string;
  } | null>(null);

  useEffect(() => {
    writeCookieBoolean(MARKETPLACE_ORDERS_CHARTS_VISIBLE_COOKIE, areChartsVisible);
  }, [areChartsVisible]);

  const normalizedRange = useMemo(() => {
    const start = parseLocalDateKey(rangeStart);
    const end = parseLocalDateKey(rangeEnd);
    if (start.getTime() <= end.getTime()) {
      return {
        startKey: formatLocalDateKey(start),
        endKey: formatLocalDateKey(end),
        startDate: startOfLocalDay(start),
        endDate: endOfLocalDay(end),
      };
    }

    return {
      startKey: formatLocalDateKey(end),
      endKey: formatLocalDateKey(start),
      startDate: startOfLocalDay(end),
      endDate: endOfLocalDay(start),
    };
  }, [rangeStart, rangeEnd]);

  const comparisonRange = useMemo(() => {
    const durationDays =
      Math.max(
        0,
        Math.round(
          (startOfLocalDay(normalizedRange.endDate).getTime() - startOfLocalDay(normalizedRange.startDate).getTime()) /
            (24 * 60 * 60 * 1000)
        )
      ) + 1;

    if (comparisonMode === "same_30_days_before") {
      const startDate = addLocalDays(normalizedRange.startDate, -30);
      const endDate = addLocalDays(normalizedRange.endDate, -30);
      return {
        startDate: startOfLocalDay(startDate),
        endDate: endOfLocalDay(endDate),
        label: `${formatLocalDateKey(startDate)} até ${formatLocalDateKey(endDate)}`,
      };
    }

    const endDate = addLocalDays(normalizedRange.startDate, -1);
    const startDate = addLocalDays(endDate, -(durationDays - 1));
    return {
      startDate: startOfLocalDay(startDate),
      endDate: endOfLocalDay(endDate),
      label: `${formatLocalDateKey(startDate)} até ${formatLocalDateKey(endDate)}`,
    };
  }, [comparisonMode, normalizedRange]);

  useEffect(() => {
    void onFetchOrdersDashboard({
      dateFrom: normalizedRange.startKey,
      dateTo: normalizedRange.endKey,
    });
  }, [normalizedRange.startKey, normalizedRange.endKey]);

  const logisticOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const order of orderItems) {
      const raw = order.shipping_logistic_type || "__empty__";
      values.set(
        raw,
        resolveMarketplaceNormalizedLabel(normalizationRules, "shipping_logistic_type", order.shipping_logistic_type, "Sem logística")
      );
    }
    return Array.from(values.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [orderItems, normalizationRules]);

  const statusOptions = useMemo(() => {
    const values = new Set<string>();
    for (const order of orderItems) {
      values.add(order.status || "Sem status");
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [orderItems]);

  const isCancelledOrder = (order: MarketplaceOrderItem) => {
    const status = `${order.status ?? ""} ${order.substatus ?? ""}`.toLowerCase();
    return status.includes("cancel");
  };

  const filterOrder = (order: MarketplaceOrderItem, startDate: Date, endDate: Date) => {
    const orderDate = new Date(order.date_created || order.updated_at || order.last_seen_at || "");
    if (!Number.isFinite(orderDate.getTime())) return false;
    if (orderDate.getTime() < startDate.getTime() || orderDate.getTime() > endDate.getTime()) return false;
    if (hideCancelled && isCancelledOrder(order)) return false;
    if (logisticFilter !== "__all__" && (order.shipping_logistic_type || "__empty__") !== logisticFilter) return false;
    if (statusFilter !== "__all__" && (order.status || "Sem status") !== statusFilter) return false;
    return true;
  };

  const summarizeOrders = (orders: MarketplaceOrderItem[]): MarketplaceOrdersSummary => {
    const revenueCents = orders.reduce((sum, order) => sum + (order.metrics?.grossRevenueCents ?? 0), 0);
    const productionCostCents = orders.reduce((sum, order) => sum + (order.metrics?.productionCostCents ?? 0), 0);
    const unitsSold = orders.reduce((sum, order) => sum + (order.metrics?.unitsSold ?? 0), 0);
    const grossProfitCents = orders.reduce((sum, order) => {
      const baseReceived = order.metrics?.netReceivedCents ?? order.metrics?.grossRevenueCents ?? 0;
      const productionCost = order.metrics?.productionCostCents ?? 0;
      const estimatedTaxCents = Math.round((order.metrics?.grossRevenueCents ?? 0) * (taxRatePercent / 100));
      return sum + baseReceived - productionCost - estimatedTaxCents;
    }, 0);

    return {
      revenueCents,
      productionCostCents,
      ordersCount: orders.length,
      averageTicketCents: orders.length > 0 ? Math.round(revenueCents / orders.length) : 0,
      unitsSold,
      grossProfitCents,
    };
  };

  const orderGrossProfitCents = (order: MarketplaceOrderItem) => {
    const baseReceived = order.metrics?.netReceivedCents ?? order.metrics?.grossRevenueCents ?? 0;
    const productionCost = order.metrics?.productionCostCents ?? 0;
    const estimatedTaxCents = Math.round((order.metrics?.grossRevenueCents ?? 0) * (taxRatePercent / 100));
    return baseReceived - productionCost - estimatedTaxCents;
  };

  const orderDateTimeMs = (order: MarketplaceOrderItem) =>
    Date.parse(order.date_created || order.updated_at || order.last_seen_at || "") || 0;

  const currentOrders = useMemo(
    () => {
      const filtered = orderItems.filter((order) => filterOrder(order, normalizedRange.startDate, normalizedRange.endDate));
      return filtered.sort((a, b) => {
        if (ordersSortKey === "total_desc") {
          return (b.metrics?.grossRevenueCents ?? 0) - (a.metrics?.grossRevenueCents ?? 0);
        }
        if (ordersSortKey === "total_asc") {
          return (a.metrics?.grossRevenueCents ?? 0) - (b.metrics?.grossRevenueCents ?? 0);
        }
        if (ordersSortKey === "profit_desc") {
          return orderGrossProfitCents(b) - orderGrossProfitCents(a);
        }
        if (ordersSortKey === "profit_asc") {
          return orderGrossProfitCents(a) - orderGrossProfitCents(b);
        }
        if (ordersSortKey === "date_asc") {
          return orderDateTimeMs(a) - orderDateTimeMs(b);
        }
        return orderDateTimeMs(b) - orderDateTimeMs(a);
      });
    },
    [orderItems, normalizedRange, logisticFilter, statusFilter, hideCancelled, ordersSortKey, taxRatePercent]
  );

  const comparisonOrders = useMemo(
    () => orderItems.filter((order) => filterOrder(order, comparisonRange.startDate, comparisonRange.endDate)),
    [orderItems, comparisonRange, logisticFilter, statusFilter, hideCancelled]
  );

  const currentSummary = useMemo(() => summarizeOrders(currentOrders), [currentOrders, taxRatePercent]);
  const comparisonSummary = useMemo(() => summarizeOrders(comparisonOrders), [comparisonOrders, taxRatePercent]);
  const productAds = ordersDashboard?.product_ads ?? null;
  const productAdsMaxCostCents = Math.max(1, ...(productAds?.daily ?? []).map((item) => item.cost_cents));
  const logisticsChartColors = ["#1e3a79", "#0f766e", "#f59e0b", "#7c3aed", "#dc2626", "#4b5563"];
  const accountsById = useMemo(() => {
    const map = new Map<string, MarketplaceAccountStatus>();
    for (const account of accounts) {
      map.set(account.id, account);
    }
    return map;
  }, [accounts]);
  const logisticsDistribution = useMemo(() => {
    const counts = new Map<string, { label: string; count: number; color: string }>();
    for (const order of currentOrders) {
      const raw = order.shipping_logistic_type || "__empty__";
      const label = resolveMarketplaceNormalizedLabel(
        normalizationRules,
        "shipping_logistic_type",
        order.shipping_logistic_type,
        "Sem logística"
      );
      const current = counts.get(raw) ?? {
        label,
        count: 0,
        color: logisticsChartColors[counts.size % logisticsChartColors.length],
      };
      current.count += 1;
      counts.set(raw, current);
    }

    const total = currentOrders.length;
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .map((item) => ({
        ...item,
        percent: total > 0 ? (item.count / total) * 100 : 0,
      }));
  }, [currentOrders, normalizationRules]);
  const logisticsPieGradient = useMemo(() => {
    if (logisticsDistribution.length === 0) return "#eef3ff";
    let cursor = 0;
    const stops = logisticsDistribution.map((item) => {
      const start = cursor;
      cursor += item.percent;
      return `${item.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [logisticsDistribution]);
  const accountDistribution = useMemo(() => {
    const counts = new Map<string, { accountId: string; label: string; count: number; color: string }>();
    for (const order of currentOrders) {
      const account = accountsById.get(order.account_id);
      const label = account?.seller_nickname || account?.account_label || account?.marketplace_user_id || order.account_id;
      const current = counts.get(order.account_id) ?? {
        accountId: order.account_id,
        label,
        count: 0,
        color: logisticsChartColors[counts.size % logisticsChartColors.length],
      };
      current.count += 1;
      counts.set(order.account_id, current);
    }

    const total = currentOrders.length;
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .map((item) => ({
        ...item,
        percent: total > 0 ? (item.count / total) * 100 : 0,
      }));
  }, [accountsById, currentOrders]);
  const accountPieGradient = useMemo(() => {
    if (accountDistribution.length === 0) return "#eef3ff";
    let cursor = 0;
    const stops = accountDistribution.map((item) => {
      const start = cursor;
      cursor += item.percent;
      return `${item.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [accountDistribution]);

  const setQuickRange = (range: Exclude<MarketplaceOrdersQuickRange, null>) => {
    const today = new Date();
    const yesterday = addLocalDays(today, -1);
    const end = range === "today" ? today : yesterday;
    const start =
      range === "today"
        ? today
        : range === "yesterday"
          ? yesterday
          : addLocalDays(yesterday, -(Number(range.replace("d", "")) - 1));
    setRangeStart(formatLocalDateKey(start));
    setRangeEnd(formatLocalDateKey(end));
    setCalendarCursor(start);
    setActiveQuickRange(range);
  };

  const renderComparison = (current: number, previous: number, formatter: (value: number) => string) => {
    const deltaPercent = previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / Math.abs(previous)) * 100;
    const isPositive = deltaPercent >= 0;
    return (
      <>
        <Text style={[styles.marketplaceMetricDelta, isPositive ? styles.marketplaceMetricDeltaPositive : styles.marketplaceMetricDeltaNegative]}>
          {isPositive ? "+" : ""}
          {deltaPercent.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
        </Text>
        <Text style={styles.marketplaceMetricPrevious}>Anterior: {formatter(previous)}</Text>
      </>
    );
  };

  const buildMetricSeries = (
    orders: MarketplaceOrderItem[],
    startDate: Date,
    endDate: Date,
    metricKey: MarketplaceOrdersMetricKey
  ) => {
    const buckets = new Map<
      string,
      {
        revenueCents: number;
        productionCostCents: number;
        grossProfitCents: number;
        ordersCount: number;
        unitsSold: number;
      }
    >();
    const labels: string[] = [];
    let cursor = startOfLocalDay(startDate);
    const end = startOfLocalDay(endDate);
    while (cursor.getTime() <= end.getTime()) {
      const key = formatLocalDateKey(cursor);
      buckets.set(key, { revenueCents: 0, productionCostCents: 0, grossProfitCents: 0, ordersCount: 0, unitsSold: 0 });
      labels.push(`${String(cursor.getDate()).padStart(2, "0")}/${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor = addLocalDays(cursor, 1);
    }

    for (const order of orders) {
      const orderDate = new Date(order.date_created || order.updated_at || order.last_seen_at || "");
      if (!Number.isFinite(orderDate.getTime())) continue;
      const key = formatLocalDateKey(orderDate);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.revenueCents += order.metrics?.grossRevenueCents ?? 0;
      bucket.productionCostCents += order.metrics?.productionCostCents ?? 0;
      bucket.grossProfitCents += orderGrossProfitCents(order);
      bucket.ordersCount += 1;
      bucket.unitsSold += order.metrics?.unitsSold ?? 0;
    }

    const values = Array.from(buckets.values()).map((bucket) => {
      if (metricKey === "revenue") return bucket.revenueCents;
      if (metricKey === "productionCost") return bucket.productionCostCents;
      if (metricKey === "grossProfit") return bucket.grossProfitCents;
      if (metricKey === "ordersCount") return bucket.ordersCount;
      if (metricKey === "averageTicket") {
        return bucket.ordersCount > 0 ? Math.round(bucket.revenueCents / bucket.ordersCount) : 0;
      }
      return bucket.unitsSold;
    });

    return { labels, values };
  };

  const metricCards = [
    {
      key: "revenue" as const,
      label: "Faturado",
      value: money(currentSummary.revenueCents),
      previousValue: comparisonSummary.revenueCents,
      currentValue: currentSummary.revenueCents,
      formatter: money,
    },
    {
      key: "productionCost" as const,
      label: "Custo produtos",
      value: money(currentSummary.productionCostCents),
      previousValue: comparisonSummary.productionCostCents,
      currentValue: currentSummary.productionCostCents,
      formatter: money,
    },
    {
      key: "grossProfit" as const,
      label: "Lucro",
      value: money(currentSummary.grossProfitCents),
      previousValue: comparisonSummary.grossProfitCents,
      currentValue: currentSummary.grossProfitCents,
      formatter: money,
    },
    {
      key: "ordersCount" as const,
      label: "Vendas",
      value: String(currentSummary.ordersCount),
      previousValue: comparisonSummary.ordersCount,
      currentValue: currentSummary.ordersCount,
      formatter: (value: number) => String(value),
    },
    {
      key: "averageTicket" as const,
      label: "Ticket médio",
      value: money(currentSummary.averageTicketCents),
      previousValue: comparisonSummary.averageTicketCents,
      currentValue: currentSummary.averageTicketCents,
      formatter: money,
    },
    {
      key: "unitsSold" as const,
      label: "Itens vendidos",
      value: String(currentSummary.unitsSold),
      previousValue: comparisonSummary.unitsSold,
      currentValue: currentSummary.unitsSold,
      formatter: (value: number) => String(value),
    },
  ];
  const selectedMetric = metricCards.find((metric) => metric.key === selectedMetricChart) ?? null;
  const metricChartData = useMemo(() => {
    if (!selectedMetricChart) return null;
    const current = buildMetricSeries(currentOrders, normalizedRange.startDate, normalizedRange.endDate, selectedMetricChart);
    const previous = buildMetricSeries(comparisonOrders, comparisonRange.startDate, comparisonRange.endDate, selectedMetricChart);
    return {
      current,
      previous,
      maxValue: Math.max(1, ...current.values, ...previous.values),
      minValue: Math.min(...current.values, ...previous.values),
    };
  }, [selectedMetricChart, currentOrders, comparisonOrders, normalizedRange, comparisonRange]);
  const metricChartWidth = 680;
  const metricChartHeight = 180;
  const stockPendingItems = useMemo(() => {
    const items: Array<{
      order: MarketplaceOrderItem;
      item: MarketplaceOrderItem["order_items"][number];
    }> = [];
    for (const order of currentOrders) {
      for (const item of order.order_items) {
        const code = item.stock_status?.code;
        if (code === "missing_sku" || code === "pending_movement") {
          items.push({ order, item });
        }
      }
    }
    return items;
  }, [currentOrders]);
  const stockStatusCounts = useMemo(() => {
    const counts = {
      missing_sku: 0,
      pending_movement: 0,
      moved: 0,
      ignored_fulfillment: 0,
      ignored_cancelled: 0,
    };
    for (const order of currentOrders) {
      for (const item of order.order_items) {
        const code = item.stock_status?.code;
        if (code && code in counts) {
          counts[code as keyof typeof counts] += 1;
        }
      }
    }
    return counts;
  }, [currentOrders]);
  const renderMetricLine = (
    values: number[],
    labels: string[],
    maxValue: number,
    minValue: number,
    color: string,
    seriesLabel: string,
    opacity = 1
  ) => {
    const valueRange = Math.max(1, maxValue - minValue);
    const xStep = values.length > 1 ? metricChartWidth / (values.length - 1) : 0;
    const points = values.map((value, index) => ({
      x: values.length > 1 ? index * xStep : metricChartWidth / 2,
      y: metricChartHeight - ((value - minValue) / valueRange) * metricChartHeight,
      value,
      label: labels[index] ?? "",
    }));

    return (
      <>
        {points.slice(1).map((point, index) => {
          const previous = points[index];
          const dx = point.x - previous.x;
          const dy = point.y - previous.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View
              key={`${color}-${index}`}
              style={[
                styles.marketplaceMetricChartSegment,
                {
                  left: (previous.x + point.x) / 2 - length / 2,
                  top: (previous.y + point.y) / 2 - 1.5,
                  width: length,
                  backgroundColor: color,
                  opacity,
                  transform: [{ rotate: `${angle}deg` }],
                },
              ]}
            />
          );
        })}
        {points.map((point, index) => (
          <Pressable
            key={`${color}-dot-${index}`}
            onHoverIn={() => setHoveredMetricPoint({ ...point, seriesLabel, color })}
            onHoverOut={() => setHoveredMetricPoint(null)}
            onPressIn={() => setHoveredMetricPoint({ ...point, seriesLabel, color })}
            style={[
              styles.marketplaceMetricChartDot,
              {
                left: point.x - 4,
                top: point.y - 4,
                backgroundColor: color,
                opacity,
              },
            ]}
          />
        ))}
      </>
    );
  };

  const calendarCells = buildCalendarCells(calendarCursor);
  const monthLabel = `${calendarCursor.toLocaleString("pt-BR", { month: "long" })} ${calendarCursor.getFullYear()}`;

  return (
    <Section title="Dashboard de pedidos">
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Período</Text>
        <View style={styles.row}>
          <Pressable
            style={styles.selectTrigger}
            onPress={() => {
              setRangeSelection("start");
              setCalendarCursor(parseLocalDateKey(normalizedRange.startKey));
              setIsRangeModalVisible(true);
            }}
          >
            <Text style={styles.selectValueText}>{normalizedRange.startKey} até {normalizedRange.endKey}</Text>
          </Pressable>
	          {[
	            { key: "today" as const, label: "Hoje" },
	            { key: "yesterday" as const, label: "Ontem" },
	            { key: "7d" as const, label: "7 dias" },
	            { key: "15d" as const, label: "15 dias" },
	            { key: "30d" as const, label: "30 dias" },
	          ].map((quickRange) => (
	            <AppButton
	              key={quickRange.key}
	              label={quickRange.label}
	              variant="small"
	              active={activeQuickRange === quickRange.key}
	              onPress={() => setQuickRange(quickRange.key)}
	            />
	          ))}
	          <AppButton
	            label="Período anterior"
	            variant="small"
	            active={comparisonMode === "previous"}
	            onPress={() => setComparisonMode("previous")}
	          />
	          <AppButton
	            label="30 dias antes"
	            variant="small"
	            active={comparisonMode === "same_30_days_before"}
	            onPress={() => setComparisonMode("same_30_days_before")}
	          />
        </View>
        <Text style={styles.text}>Comparando com: {comparisonRange.label}</Text>
      </View>

      <View style={styles.marketplaceMetricGrid}>
        {metricCards.map((metric) => (
          <Pressable
            key={metric.key}
            style={[
              styles.marketplaceMetricCard,
              selectedMetricChart === metric.key && styles.marketplaceMetricCardActive,
            ]}
            onPress={() => setSelectedMetricChart((current) => (current === metric.key ? null : metric.key))}
          >
            <Text style={styles.marketplaceMetricLabel}>{metric.label}</Text>
            <Text style={styles.marketplaceMetricValue}>{metric.value}</Text>
            {renderComparison(metric.currentValue, metric.previousValue, metric.formatter)}
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Product Ads no período</Text>
        <View style={styles.marketplaceMetricGrid}>
          <View style={styles.marketplaceMetricCard}>
            <Text style={styles.marketplaceMetricLabel}>Gasto Mercado Ads</Text>
            <Text style={styles.marketplaceMetricValue}>{money(productAds?.totals.cost_cents ?? 0)}</Text>
          </View>
          <View style={styles.marketplaceMetricCard}>
            <Text style={styles.marketplaceMetricLabel}>Impressões</Text>
            <Text style={styles.marketplaceMetricValue}>{productAds?.totals.impressions ?? 0}</Text>
          </View>
          <View style={styles.marketplaceMetricCard}>
            <Text style={styles.marketplaceMetricLabel}>Cliques</Text>
            <Text style={styles.marketplaceMetricValue}>{productAds?.totals.clicks ?? 0}</Text>
          </View>
          <View style={styles.marketplaceMetricCard}>
            <Text style={styles.marketplaceMetricLabel}>Compras Ads</Text>
            <Text style={styles.marketplaceMetricValue}>{productAds?.totals.orders ?? 0}</Text>
          </View>
        </View>
        {productAds?.daily?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productAdsChartScroll}>
            {productAds.daily.map((item) => (
              <View key={item.date} style={styles.productAdsBarWrap}>
                <Text style={styles.productAdsBarValue}>{money(item.cost_cents)}</Text>
                <View style={styles.productAdsBarTrack}>
                  <View
                    style={[
                      styles.productAdsBarFill,
                      { height: `${Math.max(4, (item.cost_cents / productAdsMaxCostCents) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.productAdsBarLabel}>{item.date.slice(5)}</Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.text}>Sem dados de Product Ads para o período ou conta sem Mercado Ads habilitado.</Text>
        )}
        {productAds?.accounts?.some((item) => item.status !== "ok") ? (
          <Text style={styles.marketplaceMetricPrevious}>
            Algumas contas não retornaram Product Ads:{" "}
            {productAds.accounts
              .filter((item) => item.status !== "ok")
              .map((item) => item.message ?? item.status)
              .join(" | ")}
          </Text>
        ) : null}
      </View>

      {selectedMetric && metricChartData ? (
        <View style={styles.card}>
          <View style={styles.marketplaceMetricChartHeader}>
            <View>
              <Text style={styles.cardTitle}>{selectedMetric.label} por dia</Text>
              <Text style={styles.text}>Atual vs. {comparisonRange.label}</Text>
            </View>
            <Text style={styles.marketplaceMetricChartScale}>
              {selectedMetric.formatter(metricChartData.minValue)} - {selectedMetric.formatter(metricChartData.maxValue)}
            </Text>
          </View>
          <View style={styles.marketplaceMetricChartLegend}>
            <View style={styles.marketplaceLogisticsLegendItem}>
              <View style={[styles.marketplaceLogisticsLegendSwatch, { backgroundColor: "#1e3a79" }]} />
              <Text style={styles.text}>Período selecionado</Text>
            </View>
            <View style={styles.marketplaceLogisticsLegendItem}>
              <View style={[styles.marketplaceLogisticsLegendSwatch, { backgroundColor: "#93b4ef" }]} />
              <Text style={styles.text}>Período anterior</Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.marketplaceMetricChartScrollContent}>
            <View style={styles.marketplaceMetricChartLayout}>
              <View style={[styles.marketplaceMetricChartScaleAxis, { height: metricChartHeight }]}>
                <Text style={styles.marketplaceMetricChartAxisText}>{selectedMetric.formatter(metricChartData.maxValue)}</Text>
                <Text style={styles.marketplaceMetricChartAxisText}>
                  {selectedMetric.formatter(Math.round((metricChartData.maxValue + metricChartData.minValue) / 2))}
                </Text>
                <Text style={styles.marketplaceMetricChartAxisText}>{selectedMetric.formatter(metricChartData.minValue)}</Text>
              </View>
              <View style={styles.marketplaceMetricChartFrame}>
                <View style={styles.marketplaceMetricChartGridLineTop} />
                <View style={styles.marketplaceMetricChartGridLineMiddle} />
                <View style={styles.marketplaceMetricChartGridLineBottom} />
                <View style={[styles.marketplaceMetricChartCanvas, { width: metricChartWidth, height: metricChartHeight }]}>
                  {renderMetricLine(
                    metricChartData.previous.values,
                    metricChartData.previous.labels,
                    metricChartData.maxValue,
                    metricChartData.minValue,
                    "#93b4ef",
                    "Período anterior",
                    0.9
                  )}
                  {renderMetricLine(
                    metricChartData.current.values,
                    metricChartData.current.labels,
                    metricChartData.maxValue,
                    metricChartData.minValue,
                    "#1e3a79",
                    "Período selecionado",
                    1
                  )}
                  {hoveredMetricPoint ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.marketplaceMetricChartTooltip,
                        {
                          left: Math.min(Math.max(hoveredMetricPoint.x - 74, 0), metricChartWidth - 148),
                          top: Math.max(hoveredMetricPoint.y - 58, 0),
                          borderColor: hoveredMetricPoint.color,
                        },
                      ]}
                    >
                      <Text style={styles.marketplaceMetricChartTooltipTitle}>{hoveredMetricPoint.seriesLabel}</Text>
                      <Text style={styles.marketplaceMetricChartTooltipText}>
                        {hoveredMetricPoint.label}: {selectedMetric.formatter(hoveredMetricPoint.value)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={[styles.marketplaceMetricChartAxis, { width: metricChartWidth }]}>
                  <Text style={styles.marketplaceMetricChartAxisText}>{metricChartData.current.labels[0] ?? ""}</Text>
                  <Text style={styles.marketplaceMetricChartAxisText}>
                    {metricChartData.current.labels[metricChartData.current.labels.length - 1] ?? ""}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.row}>
        <AppButton
          label="Gráficos"
          variant="small"
          active={areChartsVisible}
          onPress={() => setAreChartsVisible((prev) => !prev)}
          style={styles.marketplaceChartsToggleButton}
          textStyle={styles.marketplaceChartsToggleButtonText}
        />
        <AppButton
          label="Status de estoque"
          variant="small"
          active={areStockStatusesVisible}
          onPress={() => setAreStockStatusesVisible((prev) => !prev)}
        />
      </View>

      {areChartsVisible && <View style={styles.marketplaceChartsGrid}>
        <View style={[styles.card, styles.marketplaceChartCard]}>
          <Text style={styles.cardTitle}>Pedidos por logística</Text>
          {logisticsDistribution.length === 0 ? (
            <Text style={styles.text}>Nenhum pedido encontrado para o período e filtros atuais.</Text>
          ) : (
            <View style={styles.marketplaceLogisticsChartWrap}>
              <View style={styles.marketplaceLogisticsPieOuter}>
                <View
                  style={[
                    styles.marketplaceLogisticsPie,
                    Platform.OS === "web"
                      ? ({ backgroundImage: logisticsPieGradient } as ViewStyle & { backgroundImage: string })
                      : { backgroundColor: logisticsDistribution[0]?.color ?? "#eef3ff" },
                  ]}
                >
                  <View style={styles.marketplaceLogisticsPieCenter}>
                    <Text style={styles.marketplaceLogisticsPieTotal}>{currentOrders.length}</Text>
                    <Text style={styles.marketplaceLogisticsPieLabel}>pedidos</Text>
                  </View>
                </View>
              </View>
              <View style={styles.marketplaceLogisticsLegend}>
                {logisticsDistribution.map((item) => (
                  <View key={item.label} style={styles.marketplaceLogisticsLegendItem}>
                    <View style={[styles.marketplaceLogisticsLegendSwatch, { backgroundColor: item.color }]} />
                    <Text style={styles.text}>
                      {item.label}: {item.count} ({item.percent.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                      %)
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={[styles.card, styles.marketplaceChartCard]}>
          <Text style={styles.cardTitle}>Pedidos por conta</Text>
          {accountDistribution.length === 0 ? (
            <Text style={styles.text}>Nenhum pedido encontrado para o período e filtros atuais.</Text>
          ) : (
            <View style={styles.marketplaceLogisticsChartWrap}>
              <View style={styles.marketplaceLogisticsPieOuter}>
                <View
                  style={[
                    styles.marketplaceLogisticsPie,
                    Platform.OS === "web"
                      ? ({ backgroundImage: accountPieGradient } as ViewStyle & { backgroundImage: string })
                      : { backgroundColor: accountDistribution[0]?.color ?? "#eef3ff" },
                  ]}
                >
                  <View style={styles.marketplaceLogisticsPieCenter}>
                    <Text style={styles.marketplaceLogisticsPieTotal}>{currentOrders.length}</Text>
                    <Text style={styles.marketplaceLogisticsPieLabel}>pedidos</Text>
                  </View>
                </View>
              </View>
              <View style={styles.marketplaceLogisticsLegend}>
                {accountDistribution.map((item) => (
                  <View key={item.accountId} style={styles.marketplaceLogisticsLegendItem}>
                    <View style={[styles.marketplaceLogisticsLegendSwatch, { backgroundColor: item.color }]} />
                    <Text style={styles.text}>
                      {maskSensitiveText(item.label, isPrivacyMode, PRIVACY_MASK)}: {item.count} ({item.percent.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                      %)
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Filtros</Text>
        <View style={styles.row}>
          <View style={styles.marketplaceFilterGroup}>
            <Text style={styles.fieldLabel}>Logística</Text>
            <View style={styles.row}>
	              <AppButton
	                label="Todas"
	                variant="small"
	                active={logisticFilter === "__all__"}
	                onPress={() => setLogisticFilter("__all__")}
	              />
              {logisticOptions.map((option) => (
                <AppButton
                  key={option.value}
                  label={option.label}
                  variant="small"
                  active={logisticFilter === option.value}
                  onPress={() => setLogisticFilter(option.value)}
                />
              ))}
            </View>
          </View>

          <View style={styles.marketplaceFilterGroup}>
            <Text style={styles.fieldLabel}>Status</Text>
            <View style={styles.row}>
	              <AppButton
	                label="Todos"
	                variant="small"
	                active={statusFilter === "__all__"}
	                onPress={() => setStatusFilter("__all__")}
	              />
	              {statusOptions.map((option) => (
	                <AppButton
	                  key={option}
	                  label={option}
	                  variant="small"
	                  active={statusFilter === option}
	                  onPress={() => setStatusFilter(option)}
	                />
	              ))}
            </View>
          </View>

	          <AppButton
	            label="Esconder canceladas"
	            variant="small"
	            active={hideCancelled}
	            onPress={() => setHideCancelled((prev) => !prev)}
	          />
	          <AppButton
	            label="Recalcular snapshots"
	            variant="small"
	            onPress={onRecalculateAllOrderSnapshots}
	            disabled={isBusy}
	          />
        </View>
      </View>

      {areStockStatusesVisible && <View style={styles.card}>
        <Text style={styles.cardTitle}>Pendências de estoque marketplace</Text>
        <View style={styles.marketplaceStockStatusGrid}>
          <View style={styles.marketplaceStockStatusPill}>
            <Text style={styles.marketplaceMetricLabel}>Sem SKU</Text>
            <Text style={styles.marketplaceStockStatusValue}>{stockStatusCounts.missing_sku}</Text>
          </View>
          <View style={styles.marketplaceStockStatusPill}>
            <Text style={styles.marketplaceMetricLabel}>Baixa pendente</Text>
            <Text style={styles.marketplaceStockStatusValue}>{stockStatusCounts.pending_movement}</Text>
          </View>
          <View style={styles.marketplaceStockStatusPill}>
            <Text style={styles.marketplaceMetricLabel}>Baixados</Text>
            <Text style={styles.marketplaceStockStatusValue}>{stockStatusCounts.moved}</Text>
          </View>
          <View style={styles.marketplaceStockStatusPill}>
            <Text style={styles.marketplaceMetricLabel}>Fulfillment ignorado</Text>
            <Text style={styles.marketplaceStockStatusValue}>{stockStatusCounts.ignored_fulfillment}</Text>
          </View>
        </View>
        {stockPendingItems.length === 0 ? (
          <Text style={styles.text}>Nenhuma pendência de estoque nos pedidos filtrados.</Text>
        ) : (
          <View style={styles.marketplaceStockPendingList}>
            {stockPendingItems.map(({ order, item }) => (
              <View key={item.id} style={styles.marketplaceStockPendingItem}>
                <View style={styles.marketplaceStockPendingText}>
                  <Text style={styles.text}>
                    {item.stock_status?.label ?? "Pendente"} | Pedido{" "}
                    {maskSensitiveText(order.marketplace_order_id, isPrivacyMode, PRIVACY_MASK)}
                  </Text>
                  <Text style={styles.text}>{maskSensitiveText(item.title, isPrivacyMode, PRIVACY_MASK)}</Text>
                  <Text style={styles.marketplaceMetricPrevious}>
                    Qtd: {item.quantity} | Esperado: {item.stock_status?.expected_delta ?? 0} | Movido:{" "}
                    {item.stock_status?.moved_delta ?? 0}
                  </Text>
                  <Text style={styles.marketplaceMetricPrevious}>{item.stock_status?.summary ?? "-"}</Text>
                </View>
                {item.stock_status?.code === "missing_sku" ? (
                  <AppButton
                    label="Vincular SKU"
                    variant="small"
                    active
                    onPress={() =>
                      onOpenSkuLinking({
                        accountId: order.account_id,
                        marketplaceItemId: item.marketplace_item_id,
                        marketplaceVariationId: item.effective_marketplace_variation_id,
                        variationKey: item.effective_variation_key,
                        catalogVariationId: item.current_linked_catalog_variation_id,
                      })
                    }
                  />
                ) : (
                  <AppButton
                    label="Recalcular pedido"
                    variant="small"
                    onPress={() => onRecalculateSingleOrderSnapshot(order.id)}
                    disabled={isBusy}
                  />
                )}
              </View>
            ))}
          </View>
        )}
      </View>}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pedidos filtrados ({currentOrders.length})</Text>
        <View style={styles.row}>
          {[
            { key: "total_desc" as const, label: "Maior valor" },
            { key: "total_asc" as const, label: "Menor valor" },
            { key: "profit_desc" as const, label: "Maior lucro" },
            { key: "profit_asc" as const, label: "Menor lucro" },
            { key: "date_desc" as const, label: "Mais recente" },
            { key: "date_asc" as const, label: "Mais antigo" },
          ].map((option) => (
            <AppButton
              key={option.key}
              label={option.label}
              variant="small"
              active={ordersSortKey === option.key}
              onPress={() => setOrdersSortKey(option.key)}
            />
          ))}
        </View>
        {currentOrders.length === 0 ? (
          <Text style={styles.text}>Nenhum pedido encontrado para o período e filtros atuais.</Text>
        ) : (
          currentOrders.map((order) => {
            const isExpanded = Boolean(expandedOrderIds[order.id]);
            const baseReceived = order.metrics?.netReceivedCents ?? order.metrics?.grossRevenueCents ?? 0;
            const estimatedTaxCents = Math.round((order.metrics?.grossRevenueCents ?? 0) * (taxRatePercent / 100));
            const grossProfitCents = baseReceived - (order.metrics?.productionCostCents ?? 0) - estimatedTaxCents;
            const orderDetailUrl = `https://www.mercadolivre.com.br/vendas/${encodeURIComponent(
              order.marketplace_order_id
            )}/detalhe`;

            return (
              <Pressable
                key={order.id}
                style={styles.marketplaceCompactOrderCard}
                onPress={() => setExpandedOrderIds((prev) => ({ ...prev, [order.id]: !isExpanded }))}
              >
                <View style={styles.marketplaceCompactOrderHeader}>
                  <View style={styles.marketplaceCompactOrderBuyer}>
                    <Text style={styles.cardTitle}>
                      {maskSensitiveText(order.buyer_nickname || order.buyer_id || "Comprador não informado", isPrivacyMode, PRIVACY_MASK)}
                    </Text>
                    <Text style={styles.text}>Pedido {maskSensitiveText(order.marketplace_order_id, isPrivacyMode, PRIVACY_MASK)}</Text>
                  </View>
                  <View style={styles.marketplaceCompactOrderNumbers}>
                    <Text style={styles.marketplaceOrderRevenue}>{money(order.metrics?.grossRevenueCents ?? 0)}</Text>
                    <Text style={grossProfitCents >= 0 ? styles.marketplaceOrderProfitPositive : styles.marketplaceOrderProfitNegative}>
                      Lucro {money(grossProfitCents)}
                    </Text>
                  </View>
                </View>

                {isExpanded ? (
                  <View style={styles.marketplaceOrderDetails}>
                    <View style={styles.row}>
	                      <AppButton
	                        label="Recalcular pedido"
	                        variant="small"
	                        onPress={() => onRecalculateSingleOrderSnapshot(order.id)}
	                        disabled={isBusy}
	                      />
                      <AppButton
                        label="ir ao detalhe"
                        variant="small"
                        active
                        onPress={() => {
                          void Linking.openURL(orderDetailUrl);
                        }}
                      />
                    </View>
                    <Text style={styles.text}>Status: {order.status || "-"} {order.substatus ? `(${order.substatus})` : ""}</Text>
                    <Text style={styles.text}>
                      Logística:{" "}
                      {resolveMarketplaceNormalizedLabel(
                        normalizationRules,
                        "shipping_logistic_type",
                        order.shipping_logistic_type,
                        "-"
                      )}{" "}
                      | Modo: {order.shipping_mode || "-"} | Tipo: {order.shipping_type || "-"}
                    </Text>
                    <Text style={styles.text}>Envio: {order.shipping_status || "-"} {order.shipping_substatus ? `(${order.shipping_substatus})` : ""} | Etapa: {shippingStageLabel(order.shipping_stage)}</Text>
                    <Text style={styles.text}>Data: {dateTime(order.date_created || order.updated_at || "")}</Text>
                    <Text style={styles.text}>Faturado: {money(order.metrics?.grossRevenueCents ?? 0)}</Text>
                    <Text style={styles.text}>Recebido ML: {order.metrics?.netReceivedCents !== null && order.metrics?.netReceivedCents !== undefined ? money(order.metrics.netReceivedCents) : "Aguardando consolidação"}</Text>
                    <Text style={styles.text}>Taxa ML: {order.ml_fee_total_cents !== null ? money(order.ml_fee_total_cents) : "-"}</Text>
                    <Text style={styles.text}>Frete: {order.shipping_cost_cents !== null ? money(order.shipping_cost_cents) : "-"} | Compensação: {order.shipping_compensation_cents !== null ? money(order.shipping_compensation_cents) : "-"}</Text>
                    <Text style={styles.text}>Imposto estimado ({taxRatePercent.toFixed(2)}%): {money(estimatedTaxCents)}</Text>
                    <Text style={styles.text}>Custo dos produtos: {money(order.metrics?.productionCostCents ?? 0)}</Text>
                    <Text style={styles.text}>Itens vendidos: {order.metrics?.unitsSold ?? 0}</Text>
                    <Text style={styles.text}>Snapshot: {order.snapshot_status?.label ?? "Sem status"} - {order.snapshot_status?.summary ?? "-"}</Text>
                    <Text style={styles.cardTitle}>Itens</Text>
	                    {order.order_items.map((item) => {
	                      const hasLinkedSku = Boolean(item.current_linked_sku_id);
	                      return (
	                        <View
	                          key={item.id}
	                          style={[
	                            styles.marketplaceOrderItemCompact,
	                            !hasLinkedSku && styles.marketplaceOrderItemMissingSku,
	                          ]}
	                        >
	                          <Text style={styles.text}>{maskSensitiveText(item.title, isPrivacyMode, PRIVACY_MASK)}</Text>
	                          <Text style={styles.text}>
	                            Qtd: {item.quantity} | SKU:{" "}
	                            {hasLinkedSku
	                              ? maskSensitiveComposite(
	                                  [item.current_linked_sku_code, item.current_linked_sku_name],
	                                  isPrivacyMode,
	                                  "SKU vinculado"
	                                )
	                              : "Sem SKU vinculado"}
	                          </Text>
                            <Text style={styles.marketplaceMetricPrevious}>
                              Estoque: {item.stock_status?.label ?? "Sem status"} - {item.stock_status?.summary ?? "-"}
                            </Text>
	                          {!hasLinkedSku ? (
	                            <View style={styles.marketplaceMissingSkuActions}>
	                              <Text style={styles.marketplaceMissingSkuText}>
	                                Este SKU do marketplace ainda não possui SKU local vinculado.
	                              </Text>
	                              <AppButton
	                                label="Vincular SKU"
	                                variant="small"
	                                active
	                                onPress={() =>
	                                  onOpenSkuLinking({
	                                    accountId: order.account_id,
	                                    marketplaceItemId: item.marketplace_item_id,
	                                    marketplaceVariationId: item.effective_marketplace_variation_id,
	                                    variationKey: item.effective_variation_key,
	                                    catalogVariationId: item.current_linked_catalog_variation_id,
	                                  })
	                                }
	                              />
	                            </View>
	                          ) : null}
	                        </View>
	                      );
	                    })}
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}
      </View>

      <Modal
        transparent
        visible={isRangeModalVisible}
        animationType="fade"
        onRequestClose={() => setIsRangeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Selecionar período</Text>
            <View style={styles.row}>
	              <AppButton
	                label={`Inicial: ${rangeStart}`}
	                variant="small"
	                active={rangeSelection === "start"}
	                onPress={() => {
	                  setRangeSelection("start");
	                  setCalendarCursor(parseLocalDateKey(rangeStart));
	                }}
	              />
	              <AppButton
	                label={`Final: ${rangeEnd}`}
	                variant="small"
	                active={rangeSelection === "end"}
	                onPress={() => {
	                  setRangeSelection("end");
	                  setCalendarCursor(parseLocalDateKey(rangeEnd));
	                }}
	              />
            </View>
            <View style={styles.calendarHeaderRow}>
	              <AppButton label="<" variant="small" onPress={() => setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} />
	              <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
	              <AppButton label=">" variant="small" onPress={() => setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} />
            </View>
            <View style={styles.calendarGrid}>
              {WEEK_DAYS.map((dayName) => (
                <Text key={dayName} style={styles.calendarWeekDay}>{dayName}</Text>
              ))}
              {calendarCells.map((cell, index) => {
                if (!cell) return <View key={`orders-empty-${index}`} style={styles.calendarDayEmpty} />;
                const dayKey = formatLocalDateKey(cell);
                const time = startOfLocalDay(cell).getTime();
                const inRange = time >= normalizedRange.startDate.getTime() && time <= normalizedRange.endDate.getTime();
                const isEdge = dayKey === normalizedRange.startKey || dayKey === normalizedRange.endKey;
                return (
                  <Pressable
                    key={`orders-${dayKey}`}
                    style={[
                      styles.calendarDayButton,
                      inRange && styles.marketplaceCalendarDayInRange,
                      isEdge && styles.calendarDayButtonSelected,
                    ]}
	                    onPress={() => {
	                      setActiveQuickRange(null);
	                      if (rangeSelection === "start") {
	                        setRangeStart(dayKey);
                        setRangeSelection("end");
                      } else {
                        setRangeEnd(dayKey);
                        setRangeSelection("start");
                      }
                    }}
                  >
                    <Text style={[styles.calendarDayText, isEdge && styles.calendarDayTextSelected]}>{cell.getDate()}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.modalMessage}>Período: {normalizedRange.startKey} até {normalizedRange.endKey}</Text>
            <View style={styles.row}>
	              <AppButton label="Fechar" variant="secondary" onPress={() => setIsRangeModalVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </Section>
  );
}

function MarketplacesScreen({
  status,
  shopeeStatus,
  catalogVariationItems,
  orderItems,
  ordersDashboard,
  normalizationRules,
  onStartMercadoLivreAuth,
  onStartShopeeAuth,
  onRefreshStatus,
  onRefreshShopeeStatus,
  onSyncCatalog,
  onSyncOrders,
  onSyncProductAds,
  onDisconnectAll,
  onDisconnectShopee,
  onSetListingIgnored,
  onSaveNormalizationRules,
  onRunCustomRequest,
  isBusy,
  infoMessage,
  isPrivacyMode,
}: {
  status: MarketplaceStatusResponse | null;
  shopeeStatus: MarketplaceStatusResponse | null;
  catalogVariationItems: MarketplaceCatalogVariationItem[];
  orderItems: MarketplaceOrderItem[];
  ordersDashboard: MarketplaceOrdersDashboardResponse | null;
  normalizationRules: MarketplaceNormalizationRule[];
  onStartMercadoLivreAuth: () => void;
  onStartShopeeAuth: () => void;
  onRefreshStatus: () => void;
  onRefreshShopeeStatus: () => void;
  onSyncCatalog: (accountId?: string) => void;
  onSyncOrders: (accountId: string | undefined, mode: MarketplaceOrdersSyncMode) => void;
  onSyncProductAds: (accountId: string | undefined, mode: MarketplaceOrdersSyncMode) => void;
  onDisconnectAll: () => void;
  onDisconnectShopee: () => void;
  onSetListingIgnored: (listingId: string, isIgnored: boolean) => Promise<void>;
  onSaveNormalizationRules: (rules: Array<{ raw_value: string; normalized_label: string; is_active: boolean }>) => Promise<void>;
  onRunCustomRequest: (params: {
    accountId: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    headers: Record<string, string>;
    body: string;
  }) => Promise<MarketplaceCustomRequestResponse>;
  isBusy: boolean;
  infoMessage: string | null;
  isPrivacyMode: boolean;
}) {
  const marketplaceConfigured = status?.configured ?? false;
  const marketplaceConnected = status?.connected ?? false;
  const accounts = status?.accounts ?? [];
  const refreshErrors = status?.refresh_errors ?? [];
  const shopeeConfigured = shopeeStatus?.configured ?? false;
  const shopeeConnected = shopeeStatus?.connected ?? false;
  const shopeeAccounts = shopeeStatus?.accounts ?? [];
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  const [showCatalogByAccount, setShowCatalogByAccount] = useState<Record<string, boolean>>({});
  const [showOrdersByAccount, setShowOrdersByAccount] = useState<Record<string, boolean>>({});
  const [requestMethodByAccount, setRequestMethodByAccount] = useState<Record<string, "GET" | "POST" | "PUT" | "PATCH" | "DELETE">>({});
  const [requestPathByAccount, setRequestPathByAccount] = useState<Record<string, string>>({});
  const [requestBodyByAccount, setRequestBodyByAccount] = useState<Record<string, string>>({});
  const [requestHeadersByAccount, setRequestHeadersByAccount] = useState<Record<string, string>>({});
  const [requestResultByAccount, setRequestResultByAccount] = useState<Record<string, string>>({});
  const [requestLoadingByAccount, setRequestLoadingByAccount] = useState<Record<string, boolean>>({});
  const [requestErrorByAccount, setRequestErrorByAccount] = useState<Record<string, string | null>>({});
  const [listingIgnoreSavingById, setListingIgnoreSavingById] = useState<Record<string, boolean>>({});
  const [listingIgnoreErrorById, setListingIgnoreErrorById] = useState<Record<string, string | null>>({});
  const [normalizationDraft, setNormalizationDraft] = useState<Record<string, string>>({});
  const [isSavingNormalization, setIsSavingNormalization] = useState(false);

  useEffect(() => {
    setNormalizationDraft(
      Object.fromEntries(
        normalizationRules
          .filter((rule) => rule.category === "shipping_logistic_type")
          .map((rule) => [rule.raw_value, rule.normalized_label])
      )
    );
  }, [normalizationRules]);

  const handleRunCustomRequest = (accountId: string) => {
    void (async () => {
      const method = requestMethodByAccount[accountId] ?? "GET";
      const path = (requestPathByAccount[accountId] ?? "/users/me").trim();
      const body = requestBodyByAccount[accountId] ?? "";
      const headersRaw = requestHeadersByAccount[accountId] ?? "{}";

      if (!path) {
        setRequestErrorByAccount((prev) => ({ ...prev, [accountId]: "Informe um path da API." }));
        return;
      }

      let customHeaders: Record<string, string> = {};
      try {
        const parsed = headersRaw.trim() ? JSON.parse(headersRaw) : {};
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Headers inválidos");
        }
        customHeaders = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>)
            .filter(([k, v]) => k.trim().length > 0 && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
            .map(([k, v]) => [k, String(v)])
        );
      } catch {
        setRequestErrorByAccount((prev) => ({
          ...prev,
          [accountId]: "Headers inválidos. Use JSON objeto, ex.: {\"x-test\":\"123\"}",
        }));
        return;
      }

      try {
        setRequestLoadingByAccount((prev) => ({ ...prev, [accountId]: true }));
        setRequestErrorByAccount((prev) => ({ ...prev, [accountId]: null }));
        const response = await onRunCustomRequest({
          accountId,
          method,
          path,
          headers: customHeaders,
          body,
        });
        setRequestResultByAccount((prev) => ({
          ...prev,
          [accountId]: JSON.stringify(response, null, 2),
        }));
      } catch (error: any) {
        setRequestErrorByAccount((prev) => ({
          ...prev,
          [accountId]: error?.message ?? "Falha ao executar request customizado",
        }));
      } finally {
        setRequestLoadingByAccount((prev) => ({ ...prev, [accountId]: false }));
      }
    })();
  };

  const mostRecentIso = (values: Array<string | null | undefined>): string | null => {
    const valid = values
      .map((value) => {
        const iso = value ?? "";
        return Number.isFinite(Date.parse(iso)) ? iso : null;
      })
      .filter((value): value is string => Boolean(value));
    if (!valid.length) return null;
    return valid.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Marketplaces {'>'} Configurações</Text>
      <Text style={styles.pageSubtitle}>Autorização, diagnóstico e sincronização manual</Text>

      <Section title="Configurações">
        {!marketplaceConfigured ? (
          <View style={styles.errorBannerInline}>
            <Text style={styles.errorText}>
              Backend não configurado. Defina ML_APP_ID, ML_CLIENT_SECRET e ML_REDIRECT_URI no backend/.env.
            </Text>
          </View>
        ) : null}

        {infoMessage ? (
          <View style={styles.infoBannerInline}>
            <Text style={styles.statusText}>{infoMessage}</Text>
          </View>
        ) : null}

        <Text style={styles.text}>Status da integração: {marketplaceConnected ? "Conectado" : "Não conectado"}</Text>
        <Text style={styles.text}>Contas ativas: {accounts.length}</Text>

        <View style={styles.row}>
          <Pressable
            style={[styles.primaryButtonFixed, isBusy && styles.buttonDisabled]}
            onPress={onStartMercadoLivreAuth}
            disabled={isBusy}
          >
            <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
              Iniciar autorização
            </Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, isBusy && styles.buttonDisabled]}
            onPress={onRefreshStatus}
            disabled={isBusy}
          >
            <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
              Atualizar status
            </Text>
          </Pressable>
          <Pressable
            style={[styles.dangerButton, isBusy && styles.buttonDisabled]}
            onPress={onDisconnectAll}
            disabled={isBusy || accounts.length === 0}
          >
            <Text allowFontScaling={false} numberOfLines={1} style={styles.dangerButtonText}>
              Desconectar
            </Text>
          </Pressable>
        </View>
      </Section>

      <Section title="Shopee">
        {!shopeeConfigured ? (
          <View style={styles.errorBannerInline}>
            <Text style={styles.errorText}>
              Backend não configurado. Defina SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY e SHOPEE_REDIRECT_URI no backend/.env.
            </Text>
          </View>
        ) : null}

        <Text style={styles.text}>Status da integração: {shopeeConnected ? "Conectado" : "Não conectado"}</Text>
        <Text style={styles.text}>Lojas ativas: {shopeeAccounts.length}</Text>
        {shopeeAccounts.map((account) => (
          <View key={account.id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {maskSensitiveText(account.seller_nickname || `Shopee ${account.marketplace_user_id}`, isPrivacyMode, PRIVACY_MASK)}
            </Text>
            <Text style={styles.text}>
              Shop ID: {maskSensitiveText(account.marketplace_user_id, isPrivacyMode, PRIVACY_MASK)}
            </Text>
            <Text style={styles.text}>Token: {account.token_status}</Text>
            <Text style={styles.text}>Conectado em: {dateTime(account.last_connected_at || "")}</Text>
          </View>
        ))}

        <View style={styles.row}>
          <AppButton
            label="Iniciar autorização Shopee"
            variant="primary"
            onPress={onStartShopeeAuth}
            disabled={isBusy}
          />
          <AppButton
            label="Atualizar Shopee"
            variant="secondary"
            onPress={onRefreshShopeeStatus}
            disabled={isBusy}
          />
          <AppButton
            label="Desconectar Shopee"
            variant="danger"
            onPress={onDisconnectShopee}
            disabled={isBusy || shopeeAccounts.length === 0}
          />
        </View>
      </Section>

      <Section title="Normalização de nomes">
        <Text style={styles.text}>Tipos de logística do Mercado Livre exibidos nos dashboards e filtros.</Text>
        {["drop_off", "fullfilment", "fulfillment", "self_service", "xd_drop_off"].map((rawValue) => (
          <Field
            key={rawValue}
            label={rawValue}
            value={normalizationDraft[rawValue] ?? ""}
            onChangeText={(value) => setNormalizationDraft((prev) => ({ ...prev, [rawValue]: value }))}
          />
        ))}
        <View style={styles.row}>
          <AppButton
            label={isSavingNormalization ? "Salvando..." : "Salvar normalização"}
            variant="primary"
            disabled={isSavingNormalization}
            onPress={() => {
              void (async () => {
                try {
                  setIsSavingNormalization(true);
                  await onSaveNormalizationRules(
                    Object.entries(normalizationDraft)
                      .filter(([rawValue, label]) => rawValue.trim() && label.trim())
                      .map(([rawValue, label]) => ({
                        raw_value: rawValue.trim(),
                        normalized_label: label.trim(),
                        is_active: true,
                      }))
                  );
                } finally {
                  setIsSavingNormalization(false);
                }
              })();
            }}
          />
        </View>
      </Section>

      <Section title="Diagnóstico">
        <Text style={styles.text}>Status por marketplace com listas ocultas por padrão.</Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => setShowDiagnostics((prev) => !prev)}
        >
          <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
            {showDiagnostics ? "Ocultar diagnóstico" : "Mostrar diagnóstico"}
          </Text>
        </Pressable>

        {showDiagnostics ? (
          <View style={styles.fieldWrap}>
            {accounts.length === 0 ? (
              <Text style={styles.text}>Nenhuma conta conectada ainda.</Text>
            ) : (
              accounts.map((account) => (
                <View key={account.id} style={styles.section}>
                  <Text style={styles.sectionTitle}>Marketplace: Mercado Livre</Text>
                  <View style={styles.card}>
                  <Text style={styles.cardTitle}>
                    {maskSensitiveText(account.seller_nickname || `Seller ${account.marketplace_user_id}`, isPrivacyMode, PRIVACY_MASK)}
                  </Text>
                  <Text style={styles.text}>
                    ID marketplace: {maskSensitiveText(account.marketplace_user_id, isPrivacyMode, PRIVACY_MASK)}
                  </Text>
                  <Text style={styles.text}>País: {account.country_id || "-"}</Text>
                  <Text style={styles.text}>
                    Login: {maskSensitiveText(account.seller_nickname || account.marketplace_user_id, isPrivacyMode, PRIVACY_MASK)}
                  </Text>
                  <Text style={styles.text}>Conectado em: {dateTime(account.last_connected_at || "")}</Text>
                  <Text style={styles.text}>Último refresh token: {dateTime(account.last_token_refresh_at || "")}</Text>
                  <Text style={styles.text}>
                    Anúncios: {catalogVariationItems.filter((item) => item.account_id === account.id).length}
                  </Text>
                  <Text style={styles.text}>
                    Vendas: {orderItems.filter((item) => item.account_id === account.id).length}
                  </Text>
                  <Text style={styles.text}>
                    Última sincronização: {dateTime(
                      mostRecentIso([
                        ...catalogVariationItems
                          .filter((item) => item.account_id === account.id)
                          .map((item) => item.updated_at || item.last_seen_at),
                        ...orderItems
                          .filter((item) => item.account_id === account.id)
                          .map((item) => item.updated_at || item.last_seen_at),
                      ]) || ""
                    )}
                  </Text>
                  <View
                    style={[
                      styles.marketplaceTokenBadge,
                      account.token_status === "valid"
                        ? styles.marketplaceTokenBadgeOk
                        : account.token_status === "expiring_soon"
                          ? styles.marketplaceTokenBadgeWarn
                          : styles.marketplaceTokenBadgeExpired,
                    ]}
                  >
                    <Text style={styles.marketplaceTokenBadgeText}>
                      Token:{" "}
                      {account.token_status === "valid"
                        ? "Válido"
                        : account.token_status === "expiring_soon"
                          ? "Expirando"
                          : "Expirado"}
                    </Text>
                  </View>
                  <Text style={styles.text}>Sincronizações automáticas:</Text>
                  {(account.scheduled_order_syncs ?? []).map((sync) => (
                    <Text key={`${account.id}-${sync.mode}`} style={styles.text}>
                      - {sync.label}: última {sync.last_started_at ? dateTime(sync.last_started_at) : "-"} | status{" "}
                      {sync.last_status || "-"} | próxima {sync.next_run_at ? dateTime(sync.next_run_at) : "-"}
                    </Text>
                  ))}

                  <View style={styles.row}>
                    <Pressable
                      style={[styles.smallButton, isBusy && styles.buttonDisabled]}
                      onPress={() => onSyncCatalog(account.id)}
                      disabled={isBusy}
                    >
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                        Sync anúncios
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallButton, isBusy && styles.buttonDisabled]}
                      onPress={() => onSyncOrders(account.id, "incremental")}
                      disabled={isBusy}
                    >
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                        Últimas vendas
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallButton, isBusy && styles.buttonDisabled]}
                      onPress={() => onSyncOrders(account.id, "light")}
                      disabled={isBusy}
                    >
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                        Vendas 48h
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallButton, isBusy && styles.buttonDisabled]}
                      onPress={() => onSyncOrders(account.id, "normal")}
                      disabled={isBusy}
                    >
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                        Vendas 60d
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallButton, isBusy && styles.buttonDisabled]}
                      onPress={() => onSyncOrders(account.id, "full")}
                      disabled={isBusy}
                    >
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                        Vendas 1 ano
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallButton, isBusy && styles.buttonDisabled]}
                      onPress={() => onSyncProductAds(account.id, "incremental")}
                      disabled={isBusy}
                    >
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                        Ads hoje
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallButton, isBusy && styles.buttonDisabled]}
                      onPress={() => onSyncProductAds(account.id, "light")}
                      disabled={isBusy}
                    >
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                        Ads 48h
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallButton, isBusy && styles.buttonDisabled]}
                      onPress={() => onSyncProductAds(account.id, "normal")}
                      disabled={isBusy}
                    >
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                        Ads 60d
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallButton, isBusy && styles.buttonDisabled]}
                      onPress={() => onSyncProductAds(account.id, "full")}
                      disabled={isBusy}
                    >
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                        Ads 1 ano
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() =>
                        setShowCatalogByAccount((prev) => ({ ...prev, [account.id]: !prev[account.id] }))
                      }
                    >
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
                        {showCatalogByAccount[account.id] ? "Ocultar anúncios" : "Mostrar anúncios"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() =>
                        setShowOrdersByAccount((prev) => ({ ...prev, [account.id]: !prev[account.id] }))
                      }
                    >
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
                        {showOrdersByAccount[account.id] ? "Ocultar vendas" : "Mostrar vendas"}
                      </Text>
                    </Pressable>
                  </View>

                  {showCatalogByAccount[account.id] ? (
                    <>
                      <Text style={styles.cardTitle}>Lista de anúncios</Text>
                      {catalogVariationItems.filter((item) => item.account_id === account.id && isMarketplaceListingActive(item)).length === 0 ? (
                        <Text style={styles.text}>Sem anúncios sincronizados.</Text>
                      ) : (
                        catalogVariationItems
                          .filter((item) => item.account_id === account.id && isMarketplaceListingActive(item))
                          .map((item) => (
                            <View key={item.id} style={styles.card}>
                              <Text style={styles.cardTitle}>
                                {maskSensitiveText(item.title, isPrivacyMode, PRIVACY_MASK)}
                              </Text>
                              <Text style={styles.text}>
                                ID anúncio: {maskSensitiveText(item.marketplace_item_id, isPrivacyMode, PRIVACY_MASK)}
                              </Text>
                              <Text style={styles.text}>
                                ID variação: {maskSensitiveText(item.marketplace_variation_id || "principal", isPrivacyMode, PRIVACY_MASK)}
                              </Text>
                              <Text style={styles.text}>Listing type ID: {item.listing_type_id || "-"}</Text>
                              <Text style={styles.text}>Category ID: {item.category_id || "-"}</Text>
                              <Text style={styles.text}>
                                Logística: {item.shipping_logistic_type || "-"} | Modo: {item.shipping_mode || "-"} | Frete grátis: {Number(item.shipping_free ?? 0) === 1 ? "Sim" : "Não"}
                              </Text>
                              <Text style={styles.text}>Variação: {item.variation_label || "-"}</Text>
                              <Text style={styles.text}>Preço efetivo: {item.effective_price_cents !== null ? money(item.effective_price_cents) : "-"}</Text>
                              <Text style={styles.text}>Estoque: {item.available_quantity ?? "-"}</Text>
                              <Text style={styles.text}>Vendidos: {item.sold_quantity ?? "-"}</Text>
                              <Text style={styles.text}>Atualizado em: {dateTime(item.updated_at || item.last_seen_at || "")}</Text>
                              <View style={styles.marketplaceCheckboxRow}>
                                <Pressable
                                  style={[
                                    styles.marketplaceCheckboxButton,
                                    isMarketplaceListingIgnored(item) && styles.marketplaceCheckboxButtonChecked,
                                    (isBusy || listingIgnoreSavingById[item.id]) && styles.buttonDisabled,
                                  ]}
                                  disabled={isBusy || Boolean(listingIgnoreSavingById[item.id])}
                                  onPress={() => {
                                    void (async () => {
                                      try {
                                        setListingIgnoreSavingById((prev) => ({ ...prev, [item.id]: true }));
                                        setListingIgnoreErrorById((prev) => ({ ...prev, [item.id]: null }));
                                        await onSetListingIgnored(item.id, !isMarketplaceListingIgnored(item));
                                      } catch (error: any) {
                                        setListingIgnoreErrorById((prev) => ({
                                          ...prev,
                                          [item.id]: error?.message ?? "Falha ao atualizar ignorado",
                                        }));
                                      } finally {
                                        setListingIgnoreSavingById((prev) => ({ ...prev, [item.id]: false }));
                                      }
                                    })();
                                  }}
                                >
                                  <Text style={styles.marketplaceCheckboxMark}>
                                    {isMarketplaceListingIgnored(item) ? "✓" : ""}
                                  </Text>
                                </Pressable>
                                <Text style={styles.text}>
                                  Ignorar anúncio nas outras telas
                                </Text>
                              </View>
                              {listingIgnoreErrorById[item.id] ? (
                                <Text style={styles.errorText}>{listingIgnoreErrorById[item.id]}</Text>
                              ) : null}
                            </View>
                          ))
                      )}
                    </>
                  ) : null}

                  {showOrdersByAccount[account.id] ? (
                    <>
                      <Text style={styles.cardTitle}>Lista de vendas</Text>
                      {orderItems.filter((item) => item.account_id === account.id).length === 0 ? (
                        <Text style={styles.text}>Sem vendas sincronizadas.</Text>
                      ) : (
                        orderItems
                          .filter((order) => order.account_id === account.id)
                          .map((order) => (
	                            <View key={order.id} style={styles.card}>
	                              <Text style={styles.cardTitle}>
	                                Pedido {maskSensitiveText(order.marketplace_order_id, isPrivacyMode, PRIVACY_MASK)}
	                              </Text>
	                              <Text style={styles.text}>Status: {order.status || "-"} {order.substatus ? `(${order.substatus})` : ""}</Text>
	                              <Text style={styles.text}>
	                                Logística: {order.shipping_logistic_type || "-"} | Modo: {order.shipping_mode || "-"} | Tipo: {order.shipping_type || "-"}
	                              </Text>
	                              <Text style={styles.text}>
	                                Envio: {order.shipping_status || "-"} {order.shipping_substatus ? `(${order.shipping_substatus})` : ""} | Etapa: {order.shipping_stage || "-"}
	                              </Text>
	                              <Text style={styles.text}>
	                                Comprador: {maskSensitiveText(order.buyer_nickname || order.buyer_id || "-", isPrivacyMode, PRIVACY_MASK)}
                              </Text>
                              <Text style={styles.text}>Valor faturado (NF): {order.billed_total_cents !== null ? money(order.billed_total_cents) : order.order_total_cents !== null ? money(order.order_total_cents) : "-"}</Text>
                              <Text style={styles.text}>Valor líquido recebido (ML): {order.net_received_cents !== null ? money(order.net_received_cents) : "Aguardando consolidação financeira"}</Text>
                              <Text style={styles.text}>
                                Custo de produção salvo: {order.metrics ? money(order.metrics.productionCostCents) : "-"}
                              </Text>
                              <Text style={styles.text}>
                                Lucro bruto estimado: {order.metrics ? money(order.metrics.grossProfitCents) : "-"}
                              </Text>
                              <Text style={styles.text}>
                                Lucro líquido estimado:{" "}
                                {order.metrics?.netProfitCents !== null && order.metrics?.netProfitCents !== undefined
                                  ? money(order.metrics.netProfitCents)
                                  : "Aguardando consolidação financeira"}
                              </Text>
                              <Text style={styles.text}>
                                Energia {order.metrics ? money(order.metrics.energyCostCents) : "-"} | Payback{" "}
                                {order.metrics ? money(order.metrics.paybackCostCents) : "-"} | Filamentos{" "}
                                {order.metrics ? money(order.metrics.filamentCostCents) : "-"}
                              </Text>
                              <Text style={styles.text}>
                                Snapshot: {order.snapshot_status?.label ?? "Sem status"}
                              </Text>
                              <Text style={styles.text}>
                                {order.snapshot_status?.summary ?? "Sem diagnostico de snapshot."}
                              </Text>
                              <Text style={styles.text}>
                                Itens com snapshot: {order.metrics?.itemsWithCostSnapshot ?? 0}/{order.metrics?.itemsCount ?? order.order_items.length}
                              </Text>
                              <Text style={styles.cardTitle}>Itens do pedido</Text>
                              {order.order_items.map((item) => (
                                <View key={item.id} style={styles.card}>
                                  <Text style={styles.text}>
                                    ML: {maskSensitiveText(item.title, isPrivacyMode, PRIVACY_MASK)}
                                  </Text>
                                  <Text style={styles.text}>
                                    Anuncio: {maskSensitiveText(item.marketplace_item_id, isPrivacyMode, PRIVACY_MASK)} | Variacao:{" "}
                                    {maskSensitiveText(
                                      item.effective_marketplace_variation_id || item.effective_variation_key,
                                      isPrivacyMode,
                                      PRIVACY_MASK
                                    )}
                                  </Text>
                                  <Text style={styles.text}>Quantidade: {item.quantity}</Text>
                                  <Text style={styles.text}>
                                    Vinculo atual:{" "}
                                    {item.current_linked_sku_id
                                      ? maskSensitiveComposite(
                                          [item.current_linked_sku_code, item.current_linked_sku_name],
                                          isPrivacyMode,
                                          "SKU vinculado"
                                        )
                                      : "Sem SKU vinculado atualmente"}
                                  </Text>
                                  <Text style={styles.text}>
                                    Variacao local:{" "}
                                    {item.current_linked_catalog_variation_id
                                      ? maskSensitiveText(
                                          item.current_linked_catalog_variation_label || item.current_linked_catalog_variation_id,
                                          isPrivacyMode,
                                          "Variacao vinculada"
                                        )
                                      : "Nao encontrada no catalogo local"}
                                  </Text>
                                </View>
                              ))}
                              {order.metrics?.filamentMaterials?.length ? (
                                <Text style={styles.text}>
                                  Filamentos:{" "}
                                  {order.metrics.filamentMaterials
                                    .slice(0, 3)
                                    .map((item) => `${item.material_type} ${money(item.total_cost_cents)}`)
                                    .join(" | ")}
                                </Text>
                              ) : null}
                              <Text style={styles.text}>Atualizado em: {dateTime(order.updated_at || order.last_seen_at || "")}</Text>
                            </View>
                          ))
                      )}
                    </>
                  ) : null}

                  <Text style={styles.fieldLabel}>Request customizado (debug)</Text>
                  <View style={styles.row}>
                    <TextInput
                      style={[styles.input, styles.marketplaceMethodInput]}
                      value={requestMethodByAccount[account.id] ?? "GET"}
                      onChangeText={(value) =>
                        setRequestMethodByAccount((prev) => ({
                          ...prev,
                          [account.id]: (value.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE"),
                        }))
                      }
                      autoCapitalize="characters"
                      autoCorrect={false}
                      placeholder="GET"
                    />
                    <TextInput
                      style={[styles.input, styles.marketplacePathInput]}
                      value={requestPathByAccount[account.id] ?? "/users/me"}
                      onChangeText={(value) =>
                        setRequestPathByAccount((prev) => ({ ...prev, [account.id]: value }))
                      }
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="/orders/123456789"
                    />
                    <Pressable
                      style={[
                        styles.smallButton,
                        (isBusy || requestLoadingByAccount[account.id]) && styles.buttonDisabled,
                      ]}
                      onPress={() => handleRunCustomRequest(account.id)}
                      disabled={isBusy || requestLoadingByAccount[account.id]}
                    >
                      <Text allowFontScaling={false} numberOfLines={1} style={styles.smallButtonText}>
                        Testar API
                      </Text>
                    </Pressable>
                  </View>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={requestHeadersByAccount[account.id] ?? "{}"}
                    onChangeText={(value) =>
                      setRequestHeadersByAccount((prev) => ({ ...prev, [account.id]: value }))
                    }
                    autoCapitalize="none"
                    autoCorrect={false}
                    multiline
                    placeholder='Headers JSON (ex.: {"x-format-new":"true"})'
                  />
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={requestBodyByAccount[account.id] ?? ""}
                    onChangeText={(value) =>
                      setRequestBodyByAccount((prev) => ({ ...prev, [account.id]: value }))
                    }
                    autoCapitalize="none"
                    autoCorrect={false}
                    multiline
                    placeholder='Body JSON opcional (ex.: {"order_ids":"123"})'
                  />
                  {requestErrorByAccount[account.id] ? (
                    <Text style={styles.errorText}>{requestErrorByAccount[account.id]}</Text>
                  ) : null}
                  {requestResultByAccount[account.id] ? (
                    <View style={styles.marketplaceApiResult}>
                      <Text style={styles.marketplaceApiResultText}>{requestResultByAccount[account.id]}</Text>
                    </View>
                  ) : null}
                </View>
                </View>
              ))
            )}

            {refreshErrors.length > 0 ? (
              <>
                <Text style={styles.cardTitle}>Erros de refresh</Text>
                {refreshErrors.map((error) => (
                  <View key={`${error.account_id}-${error.message}`} style={styles.card}>
                    <Text style={styles.cardTitle}>Conta {error.account_id}</Text>
                    <Text style={styles.text}>{error.message}</Text>
                    <Text style={styles.text}>Status API: {error.status ?? "-"}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        ) : null}
      </Section>
    </ScrollView>
  );
}

type MarketplaceListingSalesMetrics = {
  total: number;
  last30: number;
  last7: number;
  totalSource: "orders" | "orders_item" | "catalog";
  recentSource: "orders" | "orders_item" | "unavailable";
};

function MarketplaceListingSkuConfigCard({
  item,
  skus,
  localStockBySkuId,
  salesMetrics,
  taxRatePercent,
  onLinkListingSku,
  onSetListingIgnored,
  isPrivacyMode,
}: {
  item: MarketplaceCatalogVariationItem;
  skus: SalesSku[];
  localStockBySkuId: Map<string, number>;
  salesMetrics?: MarketplaceListingSalesMetrics;
  taxRatePercent: number;
  onLinkListingSku: (listingId: string, skuId: string | null) => Promise<void>;
  onSetListingIgnored: (listingId: string, isIgnored: boolean) => Promise<void>;
  isPrivacyMode: boolean;
}) {
  const [isSkuSelectOpen, setIsSkuSelectOpen] = useState(false);
  const [skuSearch, setSkuSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const selectedSku = item.linked_sku_id ? skus.find((sku) => sku.id === item.linked_sku_id) : undefined;
  const skuFilter = skuSearch.trim().toLowerCase();
  const filteredSkus = skus.filter((sku) => {
    if (!skuFilter) return true;
    return sku.skuCode.toLowerCase().includes(skuFilter) || sku.name.toLowerCase().includes(skuFilter);
  });
  const finalPriceCents = item.effective_price_cents ?? item.price_cents ?? 0;
  const estimatedReceivedCents = item.estimated_net_proceeds_cents ?? 0;
  const productionCostCents = selectedSku?.productionCostCents ?? 0;
  const estimatedTaxCents = Math.round(finalPriceCents * (taxRatePercent / 100));
  const contributionMarginCents = estimatedReceivedCents - productionCostCents - estimatedTaxCents;
  const contributionMarginDecimal = finalPriceCents > 0 ? contributionMarginCents / finalPriceCents : 0;
  const roasMin = contributionMarginDecimal > 0 ? Math.max(1, 1 / contributionMarginDecimal) : null;
  const marketplaceStock = item.available_quantity ?? 0;
  const localStock = selectedSku?.id ? (localStockBySkuId.get(selectedSku.id) ?? 0) : null;
  const linkStatus =
    !item.linked_sku_id ? "Sem SKU" : item.linked_sku_is_active === 1 ? "Vinculado" : "SKU inativo";
  const metrics = salesMetrics ?? {
    total: Math.max(0, Math.round(item.sold_quantity ?? 0)),
    last30: 0,
    last7: 0,
    totalSource: "catalog" as const,
    recentSource: "unavailable" as const,
  };

  const saveSkuLink = async (skuId: string | null) => {
    try {
      setIsSaving(true);
      setLinkError(null);
      await onLinkListingSku(item.id, skuId);
      setSkuSearch("");
      setIsSkuSelectOpen(false);
    } catch (error: any) {
      setLinkError(error?.message ?? "Falha ao salvar vínculo de SKU");
    } finally {
      setIsSaving(false);
    }
  };

  const ignoreListing = async () => {
    try {
      setIsSaving(true);
      setLinkError(null);
      await onSetListingIgnored(item.id, true);
    } catch (error: any) {
      setLinkError(error?.message ?? "Falha ao ignorar anúncio");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{maskSensitiveText(item.title, isPrivacyMode, PRIVACY_MASK)}</Text>
      <Text style={styles.text}>Valor do anúncio final: {money(finalPriceCents)}</Text>
      <Text style={styles.text}>Valor recebido (estimado): {money(estimatedReceivedCents)}</Text>
      <Text style={styles.text}>Vendas totais: {metrics.total}</Text>
      <Text style={styles.text}>Vendas últimos 30 dias: {metrics.last30}</Text>
      <Text style={styles.text}>Vendas últimos 7 dias: {metrics.last7}</Text>
      {metrics.total > 0 && metrics.totalSource === "catalog" ? (
        <Text style={styles.text}>Fonte vendas totais: catálogo sincronizado</Text>
      ) : null}
      {metrics.total > 0 && metrics.recentSource === "unavailable" ? (
        <Text style={styles.text}>Vendas recentes por variação indisponíveis nos pedidos sincronizados</Text>
      ) : null}
      <Text style={styles.text}>
        SKU linkado: {selectedSku ? maskNameKeepCode(selectedSku.skuCode, selectedSku.name, isPrivacyMode) : "Não selecionado"}
      </Text>
      <Text style={styles.text}>Status vínculo SKU: {linkStatus}</Text>
      <Text style={styles.text}>Estoque marketplace: {marketplaceStock}</Text>
      <Text style={styles.text}>Estoque local: {localStock !== null ? localStock : "-"}</Text>
      <Text style={styles.text}>Custo do produto (SKU local): {selectedSku ? money(selectedSku.productionCostCents) : "-"}</Text>
      <Text style={styles.text}>Fonte SKU: estoque local</Text>

      <View style={styles.row}>
        <View style={styles.marketplaceSkuPickerField}>
          <Text style={styles.fieldLabel}>Selecionar SKU (digite para pesquisar)</Text>
          <TextInput
            style={styles.input}
            value={skuSearch}
            onFocus={() => setIsSkuSelectOpen(true)}
            onBlur={() => {
              setTimeout(() => setIsSkuSelectOpen(false), 120);
            }}
            onChangeText={(value) => {
              setSkuSearch(value);
              setIsSkuSelectOpen(true);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={
              selectedSku
                ? maskNameKeepCode(selectedSku.skuCode, selectedSku.name, isPrivacyMode)
                : "Digite código ou nome do SKU"
            }
          />
          {isSkuSelectOpen ? (
            <View style={styles.selectMenu}>
              {skus.length === 0 ? (
                <Text style={styles.text}>Nenhum SKU cadastrado.</Text>
              ) : filteredSkus.length === 0 ? (
                <Text style={styles.text}>Nenhum SKU encontrado para "{skuSearch}".</Text>
              ) : (
                filteredSkus.map((sku) => (
                  <Pressable key={sku.id} style={styles.selectItem} onPress={() => void saveSkuLink(sku.id)}>
                    <Text style={styles.text}>{maskNameKeepCode(sku.skuCode, sku.name, isPrivacyMode)}</Text>
                  </Pressable>
                ))
              )}
            </View>
          ) : null}
        </View>
        <AppButton label="Ignorar anúncio" variant="danger" onPress={() => void ignoreListing()} disabled={isSaving} />
        <AppButton
          label="Remover vínculo SKU"
          variant="secondary"
          style={styles.marketplaceSkuRemoveButton}
          onPress={() => void saveSkuLink(null)}
          disabled={isSaving}
        />
        {isSaving ? <Text style={styles.text}>Salvando...</Text> : null}
      </View>
      {linkError ? <Text style={styles.errorText}>{linkError}</Text> : null}

      <Text style={styles.text}>Cálculo margem estimada:</Text>
      <Text style={styles.text}>
        {money(estimatedReceivedCents)} - {money(productionCostCents)} - {money(estimatedTaxCents)} = {money(contributionMarginCents)}
      </Text>
      <Text style={styles.text}>Imposto estimado ({taxRatePercent.toFixed(2)}%): {money(estimatedTaxCents)}</Text>
      <Text style={styles.text}>Margem decimal estimada: {contributionMarginDecimal.toFixed(4)}</Text>
      <Text style={styles.text}>ROAS mínimo: {roasMin && Number.isFinite(roasMin) ? roasMin.toFixed(4) : "-"}</Text>
    </View>
  );
}

function MarketplaceListingsScreen({
  status,
  catalogVariationItems,
  orderItems,
  skus,
  salesStock,
  taxRatePercent,
  onLinkListingSku,
  onSetListingIgnored,
  isPrivacyMode,
}: {
  status: MarketplaceStatusResponse | null;
  catalogVariationItems: MarketplaceCatalogVariationItem[];
  orderItems: MarketplaceOrderItem[];
  skus: SalesSku[];
  salesStock: SalesStockOverview[];
  taxRatePercent: number;
  onLinkListingSku: (listingId: string, skuId: string | null) => Promise<void>;
  onSetListingIgnored: (listingId: string, isIgnored: boolean) => Promise<void>;
  isPrivacyMode: boolean;
}) {
  const [openSkuSelectByListingId, setOpenSkuSelectByListingId] = useState<Record<string, boolean>>({});
  const [skuSearchByListingId, setSkuSearchByListingId] = useState<Record<string, string>>({});
  const [isSavingByListingId, setIsSavingByListingId] = useState<Record<string, boolean>>({});
  const [linkErrorByListingId, setLinkErrorByListingId] = useState<Record<string, string | null>>({});
  const [collapsedByGroupKey, setCollapsedByGroupKey] = useState<Record<string, boolean>>({});
  const [visibleCountByGroupKey, setVisibleCountByGroupKey] = useState<Record<string, number>>({});
  const [globalSearch, setGlobalSearch] = useState("");
  const [filterOnlyWithoutSku, setFilterOnlyWithoutSku] = useState(false);
  const [filterMarginNegative, setFilterMarginNegative] = useState(false);
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);
  const localSkus = useMemo(() => [...skus], [skus]);
  const lowStockThreshold = 3;
  const localStockBySkuId = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of salesStock) {
      map.set(row.skuId, row.availableQuantity ?? 0);
    }
    return map;
  }, [salesStock]);

  const accountsById = useMemo(() => {
    const map = new Map<string, MarketplaceAccountStatus>();
    for (const account of status?.accounts ?? []) {
      map.set(account.id, account);
    }
    return map;
  }, [status]);

  const groupedListings = useMemo(() => {
    const rows = [...catalogVariationItems].filter(
      (item) => isMarketplaceListingActive(item) && !isMarketplaceListingIgnored(item)
    );
    rows.sort((a, b) => a.account_id.localeCompare(b.account_id) || b.updated_at.localeCompare(a.updated_at));

    const groups = new Map<
      string,
      {
        marketplace: string;
        accountId: string;
        items: MarketplaceCatalogVariationItem[];
      }
    >();

    for (const item of rows) {
      const key = `mercadolivre::${item.account_id}`;
      const group = groups.get(key) ?? {
        marketplace: "Mercado Livre",
        accountId: item.account_id,
        items: [],
      };
      group.items.push(item);
      groups.set(key, group);
    }

    return Array.from(groups.values());
  }, [catalogVariationItems]);

  const nowMs = Date.now();
  const window7Ms = nowMs - 7 * 24 * 60 * 60 * 1000;
  const window30Ms = nowMs - 30 * 24 * 60 * 60 * 1000;

  const salesMetricsByListingId = useMemo(() => {
    const map = new Map<
      string,
      {
        total: number;
        last30: number;
        last7: number;
        totalSource: "orders" | "orders_item" | "catalog";
        recentSource: "orders" | "orders_item" | "unavailable";
      }
    >();
    const zeroMetric = { total: 0, last30: 0, last7: 0 };
    const exactMetricsByKey = new Map<string, { total: number; last30: number; last7: number }>();
    const itemMetricsByKey = new Map<string, { total: number; last30: number; last7: number }>();
    const listingCountByItemKey = new Map<string, number>();

    for (const listing of catalogVariationItems) {
      const itemKey = `${listing.account_id}::${listing.marketplace_item_id}`;
      listingCountByItemKey.set(itemKey, (listingCountByItemKey.get(itemKey) ?? 0) + 1);
    }

    for (const order of orderItems) {
      const orderDateMs = Date.parse(order.date_created ?? order.updated_at ?? "");
      const hasValidDate = Number.isFinite(orderDateMs);

      for (const line of order.order_items) {
        const qty = Math.max(0, Math.round(line.quantity ?? 0));
        if (qty <= 0) continue;

        const itemKey = `${order.account_id}::${line.marketplace_item_id}`;
        const itemMetric = itemMetricsByKey.get(itemKey) ?? { ...zeroMetric };
        itemMetric.total += qty;
        if (hasValidDate && orderDateMs >= window30Ms) itemMetric.last30 += qty;
        if (hasValidDate && orderDateMs >= window7Ms) itemMetric.last7 += qty;
        itemMetricsByKey.set(itemKey, itemMetric);

        const exactKey = `${itemKey}::${line.marketplace_variation_id ?? "__item__"}`;
        const exactMetric = exactMetricsByKey.get(exactKey) ?? { ...zeroMetric };
        exactMetric.total += qty;
        if (hasValidDate && orderDateMs >= window30Ms) exactMetric.last30 += qty;
        if (hasValidDate && orderDateMs >= window7Ms) exactMetric.last7 += qty;
        exactMetricsByKey.set(exactKey, exactMetric);
      }
    }

    for (const listing of catalogVariationItems) {
      const itemKey = `${listing.account_id}::${listing.marketplace_item_id}`;
      const exactKey = `${itemKey}::${listing.marketplace_variation_id ?? "__item__"}`;
      const exactMetric = exactMetricsByKey.get(exactKey) ?? zeroMetric;
      const itemMetric = itemMetricsByKey.get(itemKey) ?? zeroMetric;
      const listingCountForItem = listingCountByItemKey.get(itemKey) ?? 0;
      const canUseItemLevelFallback = listing.marketplace_variation_id === null || listingCountForItem <= 1;
      const catalogTotal = Math.max(0, Math.round(listing.sold_quantity ?? 0));

      let total = exactMetric.total;
      let totalSource: "orders" | "orders_item" | "catalog" = "orders";

      if (canUseItemLevelFallback && itemMetric.total > total) {
        total = itemMetric.total;
        totalSource = "orders_item";
      }

      if (catalogTotal > total) {
        total = catalogTotal;
        totalSource = "catalog";
      }

      let last30 = exactMetric.last30;
      let last7 = exactMetric.last7;
      let recentSource: "orders" | "orders_item" | "unavailable" = "orders";

      if (canUseItemLevelFallback && itemMetric.total > exactMetric.total) {
        last30 = itemMetric.last30;
        last7 = itemMetric.last7;
        recentSource = "orders_item";
      } else if (
        exactMetric.total === 0 &&
        exactMetric.last30 === 0 &&
        exactMetric.last7 === 0 &&
        catalogTotal > 0
      ) {
        recentSource = "unavailable";
      }

      map.set(listing.id, { total, last30, last7, totalSource, recentSource });
    }

    return map;
  }, [catalogVariationItems, orderItems, window30Ms, window7Ms]);

  const resolveLinkedSku = (item: MarketplaceCatalogVariationItem): SalesSku | undefined => {
    if (!item.linked_sku_id) return undefined;
    return localSkus.find((sku) => sku.id === item.linked_sku_id);
  };

  const openSkuSelect = (listingId: string) => {
    setOpenSkuSelectByListingId({ [listingId]: true });
  };

  const closeSkuSelect = (listingId: string) => {
    setOpenSkuSelectByListingId((prev) => ({ ...prev, [listingId]: false }));
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Marketplaces {'>'} Anúncios</Text>
      <Text style={styles.pageSubtitle}>Gestão de anúncios por marketplace e conta</Text>

      <Section title="Filtros">
        <Field label="Busca global" value={globalSearch} onChangeText={setGlobalSearch} />
        <View style={styles.row}>
          <Pressable
            style={filterOnlyWithoutSku ? styles.smallButton : styles.secondaryButton}
            onPress={() => setFilterOnlyWithoutSku((prev) => !prev)}
          >
            <Text style={filterOnlyWithoutSku ? styles.smallButtonText : styles.secondaryButtonText}>Só sem SKU</Text>
          </Pressable>
          <Pressable
            style={filterMarginNegative ? styles.smallButton : styles.secondaryButton}
            onPress={() => setFilterMarginNegative((prev) => !prev)}
          >
            <Text style={filterMarginNegative ? styles.smallButtonText : styles.secondaryButtonText}>Margem negativa</Text>
          </Pressable>
          <Pressable
            style={filterLowStockOnly ? styles.smallButton : styles.secondaryButton}
            onPress={() => setFilterLowStockOnly((prev) => !prev)}
          >
            <Text style={filterLowStockOnly ? styles.smallButtonText : styles.secondaryButtonText}>Estoque baixo</Text>
          </Pressable>
        </View>
      </Section>

      {groupedListings.length === 0 ? (
        <Text style={styles.text}>Sem anúncios sincronizados para exibir.</Text>
      ) : (
        groupedListings.map((group) => {
          const account = accountsById.get(group.accountId);
          const accountLabel = account?.seller_nickname || account?.account_label || group.accountId;
          const groupKey = `${group.marketplace}::${group.accountId}`;
          const groupCollapsed = collapsedByGroupKey[groupKey] ?? false;

          const searchFilter = globalSearch.trim().toLowerCase();
          const filteredItems = group.items.filter((item) => {
            const linkedSku = resolveLinkedSku(item);
            const finalPriceCents = item.effective_price_cents ?? item.price_cents ?? 0;
            const estimatedReceivedCents = item.estimated_net_proceeds_cents ?? 0;
            const productionCostCents = linkedSku?.productionCostCents ?? 0;
            const estimatedTaxCents = Math.round(finalPriceCents * (taxRatePercent / 100));
            const contributionMarginCents = estimatedReceivedCents - productionCostCents - estimatedTaxCents;

            if (searchFilter) {
              const haystack = [
                item.title,
                item.variation_label ?? "",
                item.marketplace_item_id,
                item.marketplace_variation_id ?? "",
                linkedSku?.skuCode ?? item.linked_sku_code ?? "",
                linkedSku?.name ?? item.linked_sku_name ?? "",
              ].join(" ").toLowerCase();
              if (!haystack.includes(searchFilter)) return false;
            }
            if (filterOnlyWithoutSku && item.linked_sku_id) return false;
            if (filterMarginNegative && contributionMarginCents >= 0) return false;
            if (filterLowStockOnly && (item.available_quantity ?? 0) > lowStockThreshold) return false;
            return true;
          });
          const visibleCount = visibleCountByGroupKey[groupKey] ?? 25;
          const visibleItems = filteredItems.slice(0, visibleCount);
          const hasMore = filteredItems.length > visibleCount;

          return (
            <View key={`${group.marketplace}-${group.accountId}`} style={styles.section}>
              <View style={styles.row}>
                <Text style={styles.sectionTitle}>{`${group.marketplace} - ${accountLabel}`}</Text>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => setCollapsedByGroupKey((prev) => ({ ...prev, [groupKey]: !groupCollapsed }))}
                >
                  <Text style={styles.secondaryButtonText}>{groupCollapsed ? "Mostrar conteúdo" : "Esconder conteúdo"}</Text>
                </Pressable>
                <Text style={styles.text}>Itens: {filteredItems.length}</Text>
              </View>

              {!groupCollapsed && visibleItems.map((item) => (
                <MarketplaceListingSkuConfigCard
                  key={item.id}
                  item={item}
                  skus={localSkus}
                  localStockBySkuId={localStockBySkuId}
                  salesMetrics={salesMetricsByListingId.get(item.id)}
                  taxRatePercent={taxRatePercent}
                  onLinkListingSku={onLinkListingSku}
                  onSetListingIgnored={onSetListingIgnored}
                  isPrivacyMode={isPrivacyMode}
                />
              ))}

              {!groupCollapsed && hasMore ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() =>
                    setVisibleCountByGroupKey((prev) => ({ ...prev, [groupKey]: (prev[groupKey] ?? 25) + 25 }))
                  }
                >
                  <Text style={styles.secondaryButtonText}>Carregar mais anúncios</Text>
                </Pressable>
              ) : null}
              {!groupCollapsed && filteredItems.length === 0 ? (
                <Text style={styles.text}>Nenhum anúncio encontrado com os filtros atuais.</Text>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function MarketplaceListingConfigScreen({
  listing,
  skus,
  salesStock,
  taxRatePercent,
  onLinkListingSku,
  onSetListingIgnored,
  onBack,
  isPrivacyMode,
}: {
  listing?: MarketplaceCatalogVariationItem;
  skus: SalesSku[];
  salesStock: SalesStockOverview[];
  taxRatePercent: number;
  onLinkListingSku: (listingId: string, skuId: string | null) => Promise<void>;
  onSetListingIgnored: (listingId: string, isIgnored: boolean) => Promise<void>;
  onBack: () => void;
  isPrivacyMode: boolean;
}) {
  const localStockBySkuId = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of salesStock) {
      map.set(row.skuId, row.availableQuantity ?? 0);
    }
    return map;
  }, [salesStock]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Marketplaces {'>'} Configuração do Anúncio</Text>
      <Text style={styles.pageSubtitle}>Vínculo de SKU local e leitura operacional do anúncio</Text>
      <AppButton label="Voltar aos pedidos" variant="secondary" onPress={onBack} />
      {!listing ? (
        <View style={styles.errorBannerInline}>
          <Text style={styles.errorText}>
            Anúncio não encontrado no catálogo sincronizado. Sincronize os anúncios do Mercado Livre e tente novamente.
          </Text>
        </View>
      ) : (
        <MarketplaceListingSkuConfigCard
          item={listing}
          skus={skus}
          localStockBySkuId={localStockBySkuId}
          taxRatePercent={taxRatePercent}
          onLinkListingSku={onLinkListingSku}
          onSetListingIgnored={onSetListingIgnored}
          isPrivacyMode={isPrivacyMode}
        />
      )}
    </ScrollView>
  );
}

function ConfirmDialog({
  visible,
  title,
  message,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalMessage}>{message}</Text>
          <View style={styles.row}>
            <Pressable style={styles.secondaryButton} onPress={onCancel}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.secondaryButtonText}>
                Cancelar
              </Text>
            </Pressable>
            <Pressable style={styles.dangerButton} onPress={onConfirm}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.dangerButtonText}>
                Excluir
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function MockupApp() {
  const [screen, setScreen] = useState<ScreenKey>("dashboard");
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);

  const [printers, setPrinters] = useState<Printer[]>([]);
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [salesSkus, setSalesSkus] = useState<SalesSku[]>([]);
  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([]);
  const [salesStock, setSalesStock] = useState<SalesStockOverview[]>([]);
  const [consignmentBatches, setConsignmentBatches] = useState<ConsignmentBatch[]>([]);
  const [consignmentDashboard, setConsignmentDashboard] = useState<ConsignmentDashboard | null>(null);
  const [selectedConsignmentBatchId, setSelectedConsignmentBatchId] = useState<string | null>(null);
  const [selectedConsignmentBatchDetail, setSelectedConsignmentBatchDetail] = useState<ConsignmentBatchDetail | undefined>(
    undefined
  );
  const [salesPointsOverview, setSalesPointsOverview] = useState<SalesPointOverview[]>([]);
  const [logs, setLogs] = useState<OperationLogItem[]>([]);
  const [marketplaceStatus, setMarketplaceStatus] = useState<MarketplaceStatusResponse | null>(null);
  const [shopeeStatus, setShopeeStatus] = useState<MarketplaceStatusResponse | null>(null);
  const [marketplaceCatalogVariationItems, setMarketplaceCatalogVariationItems] = useState<MarketplaceCatalogVariationItem[]>([]);
  const [marketplaceOrderItems, setMarketplaceOrderItems] = useState<MarketplaceOrderItem[]>([]);
  const [marketplaceOrdersDashboard, setMarketplaceOrdersDashboard] = useState<MarketplaceOrdersDashboardResponse | null>(null);
  const [marketplaceNormalizationRules, setMarketplaceNormalizationRules] = useState<MarketplaceNormalizationRule[]>([]);
  const [selectedMarketplaceListingId, setSelectedMarketplaceListingId] = useState<string | null>(null);
  const [activeCostSettingId, setActiveCostSettingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMarketplaceBusy, setIsMarketplaceBusy] = useState(false);
  const [cancelingMarketplaceRunIds, setCancelingMarketplaceRunIds] = useState<Record<string, boolean>>({});
  const [marketplaceInfo, setMarketplaceInfo] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);
  const [editingFilamentId, setEditingFilamentId] = useState<string | null>(null);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [editingSalesSkuId, setEditingSalesSkuId] = useState<string | null>(null);
  const [editingSalesPointId, setEditingSalesPointId] = useState<string | null>(null);
  const [viewingQuoteId, setViewingQuoteId] = useState<string | null>(null);

  const [laborHourCost, setLaborHourCost] = useState("45");
  const [taxRate, setTaxRate] = useState("8");
  const [energyCostKwh, setEnergyCostKwh] = useState(String(costSettings.energyCostKwhCents));
  const [paybackMonths, setPaybackMonths] = useState(String(costSettings.paybackMonths));
  const [markupFinalSale, setMarkupFinalSale] = useState("100");
  const [markupPresentialSale, setMarkupPresentialSale] = useState("120");
  const [markupWholesaleConsignment, setMarkupWholesaleConsignment] = useState("75");
  const [markupWholesaleCash, setMarkupWholesaleCash] = useState("50");
  const [savedCosts, setSavedCosts] = useState<string[]>([]);
  const [openNavDropdown, setOpenNavDropdown] = useState<"orcamentos" | "estoque" | "consignado" | "marketplaces" | null>(null);

  const [confirmState, setConfirmState] = useState<ConfirmState>({
    visible: false,
    title: "",
    message: "",
    onConfirm: () => undefined,
  });

  const currentPrinter = useMemo(
    () => printers.find((item) => item.id === editingPrinterId),
    [printers, editingPrinterId]
  );

  const currentFilament = useMemo(
    () => filaments.find((item) => item.id === editingFilamentId),
    [filaments, editingFilamentId]
  );

  const currentQuote = useMemo(
    () => quotes.find((item) => item.id === editingQuoteId),
    [quotes, editingQuoteId]
  );
  const viewingQuote = useMemo(
    () => quotes.find((item) => item.id === viewingQuoteId),
    [quotes, viewingQuoteId]
  );
  const currentSalesSku = useMemo(
    () => salesSkus.find((item) => item.id === editingSalesSkuId),
    [salesSkus, editingSalesSkuId]
  );
  const currentMarketplaceListing = useMemo(
    () => marketplaceCatalogVariationItems.find((item) => item.id === selectedMarketplaceListingId),
    [marketplaceCatalogVariationItems, selectedMarketplaceListingId]
  );
  const currentSalesPoint = useMemo(
    () => salesPoints.find((item) => item.id === editingSalesPointId),
    [salesPoints, editingSalesPointId]
  );

  const title = useMemo(() => {
    const map: Record<ScreenKey, string> = {
      dashboard: "Dashboard",
      printers: "Impressoras",
      printerForm: currentPrinter ? "Editar Impressora" : "Cadastro Impressora",
      filaments: "Filamentos",
      filamentForm: currentFilament ? "Editar Filamento" : "Cadastro Filamento",
      fixedCosts: "Custos",
      quotes: "Orçamentos",
      quoteForm: currentQuote ? "Editar Orçamento" : "Novo Orçamento",
      quoteView: "Visualizar Orçamento",
      salesSkus: "SKUs",
      salesSkuForm: currentSalesSku ? "Editar SKU" : "Cadastro de SKU",
      salesStock: "Estoque Geral",
      salesPoints: "Pontos de Venda",
      salesPointForm: currentSalesPoint ? "Editar Ponto" : "Cadastro de Ponto",
      salesConsignment: "Consignação",
      salesPointsOverview: "Visão de Pontos",
	      marketplaces: "Marketplaces > Configurações",
	      marketplaceOrdersDashboard: "Marketplaces > Dashboard de Pedidos",
	      marketplaceListings: "Marketplaces > Anúncios",
	      marketplaceListingConfig: "Marketplaces > Configuração do Anúncio",
	      logs: "Logs",
    };
    return map[screen];
  }, [screen, currentPrinter, currentFilament, currentQuote, currentSalesSku, currentSalesPoint]);

  const openDeleteConfirm = (titleText: string, message: string, onConfirm: () => void) => {
    setConfirmState({
      visible: true,
      title: titleText,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmState((prev) => ({ ...prev, visible: false }));
      },
    });
  };

  useEffect(() => {
    setOpenNavDropdown(null);
  }, [screen]);

  const fetchPrinters = async () => {
    const rows = await apiFetch<any[]>("/printers");
    setPrinters(rows.map(mapPrinterFromApi));
  };

  const fetchFilaments = async () => {
    const rows = await apiFetch<any[]>("/filaments");
    setFilaments(rows.map(mapFilamentFromApi));
  };

  const fetchQuotes = async () => {
    const rows = await apiFetch<any[]>("/quotes");
    const detailedQuotes = await Promise.all(
      rows.map(async (row) => {
        try {
          const detail = await apiFetch<any>(`/quotes/${row.id}`);
          return mapQuoteDetailFromApi(detail);
        } catch {
          return mapQuoteSummaryFromApi(row);
        }
      })
    );
    setQuotes(detailedQuotes);
  };

  const fetchQuoteDetail = async (id: string) => {
    const row = await apiFetch<any>(`/quotes/${id}`);
    const detail = mapQuoteDetailFromApi(row);
    setQuotes((prev) => prev.map((item) => (item.id === id ? detail : item)));
    return detail;
  };

  const fetchSalesSkus = async () => {
    const rows = await apiFetch<any[]>("/sales/skus");
    setSalesSkus(rows.map(mapSalesSkuFromApi));
  };

  const fetchSalesSkuDetail = async (id: string) => {
    const row = await apiFetch<any>(`/sales/skus/${id}`);
    const detail = mapSalesSkuFromApi(row);
    setSalesSkus((prev) => prev.map((item) => (item.id === id ? detail : item)));
    return detail;
  };

  const fetchSalesPoints = async () => {
    const rows = await apiFetch<any[]>("/sales/points");
    setSalesPoints(rows.map(mapSalesPointFromApi));
  };

  const fetchSalesStock = async () => {
    const rows = await apiFetch<any[]>("/sales/stock/overview");
    setSalesStock(rows.map(mapSalesStockOverviewFromApi));
  };

  const fetchConsignmentBatches = async () => {
    const rows = await apiFetch<any[]>("/sales/consignment/batches");
    setConsignmentBatches(rows.map(mapConsignmentBatchFromApi));
  };

  const fetchConsignmentBatchDetail = async (id: string) => {
    const row = await apiFetch<any>(`/sales/consignment/batches/${id}`);
    const detail = mapConsignmentBatchDetailFromApi(row);
    setSelectedConsignmentBatchId(id);
    setSelectedConsignmentBatchDetail(detail);
    return detail;
  };

  const fetchConsignmentDashboard = async (filters?: { dateFrom?: string; dateTo?: string; salesPointId?: string }) => {
    const params = new URLSearchParams();
    if (filters?.dateFrom?.trim()) params.set("date_from", filters.dateFrom.trim());
    if (filters?.dateTo?.trim()) params.set("date_to", filters.dateTo.trim());
    if (filters?.salesPointId?.trim()) params.set("sales_point_id", filters.salesPointId.trim());
    const query = params.toString();
    const row = await apiFetch<any>(`/sales/consignment/dashboard${query ? `?${query}` : ""}`);
    const dashboard = mapConsignmentDashboardFromApi(row);
    setConsignmentDashboard(dashboard);
    return dashboard;
  };

  const fetchSalesPointsOverview = async () => {
    const rows = await apiFetch<any[]>("/sales/points/overview");
    setSalesPointsOverview(rows.map(mapSalesPointOverviewFromApi));
  };

  const fetchLogs = async () => {
    const rows = await apiFetch<any[]>("/logs");
    setLogs(rows.map(mapOperationLogFromApi));
  };

  const fetchMarketplaceStatus = async () => {
    const status = await apiFetch<MarketplaceStatusResponse>("/integrations/mercadolivre/status");
    setMarketplaceStatus(status);
    return status;
  };

  const fetchShopeeStatus = async () => {
    const status = await apiFetch<MarketplaceStatusResponse>("/integrations/shopee/status");
    setShopeeStatus(status);
    return status;
  };

  const fetchMarketplaceCatalogVariations = async () => {
    const items = await apiFetch<MarketplaceCatalogVariationItem[]>(
      "/integrations/mercadolivre/catalog/variations?limit=100"
    );
    const normalizedItems = (items ?? []).map((item) => normalizeMarketplaceCatalogVariationItem(item));
    setMarketplaceCatalogVariationItems(normalizedItems);
    return normalizedItems;
  };

  const fetchMarketplaceOrders = async () => {
    const items = await apiFetch<MarketplaceOrderItem[]>("/integrations/mercadolivre/orders?limit=5000");
    setMarketplaceOrderItems(items);
    return items;
  };

  const fetchMarketplaceOrdersDashboard = async (filters?: { dateFrom?: string; dateTo?: string }) => {
    const params = new URLSearchParams();
    if (filters?.dateFrom?.trim()) params.set("date_from", filters.dateFrom.trim());
    if (filters?.dateTo?.trim()) params.set("date_to", filters.dateTo.trim());
    const query = params.toString();
    const dashboard = await apiFetch<MarketplaceOrdersDashboardResponse>(
      `/integrations/mercadolivre/orders/dashboard${query ? `?${query}` : ""}`
    );
    setMarketplaceOrdersDashboard(dashboard);
    return dashboard;
  };

  const fetchMarketplaceNormalizationRules = async () => {
    const rules = await apiFetch<MarketplaceNormalizationRule[]>(
      "/integrations/marketplaces/normalization-rules?marketplace=mercadolivre&category=shipping_logistic_type"
    );
    setMarketplaceNormalizationRules(rules);
    return rules;
  };

  const fetchActiveCostSettings = async () => {
    const settings = await apiFetch<any | null>("/cost-settings/active");
    if (!settings) return;
    setActiveCostSettingId(settings.id);
    setLaborHourCost(String((settings.labor_hour_cost_cents ?? 0) / 100));
    setEnergyCostKwh(String(settings.energy_cost_kwh_cents ?? 0));
    setTaxRate(String((settings.tax_rate_bps ?? 0) / 100));
    setPaybackMonths(String(settings.printer_payback_months ?? 24));
    setMarkupFinalSale(String((settings.markup_final_sale_bps ?? settings.markup_bps ?? 10000) / 100));
    setMarkupPresentialSale(String((settings.markup_presential_sale_bps ?? 12000) / 100));
    setMarkupWholesaleConsignment(String((settings.markup_wholesale_consignment_bps ?? 7500) / 100));
    setMarkupWholesaleCash(String((settings.markup_wholesale_cash_bps ?? 5000) / 100));
  };

  useEffect(() => {
    const loadAll = async () => {
      setIsSyncing(true);
      setSyncError(null);
      try {
        await Promise.all([fetchPrinters(), fetchFilaments(), fetchQuotes(), fetchActiveCostSettings()]);
        await Promise.all([
          fetchSalesSkus(),
          fetchSalesPoints(),
          fetchSalesStock(),
          fetchConsignmentBatches(),
          fetchConsignmentDashboard(),
          fetchSalesPointsOverview(),
          fetchMarketplaceStatus(),
          fetchShopeeStatus(),
          fetchMarketplaceCatalogVariations(),
          fetchMarketplaceOrders(),
          fetchMarketplaceOrdersDashboard(),
          fetchMarketplaceNormalizationRules(),
          fetchLogs(),
        ]);
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao sincronizar com backend");
      } finally {
        setIsSyncing(false);
      }
    };
    void loadAll();
  }, []);

  useEffect(() => {
    if (screen !== "logs") return;
    void fetchLogs().catch((error: any) => {
      setSyncError(error?.message ?? "Falha ao carregar logs");
    });
  }, [screen]);

  useEffect(() => {
	    if (!["marketplaces", "marketplaceOrdersDashboard", "marketplaceListingConfig"].includes(screen)) return;
    void Promise.all([
      fetchMarketplaceStatus(),
      fetchShopeeStatus(),
      fetchMarketplaceCatalogVariations(),
      fetchMarketplaceOrders(),
      fetchMarketplaceOrdersDashboard(),
      fetchMarketplaceNormalizationRules(),
    ]).catch((error: any) => {
      setSyncError(error?.message ?? "Falha ao carregar status dos marketplaces");
    });
  }, [screen]);

  useEffect(() => {
    if (!["logs", "marketplaces", "marketplaceOrdersDashboard"].includes(screen)) return;
    const timer = setInterval(() => {
      void Promise.all([
        fetchLogs(),
        fetchMarketplaceStatus(),
        fetchMarketplaceOrders(),
        fetchMarketplaceOrdersDashboard(),
      ]).catch((error: any) => {
        setSyncError(error?.message ?? "Falha ao atualizar dados automáticos do marketplace");
      });
    }, 60000);
    return () => clearInterval(timer);
  }, [screen]);

  const handleStartMercadoLivreAuth = () => {
    void (async () => {
      try {
        setIsMarketplaceBusy(true);
        setSyncError(null);
        setMarketplaceInfo(null);
        const payload = await apiFetch<{ authorize_url: string }>("/integrations/mercadolivre/connect", {
          method: "POST",
          body: JSON.stringify({}),
        });

        if (!payload?.authorize_url) {
          throw new Error("URL de autorização não retornada pelo backend.");
        }

        const webWindow = typeof globalThis !== "undefined" ? (globalThis as any).window : undefined;
        if (Platform.OS === "web" && webWindow?.open) {
          webWindow.open(payload.authorize_url, "_blank", "noopener,noreferrer");
        } else {
          await Linking.openURL(payload.authorize_url);
        }

        setMarketplaceInfo("Autorização iniciada. Após concluir no Mercado Livre, clique em Atualizar status.");
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao iniciar autorização do Mercado Livre");
      } finally {
        setIsMarketplaceBusy(false);
      }
    })();
  };

  const handleRefreshMarketplaceStatus = () => {
    void (async () => {
      try {
        setIsMarketplaceBusy(true);
        setSyncError(null);
        await fetchMarketplaceStatus();
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao atualizar status do Mercado Livre");
      } finally {
        setIsMarketplaceBusy(false);
      }
    })();
  };

  const handleDisconnectMarketplace = () => {
    void (async () => {
      try {
        setIsMarketplaceBusy(true);
        setSyncError(null);
        await apiFetch("/integrations/mercadolivre/disconnect", {
          method: "POST",
          body: JSON.stringify({}),
        });
        await Promise.all([fetchMarketplaceStatus(), fetchLogs()]);
        setMarketplaceInfo("Todas as contas do Mercado Livre foram desconectadas.");
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao desconectar Mercado Livre");
      } finally {
        setIsMarketplaceBusy(false);
      }
    })();
  };

  const handleStartShopeeAuth = () => {
    void (async () => {
      try {
        setIsMarketplaceBusy(true);
        setSyncError(null);
        setMarketplaceInfo(null);
        const payload = await apiFetch<{ authorize_url: string }>("/integrations/shopee/connect", {
          method: "POST",
          body: JSON.stringify({}),
        });

        if (!payload?.authorize_url) {
          throw new Error("URL de autorização Shopee não retornada pelo backend.");
        }

        const webWindow = typeof globalThis !== "undefined" ? (globalThis as any).window : undefined;
        if (Platform.OS === "web" && webWindow?.open) {
          webWindow.open(payload.authorize_url, "_blank", "noopener,noreferrer");
        } else {
          await Linking.openURL(payload.authorize_url);
        }

        setMarketplaceInfo("Autorização Shopee iniciada. Após concluir na Shopee, clique em Atualizar status.");
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao iniciar autorização da Shopee");
      } finally {
        setIsMarketplaceBusy(false);
      }
    })();
  };

  const handleRefreshShopeeStatus = () => {
    void (async () => {
      try {
        setIsMarketplaceBusy(true);
        setSyncError(null);
        await fetchShopeeStatus();
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao atualizar status da Shopee");
      } finally {
        setIsMarketplaceBusy(false);
      }
    })();
  };

  const handleDisconnectShopee = () => {
    void (async () => {
      try {
        setIsMarketplaceBusy(true);
        setSyncError(null);
        await apiFetch("/integrations/shopee/disconnect", {
          method: "POST",
          body: JSON.stringify({}),
        });
        await Promise.all([fetchShopeeStatus(), fetchLogs()]);
        setMarketplaceInfo("Todas as contas da Shopee foram desconectadas.");
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao desconectar Shopee");
      } finally {
        setIsMarketplaceBusy(false);
      }
    })();
  };

  const handleSyncMarketplaceCatalog = (accountId?: string) => {
    void (async () => {
      try {
        setIsMarketplaceBusy(true);
        setSyncError(null);
        setMarketplaceInfo(null);
        const syncRequest = apiFetch<{
          ok?: boolean;
          cancelled?: boolean;
          message?: string;
          records_read: number;
          records_upserted: number;
          records_failed: number;
        }>("/integrations/mercadolivre/sync/catalog", {
          method: "POST",
          body: JSON.stringify({ limit: 200, account_id: accountId ?? "" }),
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
        await fetchLogs().catch(() => undefined);
        const result = await syncRequest;
        await Promise.all([
          fetchMarketplaceStatus(),
          fetchMarketplaceCatalogVariations(),
          fetchLogs(),
        ]);
        setMarketplaceInfo(
          result.cancelled
            ? `Sync interrompido. Alterações revertidas. Lidos antes da interrupção: ${result.records_read}.`
            : `Sync concluído. Lidos: ${result.records_read}, atualizados: ${result.records_upserted}, falhas: ${result.records_failed}.`
        );
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao sincronizar catálogo Mercado Livre");
      } finally {
        setIsMarketplaceBusy(false);
      }
    })();
  };

  const handleSyncMarketplaceOrders = (accountId: string | undefined, mode: MarketplaceOrdersSyncMode = "normal") => {
    void (async () => {
      try {
        const modeLabel =
          mode === "incremental"
            ? "últimas vendas"
            : mode === "light"
              ? "últimas 48h"
              : mode === "normal"
                ? "últimos 60 dias"
                : "último ano";
        setIsMarketplaceBusy(true);
        setSyncError(null);
        setMarketplaceInfo(null);
        const syncRequest = apiFetch<{
          ok?: boolean;
          cancelled?: boolean;
          message?: string;
          records_read: number;
          records_upserted: number;
          records_failed: number;
          stopped_at_existing_order?: boolean;
        }>("/integrations/mercadolivre/sync/orders", {
          method: "POST",
          body: JSON.stringify({ mode, account_id: accountId ?? "" }),
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
        await fetchLogs().catch(() => undefined);
        const result = await syncRequest;
        await Promise.all([
          fetchMarketplaceStatus(),
          fetchMarketplaceOrders(),
          fetchMarketplaceOrdersDashboard(),
          fetchLogs(),
        ]);
        setMarketplaceInfo(
          result.cancelled
            ? `Sync de pedidos (${modeLabel}) interrompido. Alterações revertidas. Lidos antes da interrupção: ${result.records_read}.`
            : result.stopped_at_existing_order
              ? `Sync de pedidos (${modeLabel}) concluído até encontrar pedido já importado. Lidos: ${result.records_read}, novos/atualizados: ${result.records_upserted}, falhas: ${result.records_failed}.`
            : `Sync de pedidos (${modeLabel}) concluído. Lidos: ${result.records_read}, atualizados: ${result.records_upserted}, falhas: ${result.records_failed}.`
        );
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao sincronizar pedidos Mercado Livre");
      } finally {
        setIsMarketplaceBusy(false);
      }
    })();
  };

  const handleSyncMarketplaceProductAds = (
    accountId: string | undefined,
    mode: MarketplaceOrdersSyncMode = "incremental"
  ) => {
    void (async () => {
      try {
        const modeLabel =
          mode === "incremental"
            ? "hoje"
            : mode === "light"
              ? "últimas 48h"
              : mode === "normal"
                ? "últimos 60 dias"
                : "último ano";
        setIsMarketplaceBusy(true);
        setSyncError(null);
        setMarketplaceInfo(null);
        const result = await apiFetch<{
          ok?: boolean;
          message?: string;
          records_read: number;
          records_upserted: number;
          records_failed: number;
        }>("/integrations/mercadolivre/sync/product-ads", {
          method: "POST",
          body: JSON.stringify({ mode, account_id: accountId ?? "" }),
        });
        await Promise.all([fetchMarketplaceOrdersDashboard(), fetchLogs()]);
        setMarketplaceInfo(
          `Sync de Product Ads (${modeLabel}) concluído. Lidos: ${result.records_read}, atualizados: ${result.records_upserted}, falhas: ${result.records_failed}.`
        );
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao sincronizar Product Ads Mercado Livre");
      } finally {
        setIsMarketplaceBusy(false);
      }
    })();
  };

  const handleCancelMarketplaceSync = (runId: string) => {
    void (async () => {
      try {
        setCancelingMarketplaceRunIds((prev) => ({ ...prev, [runId]: true }));
        setSyncError(null);
        await apiFetch(`/integrations/mercadolivre/sync/${encodeURIComponent(runId)}/cancel`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        await fetchLogs();
        setMarketplaceInfo("Interrupção solicitada. O backend vai reverter a transação no próximo ponto de parada.");
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao solicitar interrupção da sincronização");
      } finally {
        setCancelingMarketplaceRunIds((prev) => ({ ...prev, [runId]: false }));
      }
    })();
  };

  const handleRecalculateAllMarketplaceOrderSnapshots = () => {
    void (async () => {
      try {
        setIsMarketplaceBusy(true);
        setSyncError(null);
        setMarketplaceInfo(null);
        const result = await apiFetch<{
          orders_processed: number;
          items_processed: number;
          items_updated: number;
          items_skipped: number;
        }>("/integrations/mercadolivre/orders/recalculate-snapshots", {
          method: "POST",
          body: JSON.stringify({}),
        });
        await Promise.all([fetchMarketplaceOrders(), fetchMarketplaceOrdersDashboard(), fetchLogs()]);
        setMarketplaceInfo(
          `Recalculo global concluído. Pedidos: ${result.orders_processed}, itens atualizados: ${result.items_updated}, ignorados: ${result.items_skipped}.`
        );
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao recalcular snapshots de custo");
      } finally {
        setIsMarketplaceBusy(false);
      }
    })();
  };

	  const handleRecalculateSingleMarketplaceOrderSnapshot = (orderId: string) => {
	    void (async () => {
      try {
        setIsMarketplaceBusy(true);
        setSyncError(null);
        setMarketplaceInfo(null);
        const result = await apiFetch<{
          marketplace_order_id: string;
          orders_processed: number;
          items_processed: number;
          items_updated: number;
          items_skipped: number;
        }>(`/integrations/mercadolivre/orders/${orderId}/recalculate-snapshots`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        await Promise.all([fetchMarketplaceOrders(), fetchMarketplaceOrdersDashboard(), fetchLogs()]);
        setMarketplaceInfo(
          `Pedido ${result.marketplace_order_id} recalculado. Itens atualizados: ${result.items_updated}, ignorados: ${result.items_skipped}.`
        );
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao recalcular snapshot do pedido");
      } finally {
        setIsMarketplaceBusy(false);
      }
	    })();
	  };

	  const handleOpenMarketplaceListingSkuConfig = (target: MarketplaceOrderSkuLinkTarget) => {
	    const listing =
	      (target.catalogVariationId
	        ? marketplaceCatalogVariationItems.find((item) => item.id === target.catalogVariationId)
	        : undefined) ??
	      marketplaceCatalogVariationItems.find((item) => {
	        if (item.account_id !== target.accountId) return false;
	        if (item.marketplace_item_id !== target.marketplaceItemId) return false;
	        if (target.marketplaceVariationId) {
	          return item.marketplace_variation_id === target.marketplaceVariationId;
	        }
	        return item.variation_key === target.variationKey || item.marketplace_variation_id === null;
	      });

	    setSelectedMarketplaceListingId(listing?.id ?? null);
	    setScreen("marketplaceListingConfig");
	  };

  const handleRunMarketplaceCustomRequest = async (params: {
    accountId: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    headers: Record<string, string>;
    body: string;
  }) => {
    return apiFetch<MarketplaceCustomRequestResponse>("/integrations/mercadolivre/custom-request", {
      method: "POST",
      body: JSON.stringify({
        account_id: params.accountId,
        method: params.method,
        path: params.path,
        headers: params.headers,
        body: params.body,
      }),
    });
  };

  const handleSaveMarketplaceNormalizationRules = async (
    rules: Array<{ raw_value: string; normalized_label: string; is_active: boolean }>
  ) => {
    const payload = await apiFetch<{ rules: MarketplaceNormalizationRule[] }>(
      "/integrations/marketplaces/normalization-rules",
      {
        method: "PUT",
        body: JSON.stringify({
          marketplace: "mercadolivre",
          category: "shipping_logistic_type",
          rules,
        }),
      }
    );
    setMarketplaceNormalizationRules(payload.rules ?? []);
    await fetchLogs().catch(() => undefined);
    setMarketplaceInfo("Normalização de nomes salva.");
  };

  const handleLinkMarketplaceListingSku = async (listingId: string, skuId: string | null) => {
    const payload = await apiFetch<{
      ok?: boolean;
      message?: string;
      variation?: MarketplaceCatalogVariationItem;
    }>(
      "/integrations/mercadolivre/catalog/variations/link-sku",
      {
        method: "POST",
        body: JSON.stringify({
          variation_id: listingId,
          sku_id: skuId ?? "",
        }),
      }
    );

    if (payload?.ok === false) {
      throw new Error(payload.message || "Falha ao atualizar vínculo do SKU.");
    }

    setMarketplaceCatalogVariationItems((prev) =>
      prev.map((item) => {
        if (item.id !== listingId) return item;
        if (!payload?.variation) {
          return {
            ...item,
            linked_sku_id: skuId,
          };
        }
        const normalizedVariation = normalizeMarketplaceCatalogVariationItem(payload.variation);
        return normalizedVariation;
      })
    );

    await fetchMarketplaceCatalogVariations();
    setMarketplaceInfo(skuId ? "SKU vinculado ao anúncio." : "Vínculo de SKU removido.");
  };

  const handleSetMarketplaceListingIgnored = async (listingId: string, isIgnored: boolean) => {
    const payload = await apiFetch<{
      ok?: boolean;
      message?: string;
      variation?: MarketplaceCatalogVariationItem;
    }>(
      "/integrations/mercadolivre/catalog/variations/ignore",
      {
        method: "POST",
        body: JSON.stringify({
          variation_id: listingId,
          is_ignored: isIgnored,
        }),
      }
    );

    if (payload?.ok === false) {
      throw new Error(payload.message || "Falha ao atualizar anúncio ignorado.");
    }

    const normalizedVariation = payload?.variation
      ? normalizeMarketplaceCatalogVariationItem(payload.variation)
      : null;

    setMarketplaceCatalogVariationItems((prev) =>
      prev.map((item) =>
        item.id === listingId
          ? normalizedVariation ?? { ...item, is_ignored: isIgnored ? 1 : 0 }
          : item
      )
    );

    await fetchMarketplaceCatalogVariations();
    setMarketplaceInfo(isIgnored ? "Anúncio marcado como ignorado." : "Anúncio removido da lista de ignorados.");
  };

  const buildQuoteApiPayload = (quote: Quote) => ({
    print_name: quote.name,
    description: quote.description,
    printer_id: quote.printerId ?? printers[0]?.id,
    cost_setting_id: activeCostSettingId,
    units_produced: quote.unitsProduced,
    print_time_minutes: quote.printTimeMin,
    post_processing_minutes: quote.postProcessingMin,
    packaging_cost_cents: quote.packagingCostCents,
    notes: "",
    status: "quoted",
    filament_items: quote.filamentUsages
      .map((line) => {
        const filament = filaments.find(
          (item) => item.name.toLowerCase() === line.filamentName.toLowerCase()
        );
        if (!filament) return null;
        return {
          filament_id: filament.id,
          used_weight_grams: line.usedWeightGrams,
        };
      })
      .filter(Boolean),
    extra_costs: quote.extraCosts.map((item) => ({
      item_name: item.itemName,
      item_cost_cents: item.itemCostCents,
    })),
    media: [
      ...quote.media3mf.map((uri) => ({ media_type: "3mf", local_uri: uri })),
      ...quote.mediaPhotos.map((uri) => ({ media_type: "photo", local_uri: uri })),
      ...quote.mediaVideos.map((uri) => ({ media_type: "video", local_uri: uri })),
    ].filter((item) => item.local_uri.startsWith("storage/media/")),
  });

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
              3D Manager - Mockups
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">
              {title}
            </Text>
          </View>
          <Pressable
            style={[styles.privacyButton, isPrivacyMode && styles.privacyButtonActive]}
            onPress={() => setIsPrivacyMode((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={isPrivacyMode ? "Desativar modo privacidade" : "Ativar modo privacidade"}
          >
            <View style={styles.privacyEye}>
              <View style={styles.privacyEyePupil} />
              {isPrivacyMode ? <View style={styles.privacyEyeSlash} /> : null}
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.nav}>
        <View style={styles.navRow}>
          <NavButton label="Home" active={screen === "dashboard"} onPress={() => setScreen("dashboard")} responsiveWidth />
          <NavDropdown
            label="Orçamentos"
            active={["printers", "filaments", "quotes", "quoteForm", "quoteView"].includes(screen)}
            isOpen={openNavDropdown === "orcamentos"}
            onToggle={() => setOpenNavDropdown((prev) => (prev === "orcamentos" ? null : "orcamentos"))}
            onSelectItem={(onPress) => {
              onPress();
              setOpenNavDropdown(null);
            }}
            items={[
              { label: "Impressoras", active: screen === "printers", onPress: () => setScreen("printers") },
              { label: "Filamentos", active: screen === "filaments", onPress: () => setScreen("filaments") },
              { label: "Orçamentos", active: ["quotes", "quoteForm", "quoteView"].includes(screen), onPress: () => setScreen("quotes") },
            ]}
          />
          <NavDropdown
            label="Estoque"
            active={["salesSkus", "salesSkuForm", "salesStock"].includes(screen)}
            isOpen={openNavDropdown === "estoque"}
            onToggle={() => setOpenNavDropdown((prev) => (prev === "estoque" ? null : "estoque"))}
            onSelectItem={(onPress) => {
              onPress();
              setOpenNavDropdown(null);
            }}
            items={[
              { label: "Cadastro de SKU", active: ["salesSkus", "salesSkuForm"].includes(screen), onPress: () => setScreen("salesSkus") },
              { label: "Movimentação de estoque", active: screen === "salesStock", onPress: () => setScreen("salesStock") },
            ]}
          />
          <NavDropdown
            label="Consignado"
            active={["salesPointsOverview", "salesConsignment", "salesPoints", "salesPointForm"].includes(screen)}
            isOpen={openNavDropdown === "consignado"}
            onToggle={() => setOpenNavDropdown((prev) => (prev === "consignado" ? null : "consignado"))}
            onSelectItem={(onPress) => {
              onPress();
              setOpenNavDropdown(null);
            }}
            items={[
              { label: "Visão dos pontos", active: screen === "salesPointsOverview", onPress: () => setScreen("salesPointsOverview") },
              { label: "Consignação", active: screen === "salesConsignment", onPress: () => setScreen("salesConsignment") },
              { label: "Pontos", active: ["salesPoints", "salesPointForm"].includes(screen), onPress: () => setScreen("salesPoints") },
            ]}
          />
          <NavButton label="Custos" active={screen === "fixedCosts"} onPress={() => setScreen("fixedCosts")} responsiveWidth />
          <NavDropdown
            label="Marketplaces"
	            active={["marketplaces", "marketplaceOrdersDashboard", "marketplaceListings", "marketplaceListingConfig"].includes(screen)}
            isOpen={openNavDropdown === "marketplaces"}
            onToggle={() => setOpenNavDropdown((prev) => (prev === "marketplaces" ? null : "marketplaces"))}
            onSelectItem={(onPress) => {
              onPress();
              setOpenNavDropdown(null);
            }}
	            items={[
	              { label: "Configurações", active: screen === "marketplaces", onPress: () => setScreen("marketplaces") },
	              { label: "Dashboard pedidos", active: screen === "marketplaceOrdersDashboard", onPress: () => setScreen("marketplaceOrdersDashboard") },
	              { label: "Anúncios", active: screen === "marketplaceListings", onPress: () => setScreen("marketplaceListings") },
	            ]}
          />
          <NavButton label="Logs" active={screen === "logs"} onPress={() => setScreen("logs")} responsiveWidth />
        </View>
      </View>
      {isSyncing ? (
        <View style={styles.statusBanner}>
          <Text style={styles.statusText}>Sincronizando dados...</Text>
        </View>
      ) : null}
      {syncError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{syncError}</Text>
        </View>
      ) : null}

      {screen === "dashboard" && <DashboardScreen goTo={setScreen} />}

      {screen === "printers" && (
        <PrintersScreen
          printers={printers}
          onCreate={() => {
            setEditingPrinterId(null);
            setScreen("printerForm");
          }}
          onEdit={(printerId) => {
            setEditingPrinterId(printerId);
            setScreen("printerForm");
          }}
          onDelete={(printerId) => {
            const printer = printers.find((item) => item.id === printerId);
            openDeleteConfirm(
              "Excluir impressora",
              `Deseja excluir ${printer?.name ?? "esta impressora"}?`,
              () => {
                void (async () => {
                  try {
                    await apiFetch(`/printers/${printerId}`, { method: "DELETE" });
                    await fetchPrinters();
                  } catch (error: any) {
                    setSyncError(error?.message ?? "Falha ao excluir impressora");
                  }
                })();
              }
            );
          }}
        />
      )}

      {screen === "printerForm" && (
        <PrinterFormScreen
          initialData={currentPrinter}
          onSave={(printer) => {
            void (async () => {
              try {
                if (currentPrinter) {
                  await apiFetch(`/printers/${currentPrinter.id}`, {
                    method: "PUT",
                    body: JSON.stringify({
                      name: printer.name,
                      model: printer.model,
                      power_watts: printer.powerWatts,
                      purchase_cost_cents: printer.purchaseCostCents,
                    }),
                  });
                } else {
                  await apiFetch("/printers", {
                    method: "POST",
                    body: JSON.stringify({
                      name: printer.name,
                      model: printer.model,
                      power_watts: printer.powerWatts,
                      purchase_cost_cents: printer.purchaseCostCents,
                    }),
                  });
                }
                await fetchPrinters();
                setEditingPrinterId(null);
                setScreen("printers");
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao salvar impressora");
              }
            })();
          }}
          onCancel={() => {
            setEditingPrinterId(null);
            setScreen("printers");
          }}
        />
      )}

      {screen === "filaments" && (
        <FilamentsScreen
          filaments={filaments}
          onCreate={() => {
            setEditingFilamentId(null);
            setScreen("filamentForm");
          }}
          onEdit={(filamentId) => {
            setEditingFilamentId(filamentId);
            setScreen("filamentForm");
          }}
          onDelete={(filamentId) => {
            const filament = filaments.find((item) => item.id === filamentId);
            openDeleteConfirm(
              "Excluir filamento",
              `Deseja excluir ${filament?.name ?? "este filamento"}?`,
              () => {
                void (async () => {
                  try {
                    await apiFetch(`/filaments/${filamentId}`, { method: "DELETE" });
                    await fetchFilaments();
                  } catch (error: any) {
                    await fetchFilaments();
                    setSyncError(error?.message ?? "Falha ao excluir filamento");
                  }
                })();
              }
            );
          }}
        />
      )}

      {screen === "filamentForm" && (
        <FilamentFormScreen
          initialData={currentFilament}
          onSave={(filament) => {
            void (async () => {
              try {
                const purchaseCostCents = Number(filament.purchaseCostCents);
                const purchasedWeightGrams = Number(filament.purchasedWeightGrams);

                if (
                  !Number.isFinite(purchaseCostCents) ||
                  !Number.isFinite(purchasedWeightGrams) ||
                  purchasedWeightGrams <= 0 ||
                  purchaseCostCents < 0
                ) {
                  throw new Error("Valor pago e quantidade do filamento precisam ser numeros validos.");
                }

                const payload = {
                  name: filament.name,
                  brand: filament.brand,
                  color: filament.color,
                  material_type: filament.materialType,
                  purchase_link: filament.purchaseLink || "",
                  notes: filament.notes || "",
                  purchase_cost_cents: Math.round(purchaseCostCents),
                  purchased_weight_grams: Math.round(purchasedWeightGrams),
                };

                if (currentFilament) {
                  await apiFetch(`/filaments/${currentFilament.id}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                  });
                } else {
                  await apiFetch("/filaments", {
                    method: "POST",
                    body: JSON.stringify(payload),
                  });
                }
                await Promise.all([
                  fetchFilaments(),
                  fetchQuotes(),
                  fetchSalesSkus(),
                  fetchSalesStock(),
                  fetchSalesPointsOverview(),
                ]);
                setEditingFilamentId(null);
                setScreen("filaments");
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao salvar filamento");
              }
            })();
          }}
          onCancel={() => {
            setEditingFilamentId(null);
            setScreen("filaments");
          }}
        />
      )}

      {screen === "fixedCosts" && (
        <FixedCostsScreen
          laborHourCost={laborHourCost}
          taxRate={taxRate}
          energyCostKwh={energyCostKwh}
          paybackMonths={paybackMonths}
          markupFinalSale={markupFinalSale}
          markupPresentialSale={markupPresentialSale}
          markupWholesaleConsignment={markupWholesaleConsignment}
          markupWholesaleCash={markupWholesaleCash}
          onChangeLaborHourCost={setLaborHourCost}
          onChangeTaxRate={setTaxRate}
          onChangeEnergyCostKwh={setEnergyCostKwh}
          onChangePaybackMonths={setPaybackMonths}
          onChangeMarkupFinalSale={setMarkupFinalSale}
          onChangeMarkupPresentialSale={setMarkupPresentialSale}
          onChangeMarkupWholesaleConsignment={setMarkupWholesaleConsignment}
          onChangeMarkupWholesaleCash={setMarkupWholesaleCash}
          onSave={() => {
            void (async () => {
              try {
                const created = await apiFetch<any>("/cost-settings", {
                  method: "POST",
                  body: JSON.stringify({
                    effective_from: new Date().toISOString(),
                    labor_hour_cost_cents: Math.round((parseLocaleNumber(laborHourCost) || 0) * 100),
                    energy_cost_kwh_cents: parseLocaleNumber(energyCostKwh) || 0,
                    tax_rate_bps: Math.round((parseLocaleNumber(taxRate) || 0) * 100),
                    printer_payback_months: parseLocaleNumber(paybackMonths) || 24,
                    markup_bps: Math.round((parseLocaleNumber(markupFinalSale) || 0) * 100),
                    markup_final_sale_bps: Math.round((parseLocaleNumber(markupFinalSale) || 0) * 100),
                    markup_presential_sale_bps: Math.round((parseLocaleNumber(markupPresentialSale) || 0) * 100),
                    markup_wholesale_consignment_bps: Math.round(
                      (parseLocaleNumber(markupWholesaleConsignment) || 0) * 100
                    ),
                    markup_wholesale_cash_bps: Math.round((parseLocaleNumber(markupWholesaleCash) || 0) * 100),
                    is_active: 1,
                  }),
                });
                setActiveCostSettingId(created.id);
                setSavedCosts((prev) => [
                  ...prev,
                  `Hora/homem: R$ ${laborHourCost} | kWh: ${energyCostKwh} centavos | Imposto: ${taxRate}% | Payback: ${paybackMonths} meses | Markup final: ${markupFinalSale}% | Markup presencial: ${markupPresentialSale}% | Atacado consignado: ${markupWholesaleConsignment}% | Atacado a vista: ${markupWholesaleCash}%`,
                ]);
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao salvar custos");
              }
            })();
          }}
          savedItems={savedCosts}
        />
      )}

      {screen === "quotes" && (
        <QuotesScreen
          quotes={quotes}
          filaments={filaments}
          printers={printers}
          laborHourCostCents={Math.round((parseLocaleNumber(laborHourCost) || 0) * 100)}
          energyCostKwhCents={parseLocaleNumber(energyCostKwh) || 0}
          paybackMonths={parseLocaleNumber(paybackMonths) || 1}
          taxRatePercent={parseLocaleNumber(taxRate) || 0}
          markupPercent={parseLocaleNumber(markupFinalSale) || 0}
          onCreate={() => {
            setEditingQuoteId(null);
            setScreen("quoteForm");
          }}
          onEdit={(quoteId) => {
            void (async () => {
              try {
                await fetchQuoteDetail(quoteId);
                setEditingQuoteId(quoteId);
                setScreen("quoteForm");
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao carregar orçamento");
              }
            })();
          }}
          onView={(quoteId) => {
            void (async () => {
              try {
                await fetchQuoteDetail(quoteId);
                setViewingQuoteId(quoteId);
                setScreen("quoteView");
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao carregar orçamento");
              }
            })();
          }}
          onDelete={(quoteId) => {
            const quote = quotes.find((item) => item.id === quoteId);
            openDeleteConfirm(
              "Excluir orçamento",
              `Deseja excluir ${maskSensitiveText(quote?.name ?? "este orçamento", isPrivacyMode, "este orçamento")}?`,
              () => {
                void (async () => {
                  try {
                    await apiFetch(`/quotes/${quoteId}`, { method: "DELETE" });
                    await fetchQuotes();
                  } catch (error: any) {
                    setSyncError(error?.message ?? "Falha ao excluir orçamento");
                  }
                })();
              }
            );
          }}
          isPrivacyMode={isPrivacyMode}
        />
      )}

      {screen === "quoteForm" && (
        <QuoteFormScreen
          initialData={currentQuote}
          filaments={filaments}
          printers={printers}
          laborHourCostCents={Math.round((parseLocaleNumber(laborHourCost) || 0) * 100)}
          energyCostKwhCents={parseLocaleNumber(energyCostKwh) || 0}
          paybackMonths={parseLocaleNumber(paybackMonths) || 1}
          taxRatePercent={parseLocaleNumber(taxRate) || 0}
          markupPercent={parseLocaleNumber(markupFinalSale) || 0}
          onSave={(quote) => {
            void (async () => {
              try {
                setSyncError(null);
                if (!activeCostSettingId) {
                  throw new Error("Defina e salve os custos antes de criar orçamentos.");
                }
                const payload = buildQuoteApiPayload(quote);
                if (editingQuoteId) {
                  await apiFetch(`/quotes/${editingQuoteId}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                  });
                } else {
                  await apiFetch("/quotes", {
                    method: "POST",
                    body: JSON.stringify(payload),
                  });
                }
                await Promise.all([fetchQuotes(), fetchSalesSkus(), fetchSalesStock(), fetchSalesPointsOverview()]);
                setEditingQuoteId(null);
                setScreen("quotes");
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao salvar orçamento");
              }
            })();
          }}
          onCancel={() => {
            setEditingQuoteId(null);
            setScreen("quotes");
          }}
        />
      )}

      {screen === "quoteView" && (
        <QuoteViewScreen
          quote={viewingQuote}
          filaments={filaments}
          printers={printers}
          laborHourCostCents={Math.round((parseLocaleNumber(laborHourCost) || 0) * 100)}
          energyCostKwhCents={parseLocaleNumber(energyCostKwh) || 0}
          paybackMonths={parseLocaleNumber(paybackMonths) || 1}
          taxRatePercent={parseLocaleNumber(taxRate) || 0}
          markupPercent={parseLocaleNumber(markupFinalSale) || 0}
          onBack={() => {
            setViewingQuoteId(null);
            setScreen("quotes");
          }}
        />
      )}

      {screen === "salesSkus" && (
        <SalesSkusScreen
          skus={salesSkus}
          stock={salesStock}
          onCreate={() => {
            setEditingSalesSkuId(null);
            setScreen("salesSkuForm");
          }}
          onEdit={(id) => {
            void (async () => {
              try {
                await fetchSalesSkuDetail(id);
                setEditingSalesSkuId(id);
                setScreen("salesSkuForm");
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao carregar SKU");
              }
            })();
          }}
          onDelete={(id) => {
            const sku = salesSkus.find((item) => item.id === id);
            openDeleteConfirm(
              "Excluir SKU",
              `Deseja excluir ${maskSensitiveText(sku?.name ?? "este SKU", isPrivacyMode, "este SKU")}?`,
              () => {
                void (async () => {
                  try {
                    await apiFetch(`/sales/skus/${id}`, { method: "DELETE" });
                    await Promise.all([fetchSalesSkus(), fetchSalesStock(), fetchSalesPointsOverview()]);
                  } catch (error: any) {
                    setSyncError(error?.message ?? "Falha ao excluir SKU");
                  }
                })();
              }
            );
          }}
          isPrivacyMode={isPrivacyMode}
        />
      )}

      {screen === "salesSkuForm" && (
        <SalesSkuFormScreen
          initialData={currentSalesSku}
          quotes={quotes}
          allSkus={salesSkus}
          onEnsureQuoteDetail={async (quoteId) => {
            try {
              return await fetchQuoteDetail(quoteId);
            } catch {
              return quotes.find((item) => item.id === quoteId);
            }
          }}
          wholesaleConsignmentMarkupPercent={parseLocaleNumber(markupWholesaleConsignment) || 75}
          wholesaleCashMarkupPercent={parseLocaleNumber(markupWholesaleCash) || 50}
          onSave={(sku, options) => {
            void (async () => {
              try {
                const payload = {
                  sku_code: sku.skuCode,
                  name: sku.name,
                  description: sku.description,
                  default_sale_price_cents: options.suggestSalePriceFromQuote
                    ? undefined
                    : sku.defaultSalePriceCents,
                  presential_sale_price_cents: sku.presentialSalePriceCents,
                  wholesale_consignment_price_cents: sku.wholesaleConsignmentPriceCents,
                  wholesale_cash_price_cents: sku.wholesaleCashPriceCents,
                  production_cost_cents: options.suggestProductionCostFromQuote
                    ? undefined
                    : sku.productionCostCents,
                  sync_final_sale_price_with_suggested: sku.syncFinalSalePriceWithSuggested,
                  sync_presential_sale_price_with_suggested: sku.syncPresentialSalePriceWithSuggested,
                  sync_wholesale_consignment_price_with_suggested: sku.syncWholesaleConsignmentPriceWithSuggested,
                  sync_wholesale_cash_price_with_suggested: sku.syncWholesaleCashPriceWithSuggested,
                  parent_sku_id: sku.parentSkuId || "",
                  source_quote_id: sku.sourceQuoteId || "",
                  sync_with_quote_pricing: sku.syncWithQuotePricing,
                  copy_from_quote: options.copyFromQuote,
                  copy_media_from_quote: options.copyMediaFromQuote,
                  barcodes: sku.barcodes,
                  media: [
                    ...sku.media3mf.map((uri) => ({ media_type: "3mf", local_uri: uri })),
                    ...sku.mediaPhotos.map((uri) => ({ media_type: "photo", local_uri: uri })),
                    ...sku.mediaVideos.map((uri) => ({ media_type: "video", local_uri: uri })),
                  ],
                };
                if (currentSalesSku) {
                  await apiFetch(`/sales/skus/${currentSalesSku.id}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                  });
                } else {
                  await apiFetch("/sales/skus", {
                    method: "POST",
                    body: JSON.stringify(payload),
                  });
                }
                await Promise.all([fetchSalesSkus(), fetchSalesStock(), fetchSalesPointsOverview()]);
                setEditingSalesSkuId(null);
                setScreen("salesSkus");
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao salvar SKU");
              }
            })();
          }}
          onCancel={() => {
            setEditingSalesSkuId(null);
            setScreen("salesSkus");
          }}
          isPrivacyMode={isPrivacyMode}
        />
      )}

      {screen === "salesPoints" && (
        <SalesPointsScreen
          points={salesPoints}
          onCreate={() => {
            setEditingSalesPointId(null);
            setScreen("salesPointForm");
          }}
          onEdit={(id) => {
            setEditingSalesPointId(id);
            setScreen("salesPointForm");
          }}
          onDelete={(id) => {
            const point = salesPoints.find((item) => item.id === id);
            openDeleteConfirm(
              "Excluir ponto",
              `Deseja excluir ${maskSensitiveText(point?.name ?? "este ponto", isPrivacyMode, "este ponto")}?`,
              () => {
                void (async () => {
                  try {
                    await apiFetch(`/sales/points/${id}`, { method: "DELETE" });
                    await Promise.all([fetchSalesPoints(), fetchSalesPointsOverview(), fetchConsignmentBatches()]);
                  } catch (error: any) {
                    setSyncError(error?.message ?? "Falha ao excluir ponto");
                  }
                })();
              }
            );
          }}
        />
      )}

      {screen === "salesPointForm" && (
        <SalesPointFormScreen
          initialData={currentSalesPoint}
          onSave={(point) => {
            void (async () => {
              try {
                const payload = {
                  name: point.name,
                  contact_name: point.contactName,
                  phone: point.phone,
                  email: point.email || "",
                  address: point.address,
                  commission_bps: point.commissionBps,
                  contact_period_days: point.contactPeriodDays,
                  notes: point.notes,
                };
                if (currentSalesPoint) {
                  await apiFetch(`/sales/points/${currentSalesPoint.id}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                  });
                } else {
                  await apiFetch("/sales/points", {
                    method: "POST",
                    body: JSON.stringify(payload),
                  });
                }
                await Promise.all([fetchSalesPoints(), fetchSalesPointsOverview()]);
                setEditingSalesPointId(null);
                setScreen("salesPoints");
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao salvar ponto de venda");
              }
            })();
          }}
          onCancel={() => {
            setEditingSalesPointId(null);
            setScreen("salesPoints");
          }}
        />
      )}

      {screen === "salesStock" && (
        <SalesStockScreen
          stock={salesStock}
          skus={salesSkus}
          onCreateMovement={async ({ skuId, movementType, quantityDelta, occurredAt, notes }) => {
              try {
                await apiFetch("/sales/stock/movements", {
                  method: "POST",
                  body: JSON.stringify({
                    sku_id: skuId,
                    movement_type: movementType,
                    quantity_delta: quantityDelta,
                    occurred_at: occurredAt || "",
                    notes,
                  }),
                });
                await Promise.all([fetchSalesStock(), fetchLogs()]);
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao registrar movimento de estoque");
                throw error;
              }
          }}
          onFetchSkuMovements={async (skuId) => {
            const rows = await apiFetch<any[]>(`/sales/stock/movements/${skuId}`);
            return rows.map(mapStockMovementHistoryFromApi);
          }}
          isPrivacyMode={isPrivacyMode}
        />
      )}

      {screen === "salesConsignment" && (
        <SalesConsignmentScreen
          skus={salesSkus}
          points={salesPoints}
          batches={consignmentBatches}
          selectedBatchDetail={selectedConsignmentBatchDetail}
          onSelectBatch={(batchId) => {
            void (async () => {
              try {
                await fetchConsignmentBatchDetail(batchId);
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao carregar detalhes do envio");
              }
            })();
          }}
          onCreateBatch={({ salesPointId, dispatchedAt, notes, items }) => {
            void (async () => {
              try {
                await apiFetch("/sales/consignment/batches", {
                  method: "POST",
                  body: JSON.stringify({
                    sales_point_id: salesPointId,
                    dispatched_at: dispatchedAt || "",
                    notes,
                    items: items.map((item) => ({
                      sku_id: item.skuId,
                      quantity_sent: item.quantitySent,
                      unit_sale_price_cents: item.unitSalePriceCents,
                    })),
                  }),
                });
                await Promise.all([
                  fetchConsignmentBatches(),
                  fetchConsignmentDashboard(),
                  fetchSalesStock(),
                  fetchSalesPointsOverview(),
                  fetchLogs(),
                ]);
                if (selectedConsignmentBatchId) {
                  await fetchConsignmentBatchDetail(selectedConsignmentBatchId);
                }
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao criar envio de consignação");
              }
            })();
          }}
          onRegisterSale={(batchItemId, soldQuantity, soldAt, notes) => {
            void (async () => {
              try {
                await apiFetch(`/sales/consignment/batch-items/${batchItemId}/sales`, {
                  method: "POST",
                  body: JSON.stringify({
                    sold_quantity: soldQuantity,
                    sold_at: soldAt || "",
                    notes,
                  }),
                });
                await Promise.all([
                  fetchConsignmentBatches(),
                  fetchConsignmentDashboard(),
                  fetchSalesPointsOverview(),
                  fetchLogs(),
                ]);
                if (selectedConsignmentBatchId) {
                  await fetchConsignmentBatchDetail(selectedConsignmentBatchId);
                }
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao registrar venda");
              }
            })();
          }}
          onRegisterReturn={(batchItemId, returnedQuantity, returnedAt, notes) => {
            void (async () => {
              try {
                await apiFetch(`/sales/consignment/batch-items/${batchItemId}/returns`, {
                  method: "POST",
                  body: JSON.stringify({
                    returned_quantity: returnedQuantity,
                    returned_at: returnedAt || "",
                    notes,
                  }),
                });
                await Promise.all([
                  fetchConsignmentBatches(),
                  fetchConsignmentDashboard(),
                  fetchSalesStock(),
                  fetchSalesPointsOverview(),
                  fetchLogs(),
                ]);
                if (selectedConsignmentBatchId) {
                  await fetchConsignmentBatchDetail(selectedConsignmentBatchId);
                }
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao registrar devolução");
              }
            })();
          }}
          isPrivacyMode={isPrivacyMode}
        />
      )}

      {screen === "salesPointsOverview" && (
        <SalesPointsOverviewScreen
          overview={salesPointsOverview}
          dashboard={consignmentDashboard}
          skus={salesSkus}
          points={salesPoints}
          onFetchDashboard={({ dateFrom, dateTo, salesPointId }) =>
            fetchConsignmentDashboard({ dateFrom, dateTo, salesPointId }).then(() => undefined)
          }
          onCreateConsignmentBatch={({ salesPointId, dispatchedAt, notes, items }) => {
            void (async () => {
              try {
                await apiFetch("/sales/consignment/batches", {
                  method: "POST",
                  body: JSON.stringify({
                    sales_point_id: salesPointId,
                    dispatched_at: dispatchedAt || "",
                    notes,
                    items: items.map((item) => ({
                      sku_id: item.skuId,
                      quantity_sent: item.quantitySent,
                      unit_sale_price_cents: item.unitSalePriceCents,
                    })),
                  }),
                });
                await Promise.all([
                  fetchConsignmentBatches(),
                  fetchConsignmentDashboard(),
                  fetchSalesStock(),
                  fetchSalesPointsOverview(),
                  fetchLogs(),
                ]);
                if (selectedConsignmentBatchId) {
                  await fetchConsignmentBatchDetail(selectedConsignmentBatchId);
                }
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao registrar envio de estoque");
              }
            })();
          }}
          onRegisterPointSale={(salesPointId, skuId, soldQuantity, soldAt, notes) => {
            void (async () => {
              try {
                await apiFetch(`/sales/consignment/points/${salesPointId}/sales`, {
                  method: "POST",
                  body: JSON.stringify({
                    sku_id: skuId,
                    sold_quantity: soldQuantity,
                    sold_at: soldAt || "",
                    notes,
                  }),
                });
                await Promise.all([
                  fetchConsignmentBatches(),
                  fetchConsignmentDashboard(),
                  fetchSalesPointsOverview(),
                  fetchLogs(),
                ]);
                if (selectedConsignmentBatchId) {
                  await fetchConsignmentBatchDetail(selectedConsignmentBatchId);
                }
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao registrar venda no ponto");
              }
            })();
          }}
          onRegisterPointReturn={(salesPointId, skuId, returnedQuantity, returnedAt, notes) => {
            void (async () => {
              try {
                await apiFetch(`/sales/consignment/points/${salesPointId}/returns`, {
                  method: "POST",
                  body: JSON.stringify({
                    sku_id: skuId,
                    returned_quantity: returnedQuantity,
                    returned_at: returnedAt || "",
                    notes,
                  }),
                });
                await Promise.all([
                  fetchConsignmentBatches(),
                  fetchConsignmentDashboard(),
                  fetchSalesStock(),
                  fetchSalesPointsOverview(),
                  fetchLogs(),
                ]);
                if (selectedConsignmentBatchId) {
                  await fetchConsignmentBatchDetail(selectedConsignmentBatchId);
                }
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao registrar retirada no ponto");
              }
            })();
          }}
          onMarkContactToday={(salesPointId) => {
            void (async () => {
              try {
                await apiFetch(`/sales/points/${salesPointId}/contact-today`, { method: "POST" });
                await Promise.all([fetchSalesPoints(), fetchSalesPointsOverview(), fetchLogs()]);
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao registrar contato de hoje");
              }
            })();
          }}
          onSetNextContact={(salesPointId, nextContactDate) => {
            void (async () => {
              try {
                await apiFetch(`/sales/points/${salesPointId}/next-contact`, {
                  method: "PUT",
                  body: JSON.stringify({ next_contact_at: nextContactDate }),
                });
                await Promise.all([fetchSalesPoints(), fetchSalesPointsOverview(), fetchLogs()]);
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao atualizar próximo contato");
              }
            })();
          }}
          isPrivacyMode={isPrivacyMode}
        />
      )}

      {screen === "marketplaces" && (
        <MarketplacesScreen
          status={marketplaceStatus}
          shopeeStatus={shopeeStatus}
          catalogVariationItems={marketplaceCatalogVariationItems}
          orderItems={marketplaceOrderItems}
          ordersDashboard={marketplaceOrdersDashboard}
          normalizationRules={marketplaceNormalizationRules}
          onStartMercadoLivreAuth={handleStartMercadoLivreAuth}
          onStartShopeeAuth={handleStartShopeeAuth}
	          onRefreshStatus={handleRefreshMarketplaceStatus}
	          onRefreshShopeeStatus={handleRefreshShopeeStatus}
	          onSyncCatalog={handleSyncMarketplaceCatalog}
	          onSyncOrders={handleSyncMarketplaceOrders}
	          onSyncProductAds={handleSyncMarketplaceProductAds}
          onDisconnectAll={handleDisconnectMarketplace}
          onDisconnectShopee={handleDisconnectShopee}
          onSetListingIgnored={handleSetMarketplaceListingIgnored}
          onSaveNormalizationRules={handleSaveMarketplaceNormalizationRules}
          onRunCustomRequest={handleRunMarketplaceCustomRequest}
	          isBusy={isMarketplaceBusy}
	          infoMessage={marketplaceInfo}
	          isPrivacyMode={isPrivacyMode}
	        />
	      )}

	      {screen === "marketplaceOrdersDashboard" && (
	        <ScrollView contentContainerStyle={styles.content}>
	          <Text style={styles.pageTitle}>Marketplaces {'>'} Dashboard de Pedidos</Text>
	          <Text style={styles.pageSubtitle}>Consulta financeira por período, logística e status</Text>
	          <MarketplaceOrdersDashboardSection
	            orderItems={marketplaceOrderItems}
	            accounts={marketplaceStatus?.accounts ?? []}
	            ordersDashboard={marketplaceOrdersDashboard}
	            normalizationRules={marketplaceNormalizationRules}
	            isBusy={isMarketplaceBusy}
	            taxRatePercent={parseLocaleNumber(taxRate) || 0}
		            onFetchOrdersDashboard={({ dateFrom, dateTo }) =>
		              fetchMarketplaceOrdersDashboard({ dateFrom, dateTo }).then(() => undefined)
		            }
		            onRecalculateAllOrderSnapshots={handleRecalculateAllMarketplaceOrderSnapshots}
		            onRecalculateSingleOrderSnapshot={handleRecalculateSingleMarketplaceOrderSnapshot}
		            onOpenSkuLinking={handleOpenMarketplaceListingSkuConfig}
		            isPrivacyMode={isPrivacyMode}
		          />
		        </ScrollView>
		      )}

		      {screen === "marketplaceListingConfig" && (
		        <MarketplaceListingConfigScreen
		          listing={currentMarketplaceListing}
		          skus={salesSkus}
		          salesStock={salesStock}
		          taxRatePercent={parseLocaleNumber(taxRate) || 0}
		          onLinkListingSku={handleLinkMarketplaceListingSku}
		          onSetListingIgnored={handleSetMarketplaceListingIgnored}
		          onBack={() => setScreen("marketplaceOrdersDashboard")}
		          isPrivacyMode={isPrivacyMode}
		        />
		      )}

		      {screen === "marketplaceListings" && (
        <MarketplaceListingsScreen
          status={marketplaceStatus}
          catalogVariationItems={marketplaceCatalogVariationItems}
          orderItems={marketplaceOrderItems}
          skus={salesSkus}
          salesStock={salesStock}
          taxRatePercent={parseLocaleNumber(taxRate) || 0}
          onLinkListingSku={handleLinkMarketplaceListingSku}
          onSetListingIgnored={handleSetMarketplaceListingIgnored}
          isPrivacyMode={isPrivacyMode}
        />
      )}

      {screen === "logs" && (
        <LogsScreen
          logs={logs}
          onCancelMarketplaceSync={handleCancelMarketplaceSync}
          cancelingRunIds={cancelingMarketplaceRunIds}
        />
      )}

      <ConfirmDialog
        visible={confirmState.visible}
        title={confirmState.title}
        message={confirmState.message}
        onCancel={() => setConfirmState((prev) => ({ ...prev, visible: false }))}
        onConfirm={confirmState.onConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f6f7fb",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#121828",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: "#f6f7fb",
    fontSize: 18,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: "#9fb0d3",
    marginTop: 4,
    fontSize: 13,
  },
  privacyButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
  },
  privacyButtonActive: {
    backgroundColor: "#0f172a",
    borderColor: "#64748b",
  },
  privacyEye: {
    width: 24,
    height: 14,
    borderWidth: 1.5,
    borderColor: "#f8fafc",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  privacyEyePupil: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
  },
  privacyEyeSlash: {
    position: "absolute",
    width: 28,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    transform: [{ rotate: "-35deg" }],
  },
  nav: {
    minHeight: 52,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#ffffff",
    position: "relative",
    zIndex: 200,
    elevation: 20,
    overflow: "visible",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    flexWrap: "wrap",
    position: "relative",
    zIndex: 210,
    overflow: "visible",
  },
  navButtonBase: {
    height: 36,
    maxHeight: 36,
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: 12,
    backgroundColor: "#e8ecf7",
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonFill: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 170,
    minWidth: 128,
    maxWidth: 220,
  },
  navButtonWide: {
    width: "100%",
  },
  navButtonCompact: {
    flex: 0,
    minWidth: 132,
    maxWidth: 180,
    paddingHorizontal: 12,
  },
  navDropdownWrap: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 170,
    minWidth: 128,
    maxWidth: 220,
    position: "relative",
    zIndex: 230,
    overflow: "visible",
  },
  navDropdownWrapCompact: {
    flex: 0,
    minWidth: 132,
    maxWidth: 180,
  },
  navDropdownTrigger: {
    flex: 0,
    width: "100%",
    height: 36,
    maxHeight: 36,
    minHeight: 36,
  },
  navDropdownMenu: {
    position: "absolute",
    top: 40,
    left: 0,
    width: "100%",
    minWidth: 180,
    maxWidth: 320,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9e0ef",
    borderRadius: 10,
    padding: 6,
    gap: 4,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 30,
    zIndex: 9999,
  },
  navDropdownItem: {
    width: "100%",
    alignSelf: "stretch",
    height: 36,
    minHeight: 36,
    maxHeight: 36,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 0,
    backgroundColor: "#f4f7ff",
    justifyContent: "center",
    marginBottom: 4,
  },
  navDropdownItemActive: {
    backgroundColor: "#dae5ff",
  },
  navDropdownItemText: {
    width: "100%",
    textAlign: "left",
  },
  navDropdownItemTextActive: {
    color: "#1b376d",
  },
  navButtonActive: {
    backgroundColor: "#213b74",
  },
  navButtonText: {
    color: "#23314f",
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  navButtonTextActive: {
    color: "#f4f8ff",
  },
  dashboardNavRow: {
    flexDirection: "row",
  },
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  quoteFormScreenRoot: {
    flex: 1,
  },
  quoteFormContentWeb: {
    maxWidth: 1400,
    width: "100%",
    alignSelf: "center",
  },
  quoteFormSplit: {
    gap: 12,
  },
  quoteFormSplitWeb: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  quoteFormMainColumn: {
    gap: 12,
  },
  quoteFormMainColumnWeb: {
    flex: 1.8,
  },
  quoteFormPreviewColumn: {
    gap: 12,
  },
  quoteFormPreviewColumnWeb: {
    flex: 1,
  },
  quoteFormPreviewSticky: {
    borderColor: "#dbe7ff",
    borderWidth: 1,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  summaryToggleButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef3ff",
    borderWidth: 1,
    borderColor: "#c7d7fb",
  },
  summaryToggleButtonText: {
    color: "#23407e",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 12,
  },
  summaryRevealButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef3ff",
    borderWidth: 1,
    borderColor: "#c7d7fb",
  },
  summaryRevealButtonText: {
    color: "#23407e",
    fontSize: 13,
    fontWeight: "700",
  },
  quoteFormFloatingHost: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  quoteFormPreviewFloating: {
    position: "absolute",
    top: 96,
    right: 16,
    zIndex: 10,
  },
  quoteFormRevealFloating: {
    position: "absolute",
    top: 96,
    right: 16,
    zIndex: 11,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1e2433",
  },
  pageSubtitle: {
    fontSize: 14,
    color: "#576179",
  },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#222f4d",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "#ebeff8",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1f2a45",
  },
  text: {
    fontSize: 13,
    color: "#334260",
  },
  statusBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: "#e0f2fe",
    borderWidth: 1,
    borderColor: "#7dd3fc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusText: {
    color: "#075985",
    fontSize: 13,
    fontWeight: "600",
  },
  infoBannerInline: {
    backgroundColor: "#ecfeff",
    borderWidth: 1,
    borderColor: "#67e8f9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "600",
  },
  errorBannerInline: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  marketplaceTokenBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  marketplaceTokenBadgeOk: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
  },
  marketplaceTokenBadgeWarn: {
    backgroundColor: "#fef9c3",
    borderColor: "#fde047",
  },
  marketplaceTokenBadgeExpired: {
    backgroundColor: "#fee2e2",
    borderColor: "#fca5a5",
  },
  marketplaceTokenBadgeText: {
    color: "#1f2937",
    fontSize: 12,
    fontWeight: "700",
  },
  marketplaceMethodInput: {
    width: 88,
  },
  marketplacePathInput: {
    flex: 1,
    minWidth: 220,
  },
  marketplaceSkuPickerField: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 320,
    minWidth: 260,
  },
  marketplaceSkuRemoveButton: {
    minWidth: 170,
  },
  marketplaceMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  marketplaceMetricCard: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 160,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9e0ef",
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  marketplaceMetricCardActive: {
    borderColor: "#1e3a79",
    backgroundColor: "#f3f7ff",
  },
  marketplaceMetricLabel: {
    fontSize: 12,
    color: "#5f6f93",
    fontWeight: "700",
  },
  marketplaceMetricValue: {
    fontSize: 20,
    color: "#1c2438",
    fontWeight: "800",
  },
  marketplaceMetricDelta: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 12,
    fontWeight: "800",
  },
  marketplaceMetricDeltaPositive: {
    backgroundColor: "#dcfce7",
    color: "#166534",
  },
  marketplaceMetricDeltaNegative: {
    backgroundColor: "#fee2e2",
    color: "#991b1b",
  },
  marketplaceMetricPrevious: {
    fontSize: 12,
    color: "#6b768f",
  },
  marketplaceMetricChartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  marketplaceMetricChartScale: {
    fontSize: 12,
    color: "#5f6f93",
    fontWeight: "700",
  },
  marketplaceMetricChartLegend: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
    marginTop: 4,
  },
  marketplaceMetricChartScrollContent: {
    minWidth: "100%",
    justifyContent: "center",
  },
  marketplaceMetricChartLayout: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 10,
  },
  marketplaceMetricChartScaleAxis: {
    width: 88,
    marginTop: 18,
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  marketplaceMetricChartFrame: {
    marginTop: 8,
    paddingTop: 10,
    paddingBottom: 4,
    position: "relative",
    alignItems: "center",
  },
  marketplaceMetricChartCanvas: {
    position: "relative",
    marginHorizontal: 8,
  },
  marketplaceMetricChartSegment: {
    position: "absolute",
    height: 3,
    borderRadius: 999,
  },
  marketplaceMetricChartDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#ffffff",
    zIndex: 3,
  },
  marketplaceMetricChartTooltip: {
    position: "absolute",
    width: 148,
    zIndex: 5,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  marketplaceMetricChartTooltipTitle: {
    fontSize: 11,
    color: "#5f6f93",
    fontWeight: "800",
  },
  marketplaceMetricChartTooltipText: {
    marginTop: 2,
    fontSize: 12,
    color: "#1c2438",
    fontWeight: "700",
  },
  marketplaceMetricChartGridLineTop: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 10,
    height: 1,
    backgroundColor: "#e6ebf5",
  },
  marketplaceMetricChartGridLineMiddle: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 100,
    height: 1,
    backgroundColor: "#eef2f8",
  },
  marketplaceMetricChartGridLineBottom: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 190,
    height: 1,
    backgroundColor: "#e6ebf5",
  },
  marketplaceMetricChartAxis: {
    marginHorizontal: 8,
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  marketplaceMetricChartAxisText: {
    fontSize: 11,
    color: "#6b768f",
    fontWeight: "700",
  },
  productAdsChartScroll: {
    alignItems: "flex-end",
    gap: 10,
    minHeight: 170,
    paddingTop: 12,
    paddingBottom: 4,
  },
  productAdsBarWrap: {
    alignItems: "center",
    justifyContent: "flex-end",
    width: 58,
    gap: 6,
  },
  productAdsBarValue: {
    color: "#1c2438",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  productAdsBarTrack: {
    width: 28,
    height: 110,
    borderRadius: 8,
    backgroundColor: "#eef3ff",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  productAdsBarFill: {
    width: "100%",
    backgroundColor: "#0f766e",
    borderRadius: 8,
  },
  productAdsBarLabel: {
    color: "#64708a",
    fontSize: 10,
    fontWeight: "700",
  },
  marketplaceChartsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "stretch",
  },
  marketplaceChartCard: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 360,
    minWidth: 320,
  },
  marketplaceChartsToggleButton: {
    minWidth: 110,
    height: 40,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  marketplaceChartsToggleButtonText: {
    fontSize: 12,
    lineHeight: 14,
  },
  marketplaceLogisticsChartWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  marketplaceLogisticsPieOuter: {
    width: 172,
    height: 172,
    alignItems: "center",
    justifyContent: "center",
  },
  marketplaceLogisticsPie: {
    width: 156,
    height: 156,
    borderRadius: 78,
    alignItems: "center",
    justifyContent: "center",
  },
  marketplaceLogisticsPieCenter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e6ebf5",
  },
  marketplaceLogisticsPieTotal: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1c2438",
  },
  marketplaceLogisticsPieLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b768f",
  },
  marketplaceLogisticsLegend: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 240,
    gap: 8,
  },
  marketplaceLogisticsLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  marketplaceLogisticsLegendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  marketplaceFilterGroup: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 260,
    minWidth: 220,
    gap: 6,
  },
  marketplaceStockStatusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  marketplaceStockStatusPill: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 130,
    borderWidth: 1,
    borderColor: "#d9e0ef",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
  },
  marketplaceStockStatusValue: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: "800",
    color: "#1c2438",
  },
  marketplaceStockPendingList: {
    gap: 8,
  },
  marketplaceStockPendingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderColor: "#f5d08a",
    backgroundColor: "#fffbeb",
    borderRadius: 8,
    padding: 10,
    flexWrap: "wrap",
  },
  marketplaceStockPendingText: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 300,
    gap: 2,
  },
  marketplaceCompactOrderCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9e0ef",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  marketplaceCompactOrderHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  marketplaceCompactOrderBuyer: {
    flex: 1,
    minWidth: 180,
  },
  marketplaceCompactOrderNumbers: {
    alignItems: "flex-end",
    gap: 4,
  },
  marketplaceOrderRevenue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1c2438",
  },
  marketplaceOrderProfitPositive: {
    fontSize: 13,
    fontWeight: "800",
    color: "#166534",
  },
  marketplaceOrderProfitNegative: {
    fontSize: 13,
    fontWeight: "800",
    color: "#991b1b",
  },
  marketplaceOrderDetails: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e6ebf5",
    gap: 4,
  },
  marketplaceOrderItemCompact: {
    backgroundColor: "#f6f8fc",
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
  },
  marketplaceOrderItemMissingSku: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fdba74",
  },
  skuPriceWarningCard: {
    borderColor: "#dc2626",
    borderWidth: 2,
    backgroundColor: "#fff5f5",
  },
  skuPriceWarningText: {
    color: "#b42318",
    fontSize: 13,
    fontWeight: "800",
  },
  marketplaceMissingSkuActions: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  marketplaceMissingSkuText: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 220,
    color: "#9a3412",
    fontSize: 12,
    fontWeight: "700",
  },
  marketplaceCalendarDayInRange: {
    backgroundColor: "#dbeafe",
  },
  marketplaceCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  marketplaceCheckboxButton: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#9cb0d8",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  marketplaceCheckboxButtonChecked: {
    backgroundColor: "#e0f2fe",
    borderColor: "#0ea5e9",
  },
  marketplaceCheckboxMark: {
    fontSize: 13,
    lineHeight: 13,
    color: "#0c4a6e",
    fontWeight: "700",
  },
  marketplaceApiResult: {
    marginTop: 8,
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 10,
  },
  marketplaceApiResultText: {
    color: "#e2e8f0",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1f2a45",
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9e0ef",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1c2438",
  },
  inputDisabled: {
    backgroundColor: "#f1f4fb",
    color: "#6b768f",
  },
  selectTrigger: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9e0ef",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectValueText: {
    color: "#1c2438",
    fontSize: 14,
  },
  selectPlaceholderText: {
    color: "#8a94ab",
    fontSize: 14,
  },
  selectMenu: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9e0ef",
    borderRadius: 12,
    padding: 8,
    gap: 4,
  },
  selectItem: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f4f7ff",
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  bulkMovementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "nowrap",
  },
  bulkMovementProductText: {
    flex: 1,
    minWidth: 0,
    color: "#3d4863",
    fontSize: 14,
  },
  bulkMovementQuantityInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9e0ef",
    borderRadius: 10,
    color: "#1c2438",
    fontSize: 14,
    height: 40,
    paddingHorizontal: 10,
    textAlign: "center",
    width: 72,
  },
  bulkMovementRemoveButton: {
    ...APP_BUTTON_THEME.danger.inactive,
    borderWidth: 1,
    height: 40,
    width: 92,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: 160,
    backgroundColor: "#f4f7ff",
    borderWidth: 1,
    borderColor: "#d9e0ef",
    borderRadius: 8,
    padding: 10,
  },
  metricLabel: {
    color: "#64708a",
    fontSize: 12,
    fontWeight: "700",
  },
  metricValue: {
    color: "#1c2438",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 4,
  },
  filterField: {
    flexGrow: 1,
    flexBasis: 180,
  },
  dashboardMovementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5eaf5",
    paddingVertical: 8,
  },
  dashboardMovementMainText: {
    flex: 1,
    minWidth: 0,
    color: "#1c2438",
    fontSize: 13,
    fontWeight: "700",
  },
  dashboardMovementMetaText: {
    color: "#3d4863",
    fontSize: 12,
    width: 86,
  },
  dashboardMovementPointText: {
    color: "#3d4863",
    fontSize: 12,
    width: 140,
  },
  appButtonBase: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  appButtonTextBase: {
    textAlign: "center",
  },
  appButtonPrimary: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
  appButtonSecondary: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
  appButtonSmall: {
    height: 40,
    minWidth: 110,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  appButtonDanger: {
    height: 40,
    minWidth: 110,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  appButtonNav: {
    height: 36,
    maxHeight: 36,
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: 12,
  },
  primaryButtonFixed: {
    ...APP_BUTTON_THEME.primary.inactive,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    ...APP_BUTTON_THEME.secondary.inactive,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    ...APP_BUTTON_THEME.primary.textInactive,
  },
  secondaryButtonText: {
    ...APP_BUTTON_THEME.secondary.textInactive,
  },
  selectedButton: {
    backgroundColor: "#1d4ed8",
    borderColor: "#1d4ed8",
  },
  selectedButtonText: {
    color: "#ffffff",
  },
  smallButton: {
    ...APP_BUTTON_THEME.small.inactive,
    borderWidth: 1,
    height: 40,
    minWidth: 110,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonText: {
    ...APP_BUTTON_THEME.small.textInactive,
  },
  dangerButton: {
    ...APP_BUTTON_THEME.danger.inactive,
    borderWidth: 1,
    height: 40,
    minWidth: 110,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerButtonText: {
    ...APP_BUTTON_THEME.danger.textInactive,
  },
  wideButton: {
    backgroundColor: "#eef3ff",
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  wideButtonText: {
    color: "#23407e",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  formulaButton: {
    backgroundColor: "#eef3ff",
    borderWidth: 1,
    borderColor: "#c7d7fb",
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  formulaButtonText: {
    color: "#23407e",
    fontSize: 11,
    fontWeight: "700",
  },
  formulaText: {
    fontSize: 12,
    color: "#334260",
    backgroundColor: "#f4f7ff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalBox: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2a45",
  },
  modalMessage: {
    fontSize: 13,
    color: "#334260",
  },
  calendarHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  calendarMonthLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: "#1f2a45",
    textTransform: "capitalize",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  calendarWeekDay: {
    width: "13.2%",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: "#5f6f93",
    marginBottom: 4,
  },
  calendarDayEmpty: {
    width: "13.2%",
    aspectRatio: 1,
  },
  calendarDayButton: {
    width: "13.2%",
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "#f4f7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayButtonSelected: {
    backgroundColor: "#1e3a79",
  },
  calendarDayText: {
    fontSize: 13,
    color: "#243253",
    fontWeight: "600",
  },
  calendarDayTextSelected: {
    color: "#f5f8ff",
  },
  contactDatePast: {
    color: "#b42318",
  },
  contactDateToday: {
    fontWeight: "700",
  },
  contactDateTomorrow: {
    color: "#1d4ed8",
  },
});
