import React, { ReactNode, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

type ScreenKey =
  | "dashboard"
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
  productionCostCents: number;
  estimatedTaxCents?: number;
  taxRateBpsApplied?: number;
  contributionMarginCents?: number;
  contributionMarginBps?: number;
  syncWithQuotePricing: boolean;
  suggestedFinalPriceCents: number;
  suggestedPresentialPriceCents: number;
  suggestedWholesaleConsignmentPriceCents: number;
  suggestedWholesaleCashPriceCents: number;
  parentSkuId?: string;
  sourceQuoteId?: string;
  parentSkuName?: string;
  sourceQuoteName?: string;
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
  createdAt: string;
};

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
    productionCostCents: row.production_cost_cents ?? 0,
    estimatedTaxCents: row.estimated_tax_cents,
    taxRateBpsApplied: row.tax_rate_bps_applied,
    contributionMarginCents: row.contribution_margin_cents,
    contributionMarginBps: row.contribution_margin_bps,
    syncWithQuotePricing: Number(row.sync_with_quote_pricing ?? 0) === 1,
    suggestedFinalPriceCents: row.suggested_final_price_cents ?? row.default_sale_price_cents ?? 0,
    suggestedPresentialPriceCents: row.suggested_presential_price_cents ?? 0,
    suggestedWholesaleConsignmentPriceCents: row.suggested_wholesale_consignment_price_cents ?? 0,
    suggestedWholesaleCashPriceCents: row.suggested_wholesale_cash_price_cents ?? 0,
    parentSkuId: row.parent_sku_id ?? undefined,
    sourceQuoteId: row.source_quote_id ?? undefined,
    parentSkuName: row.parent_sku_name ?? undefined,
    sourceQuoteName: row.source_quote_name ?? undefined,
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
  return {
    id: row.id,
    eventType: row.event_type ?? "",
    entityType: row.entity_type ?? "",
    entityId: row.entity_id ?? "",
    summary: row.summary ?? "",
    payloadJson: row.payload_json ?? "",
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

  const totalPrintTimeMin = quote.printTimeMin * unitsProduced;
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

  const extrasBatchTotalCents = quote.extraCosts.reduce((sum, item) => sum + item.itemCostCents, 0);
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
  const totalPrintTimeMin = quote.printTimeMin * unitsProduced;
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
  const extrasBatchCents = quote.extraCosts.reduce((sum, item) => sum + item.itemCostCents, 0);
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
    <Pressable
      onPress={onPress}
      style={[
        styles.navButtonBase,
        responsiveWidth ? (compact ? styles.navButtonCompact : styles.navButtonFill) : styles.navButtonWide,
        active && styles.navButtonActive,
      ]}
    >
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[styles.navButtonText, active && styles.navButtonTextActive]}
      >
        {label}
      </Text>
    </Pressable>
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
      <Pressable
        onPress={onToggle}
        style={[
          styles.navButtonBase,
          styles.navDropdownTrigger,
          compact && styles.navButtonCompact,
          active && styles.navButtonActive,
        ]}
      >
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.navButtonText, active && styles.navButtonTextActive]}
        >
          {label} v
        </Text>
      </Pressable>
      {isOpen && (
        <View style={styles.navDropdownMenu}>
          {items.map((item) => (
            <Pressable
              key={item.label}
              style={[
                styles.navButtonBase,
                styles.navDropdownItem,
                item.active && styles.navDropdownItemActive,
              ]}
              onPress={() => onSelectItem(item.onPress)}
            >
              <Text style={[styles.navButtonText, styles.navDropdownItemText, item.active && styles.navDropdownItemTextActive]}>
                {item.label}
              </Text>
            </Pressable>
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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "numeric";
  multiline?: boolean;
  editable?: boolean;
}) {
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
  options: string[];
  emptyText?: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
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
          {options.length === 0 && <Text style={styles.text}>{emptyText ?? "Nenhum item cadastrado."}</Text>}
          {options.map((option) => (
            <Pressable
              key={option}
              style={styles.selectItem}
              onPress={() => {
                onSelect(option);
              }}
            >
              <Text style={styles.text}>{option}</Text>
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
      <Text style={styles.pageTitle}>Dashboard</Text>
      <Text style={styles.pageSubtitle}>Atalhos do modulo de precificacao</Text>
      <Section title="Cadastros">
        <View style={styles.dashboardNavRow}>
          <NavButton label="Impressoras" onPress={() => goTo("printers")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Filamentos" onPress={() => goTo("filaments")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Custos" onPress={() => goTo("fixedCosts")} />
        </View>
      </Section>
      <Section title="Orçamentos">
        <View style={styles.dashboardNavRow}>
          <NavButton label="Lista de Orçamentos" onPress={() => goTo("quotes")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Novo Orçamento" onPress={() => goTo("quoteForm")} />
        </View>
      </Section>
      <Section title="Vendas Consignado">
        <View style={styles.dashboardNavRow}>
          <NavButton label="Cadastro de SKUs" onPress={() => goTo("salesSkus")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Estoque Geral" onPress={() => goTo("salesStock")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Pontos de Venda" onPress={() => goTo("salesPoints")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Controle no Ponto" onPress={() => goTo("salesConsignment")} />
        </View>
        <View style={styles.dashboardNavRow}>
          <NavButton label="Visão Geral dos Pontos" onPress={() => goTo("salesPointsOverview")} />
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
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Filamentos</Text>
      {filaments.map((f) => {
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
      <Pressable style={styles.primaryButtonFixed} onPress={onCreate}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
          Cadastrar novo filamento
        </Text>
      </Pressable>
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
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Orçamentos</Text>
      {quotes.map((q) => {
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
        const contributionCents =
          typeof q.contributionMarginCents === "number"
            ? q.contributionMarginCents
            : totals.finalUnitCents - totals.subtotalUnitCents - totals.taxUnitCents;
        const contributionBps =
          typeof q.contributionMarginBps === "number"
            ? q.contributionMarginBps
            : totals.finalUnitCents > 0
              ? Math.round((contributionCents * 10000) / totals.finalUnitCents)
              : 0;
        return (
          <View key={q.id} style={styles.card}>
            <Text style={styles.cardTitle}>{q.name}</Text>
            <Text style={styles.text}>Tempo impressao: {q.printTimeMin} min</Text>
            <Text style={styles.text}>Tempo pós-produção: {q.postProcessingMin} min</Text>
            <Text style={styles.text}>Unidades: {Math.max(1, q.unitsProduced || 1)}</Text>
            <Text style={styles.text}>Custo producao (un): {money(totals.subtotalUnitCents)}</Text>
            <Text style={styles.text}>Custo producao (lote): {money(totals.subtotalBatchCents)}</Text>
            <Text style={styles.text}>Custo sem payback/imp. (un): {money(noPaybackNoTax.totalUnitCents)}</Text>
            <Text style={styles.text}>Custo sem payback/imp. (lote): {money(noPaybackNoTax.totalBatchCents)}</Text>
            <Text style={styles.text}>Preco venda (un): {money(totals.finalUnitCents)}</Text>
            <Text style={styles.text}>Preco venda (lote): {money(totals.finalBatchCents)}</Text>
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
        );
      })}
      <Pressable style={styles.primaryButtonFixed} onPress={onCreate}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
          Adicionar novo orçamento
        </Text>
      </Pressable>
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
  const totalPrintTimeMin = quote.printTimeMin * unitsProduced;
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
  const extrasBatchTotalCents = quote.extraCosts.reduce((sum, item) => sum + item.itemCostCents, 0);
  const extrasUnitTotalCents = Math.round(extrasBatchTotalCents / unitsProduced);
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
  const contributionCents =
    typeof quote.contributionMarginCents === "number"
      ? quote.contributionMarginCents
      : totals.finalUnitCents - totals.subtotalUnitCents - totals.taxUnitCents;
  const contributionBps =
    typeof quote.contributionMarginBps === "number"
      ? quote.contributionMarginBps
      : totals.finalUnitCents > 0
        ? Math.round((contributionCents * 10000) / totals.finalUnitCents)
        : 0;

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
            - {item.itemName}: {money(item.itemCostCents)}
          </Text>
        ))}
        <Text style={styles.text}>Total extras no lote: {money(extrasBatchTotalCents)}</Text>
        <Text style={styles.text}>Total extras por unidade: {money(extrasUnitTotalCents)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Resumo final</Text>
        <View style={styles.row}>
          <Text style={styles.text}>Custo final de producao: {money(totals.subtotalUnitCents)} por unidade</Text>
          <Pressable style={styles.formulaButton} onPress={() => toggleFormula("subtotalUnit")}>
            <Text style={styles.formulaButtonText}>Fórmula</Text>
          </Pressable>
        </View>
        {openFormulaKeys.subtotalUnit ? (
          <Text style={styles.formulaText}>
            subtotal_un = arred(total_lote / unidades) = arred({money(totals.subtotalBatchCents)} / {unitsProduced})
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
            base_imposto_lote = arred(total_lote x (1 + {markupPercent}%)); imposto_lote = arred(base_imposto_lote x {taxRatePercent}%); imposto_un = arred(imposto_lote / unidades)
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
            base_imposto_lote = arred(total_lote x (1 + {markupPercent}%)); final_lote = base_imposto_lote + imposto_lote; final_un = arred(final_lote / unidades)
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
            total_lote = filamentos_lote + extras_lote + embalagem_lote + energia_lote + payback_lote + mao_de_obra_lote
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
            base_imposto_lote = arred(total_lote x (1 + {markupPercent}%)); imposto_lote = arred(base_imposto_lote x {taxRatePercent}%)
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
            base_imposto_lote = arred(total_lote x (1 + {markupPercent}%)); final_lote = base_imposto_lote + imposto_lote
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

  const totalPrintTimeMin = previewQuote.printTimeMin * previewQuote.unitsProduced;
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
  const extrasBatchTotalCents = extraList.reduce((sum, item) => sum + item.itemCostCents, 0);
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
  const previewContributionUnitCents =
    previewTotals.finalUnitCents - previewTotals.subtotalUnitCents - previewTotals.taxUnitCents;
  const previewContributionBatchCents =
    previewTotals.finalBatchCents - previewTotals.subtotalBatchCents - previewTotals.taxBatchCents;
  const previewContributionUnitBps =
    previewTotals.finalUnitCents > 0
      ? Math.round((previewContributionUnitCents * 10000) / previewTotals.finalUnitCents)
      : 0;
  const previewContributionBatchBps =
    previewTotals.finalBatchCents > 0
      ? Math.round((previewContributionBatchCents * 10000) / previewTotals.finalBatchCents)
      : 0;

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
              label="Quantidade usada (g)"
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
              label="Tempo de impressao (min)"
              value={printTime}
              onChangeText={setPrintTime}
              keyboardType="numeric"
            />
            <Field
              label="Tempo de pós-produção (min)"
              value={postTime}
              onChangeText={setPostTime}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Itens extras</Text>
            <Field label="Nome do item" value={extraName} onChangeText={setExtraName} />
            <Field label="Custo (R$)" value={extraCost} onChangeText={setExtraCost} keyboardType="numeric" />
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
            label="Custo de embalagem (R$)"
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
  onCreate,
  onEdit,
  onDelete,
}: {
  skus: SalesSku[];
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>SKUs</Text>
      <Text style={styles.pageSubtitle}>Cadastro de produtos para vendas em consignação</Text>
      {skus.map((sku) => {
        const estimatedTaxCents = sku.estimatedTaxCents ?? 0;
        const contributionCents =
          typeof sku.contributionMarginCents === "number"
            ? sku.contributionMarginCents
            : sku.defaultSalePriceCents - sku.productionCostCents - estimatedTaxCents;
        const contributionBps =
          typeof sku.contributionMarginBps === "number"
            ? sku.contributionMarginBps
            : sku.defaultSalePriceCents > 0
              ? Math.round((contributionCents * 10000) / sku.defaultSalePriceCents)
              : 0;

        return (
          <View key={sku.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {sku.skuCode} - {sku.name}
          </Text>
          {sku.parentSkuName ? <Text style={styles.text}>Derivado de: {sku.parentSkuName}</Text> : null}
          {sku.sourceQuoteName ? <Text style={styles.text}>Orçamento base: {sku.sourceQuoteName}</Text> : null}
          <Text style={styles.text}>
            Sync preço com orçamento: {sku.syncWithQuotePricing ? "Ativo" : "Inativo"}
          </Text>
          <Text style={styles.text}>Preco padrão: {money(sku.defaultSalePriceCents)}</Text>
          <Text style={styles.text}>Custo produção: {money(sku.productionCostCents)}</Text>
          <Text style={styles.text}>Imposto estimado: {money(estimatedTaxCents)}</Text>
          <Text style={styles.text}>
            Margem contribuição: {money(contributionCents)} ({percentFromBps(contributionBps)}%)
          </Text>
          <Text style={styles.text}>Sugestão venda final: {money(sku.suggestedFinalPriceCents)}</Text>
          <Text style={styles.text}>Sugestão presencial: {money(sku.suggestedPresentialPriceCents)}</Text>
          <Text style={styles.text}>
            Sugestão atacado consignado: {money(sku.suggestedWholesaleConsignmentPriceCents)}
          </Text>
          <Text style={styles.text}>Sugestão atacado a vista: {money(sku.suggestedWholesaleCashPriceCents)}</Text>
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
        );
      })}
      <Pressable style={styles.primaryButtonFixed} onPress={onCreate}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.primaryButtonText}>
          Novo SKU
        </Text>
      </Pressable>
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
}) {
  const [skuDraftId, setSkuDraftId] = useState(initialData?.id ?? createId("sales-sku"));
  const [skuCode, setSkuCode] = useState(initialData?.skuCode ?? generateInternalSkuCode());
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [finalSalePrice, setFinalSalePrice] = useState(
    initialData ? String(initialData.defaultSalePriceCents / 100) : ""
  );
  const [productionCost, setProductionCost] = useState(
    initialData ? String(initialData.productionCostCents / 100) : ""
  );
  const [wholesaleConsignmentPrice, setWholesaleConsignmentPrice] = useState(
    initialData ? String(initialData.suggestedWholesaleConsignmentPriceCents / 100) : ""
  );
  const [wholesaleCashPrice, setWholesaleCashPrice] = useState(
    initialData ? String(initialData.suggestedWholesaleCashPriceCents / 100) : ""
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
  const [media3mfList, setMedia3mfList] = useState<string[]>(initialData?.media3mf ?? []);
  const [mediaPhotos, setMediaPhotos] = useState<string[]>(initialData?.mediaPhotos ?? []);
  const [mediaVideos, setMediaVideos] = useState<string[]>(initialData?.mediaVideos ?? []);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setSkuDraftId(initialData?.id ?? createId("sales-sku"));
    setSkuCode(initialData?.skuCode ?? generateInternalSkuCode());
    setName(initialData?.name ?? "");
    setDescription(initialData?.description ?? "");
    setFinalSalePrice(initialData ? String(initialData.defaultSalePriceCents / 100) : "");
    setProductionCost(initialData ? String(initialData.productionCostCents / 100) : "");
    setWholesaleConsignmentPrice(
      initialData ? String(initialData.suggestedWholesaleConsignmentPriceCents / 100) : ""
    );
    setWholesaleCashPrice(initialData ? String(initialData.suggestedWholesaleCashPriceCents / 100) : "");
    setParentSkuId(initialData?.parentSkuId ?? "");
    setLinkedQuoteId(initialData?.sourceQuoteId ?? "");
    setCopyQuoteId(initialData?.sourceQuoteId ?? "");
    setCopyFromQuote(Boolean(initialData?.sourceQuoteId));
    setCopyMediaFromQuote(Boolean(initialData?.sourceQuoteId));
    setSyncWithQuotePricing(initialData?.syncWithQuotePricing ?? false);
    setMedia3mfList(initialData?.media3mf ?? []);
    setMediaPhotos(initialData?.mediaPhotos ?? []);
    setMediaVideos(initialData?.mediaVideos ?? []);
    setFormError(null);
  }, [initialData]);

  const skuOptions = allSkus.filter((item) => item.id !== initialData?.id);
  const selectedParentSkuName =
    parentSkuId ? skuOptions.find((item) => item.id === parentSkuId)?.name ?? "" : "";
  const quoteOptions = useMemo(() => {
    const occurrences = new Map<string, number>();
    return quotes.map((item) => {
      const seen = (occurrences.get(item.name) ?? 0) + 1;
      occurrences.set(item.name, seen);
      return {
        id: item.id,
        label: seen > 1 ? `${item.name} (${seen})` : item.name,
      };
    });
  }, [quotes]);
  const quoteOptionLabels = quoteOptions.map((item) => item.label);
  const selectedLinkedQuoteName =
    linkedQuoteId
      ? (() => {
          const q = quoteOptions.find((item) => item.id === linkedQuoteId);
          return q?.label ?? "";
        })()
      : "";

  const selectedCopyQuoteName =
    copyQuoteId
      ? (() => {
          const q = quoteOptions.find((item) => item.id === copyQuoteId);
          return q?.label ?? "";
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

  const handleSave = () => {
    const parsedDefaultPrice = Math.round(parseLocaleNumber(finalSalePrice) * 100);
    const parsedProductionCost = Math.round(parseLocaleNumber(productionCost) * 100);
    const parsedWholesaleConsignmentPrice = Math.round(parseLocaleNumber(wholesaleConsignmentPrice) * 100);
    const parsedWholesaleCashPrice = Math.round(parseLocaleNumber(wholesaleCashPrice) * 100);
    const suggestSalePriceFromQuote = !finalSalePrice.trim() && Boolean(linkedQuoteId);
    const suggestProductionCostFromQuote = !productionCost.trim() && Boolean(linkedQuoteId);

    if (
      (!name.trim() && !copyFromQuote) ||
      (!Number.isFinite(parsedDefaultPrice) && !suggestSalePriceFromQuote) ||
      (!Number.isFinite(parsedProductionCost) && !suggestProductionCostFromQuote) ||
      (!Number.isFinite(parsedWholesaleConsignmentPrice) && !syncWithQuotePricing) ||
      (!Number.isFinite(parsedWholesaleCashPrice) && !syncWithQuotePricing) ||
      (!suggestSalePriceFromQuote && parsedDefaultPrice < 0) ||
      (!suggestProductionCostFromQuote && parsedProductionCost < 0) ||
      (!syncWithQuotePricing && parsedWholesaleConsignmentPrice < 0) ||
      (!syncWithQuotePricing && parsedWholesaleCashPrice < 0)
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
        productionCostCents: Number.isFinite(parsedProductionCost) ? parsedProductionCost : 0,
        syncWithQuotePricing,
        suggestedFinalPriceCents: Number.isFinite(parsedDefaultPrice) ? parsedDefaultPrice : 0,
        suggestedPresentialPriceCents: initialData?.suggestedPresentialPriceCents ?? 0,
        suggestedWholesaleConsignmentPriceCents: Number.isFinite(parsedWholesaleConsignmentPrice)
          ? parsedWholesaleConsignmentPrice
          : 0,
        suggestedWholesaleCashPriceCents: Number.isFinite(parsedWholesaleCashPrice) ? parsedWholesaleCashPrice : 0,
        parentSkuId: parentSkuId || undefined,
        sourceQuoteId: linkedQuoteId || undefined,
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
      <Field label="Nome" value={name} onChangeText={setName} />
      <Field label="Descricao" value={description} onChangeText={setDescription} multiline />
      <SelectField
        label="SKU derivado de"
        value={selectedParentSkuName}
        placeholder="Nenhum (SKU raiz)"
        options={skuOptions.map((item) => item.name)}
        isOpen={isParentSkuOpen}
        emptyText="Nenhum SKU pai disponível."
        onToggle={() => setIsParentSkuOpen((prev) => !prev)}
        onSelect={(value) => {
          const parent = skuOptions.find((item) => item.name === value);
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
          const quote = quoteOptions.find((item) => item.label === value);
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
          const quote = quoteOptions.find((item) => item.label === value);
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
        editable={!syncWithQuotePricing}
      />
      <Field
        label="Preço venda atacado consignado (R$)"
        value={wholesaleConsignmentPrice}
        onChangeText={setWholesaleConsignmentPrice}
        keyboardType="numeric"
        editable={!syncWithQuotePricing}
      />
      <Field
        label="Preço venda atacado a vista (R$)"
        value={wholesaleCashPrice}
        onChangeText={setWholesaleCashPrice}
        keyboardType="numeric"
        editable={!syncWithQuotePricing}
      />

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
}: {
  stock: SalesStockOverview[];
  skus: SalesSku[];
  onCreateMovement: (args: {
    skuId: string;
    movementType: "adjustment_in" | "adjustment_out";
    quantityDelta: number;
    occurredAt: string;
    notes: string;
  }) => void;
  onFetchSkuMovements: (skuId: string) => Promise<StockMovementHistoryItem[]>;
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

  const selectedSkuName = skus.find((item) => item.id === skuId)?.name ?? "";
  const movementLabelMap: Record<string, string> = {
    adjustment_in: "Ajuste entrada",
    adjustment_out: "Ajuste saída",
  };
  const historyTypeLabel: Record<string, string> = {
    adjustment_in: "Entrada",
    adjustment_out: "Saída",
    consignment_out: "Consignado (saída)",
    consignment_return: "Retorno consignado",
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
          options={skus.map((item) => item.name)}
          emptyText="Cadastre SKUs primeiro."
          isOpen={isSkuOpen}
          onToggle={() => setIsSkuOpen((prev) => !prev)}
          onSelect={(name) => {
            const sku = skus.find((item) => item.name === name);
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
            onCreateMovement({
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
              {item.skuCode} - {item.name}
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
                  setHistorySkuLabel(`${item.skuCode} - ${item.name}`);
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

function SalesConsignmentScreen({
  skus,
  points,
  batches,
  selectedBatchDetail,
  onSelectBatch,
  onCreateBatch,
  onRegisterSale,
  onRegisterReturn,
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

  const selectedPointName = points.find((item) => item.id === salesPointId)?.name ?? "";
  const selectedSkuName = skus.find((item) => item.id === skuId)?.name ?? "";
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
          options={points.map((item) => item.name)}
          isOpen={isPointOpen}
          emptyText="Cadastre pontos de venda primeiro."
          onToggle={() => setIsPointOpen((prev) => !prev)}
          onSelect={(name) => {
            const point = points.find((item) => item.name === name);
            if (!point) return;
            setSalesPointId(point.id);
            setIsPointOpen(false);
          }}
        />
        <SelectField
          label="SKU do item"
          value={selectedSkuName}
          placeholder="Selecione um SKU"
          options={skus.map((item) => item.name)}
          isOpen={isSkuOpen}
          emptyText="Cadastre SKUs primeiro."
          onToggle={() => setIsSkuOpen((prev) => !prev)}
          onSelect={(name) => {
            const sku = skus.find((item) => item.name === name);
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
              {item.skuLabel} | qtd: {item.quantitySent} | valor: {money(item.unitSalePriceCents)}
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
            <Text style={styles.text}>{batch.salesPointName}</Text>
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
          <Text style={styles.cardTitle}>Detalhes do envio - {selectedBatchDetail.salesPointName}</Text>
          {selectedBatchDetail.items.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.text}>
                {item.skuCode} - {item.skuName}
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
  onMarkContactToday,
  onSetNextContact,
}: {
  overview: SalesPointOverview[];
  onMarkContactToday: (salesPointId: string) => void;
  onSetNextContact: (salesPointId: string, nextContactDate: string) => void;
}) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingPointId, setEditingPointId] = useState("");
  const [nextContactDateInput, setNextContactDateInput] = useState("");
  const [calendarCursor, setCalendarCursor] = useState(new Date());

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

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Visão Geral dos Pontos</Text>
      {overview.length === 0 && <Text style={styles.text}>Sem dados de consignação ainda.</Text>}
      {overview.map((point) => (
        <View key={point.salesPointId} style={styles.card}>
          <Text style={styles.cardTitle}>{point.salesPointName}</Text>
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
          </View>
          <Text style={styles.text}>Produtos ativos no ponto: {point.activeProductsCount}</Text>
          <Text style={styles.text}>Renda esperada: {money(point.expectedRevenueCents)}</Text>
          <Text style={styles.text}>Renda realizada: {money(point.realizedRevenueCents)}</Text>
          {point.productsAtPoint.map((product) => (
            <View key={`${point.salesPointId}-${product.skuId}`} style={styles.card}>
              <Text style={styles.text}>
                {product.skuCode} - {product.skuName}
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

function LogsScreen({ logs }: { logs: OperationLogItem[] }) {
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
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Logs</Text>
      <Text style={styles.pageSubtitle}>Histórico de movimentações e ações</Text>
      {logs.length === 0 && <Text style={styles.text}>Sem logs até o momento.</Text>}
      {logs.map((log) => (
        <View key={log.id} style={styles.card}>
          <Text style={styles.cardTitle}>{typeLabels[log.eventType] ?? log.eventType}</Text>
          <Text style={styles.text}>Resumo: {log.summary}</Text>
          <Text style={styles.text}>Data: {dateOnly(log.createdAt)}</Text>
          <Text style={styles.text}>Entidade: {log.entityType}{log.entityId ? ` (${log.entityId})` : ""}</Text>
        </View>
      ))}
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

  const [printers, setPrinters] = useState<Printer[]>([]);
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [salesSkus, setSalesSkus] = useState<SalesSku[]>([]);
  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([]);
  const [salesStock, setSalesStock] = useState<SalesStockOverview[]>([]);
  const [consignmentBatches, setConsignmentBatches] = useState<ConsignmentBatch[]>([]);
  const [selectedConsignmentBatchId, setSelectedConsignmentBatchId] = useState<string | null>(null);
  const [selectedConsignmentBatchDetail, setSelectedConsignmentBatchDetail] = useState<ConsignmentBatchDetail | undefined>(
    undefined
  );
  const [salesPointsOverview, setSalesPointsOverview] = useState<SalesPointOverview[]>([]);
  const [logs, setLogs] = useState<OperationLogItem[]>([]);
  const [activeCostSettingId, setActiveCostSettingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
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
  const [openNavDropdown, setOpenNavDropdown] = useState<"orcamentos" | "estoque" | "consignado" | null>(null);

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

  const fetchSalesPointsOverview = async () => {
    const rows = await apiFetch<any[]>("/sales/points/overview");
    setSalesPointsOverview(rows.map(mapSalesPointOverviewFromApi));
  };

  const fetchLogs = async () => {
    const rows = await apiFetch<any[]>("/logs");
    setLogs(rows.map(mapOperationLogFromApi));
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
          fetchSalesPointsOverview(),
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
        <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
          3D Manager - Mockups
        </Text>
        <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">
          {title}
        </Text>
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
              `Deseja excluir ${quote?.name ?? "este orçamento"}?`,
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
            openDeleteConfirm("Excluir SKU", `Deseja excluir ${sku?.name ?? "este SKU"}?`, () => {
              void (async () => {
                try {
                  await apiFetch(`/sales/skus/${id}`, { method: "DELETE" });
                  await Promise.all([fetchSalesSkus(), fetchSalesStock(), fetchSalesPointsOverview()]);
                } catch (error: any) {
                  setSyncError(error?.message ?? "Falha ao excluir SKU");
                }
              })();
            });
          }}
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
                  production_cost_cents: options.suggestProductionCostFromQuote
                    ? undefined
                    : sku.productionCostCents,
                  suggested_wholesale_consignment_price_cents: sku.suggestedWholesaleConsignmentPriceCents,
                  suggested_wholesale_cash_price_cents: sku.suggestedWholesaleCashPriceCents,
                  parent_sku_id: sku.parentSkuId || "",
                  source_quote_id: sku.sourceQuoteId || "",
                  sync_with_quote_pricing: sku.syncWithQuotePricing,
                  copy_from_quote: options.copyFromQuote,
                  copy_media_from_quote: options.copyMediaFromQuote,
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
            openDeleteConfirm("Excluir ponto", `Deseja excluir ${point?.name ?? "este ponto"}?`, () => {
              void (async () => {
                try {
                  await apiFetch(`/sales/points/${id}`, { method: "DELETE" });
                  await Promise.all([fetchSalesPoints(), fetchSalesPointsOverview(), fetchConsignmentBatches()]);
                } catch (error: any) {
                  setSyncError(error?.message ?? "Falha ao excluir ponto");
                }
              })();
            });
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
          onCreateMovement={({ skuId, movementType, quantityDelta, occurredAt, notes }) => {
            void (async () => {
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
              }
            })();
          }}
          onFetchSkuMovements={async (skuId) => {
            const rows = await apiFetch<any[]>(`/sales/stock/movements/${skuId}`);
            return rows.map(mapStockMovementHistoryFromApi);
          }}
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
                await Promise.all([fetchConsignmentBatches(), fetchSalesStock(), fetchSalesPointsOverview(), fetchLogs()]);
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
                await Promise.all([fetchConsignmentBatches(), fetchSalesPointsOverview(), fetchLogs()]);
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
                await Promise.all([fetchConsignmentBatches(), fetchSalesStock(), fetchSalesPointsOverview(), fetchLogs()]);
                if (selectedConsignmentBatchId) {
                  await fetchConsignmentBatchDetail(selectedConsignmentBatchId);
                }
              } catch (error: any) {
                setSyncError(error?.message ?? "Falha ao registrar devolução");
              }
            })();
          }}
        />
      )}

      {screen === "salesPointsOverview" && (
        <SalesPointsOverviewScreen
          overview={salesPointsOverview}
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
        />
      )}

      {screen === "logs" && <LogsScreen logs={logs} />}

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
  primaryButtonFixed: {
    backgroundColor: "#1e3a79",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#9cb0d8",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#f5f8ff",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryButtonText: {
    color: "#29467f",
    fontSize: 13,
    fontWeight: "700",
  },
  smallButton: {
    backgroundColor: "#eef3ff",
    height: 40,
    minWidth: 110,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonText: {
    color: "#23407e",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  dangerButton: {
    backgroundColor: "#ffe8e8",
    borderWidth: 1,
    borderColor: "#f2bcbc",
    height: 40,
    minWidth: 110,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerButtonText: {
    color: "#902222",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
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
