import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { v4 as uuidv4 } from "uuid";
import { ZodError, z } from "zod";
import { createDb, nowIso, runMigrations } from "./db.js";
import { ensureMediaStorage, persistMediaFile, persistUploadedBuffer } from "./media-store.js";
import { computeQuote } from "./pricing.js";

const currentFilePath = fileURLToPath(import.meta.url);
const backendRoot = path.resolve(path.dirname(currentFilePath), "..");
const dbPath = process.env.DB_PATH ?? path.resolve(backendRoot, "data.sqlite");
const migrationsDir = path.resolve(backendRoot, "migrations");
const mediaRoot = process.env.MEDIA_ROOT ?? path.resolve(backendRoot, "storage", "media");

const db = createDb(dbPath);
runMigrations(db, migrationsDir);
ensureMediaStorage(mediaRoot);

const app = Fastify({ logger: true });
await app.register(cors, {
  origin: true,
});
await app.register(multipart, {
  limits: {
    fileSize: 1024 * 1024 * 1024,
    files: 10,
  },
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    reply.code(400).send({
      message: "Validation error",
      issues: error.issues,
    });
    return;
  }
  if ((error as any).statusCode === 413) {
    reply.code(413).send({
      message: "Arquivo muito grande. Limite atual: 1 GB por arquivo.",
    });
    return;
  }
  reply.send(error);
});

const printerSchema = z.object({
  name: z.string().min(1),
  model: z.string().min(1),
  power_watts: z.number().int().positive(),
  purchase_cost_cents: z.number().int().nonnegative(),
});

const filamentSchema = z.object({
  name: z.string().min(1),
  brand: z.string().min(1),
  color: z.string().min(1),
  material_type: z.string().min(1),
  purchase_link: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional().default(""),
  purchase_cost_cents: z.number().int().nonnegative(),
  purchased_weight_grams: z.number().int().positive(),
});

const costSettingsSchema = z.object({
  effective_from: z.string().min(1),
  labor_hour_cost_cents: z.number().int().nonnegative(),
  energy_cost_kwh_cents: z.number().int().nonnegative(),
  tax_rate_bps: z.number().int().nonnegative(),
  printer_payback_months: z.number().int().positive(),
  markup_bps: z.number().int().nonnegative(),
  markup_final_sale_bps: z.number().int().nonnegative().optional(),
  markup_presential_sale_bps: z.number().int().nonnegative().optional().default(12000),
  markup_wholesale_consignment_bps: z.number().int().nonnegative().optional().default(7500),
  markup_wholesale_cash_bps: z.number().int().nonnegative().optional().default(5000),
  is_active: z.number().int().optional().default(1),
});

const quoteSchema = z.object({
  print_name: z.string().min(1),
  description: z.string().optional().default(""),
  printer_id: z.string().min(1),
  cost_setting_id: z.string().min(1),
  units_produced: z.number().int().positive().optional().default(1),
  print_time_minutes: z.number().int().nonnegative(),
  post_processing_minutes: z.number().int().nonnegative(),
  packaging_cost_cents: z.number().int().nonnegative().optional().default(0),
  notes: z.string().optional().default(""),
  status: z.enum(["draft", "quoted", "approved", "archived"]).optional().default("quoted"),
  filament_items: z
    .array(
      z.object({
        filament_id: z.string().min(1),
        used_weight_grams: z.number().int().positive(),
      })
    )
    .default([]),
  extra_costs: z
    .array(
      z.object({
        item_name: z.string().min(1),
        item_cost_cents: z.number().int().nonnegative(),
      })
    )
    .default([]),
  media: z
    .array(
      z.object({
        media_type: z.enum(["photo", "video", "3mf"]),
        local_uri: z.string().min(1),
      })
    )
    .default([]),
});

const salesSkuSchema = z.object({
  sku_code: z.string().optional().default(""),
  name: z.string().optional().default(""),
  description: z.string().optional().default(""),
  default_sale_price_cents: z.number().int().nonnegative().optional(),
  production_cost_cents: z.number().int().nonnegative().optional(),
  suggested_wholesale_consignment_price_cents: z.number().int().nonnegative().optional(),
  suggested_wholesale_cash_price_cents: z.number().int().nonnegative().optional(),
  parent_sku_id: z.string().optional().or(z.literal("")),
  source_quote_id: z.string().optional().or(z.literal("")),
  sync_with_quote_pricing: z.boolean().optional(),
  copy_from_quote: z.boolean().optional().default(false),
  copy_media_from_quote: z.boolean().optional().default(false),
  media: z
    .array(
      z.object({
        media_type: z.enum(["photo", "video", "3mf"]),
        local_uri: z.string().min(1),
      })
    )
    .default([]),
});

const salesPointSchema = z.object({
  name: z.string().min(1),
  contact_name: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional().default(""),
  commission_bps: z.number().int().nonnegative().optional().default(0),
  contact_period_days: z.number().int().positive().optional().default(30),
  notes: z.string().optional().default(""),
});

const salesPointNextContactSchema = z.object({
  next_contact_at: z.string().min(1),
});

const stockMovementSchema = z.object({
  sku_id: z.string().min(1),
  movement_type: z.enum(["initial", "adjustment_in", "adjustment_out"]),
  quantity_delta: z.number().int().refine((value) => value !== 0, "quantity_delta must not be 0"),
  occurred_at: z.string().optional().or(z.literal("")),
  notes: z.string().optional().default(""),
});

const consignmentBatchSchema = z.object({
  sales_point_id: z.string().min(1),
  dispatched_at: z.string().optional().or(z.literal("")),
  expected_settlement_at: z.string().optional().or(z.literal("")),
  notes: z.string().optional().default(""),
  items: z
    .array(
      z.object({
        sku_id: z.string().min(1),
        quantity_sent: z.number().int().positive(),
        unit_sale_price_cents: z.number().int().nonnegative(),
      })
    )
    .min(1),
});

const consignmentSaleSchema = z.object({
  sold_quantity: z.number().int().positive(),
  sold_at: z.string().optional().or(z.literal("")),
  notes: z.string().optional().default(""),
});

const consignmentReturnSchema = z.object({
  returned_quantity: z.number().int().positive(),
  returned_at: z.string().optional().or(z.literal("")),
  notes: z.string().optional().default(""),
});

function readMultipartFieldValue(
  fields: Record<string, unknown> | undefined,
  fieldName: string
): string {
  if (!fields) return "";
  const raw = fields[fieldName] as any;
  if (!raw) return "";

  const field = Array.isArray(raw) ? raw[0] : raw;
  if (field && typeof field === "object" && "value" in field) {
    return String((field as { value?: unknown }).value ?? "");
  }
  return "";
}

function getSkuAvailableStock(skuId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(quantity_delta), 0) AS available_quantity
       FROM stock_movements
       WHERE sku_id = ?`
    )
    .get(skuId) as { available_quantity: number } | undefined;
  return row?.available_quantity ?? 0;
}

function getBatchItemCounters(batchItemId: string): {
  quantity_sent: number;
  sold_quantity: number;
  returned_quantity: number;
  remaining_quantity: number;
} | null {
  const row = db
    .prepare(
      `SELECT cbi.quantity_sent,
              COALESCE((SELECT SUM(sold_quantity) FROM consignment_sales WHERE batch_item_id = cbi.id), 0) AS sold_quantity,
              COALESCE((SELECT SUM(returned_quantity) FROM consignment_returns WHERE batch_item_id = cbi.id), 0) AS returned_quantity
       FROM consignment_batch_items cbi
       WHERE cbi.id = ?`
    )
    .get(batchItemId) as
    | {
        quantity_sent: number;
        sold_quantity: number;
        returned_quantity: number;
      }
    | undefined;

  if (!row) return null;
  return {
    quantity_sent: row.quantity_sent,
    sold_quantity: row.sold_quantity,
    returned_quantity: row.returned_quantity,
    remaining_quantity: row.quantity_sent - row.sold_quantity - row.returned_quantity,
  };
}

function generateInternalSkuCode(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SKU-${y}${m}${d}-${suffix}`;
}

function resolveUniqueSkuCode(initialValue: string): string {
  let candidate = initialValue.trim() || generateInternalSkuCode();
  let attempts = 0;
  while (attempts < 20) {
    const exists = db.prepare("SELECT id FROM sales_skus WHERE sku_code = ?").get(candidate) as any;
    if (!exists) return candidate;
    candidate = generateInternalSkuCode();
    attempts += 1;
  }
  return `${generateInternalSkuCode()}-${Math.floor(Math.random() * 1000)}`;
}

function getActiveSalesMarkupProfiles(): {
  markup_final_sale_bps: number;
  markup_presential_sale_bps: number;
  markup_wholesale_consignment_bps: number;
  markup_wholesale_cash_bps: number;
} {
  const settings = db
    .prepare(
      `SELECT markup_bps, markup_final_sale_bps, markup_presential_sale_bps,
              markup_wholesale_consignment_bps, markup_wholesale_cash_bps
       FROM cost_settings
       WHERE is_active = 1
       ORDER BY effective_from DESC
       LIMIT 1`
    )
    .get() as any;

  const finalMarkup = Number(
    settings?.markup_final_sale_bps ??
      settings?.markup_bps ??
      10000
  );

  return {
    markup_final_sale_bps: finalMarkup,
    markup_presential_sale_bps: Number(settings?.markup_presential_sale_bps ?? 12000),
    markup_wholesale_consignment_bps: Number(settings?.markup_wholesale_consignment_bps ?? 7500),
    markup_wholesale_cash_bps: Number(settings?.markup_wholesale_cash_bps ?? 5000),
  };
}

function computeSuggestedSalesPrices(params: {
  productionCostCents: number;
  finalPriceCents?: number | null;
  markups: {
    markup_final_sale_bps: number;
    markup_presential_sale_bps: number;
    markup_wholesale_consignment_bps: number;
    markup_wholesale_cash_bps: number;
  };
}) {
  const baseCost = Math.max(0, Number(params.productionCostCents || 0));
  const finalPrice = params.finalPriceCents ?? null;

  const finalFromMarkup = Math.round(baseCost * (1 + params.markups.markup_final_sale_bps / 10000));
  const suggestedFinal = finalPrice !== null && Number.isFinite(finalPrice)
    ? Math.max(0, Math.round(finalPrice))
    : finalFromMarkup;

  return {
    suggested_final_price_cents: suggestedFinal,
    suggested_presential_price_cents: Math.round(
      baseCost * (1 + params.markups.markup_presential_sale_bps / 10000)
    ),
    suggested_wholesale_consignment_price_cents: Math.round(
      baseCost * (1 + params.markups.markup_wholesale_consignment_bps / 10000)
    ),
    suggested_wholesale_cash_price_cents: Math.round(
      baseCost * (1 + params.markups.markup_wholesale_cash_bps / 10000)
    ),
  };
}

function computeContributionMargin(params: {
  revenueCents: number;
  variableCostCents: number;
  taxCents: number;
}): {
  contribution_margin_cents: number;
  contribution_margin_bps: number;
} {
  const revenue = Math.max(0, Math.round(Number(params.revenueCents || 0)));
  const variableCost = Math.max(0, Math.round(Number(params.variableCostCents || 0)));
  const tax = Math.max(0, Math.round(Number(params.taxCents || 0)));
  const contribution = revenue - variableCost - tax;
  const bps = revenue > 0 ? Math.round((contribution * 10000) / revenue) : 0;
  return {
    contribution_margin_cents: contribution,
    contribution_margin_bps: bps,
  };
}

function estimateIncludedTaxCents(totalCents: number, taxRateBps: number): number {
  const total = Math.max(0, Math.round(Number(totalCents || 0)));
  const rateBps = Math.max(0, Math.round(Number(taxRateBps || 0)));
  if (total <= 0 || rateBps <= 0) return 0;
  return Math.round((total * rateBps) / (10000 + rateBps));
}

function getActiveTaxRateBps(): number {
  const row = db
    .prepare(
      `SELECT tax_rate_bps
       FROM cost_settings
       WHERE is_active = 1
       ORDER BY effective_from DESC
       LIMIT 1`
    )
    .get() as { tax_rate_bps?: number } | undefined;

  return Math.max(0, Math.round(Number(row?.tax_rate_bps ?? 0)));
}

function withQuoteContributionMargin<T extends {
  final_price_cents?: number;
  subtotal_cost_cents?: number;
  tax_cost_cents?: number;
}>(row: T): T & {
  contribution_margin_cents: number;
  contribution_margin_bps: number;
} {
  return {
    ...row,
    ...computeContributionMargin({
      revenueCents: Number(row.final_price_cents ?? 0),
      variableCostCents: Number(row.subtotal_cost_cents ?? 0),
      taxCents: Number(row.tax_cost_cents ?? 0),
    }),
  };
}

function withSkuContributionMargin<T extends {
  default_sale_price_cents?: number;
  production_cost_cents?: number;
}>(
  row: T,
  taxRateBps: number,
  exactTaxCents?: number | null
): T & {
  estimated_tax_cents: number;
  tax_rate_bps_applied: number;
  contribution_margin_cents: number;
  contribution_margin_bps: number;
} {
  const estimatedTaxCents =
    typeof exactTaxCents === "number" && Number.isFinite(exactTaxCents)
      ? Math.max(0, Math.round(exactTaxCents))
      : estimateIncludedTaxCents(Number(row.default_sale_price_cents ?? 0), taxRateBps);

  return {
    ...row,
    estimated_tax_cents: estimatedTaxCents,
    tax_rate_bps_applied: taxRateBps,
    ...computeContributionMargin({
      revenueCents: Number(row.default_sale_price_cents ?? 0),
      variableCostCents: Number(row.production_cost_cents ?? 0),
      taxCents: estimatedTaxCents,
    }),
  };
}

function recomputeQuoteWithActiveSettings(quoteId: string): {
  subtotalUnitCents: number;
  taxUnitCents: number;
  finalUnitCents: number;
} | null {
  const quote = db
    .prepare(
      `SELECT id, printer_id, units_produced, print_time_minutes, post_processing_minutes, packaging_cost_cents
       FROM print_quotes
       WHERE id = ?`
    )
    .get(quoteId) as any;
  if (!quote) return null;

  const printer = db.prepare("SELECT id, power_watts, purchase_cost_cents FROM printers WHERE id = ?").get(quote.printer_id) as any;
  if (!printer) return null;

  const settings = db
    .prepare(
      `SELECT labor_hour_cost_cents, energy_cost_kwh_cents, tax_rate_bps, printer_payback_months,
              markup_final_sale_bps, markup_bps
       FROM cost_settings
       WHERE is_active = 1
       ORDER BY effective_from DESC
       LIMIT 1`
    )
    .get() as any;
  if (!settings) return null;

  const quoteFilaments = db
    .prepare("SELECT filament_id, used_weight_grams FROM print_quote_filaments WHERE quote_id = ?")
    .all(quoteId) as Array<{ filament_id: string; used_weight_grams: number }>;

  let filamentTotalUnitCents = 0;
  for (const item of quoteFilaments) {
    const filament = db
      .prepare("SELECT cost_per_gram_cents FROM filaments WHERE id = ?")
      .get(item.filament_id) as any;
    if (!filament) continue;
    filamentTotalUnitCents += Number(filament.cost_per_gram_cents) * Number(item.used_weight_grams);
  }

  const extrasTotalUnitCents = db
    .prepare("SELECT COALESCE(SUM(item_cost_cents), 0) AS total FROM print_quote_extra_costs WHERE quote_id = ?")
    .get(quoteId) as any;

  const computed = computeQuote({
    unitsProduced: Number(quote.units_produced ?? 1),
    printTimeMinutes: Number(quote.print_time_minutes ?? 0),
    postProcessingMinutes: Number(quote.post_processing_minutes ?? 0),
    packagingCostCents: Number(quote.packaging_cost_cents ?? 0),
    printerPowerWatts: Number(printer.power_watts),
    printerPurchaseCostCents: Number(printer.purchase_cost_cents),
    laborHourCostCents: Number(settings.labor_hour_cost_cents ?? 0),
    energyCostKwhCents: Number(settings.energy_cost_kwh_cents ?? 0),
    taxRateBps: Number(settings.tax_rate_bps ?? 0),
    printerPaybackMonths: Number(settings.printer_payback_months ?? 1),
    markupBps: Number(settings.markup_final_sale_bps ?? settings.markup_bps ?? 10000),
    filamentTotalUnitCents,
    extrasTotalUnitCents: Number(extrasTotalUnitCents?.total ?? 0),
  });

  return {
    subtotalUnitCents: computed.subtotalUnitCents,
    taxUnitCents: computed.taxUnitCents,
    finalUnitCents: computed.finalUnitCents,
  };
}

function syncSkusLinkedToQuote(quoteId: string): number {
  const linkedCountRow = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM sales_skus
       WHERE is_active = 1
         AND sync_with_quote_pricing = 1
         AND source_quote_id = ?`
    )
    .get(quoteId) as { total: number } | undefined;

  if (!linkedCountRow || Number(linkedCountRow.total) <= 0) {
    return 0;
  }

  const recomputed = recomputeQuoteWithActiveSettings(quoteId);
  if (!recomputed) {
    return 0;
  }

  const suggested = computeSuggestedSalesPrices({
    productionCostCents: recomputed.subtotalUnitCents,
    finalPriceCents: recomputed.finalUnitCents,
    markups: getActiveSalesMarkupProfiles(),
  });

  const result = db
    .prepare(
      `UPDATE sales_skus
       SET default_sale_price_cents = ?,
           production_cost_cents = ?,
           suggested_final_price_cents = ?,
           suggested_presential_price_cents = ?,
           suggested_wholesale_consignment_price_cents = ?,
           suggested_wholesale_cash_price_cents = ?,
           updated_at = ?
       WHERE is_active = 1
         AND sync_with_quote_pricing = 1
         AND source_quote_id = ?`
    )
    .run(
      recomputed.finalUnitCents,
      recomputed.subtotalUnitCents,
      suggested.suggested_final_price_cents,
      suggested.suggested_presential_price_cents,
      suggested.suggested_wholesale_consignment_price_cents,
      suggested.suggested_wholesale_cash_price_cents,
      nowIso(),
      quoteId
    );

  return result.changes;
}

function syncSkusLinkedToQuotes(quoteIds: string[]): number {
  const uniqueQuoteIds = Array.from(new Set(quoteIds.filter((item) => item && item.trim())));
  let totalChanges = 0;
  for (const quoteId of uniqueQuoteIds) {
    totalChanges += syncSkusLinkedToQuote(quoteId);
  }
  return totalChanges;
}

function syncAllSkusWithQuotePricing(): number {
  const rows = db
    .prepare(
      `SELECT DISTINCT source_quote_id
       FROM sales_skus
       WHERE is_active = 1
         AND sync_with_quote_pricing = 1
         AND source_quote_id IS NOT NULL`
    )
    .all() as Array<{ source_quote_id: string }>;

  return syncSkusLinkedToQuotes(rows.map((row) => row.source_quote_id));
}

function syncSkusImpactedByFilament(filamentId: string): number {
  const rows = db
    .prepare(
      `SELECT DISTINCT s.source_quote_id AS quote_id
       FROM sales_skus s
       JOIN print_quote_filaments qf ON qf.quote_id = s.source_quote_id
       WHERE s.is_active = 1
         AND s.sync_with_quote_pricing = 1
         AND s.source_quote_id IS NOT NULL
         AND qf.filament_id = ?`
    )
    .all(filamentId) as Array<{ quote_id: string }>;

  return syncSkusLinkedToQuotes(rows.map((row) => row.quote_id));
}

function computeNextContactAtFromPeriod(params: {
  createdAtIso: string;
  contactPeriodDays: number;
  lastContactAtIso?: string | null;
  nextContactOverrideAtIso?: string | null;
}): string | null {
  const overrideMs = Date.parse(params.nextContactOverrideAtIso ?? "");
  if (Number.isFinite(overrideMs)) {
    return new Date(overrideMs).toISOString();
  }

  const anchorIso = params.lastContactAtIso || params.createdAtIso;
  const createdAtMs = Date.parse(anchorIso);
  if (!Number.isFinite(createdAtMs)) return null;

  const days = Math.max(1, Math.round(params.contactPeriodDays || 1));
  const periodMs = days * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();

  if (nowMs <= createdAtMs) {
    return new Date(createdAtMs + periodMs).toISOString();
  }

  const elapsedMs = nowMs - createdAtMs;
  const completedCycles = Math.floor(elapsedMs / periodMs);
  const nextContactMs = createdAtMs + (completedCycles + 1) * periodMs;
  return new Date(nextContactMs).toISOString();
}

function appendOperationLog(params: {
  eventType: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  payload?: Record<string, unknown>;
}): void {
  const id = uuidv4();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO operation_logs (
      id, event_type, entity_type, entity_id, summary, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.eventType,
    params.entityType,
    params.entityId ?? null,
    params.summary,
    params.payload ? JSON.stringify(params.payload) : null,
    createdAt
  );
}

app.get("/health", async () => ({ ok: true }));

app.get("/logs", async () => {
  return db
    .prepare(
      `SELECT id, event_type, entity_type, entity_id, summary, payload_json, created_at
       FROM operation_logs
       ORDER BY created_at DESC
       LIMIT 500`
    )
    .all();
});

app.get("/storage/media/*", async (request, reply) => {
  const wildcardPath = String((request.params as any)["*"] ?? "");
  const targetPath = path.resolve(mediaRoot, wildcardPath);

  if (!targetPath.startsWith(mediaRoot)) {
    reply.code(400);
    return { message: "Invalid media path" };
  }

  try {
    const fileStat = await stat(targetPath);
    if (!fileStat.isFile()) {
      reply.code(404);
      return { message: "Media not found" };
    }
  } catch {
    reply.code(404);
    return { message: "Media not found" };
  }

  const ext = path.extname(targetPath).toLowerCase();
  const contentType =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".mp4"
              ? "video/mp4"
              : ext === ".mov"
                ? "video/quicktime"
                : ext === ".webm"
                  ? "video/webm"
                  : ext === ".3mf"
                    ? "model/3mf"
                    : "application/octet-stream";

  reply.type(contentType);
  reply.header("Content-Disposition", `attachment; filename="${path.basename(targetPath)}"`);
  return reply.send(createReadStream(targetPath));
});

app.post("/uploads", async (request, reply) => {
  const file = await request.file();
  if (!file) {
    reply.code(400);
    return { message: "Missing file" };
  }

  const ownerTypeRaw = readMultipartFieldValue(
    file.fields as Record<string, unknown> | undefined,
    "owner_type"
  ).trim();
  const ownerType = (ownerTypeRaw || "quotes") as "quotes" | "skus";
  if (!["quotes", "skus"].includes(ownerType)) {
    reply.code(400);
    return { message: "owner_type must be quotes or skus" };
  }

  const ownerId =
    readMultipartFieldValue(file.fields as Record<string, unknown> | undefined, "owner_id").trim() ||
    readMultipartFieldValue(file.fields as Record<string, unknown> | undefined, "quote_id").trim();

  if (!ownerId) {
    reply.code(400);
    return { message: "owner_id is required (or quote_id for compatibility)" };
  }

  const mediaType = readMultipartFieldValue(
    file.fields as Record<string, unknown> | undefined,
    "media_type"
  ).trim() as
    | "photo"
    | "video"
    | "3mf";

  if (!["photo", "video", "3mf"].includes(mediaType)) {
    reply.code(400);
    return { message: "media_type must be photo, video or 3mf" };
  }

  const buffer = await file.toBuffer();
  const persisted = persistUploadedBuffer({
    mediaRoot,
    mediaType,
    originalName: file.filename,
    buffer,
    ownerType,
    ownerId,
  });

  reply.code(201);
  return {
    media_type: mediaType,
    local_uri: persisted.relativePath,
    original_name: file.filename,
  };
});

app.get("/sales/skus", async () => {
  const rows = db
    .prepare(
      `SELECT s.*,
              parent.name AS parent_sku_name,
              q.print_name AS source_quote_name,
              q.tax_cost_cents AS source_quote_tax_cost_cents,
              COALESCE((SELECT COUNT(*) FROM sales_sku_media sm WHERE sm.sku_id = s.id), 0) AS media_count
       FROM sales_skus s
       LEFT JOIN sales_skus parent ON parent.id = s.parent_sku_id
       LEFT JOIN print_quotes q ON q.id = s.source_quote_id
       WHERE s.is_active = 1
       ORDER BY s.created_at DESC`
    )
    .all();

  const markups = getActiveSalesMarkupProfiles();
  const activeTaxRateBps = getActiveTaxRateBps();
  const updateSuggested = db.prepare(
    `UPDATE sales_skus
     SET default_sale_price_cents = ?, production_cost_cents = ?,
         suggested_final_price_cents = ?, suggested_presential_price_cents = ?,
         suggested_wholesale_consignment_price_cents = ?, suggested_wholesale_cash_price_cents = ?,
         updated_at = ?
     WHERE id = ?`
  );

  return rows.map((row: any) => {
    if (Number(row.sync_with_quote_pricing) === 1 && row.source_quote_id) {
      const recomputed = recomputeQuoteWithActiveSettings(String(row.source_quote_id));
      if (recomputed) {
        const suggested = computeSuggestedSalesPrices({
          productionCostCents: recomputed.subtotalUnitCents,
          finalPriceCents: recomputed.finalUnitCents,
          markups,
        });
        updateSuggested.run(
          recomputed.finalUnitCents,
          recomputed.subtotalUnitCents,
          suggested.suggested_final_price_cents,
          suggested.suggested_presential_price_cents,
          suggested.suggested_wholesale_consignment_price_cents,
          suggested.suggested_wholesale_cash_price_cents,
          nowIso(),
          row.id
        );
        return withSkuContributionMargin(
          {
            ...row,
            default_sale_price_cents: recomputed.finalUnitCents,
            production_cost_cents: recomputed.subtotalUnitCents,
            ...suggested,
          },
          activeTaxRateBps,
          recomputed.taxUnitCents
        );
      }
    }
    return withSkuContributionMargin(
      row,
      activeTaxRateBps,
      row.source_quote_id ? Number(row.source_quote_tax_cost_cents ?? 0) : undefined
    );
  });
});

app.get("/sales/skus/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const sku = db
    .prepare(
      `SELECT s.*,
              parent.name AS parent_sku_name,
              q.print_name AS source_quote_name,
              q.tax_cost_cents AS source_quote_tax_cost_cents
       FROM sales_skus s
       LEFT JOIN sales_skus parent ON parent.id = s.parent_sku_id
       LEFT JOIN print_quotes q ON q.id = s.source_quote_id
       WHERE s.id = ?`
    )
    .get(id) as any;

  if (!sku) {
    reply.code(404);
    return { message: "SKU not found" };
  }

  const media = db
    .prepare("SELECT id, media_type, local_uri, created_at, updated_at FROM sales_sku_media WHERE sku_id = ?")
    .all(id);

  let resolvedSku = sku;
  const activeTaxRateBps = getActiveTaxRateBps();
  if (Number(sku.sync_with_quote_pricing) === 1 && sku.source_quote_id) {
    const recomputed = recomputeQuoteWithActiveSettings(String(sku.source_quote_id));
    if (recomputed) {
      const markups = getActiveSalesMarkupProfiles();
      const suggested = computeSuggestedSalesPrices({
        productionCostCents: recomputed.subtotalUnitCents,
        finalPriceCents: recomputed.finalUnitCents,
        markups,
      });
      db.prepare(
        `UPDATE sales_skus
         SET default_sale_price_cents = ?, production_cost_cents = ?,
             suggested_final_price_cents = ?, suggested_presential_price_cents = ?,
             suggested_wholesale_consignment_price_cents = ?, suggested_wholesale_cash_price_cents = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(
        recomputed.finalUnitCents,
        recomputed.subtotalUnitCents,
        suggested.suggested_final_price_cents,
        suggested.suggested_presential_price_cents,
        suggested.suggested_wholesale_consignment_price_cents,
        suggested.suggested_wholesale_cash_price_cents,
        nowIso(),
        id
      );
      resolvedSku = {
        ...sku,
        default_sale_price_cents: recomputed.finalUnitCents,
        production_cost_cents: recomputed.subtotalUnitCents,
        ...suggested,
      };
    }
  }

  return {
    ...withSkuContributionMargin(
      resolvedSku,
      activeTaxRateBps,
      resolvedSku.source_quote_id ? Number(resolvedSku.source_quote_tax_cost_cents ?? 0) : undefined
    ),
    media,
  };
});

app.get("/sales/skus/:id/media", async (request, reply) => {
  const { id } = request.params as { id: string };
  const media = db
    .prepare("SELECT id, media_type, local_uri, created_at, updated_at FROM sales_sku_media WHERE sku_id = ?")
    .all(id);
  if (!media.length) {
    reply.code(404);
    return { message: "No media found for this SKU" };
  }
  return media;
});

app.post("/sales/skus", async (request, reply) => {
  const body = salesSkuSchema.parse(request.body);
  const id = uuidv4();
  const now = nowIso();
  const skuCode = resolveUniqueSkuCode(body.sku_code ?? "");
  const syncWithQuotePricing = body.sync_with_quote_pricing === true ? 1 : 0;

  const parentSkuId = body.parent_sku_id?.trim() || null;
  if (parentSkuId) {
    const parent = db.prepare("SELECT id FROM sales_skus WHERE id = ? AND is_active = 1").get(parentSkuId) as any;
    if (!parent) {
      reply.code(400);
      return { message: "Parent SKU not found or inactive" };
    }
  }

  const sourceQuoteId = body.source_quote_id?.trim() || null;
  const sourceQuote = sourceQuoteId
    ? (db
        .prepare(
          `SELECT id, print_name, description, subtotal_cost_cents, tax_cost_cents, final_price_cents
           FROM print_quotes
           WHERE id = ?`
        )
        .get(sourceQuoteId) as any)
    : null;

  if (sourceQuoteId && !sourceQuote) {
    reply.code(400);
    return { message: "Source quote not found" };
  }

  const resolvedName =
    body.name.trim() ||
    (body.copy_from_quote && sourceQuote ? String(sourceQuote.print_name ?? "").trim() : "");
  const resolvedDescription =
    body.description.trim() ||
    (body.copy_from_quote && sourceQuote ? String(sourceQuote.description ?? "").trim() : "");

  if (!resolvedName) {
    reply.code(400);
    return { message: "name is required (or enable copy_from_quote with a valid quote)" };
  }

  const recomputedFromQuote =
    syncWithQuotePricing === 1 && sourceQuoteId ? recomputeQuoteWithActiveSettings(sourceQuoteId) : null;

  const resolvedDefaultSalePriceCents =
    typeof body.default_sale_price_cents === "number"
      ? body.default_sale_price_cents
      : recomputedFromQuote
        ? recomputedFromQuote.finalUnitCents
      : sourceQuote
        ? Number(sourceQuote.final_price_cents ?? 0)
        : 0;

  const resolvedProductionCostCents =
    typeof body.production_cost_cents === "number"
      ? body.production_cost_cents
      : recomputedFromQuote
        ? recomputedFromQuote.subtotalUnitCents
      : sourceQuote
        ? Number(sourceQuote.subtotal_cost_cents ?? 0)
        : 0;

  const markups = getActiveSalesMarkupProfiles();
  const suggestedSalesPrices = computeSuggestedSalesPrices({
    productionCostCents: resolvedProductionCostCents,
    finalPriceCents: resolvedDefaultSalePriceCents,
    markups,
  });
  const resolvedWholesaleConsignmentPriceCents =
    syncWithQuotePricing === 0 && typeof body.suggested_wholesale_consignment_price_cents === "number"
      ? body.suggested_wholesale_consignment_price_cents
      : suggestedSalesPrices.suggested_wholesale_consignment_price_cents;
  const resolvedWholesaleCashPriceCents =
    syncWithQuotePricing === 0 && typeof body.suggested_wholesale_cash_price_cents === "number"
      ? body.suggested_wholesale_cash_price_cents
      : suggestedSalesPrices.suggested_wholesale_cash_price_cents;

  const quoteMedia = body.copy_media_from_quote && sourceQuoteId
    ? (db
        .prepare(
          `SELECT media_type, local_uri
           FROM print_quote_media
           WHERE quote_id = ?`
        )
        .all(sourceQuoteId) as Array<{ media_type: "photo" | "video" | "3mf"; local_uri: string }>)
    : [];

  const mergedMedia = [...body.media, ...quoteMedia].filter(
    (item, index, arr) =>
      arr.findIndex((other) => other.media_type === item.media_type && other.local_uri === item.local_uri) === index
  );

  const persistedMedia = [] as Array<{
    id: string;
    sku_id: string;
    media_type: "photo" | "video" | "3mf";
    local_uri: string;
    created_at: string;
    updated_at: string;
  }>;

  for (const item of mergedMedia) {
    const persisted = persistMediaFile({
      mediaRoot,
      mediaType: item.media_type,
      localUri: item.local_uri,
      backendRoot,
      ownerType: "skus",
      ownerId: id,
    });
    persistedMedia.push({
      id: uuidv4(),
      sku_id: id,
      media_type: item.media_type,
      local_uri: persisted.relativePath,
      created_at: now,
      updated_at: now,
    });
  }

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sales_skus (
        id, sku_code, name, description, default_sale_price_cents, production_cost_cents,
        parent_sku_id, source_quote_id, sync_with_quote_pricing,
        suggested_final_price_cents, suggested_presential_price_cents,
        suggested_wholesale_consignment_price_cents, suggested_wholesale_cash_price_cents,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      id,
      skuCode,
      resolvedName,
      resolvedDescription || null,
      resolvedDefaultSalePriceCents,
      resolvedProductionCostCents,
      parentSkuId,
      sourceQuoteId,
      syncWithQuotePricing,
      suggestedSalesPrices.suggested_final_price_cents,
      suggestedSalesPrices.suggested_presential_price_cents,
      resolvedWholesaleConsignmentPriceCents,
      resolvedWholesaleCashPriceCents,
      now,
      now
    );

    const insertMedia = db.prepare(
      `INSERT INTO sales_sku_media (id, sku_id, media_type, local_uri, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const item of persistedMedia) {
      insertMedia.run(item.id, item.sku_id, item.media_type, item.local_uri, item.created_at, item.updated_at);
    }
  });

  tx();
  reply.code(201);
  const created = db.prepare("SELECT * FROM sales_skus WHERE id = ?").get(id) as any;
  return withSkuContributionMargin(
    created,
    getActiveTaxRateBps(),
    recomputedFromQuote
      ? recomputedFromQuote.taxUnitCents
      : sourceQuote
        ? Number(sourceQuote.tax_cost_cents ?? 0)
        : undefined
  );
});

app.put("/sales/skus/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = salesSkuSchema.parse(request.body);
  const rawBody = (request.body ?? {}) as Record<string, unknown>;
  const hasMediaField = Object.prototype.hasOwnProperty.call(rawBody, "media");
  const hasSyncField = Object.prototype.hasOwnProperty.call(rawBody, "sync_with_quote_pricing");
  const now = nowIso();

  const existing = db.prepare("SELECT * FROM sales_skus WHERE id = ?").get(id) as any;
  if (!existing) {
    reply.code(404);
    return { message: "SKU not found" };
  }

  const requestedSkuCode = (body.sku_code ?? "").trim();
  const finalSkuCode = requestedSkuCode || String(existing.sku_code ?? "");
  const duplicateSku = db
    .prepare("SELECT id FROM sales_skus WHERE sku_code = ? AND id <> ?")
    .get(finalSkuCode, id) as any;
  if (duplicateSku) {
    reply.code(400);
    return { message: "SKU code already in use" };
  }

  const parentSkuId = body.parent_sku_id?.trim() || null;
  if (parentSkuId === id) {
    reply.code(400);
    return { message: "A SKU cannot be parent of itself" };
  }
  if (parentSkuId) {
    const parent = db.prepare("SELECT id FROM sales_skus WHERE id = ? AND is_active = 1").get(parentSkuId) as any;
    if (!parent) {
      reply.code(400);
      return { message: "Parent SKU not found or inactive" };
    }
  }

  const sourceQuoteId = body.source_quote_id?.trim() || null;
  const sourceQuote = sourceQuoteId
    ? (db
        .prepare(
          `SELECT id, print_name, description, subtotal_cost_cents, tax_cost_cents, final_price_cents
           FROM print_quotes
           WHERE id = ?`
        )
        .get(sourceQuoteId) as any)
    : null;
  if (sourceQuoteId && !sourceQuote) {
    reply.code(400);
    return { message: "Source quote not found" };
  }

  const syncWithQuotePricing = hasSyncField
    ? body.sync_with_quote_pricing === true
      ? 1
      : 0
    : Number(existing.sync_with_quote_pricing ?? 0);

  const recomputedFromQuote =
    syncWithQuotePricing === 1 && sourceQuoteId ? recomputeQuoteWithActiveSettings(sourceQuoteId) : null;

  const resolvedName =
    body.name.trim() ||
    (body.copy_from_quote && sourceQuote ? String(sourceQuote.print_name ?? "").trim() : "") ||
    String(existing.name ?? "").trim();

  const resolvedDescription =
    body.description.trim() ||
    (body.copy_from_quote && sourceQuote ? String(sourceQuote.description ?? "").trim() : "") ||
    String(existing.description ?? "").trim();

  const resolvedDefaultSalePriceCents =
    typeof body.default_sale_price_cents === "number"
      ? body.default_sale_price_cents
      : recomputedFromQuote
        ? recomputedFromQuote.finalUnitCents
      : sourceQuote
        ? Number(sourceQuote.final_price_cents ?? 0)
        : Number(existing.default_sale_price_cents ?? 0);

  const resolvedProductionCostCents =
    typeof body.production_cost_cents === "number"
      ? body.production_cost_cents
      : recomputedFromQuote
        ? recomputedFromQuote.subtotalUnitCents
      : sourceQuote
        ? Number(sourceQuote.subtotal_cost_cents ?? 0)
        : Number(existing.production_cost_cents ?? 0);

  const markups = getActiveSalesMarkupProfiles();
  const suggestedSalesPrices = computeSuggestedSalesPrices({
    productionCostCents: resolvedProductionCostCents,
    finalPriceCents: resolvedDefaultSalePriceCents,
    markups,
  });
  const resolvedWholesaleConsignmentPriceCents =
    syncWithQuotePricing === 0 && typeof body.suggested_wholesale_consignment_price_cents === "number"
      ? body.suggested_wholesale_consignment_price_cents
      : suggestedSalesPrices.suggested_wholesale_consignment_price_cents;
  const resolvedWholesaleCashPriceCents =
    syncWithQuotePricing === 0 && typeof body.suggested_wholesale_cash_price_cents === "number"
      ? body.suggested_wholesale_cash_price_cents
      : suggestedSalesPrices.suggested_wholesale_cash_price_cents;

  const existingMedia = db
    .prepare("SELECT media_type, local_uri FROM sales_sku_media WHERE sku_id = ?")
    .all(id) as Array<{ media_type: "photo" | "video" | "3mf"; local_uri: string }>;

  const quoteMedia = body.copy_media_from_quote && sourceQuoteId
    ? (db
        .prepare(
          `SELECT media_type, local_uri
           FROM print_quote_media
           WHERE quote_id = ?`
        )
        .all(sourceQuoteId) as Array<{ media_type: "photo" | "video" | "3mf"; local_uri: string }>)
    : [];

  const mediaBase = hasMediaField ? body.media : existingMedia;
  const mergedMedia = [...mediaBase, ...quoteMedia].filter(
    (item, index, arr) =>
      arr.findIndex((other) => other.media_type === item.media_type && other.local_uri === item.local_uri) === index
  );

  const persistedMedia = [] as Array<{
    id: string;
    sku_id: string;
    media_type: "photo" | "video" | "3mf";
    local_uri: string;
    created_at: string;
    updated_at: string;
  }>;

  for (const item of mergedMedia) {
    const persisted = persistMediaFile({
      mediaRoot,
      mediaType: item.media_type,
      localUri: item.local_uri,
      backendRoot,
      ownerType: "skus",
      ownerId: id,
    });
    persistedMedia.push({
      id: uuidv4(),
      sku_id: id,
      media_type: item.media_type,
      local_uri: persisted.relativePath,
      created_at: now,
      updated_at: now,
    });
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE sales_skus
       SET sku_code = ?, name = ?, description = ?, default_sale_price_cents = ?,
           production_cost_cents = ?, parent_sku_id = ?, source_quote_id = ?, sync_with_quote_pricing = ?,
           suggested_final_price_cents = ?, suggested_presential_price_cents = ?,
           suggested_wholesale_consignment_price_cents = ?, suggested_wholesale_cash_price_cents = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(
      finalSkuCode,
      resolvedName,
      resolvedDescription || null,
      resolvedDefaultSalePriceCents,
      resolvedProductionCostCents,
      parentSkuId,
      sourceQuoteId,
      syncWithQuotePricing,
      suggestedSalesPrices.suggested_final_price_cents,
      suggestedSalesPrices.suggested_presential_price_cents,
      resolvedWholesaleConsignmentPriceCents,
      resolvedWholesaleCashPriceCents,
      now,
      id
    );

    if (hasMediaField || body.copy_media_from_quote) {
      db.prepare("DELETE FROM sales_sku_media WHERE sku_id = ?").run(id);
      const insertMedia = db.prepare(
        `INSERT INTO sales_sku_media (id, sku_id, media_type, local_uri, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const item of persistedMedia) {
        insertMedia.run(item.id, item.sku_id, item.media_type, item.local_uri, item.created_at, item.updated_at);
      }
    }
  });

  tx();
  const updated = db.prepare("SELECT * FROM sales_skus WHERE id = ?").get(id) as any;
  return withSkuContributionMargin(
    updated,
    getActiveTaxRateBps(),
    recomputedFromQuote
      ? recomputedFromQuote.taxUnitCents
      : sourceQuote
        ? Number(sourceQuote.tax_cost_cents ?? 0)
        : undefined
  );
});

app.delete("/sales/skus/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const result = db
    .prepare("UPDATE sales_skus SET is_active = 0, updated_at = ? WHERE id = ? AND is_active = 1")
    .run(nowIso(), id);
  if (result.changes === 0) {
    reply.code(404);
    return { ok: false, message: "SKU not found or already inactive" };
  }
  return { ok: true };
});

app.get("/sales/points", async () => {
  return db.prepare("SELECT * FROM sales_points WHERE is_active = 1 ORDER BY created_at DESC").all();
});

app.post("/sales/points", async (request, reply) => {
  const body = salesPointSchema.parse(request.body);
  const id = uuidv4();
  const now = nowIso();

  db.prepare(
    `INSERT INTO sales_points (
      id, name, contact_name, phone, email, address, commission_bps, contact_period_days,
      last_contact_at, next_contact_override_at, notes, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    id,
    body.name.trim(),
    body.contact_name.trim() || null,
    body.phone.trim() || null,
    body.email?.trim() || null,
    body.address.trim() || null,
    body.commission_bps,
    body.contact_period_days,
    now,
    null,
    body.notes.trim() || null,
    now,
    now
  );

  reply.code(201);
  return db.prepare("SELECT * FROM sales_points WHERE id = ?").get(id);
});

app.put("/sales/points/:id", async (request) => {
  const { id } = request.params as { id: string };
  const body = salesPointSchema.parse(request.body);

  db.prepare(
    `UPDATE sales_points
     SET name = ?, contact_name = ?, phone = ?, email = ?, address = ?,
         commission_bps = ?, contact_period_days = ?, notes = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    body.name.trim(),
    body.contact_name.trim() || null,
    body.phone.trim() || null,
    body.email?.trim() || null,
    body.address.trim() || null,
    body.commission_bps,
    body.contact_period_days,
    body.notes.trim() || null,
    nowIso(),
    id
  );

  return db.prepare("SELECT * FROM sales_points WHERE id = ?").get(id);
});

app.post("/sales/points/:id/contact-today", async (request, reply) => {
  const { id } = request.params as { id: string };
  const now = nowIso();
  const result = db
    .prepare(
      `UPDATE sales_points
       SET last_contact_at = ?, next_contact_override_at = NULL, updated_at = ?
       WHERE id = ? AND is_active = 1`
    )
    .run(now, now, id);

  if (result.changes === 0) {
    reply.code(404);
    return { message: "Sales point not found or inactive" };
  }

  appendOperationLog({
    eventType: "sales_point_contact_today",
    entityType: "sales_point",
    entityId: id,
    summary: "Contato registrado como realizado hoje",
    payload: { sales_point_id: id, occurred_at: now },
  });

  return db.prepare("SELECT * FROM sales_points WHERE id = ?").get(id);
});

app.put("/sales/points/:id/next-contact", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = salesPointNextContactSchema.parse(request.body);
  const parsed = Date.parse(body.next_contact_at);
  if (!Number.isFinite(parsed)) {
    reply.code(400);
    return { message: "Invalid next_contact_at date" };
  }

  const iso = new Date(parsed).toISOString();
  const now = nowIso();
  const result = db
    .prepare(
      `UPDATE sales_points
       SET next_contact_override_at = ?, updated_at = ?
       WHERE id = ? AND is_active = 1`
    )
    .run(iso, now, id);

  if (result.changes === 0) {
    reply.code(404);
    return { message: "Sales point not found or inactive" };
  }

  appendOperationLog({
    eventType: "sales_point_next_contact_override",
    entityType: "sales_point",
    entityId: id,
    summary: "Próximo contato ajustado manualmente",
    payload: { sales_point_id: id, next_contact_at: iso },
  });

  return db.prepare("SELECT * FROM sales_points WHERE id = ?").get(id);
});

app.delete("/sales/points/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const result = db
    .prepare("UPDATE sales_points SET is_active = 0, updated_at = ? WHERE id = ? AND is_active = 1")
    .run(nowIso(), id);
  if (result.changes === 0) {
    reply.code(404);
    return { ok: false, message: "Sales point not found or already inactive" };
  }
  return { ok: true };
});

app.get("/sales/stock/overview", async () => {
  const stockRows = db
    .prepare(
      `SELECT s.id AS sku_id,
              s.sku_code,
              s.name,
              s.default_sale_price_cents,
              s.production_cost_cents,
              COALESCE(SUM(sm.quantity_delta), 0) AS available_quantity
       FROM sales_skus s
       LEFT JOIN stock_movements sm ON sm.sku_id = s.id
       WHERE s.is_active = 1
       GROUP BY s.id, s.sku_code, s.name, s.default_sale_price_cents, s.production_cost_cents
       ORDER BY s.created_at DESC`
    )
    .all();

  const consignedByPointRows = db
    .prepare(
      `WITH item_totals AS (
         SELECT cb.sales_point_id,
                cbi.sku_id,
                cbi.quantity_sent,
                COALESCE((SELECT SUM(sold_quantity) FROM consignment_sales cs WHERE cs.batch_item_id = cbi.id), 0) AS sold_quantity,
                COALESCE((SELECT SUM(returned_quantity) FROM consignment_returns cr WHERE cr.batch_item_id = cbi.id), 0) AS returned_quantity
         FROM consignment_batch_items cbi
         JOIN consignment_batches cb ON cb.id = cbi.batch_id
       )
       SELECT it.sku_id,
              sp.id AS sales_point_id,
              sp.name AS sales_point_name,
              SUM(it.quantity_sent - it.sold_quantity - it.returned_quantity) AS quantity_remaining
       FROM item_totals it
       JOIN sales_points sp ON sp.id = it.sales_point_id
       WHERE sp.is_active = 1
       GROUP BY it.sku_id, sp.id, sp.name
       HAVING SUM(it.quantity_sent - it.sold_quantity - it.returned_quantity) > 0
       ORDER BY sp.name ASC`
    )
    .all() as Array<{
    sku_id: string;
    sales_point_id: string;
    sales_point_name: string;
    quantity_remaining: number;
  }>;

  const consignedBySku = new Map<
    string,
    Array<{ sales_point_id: string; sales_point_name: string; quantity_remaining: number }>
  >();
  for (const row of consignedByPointRows) {
    const list = consignedBySku.get(row.sku_id) ?? [];
    list.push({
      sales_point_id: row.sales_point_id,
      sales_point_name: row.sales_point_name,
      quantity_remaining: row.quantity_remaining,
    });
    consignedBySku.set(row.sku_id, list);
  }

  return stockRows.map((row: any) => ({
    ...row,
    consigned_at_points: consignedBySku.get(row.sku_id) ?? [],
  }));
});

app.get("/sales/stock/movements/:skuId", async (request, reply) => {
  const { skuId } = request.params as { skuId: string };
  const sku = db
    .prepare("SELECT id, sku_code, name, is_active FROM sales_skus WHERE id = ?")
    .get(skuId) as { id: string; sku_code: string; name: string; is_active: number } | undefined;

  if (!sku || sku.is_active !== 1) {
    reply.code(404);
    return { message: "SKU not found or inactive" };
  }

  return db
    .prepare(
      `SELECT sm.id,
              sm.sku_id,
              sm.movement_type,
              sm.quantity_delta,
              sm.occurred_at,
              sm.reference_type,
              sm.reference_id,
              sm.notes,
              sm.created_at,
              sm.updated_at,
              sp.id AS sales_point_id,
              sp.name AS sales_point_name
       FROM stock_movements sm
       LEFT JOIN consignment_batch_items cbi
         ON sm.reference_type = 'consignment_batch_item'
        AND sm.reference_id = cbi.id
       LEFT JOIN consignment_batches cb ON cb.id = cbi.batch_id
       LEFT JOIN sales_points sp ON sp.id = cb.sales_point_id
       WHERE sm.sku_id = ?
       ORDER BY sm.occurred_at DESC, sm.created_at DESC`
    )
    .all(skuId);
});

app.post("/sales/stock/movements", async (request, reply) => {
  const body = stockMovementSchema.parse(request.body);
  const sku = db.prepare("SELECT * FROM sales_skus WHERE id = ? AND is_active = 1").get(body.sku_id) as any;
  if (!sku) {
    reply.code(400);
    return { message: "SKU not found or inactive" };
  }

  if (body.movement_type === "adjustment_in" && body.quantity_delta < 0) {
    reply.code(400);
    return { message: "adjustment_in requires positive quantity_delta" };
  }
  if (body.movement_type === "adjustment_out" && body.quantity_delta > 0) {
    reply.code(400);
    return { message: "adjustment_out requires negative quantity_delta" };
  }

  const availableBefore = getSkuAvailableStock(body.sku_id);
  const availableAfter = availableBefore + body.quantity_delta;
  if (availableAfter < 0) {
    reply.code(400);
    return { message: "Insufficient stock for movement", available_before: availableBefore };
  }

  const id = uuidv4();
  const now = nowIso();
  const occurredAt = body.occurred_at?.trim() || now;

  db.prepare(
    `INSERT INTO stock_movements (
      id, sku_id, movement_type, quantity_delta, occurred_at, reference_type, reference_id, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    body.sku_id,
    body.movement_type,
    body.quantity_delta,
    occurredAt,
    "manual_stock_entry",
    null,
    body.notes.trim() || null,
    now,
    now
  );

  appendOperationLog({
    eventType: "stock_movement_created",
    entityType: "sku",
    entityId: body.sku_id,
    summary: `Movimento de estoque (${body.movement_type})`,
    payload: {
      sku_id: body.sku_id,
      movement_type: body.movement_type,
      quantity_delta: body.quantity_delta,
      occurred_at: occurredAt,
      notes: body.notes.trim() || null,
    },
  });

  reply.code(201);
  return {
    id,
    sku_id: body.sku_id,
    movement_type: body.movement_type,
    quantity_delta: body.quantity_delta,
    available_before: availableBefore,
    available_after: availableAfter,
  };
});

app.post("/sales/consignment/batches", async (request, reply) => {
  const body = consignmentBatchSchema.parse(request.body);
  const point = db
    .prepare("SELECT id, is_active FROM sales_points WHERE id = ?")
    .get(body.sales_point_id) as { id: string; is_active: number } | undefined;

  if (!point || point.is_active !== 1) {
    reply.code(400);
    return { message: "Sales point not found or inactive" };
  }

  const requestedBySku = new Map<string, number>();
  for (const item of body.items) {
    requestedBySku.set(item.sku_id, (requestedBySku.get(item.sku_id) ?? 0) + item.quantity_sent);
  }

  for (const [skuId, totalRequested] of requestedBySku.entries()) {
    const sku = db.prepare("SELECT id FROM sales_skus WHERE id = ? AND is_active = 1").get(skuId) as any;
    if (!sku) {
      reply.code(400);
      return { message: `SKU not found or inactive: ${skuId}` };
    }
    const available = getSkuAvailableStock(skuId);
    if (available < totalRequested) {
      reply.code(400);
      return { message: "Insufficient stock for consignment", sku_id: skuId, requested: totalRequested, available };
    }
  }

  const now = nowIso();
  const batchId = uuidv4();
  const dispatchedAt = body.dispatched_at?.trim() || now;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO consignment_batches (
        id, sales_point_id, dispatched_at, expected_settlement_at, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`
    ).run(
      batchId,
      body.sales_point_id,
      dispatchedAt,
      body.expected_settlement_at?.trim() || null,
      body.notes.trim() || null,
      now,
      now
    );

    const insertItem = db.prepare(
      `INSERT INTO consignment_batch_items (
        id, batch_id, sku_id, quantity_sent, unit_sale_price_cents, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insertStockMovement = db.prepare(
      `INSERT INTO stock_movements (
        id, sku_id, movement_type, quantity_delta, occurred_at, reference_type, reference_id, notes, created_at, updated_at
      ) VALUES (?, ?, 'consignment_out', ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const item of body.items) {
      const batchItemId = uuidv4();
      insertItem.run(
        batchItemId,
        batchId,
        item.sku_id,
        item.quantity_sent,
        item.unit_sale_price_cents,
        now,
        now
      );
      insertStockMovement.run(
        uuidv4(),
        item.sku_id,
        -item.quantity_sent,
        dispatchedAt,
        "consignment_batch_item",
        batchItemId,
        body.notes.trim() || null,
        now,
        now
      );
    }
  });

  tx();
  appendOperationLog({
    eventType: "consignment_batch_created",
    entityType: "consignment_batch",
    entityId: batchId,
    summary: "Envio de consignação registrado",
    payload: {
      batch_id: batchId,
      sales_point_id: body.sales_point_id,
      items_count: body.items.length,
      dispatched_at: dispatchedAt,
    },
  });
  reply.code(201);
  return db.prepare("SELECT * FROM consignment_batches WHERE id = ?").get(batchId);
});

app.get("/sales/consignment/batches", async () => {
  return db
    .prepare(
      `SELECT cb.*,
              sp.name AS sales_point_name,
              COUNT(cbi.id) AS items_count
       FROM consignment_batches cb
       JOIN sales_points sp ON sp.id = cb.sales_point_id
       LEFT JOIN consignment_batch_items cbi ON cbi.batch_id = cb.id
       GROUP BY cb.id, sp.name
       ORDER BY cb.dispatched_at DESC`
    )
    .all();
});

app.get("/sales/consignment/batches/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const batch = db
    .prepare(
      `SELECT cb.*, sp.name AS sales_point_name
       FROM consignment_batches cb
       JOIN sales_points sp ON sp.id = cb.sales_point_id
       WHERE cb.id = ?`
    )
    .get(id) as any;

  if (!batch) {
    reply.code(404);
    return { message: "Consignment batch not found" };
  }

  const items = db
    .prepare(
      `SELECT cbi.*,
              s.sku_code,
              s.name AS sku_name,
              COALESCE((SELECT SUM(sold_quantity) FROM consignment_sales cs WHERE cs.batch_item_id = cbi.id), 0) AS sold_quantity,
              COALESCE((SELECT SUM(returned_quantity) FROM consignment_returns cr WHERE cr.batch_item_id = cbi.id), 0) AS returned_quantity
       FROM consignment_batch_items cbi
       JOIN sales_skus s ON s.id = cbi.sku_id
       WHERE cbi.batch_id = ?
       ORDER BY cbi.created_at ASC`
    )
    .all(id)
    .map((item: any) => ({
      ...item,
      remaining_quantity: item.quantity_sent - item.sold_quantity - item.returned_quantity,
      expected_revenue_cents:
        (item.quantity_sent - item.sold_quantity - item.returned_quantity) * item.unit_sale_price_cents,
      realized_revenue_cents: item.sold_quantity * item.unit_sale_price_cents,
    }));

  return {
    ...batch,
    items,
  };
});

app.post("/sales/consignment/batch-items/:id/sales", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = consignmentSaleSchema.parse(request.body);
  const batchItem = db
    .prepare(
      `SELECT cbi.id,
              cb.status
       FROM consignment_batch_items cbi
       JOIN consignment_batches cb ON cb.id = cbi.batch_id
       WHERE cbi.id = ?`
    )
    .get(id) as { id: string; status: "open" | "closed" } | undefined;

  if (!batchItem) {
    reply.code(404);
    return { message: "Batch item not found" };
  }
  if (batchItem.status !== "open") {
    reply.code(400);
    return { message: "Cannot register sale on a closed batch" };
  }

  const counters = getBatchItemCounters(id);
  if (!counters) {
    reply.code(404);
    return { message: "Batch item not found" };
  }
  if (body.sold_quantity > counters.remaining_quantity) {
    reply.code(400);
    return {
      message: "Sold quantity exceeds remaining stock at point",
      remaining_quantity: counters.remaining_quantity,
    };
  }

  const now = nowIso();
  const saleId = uuidv4();
  db.prepare(
    `INSERT INTO consignment_sales (id, batch_item_id, sold_quantity, sold_at, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(saleId, id, body.sold_quantity, body.sold_at?.trim() || now, body.notes.trim() || null, now, now);

  appendOperationLog({
    eventType: "consignment_sale_registered",
    entityType: "consignment_batch_item",
    entityId: id,
    summary: "Venda registrada em item de consignação",
    payload: {
      batch_item_id: id,
      sale_id: saleId,
      sold_quantity: body.sold_quantity,
      sold_at: body.sold_at?.trim() || now,
      notes: body.notes.trim() || null,
    },
  });

  reply.code(201);
  const updatedCounters = getBatchItemCounters(id);
  return {
    id: saleId,
    batch_item_id: id,
    sold_quantity: body.sold_quantity,
    remaining_quantity: updatedCounters?.remaining_quantity ?? 0,
  };
});

app.post("/sales/consignment/batch-items/:id/returns", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = consignmentReturnSchema.parse(request.body);
  const batchItem = db
    .prepare(
      `SELECT cbi.id,
              cbi.sku_id,
              cb.status
       FROM consignment_batch_items cbi
       JOIN consignment_batches cb ON cb.id = cbi.batch_id
       WHERE cbi.id = ?`
    )
    .get(id) as { id: string; sku_id: string; status: "open" | "closed" } | undefined;

  if (!batchItem) {
    reply.code(404);
    return { message: "Batch item not found" };
  }
  if (batchItem.status !== "open") {
    reply.code(400);
    return { message: "Cannot register return on a closed batch" };
  }

  const counters = getBatchItemCounters(id);
  if (!counters) {
    reply.code(404);
    return { message: "Batch item not found" };
  }
  if (body.returned_quantity > counters.remaining_quantity) {
    reply.code(400);
    return {
      message: "Returned quantity exceeds remaining stock at point",
      remaining_quantity: counters.remaining_quantity,
    };
  }

  const now = nowIso();
  const returnId = uuidv4();
  const returnedAt = body.returned_at?.trim() || now;
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO consignment_returns (id, batch_item_id, returned_quantity, returned_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(returnId, id, body.returned_quantity, returnedAt, body.notes.trim() || null, now, now);

    db.prepare(
      `INSERT INTO stock_movements (
        id, sku_id, movement_type, quantity_delta, occurred_at, reference_type, reference_id, notes, created_at, updated_at
      ) VALUES (?, ?, 'consignment_return', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuidv4(),
      batchItem.sku_id,
      body.returned_quantity,
      returnedAt,
      "consignment_batch_item",
      id,
      body.notes.trim() || null,
      now,
      now
    );
  });

  tx();
  appendOperationLog({
    eventType: "consignment_return_registered",
    entityType: "consignment_batch_item",
    entityId: id,
    summary: "Devolução registrada em item de consignação",
    payload: {
      batch_item_id: id,
      return_id: returnId,
      returned_quantity: body.returned_quantity,
      returned_at: returnedAt,
      notes: body.notes.trim() || null,
    },
  });
  reply.code(201);
  const updatedCounters = getBatchItemCounters(id);
  return {
    id: returnId,
    batch_item_id: id,
    returned_quantity: body.returned_quantity,
    remaining_quantity: updatedCounters?.remaining_quantity ?? 0,
  };
});

app.get("/sales/points/overview", async () => {
  const summaries = db
    .prepare(
      `WITH item_totals AS (
         SELECT cb.sales_point_id,
                cbi.sku_id,
                cbi.unit_sale_price_cents,
                cbi.quantity_sent,
                COALESCE((SELECT SUM(sold_quantity) FROM consignment_sales cs WHERE cs.batch_item_id = cbi.id), 0) AS sold_quantity,
                COALESCE((SELECT SUM(returned_quantity) FROM consignment_returns cr WHERE cr.batch_item_id = cbi.id), 0) AS returned_quantity
         FROM consignment_batch_items cbi
         JOIN consignment_batches cb ON cb.id = cbi.batch_id
       )
        SELECT sp.id AS sales_point_id,
               sp.name AS sales_point_name,
               sp.contact_period_days,
               sp.created_at,
               sp.last_contact_at,
               sp.next_contact_override_at,
               COALESCE(SUM((it.quantity_sent - it.sold_quantity - it.returned_quantity) * it.unit_sale_price_cents), 0) AS expected_revenue_cents,
               COALESCE(SUM(it.sold_quantity * it.unit_sale_price_cents), 0) AS realized_revenue_cents,
               COALESCE(COUNT(DISTINCT CASE WHEN (it.quantity_sent - it.sold_quantity - it.returned_quantity) > 0 THEN it.sku_id END), 0) AS active_products_count
       FROM sales_points sp
       LEFT JOIN item_totals it ON it.sales_point_id = sp.id
       WHERE sp.is_active = 1
       GROUP BY sp.id, sp.name, sp.contact_period_days, sp.created_at, sp.last_contact_at, sp.next_contact_override_at
       ORDER BY sp.name ASC`
    )
    .all() as Array<{
    sales_point_id: string;
    sales_point_name: string;
    contact_period_days: number;
    created_at: string;
    last_contact_at: string | null;
    next_contact_override_at: string | null;
    expected_revenue_cents: number;
    realized_revenue_cents: number;
    active_products_count: number;
  }>;

  const products = db
    .prepare(
      `WITH item_totals AS (
         SELECT cb.sales_point_id,
                cbi.sku_id,
                cbi.unit_sale_price_cents,
                cbi.quantity_sent,
                COALESCE((SELECT SUM(sold_quantity) FROM consignment_sales cs WHERE cs.batch_item_id = cbi.id), 0) AS sold_quantity,
                COALESCE((SELECT SUM(returned_quantity) FROM consignment_returns cr WHERE cr.batch_item_id = cbi.id), 0) AS returned_quantity
         FROM consignment_batch_items cbi
         JOIN consignment_batches cb ON cb.id = cbi.batch_id
       )
       SELECT it.sales_point_id,
              s.id AS sku_id,
              s.sku_code,
              s.name AS sku_name,
              MAX(it.unit_sale_price_cents) AS reference_unit_sale_price_cents,
              SUM(it.quantity_sent) AS quantity_sent,
              SUM(it.sold_quantity) AS sold_quantity,
              SUM(it.returned_quantity) AS returned_quantity
       FROM item_totals it
       JOIN sales_skus s ON s.id = it.sku_id
       GROUP BY it.sales_point_id, s.id, s.sku_code, s.name
       HAVING SUM(it.quantity_sent - it.sold_quantity - it.returned_quantity) > 0
       ORDER BY s.name ASC`
    )
    .all() as Array<{
    sales_point_id: string;
    sku_id: string;
    sku_code: string;
    sku_name: string;
    reference_unit_sale_price_cents: number;
    quantity_sent: number;
    sold_quantity: number;
    returned_quantity: number;
  }>;

  const productsByPoint = new Map<string, Array<Record<string, unknown>>>();
  for (const product of products) {
    const remainingQuantity = product.quantity_sent - product.sold_quantity - product.returned_quantity;
    const row = {
      sku_id: product.sku_id,
      sku_code: product.sku_code,
      sku_name: product.sku_name,
      quantity_remaining: remainingQuantity,
      reference_unit_sale_price_cents: product.reference_unit_sale_price_cents,
      expected_revenue_cents: remainingQuantity * product.reference_unit_sale_price_cents,
      realized_revenue_cents: product.sold_quantity * product.reference_unit_sale_price_cents,
    };
    const list = productsByPoint.get(product.sales_point_id) ?? [];
    list.push(row);
    productsByPoint.set(product.sales_point_id, list);
  }

  return summaries.map((summary) => ({
    ...summary,
    next_contact_at: computeNextContactAtFromPeriod({
      createdAtIso: summary.created_at,
      contactPeriodDays: summary.contact_period_days,
      lastContactAtIso: summary.last_contact_at,
      nextContactOverrideAtIso: summary.next_contact_override_at,
    }),
    products_at_point: productsByPoint.get(summary.sales_point_id) ?? [],
  }));
});

app.get("/printers", async () => {
  return db.prepare("SELECT * FROM printers WHERE is_active = 1 ORDER BY created_at DESC").all();
});

app.post("/printers", async (request, reply) => {
  const body = printerSchema.parse(request.body);
  const id = uuidv4();
  const now = nowIso();

  db.prepare(
    `INSERT INTO printers (id, name, model, power_watts, purchase_cost_cents, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(id, body.name, body.model, body.power_watts, body.purchase_cost_cents, now, now);

  reply.code(201);
  return db.prepare("SELECT * FROM printers WHERE id = ?").get(id);
});

app.put("/printers/:id", async (request) => {
  const { id } = request.params as { id: string };
  const body = printerSchema.parse(request.body);

  db.prepare(
    `UPDATE printers
     SET name = ?, model = ?, power_watts = ?, purchase_cost_cents = ?, updated_at = ?
     WHERE id = ?`
  ).run(body.name, body.model, body.power_watts, body.purchase_cost_cents, nowIso(), id);

  return db.prepare("SELECT * FROM printers WHERE id = ?").get(id);
});

app.delete("/printers/:id", async (request) => {
  const { id } = request.params as { id: string };
  db.prepare("UPDATE printers SET is_active = 0, updated_at = ? WHERE id = ?").run(nowIso(), id);
  return { ok: true };
});

app.get("/filaments", async () => {
  return db.prepare("SELECT * FROM filaments WHERE is_active = 1 ORDER BY created_at DESC").all();
});

app.post("/filaments", async (request, reply) => {
  const body = filamentSchema.parse(request.body);
  const id = uuidv4();
  const now = nowIso();
  const costPerGram = Math.round(body.purchase_cost_cents / body.purchased_weight_grams);
  const costPerKg = costPerGram * 1000;

  db.prepare(
    `INSERT INTO filaments (
      id, name, brand, color, material_type, purchase_link, notes,
      purchase_cost_cents, purchased_weight_grams, cost_per_gram_cents, cost_per_kg_cents,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    id,
    body.name,
    body.brand,
    body.color,
    body.material_type,
    body.purchase_link || null,
    body.notes || "",
    body.purchase_cost_cents,
    body.purchased_weight_grams,
    costPerGram,
    costPerKg,
    now,
    now
  );

  reply.code(201);
  appendOperationLog({
    eventType: "filament_created",
    entityType: "filament",
    entityId: id,
    summary: "Filamento criado",
    payload: {
      filament_id: id,
      name: body.name,
      brand: body.brand,
      material_type: body.material_type,
      purchase_cost_cents: body.purchase_cost_cents,
      purchased_weight_grams: body.purchased_weight_grams,
    },
  });
  return db.prepare("SELECT * FROM filaments WHERE id = ?").get(id);
});

app.put("/filaments/:id", async (request) => {
  const { id } = request.params as { id: string };
  const body = filamentSchema.parse(request.body);
  const costPerGram = Math.round(body.purchase_cost_cents / body.purchased_weight_grams);
  const costPerKg = costPerGram * 1000;

  db.prepare(
    `UPDATE filaments
     SET name = ?, brand = ?, color = ?, material_type = ?, purchase_link = ?, notes = ?,
         purchase_cost_cents = ?, purchased_weight_grams = ?, cost_per_gram_cents = ?,
         cost_per_kg_cents = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    body.name,
    body.brand,
    body.color,
    body.material_type,
    body.purchase_link || null,
    body.notes || "",
    body.purchase_cost_cents,
    body.purchased_weight_grams,
    costPerGram,
    costPerKg,
    nowIso(),
    id
  );

  syncSkusImpactedByFilament(id);
  appendOperationLog({
    eventType: "filament_updated",
    entityType: "filament",
    entityId: id,
    summary: "Filamento atualizado",
    payload: {
      filament_id: id,
      name: body.name,
      brand: body.brand,
      material_type: body.material_type,
      purchase_cost_cents: body.purchase_cost_cents,
      purchased_weight_grams: body.purchased_weight_grams,
    },
  });

  return db.prepare("SELECT * FROM filaments WHERE id = ?").get(id);
});

app.delete("/filaments/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const result = db
    .prepare("UPDATE filaments SET is_active = 0, updated_at = ? WHERE id = ? AND is_active = 1")
    .run(nowIso(), id);
  if (result.changes === 0) {
    reply.code(404);
    return { ok: false, message: "Filament not found or already inactive" };
  }
  appendOperationLog({
    eventType: "filament_deleted",
    entityType: "filament",
    entityId: id,
    summary: "Filamento desativado",
    payload: { filament_id: id },
  });
  return { ok: true };
});

app.get("/cost-settings", async () => {
  return db.prepare("SELECT * FROM cost_settings ORDER BY effective_from DESC").all();
});

app.get("/cost-settings/active", async () => {
  const row = db
    .prepare("SELECT * FROM cost_settings WHERE is_active = 1 ORDER BY effective_from DESC LIMIT 1")
    .get();
  return row ?? null;
});

app.post("/cost-settings", async (request, reply) => {
  const body = costSettingsSchema.parse(request.body);
  const id = uuidv4();
  const now = nowIso();
  const finalMarkupBps =
    typeof body.markup_final_sale_bps === "number" ? body.markup_final_sale_bps : body.markup_bps;

  const tx = db.transaction(() => {
    if (body.is_active === 1) {
      db.prepare("UPDATE cost_settings SET is_active = 0, updated_at = ? WHERE is_active = 1").run(now);
    }

    db.prepare(
      `INSERT INTO cost_settings (
        id, effective_from, labor_hour_cost_cents, energy_cost_kwh_cents,
        tax_rate_bps, printer_payback_months, markup_bps,
        markup_final_sale_bps, markup_presential_sale_bps, markup_wholesale_consignment_bps, markup_wholesale_cash_bps,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      body.effective_from,
      body.labor_hour_cost_cents,
      body.energy_cost_kwh_cents,
      body.tax_rate_bps,
      body.printer_payback_months,
      body.markup_bps,
      finalMarkupBps,
      body.markup_presential_sale_bps,
      body.markup_wholesale_consignment_bps,
      body.markup_wholesale_cash_bps,
      body.is_active,
      now,
      now
    );
  });

  tx();
  if (body.is_active === 1) {
    syncAllSkusWithQuotePricing();
  }
  appendOperationLog({
    eventType: "cost_settings_created",
    entityType: "cost_settings",
    entityId: id,
    summary: "Configuração de custos criada",
    payload: {
      cost_settings_id: id,
      effective_from: body.effective_from,
      labor_hour_cost_cents: body.labor_hour_cost_cents,
      energy_cost_kwh_cents: body.energy_cost_kwh_cents,
      tax_rate_bps: body.tax_rate_bps,
      printer_payback_months: body.printer_payback_months,
      markup_bps: body.markup_bps,
      is_active: body.is_active,
    },
  });
  reply.code(201);
  return db.prepare("SELECT * FROM cost_settings WHERE id = ?").get(id);
});

app.get("/quotes", async () => {
  const rows = db
    .prepare(
      `SELECT q.id, q.print_name, q.status, q.units_produced, q.print_time_minutes,
              q.post_processing_minutes, q.subtotal_cost_cents, q.tax_cost_cents,
              q.final_price_cents, q.created_at, p.name AS printer_name
       FROM print_quotes q
       JOIN printers p ON p.id = q.printer_id
       ORDER BY q.created_at DESC`
    )
    .all();
  return rows.map((row: any) => withQuoteContributionMargin(row));
});

app.get("/quotes/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const quote = db.prepare("SELECT * FROM print_quotes WHERE id = ?").get(id) as any;

  if (!quote) {
    reply.code(404);
    return { message: "Quote not found" };
  }

  const filamentItems = db
    .prepare(
      `SELECT qf.*, f.name AS filament_name
       FROM print_quote_filaments qf
       JOIN filaments f ON f.id = qf.filament_id
       WHERE qf.quote_id = ?`
    )
    .all(id);

  const extraCosts = db.prepare("SELECT * FROM print_quote_extra_costs WHERE quote_id = ?").all(id);
  const media = db.prepare("SELECT * FROM print_quote_media WHERE quote_id = ?").all(id);

  return {
    ...withQuoteContributionMargin(quote),
    filament_items: filamentItems,
    extra_costs: extraCosts,
    media,
  };
});

app.get("/quotes/:id/media", async (request, reply) => {
  const { id } = request.params as { id: string };
  const media = db
    .prepare("SELECT id, media_type, local_uri, created_at FROM print_quote_media WHERE quote_id = ?")
    .all(id);
  if (!media.length) {
    reply.code(404);
    return { message: "No media found for this quote" };
  }
  return media;
});

app.post("/quotes", async (request, reply) => {
  const body = quoteSchema.parse(request.body);
  const now = nowIso();
  const quoteId = uuidv4();

  const printer = db.prepare("SELECT * FROM printers WHERE id = ? AND is_active = 1").get(body.printer_id) as any;
  if (!printer) {
    reply.code(400);
    return { message: "Printer not found or inactive" };
  }

  const settings = db
    .prepare("SELECT * FROM cost_settings WHERE id = ?")
    .get(body.cost_setting_id) as any;
  if (!settings) {
    reply.code(400);
    return { message: "Cost setting not found" };
  }

  let filamentTotalUnitCents = 0;
  const filamentRows = body.filament_items.map((item) => {
    const filament = db
      .prepare("SELECT * FROM filaments WHERE id = ? AND is_active = 1")
      .get(item.filament_id) as any;

    if (!filament) {
      throw new Error(`Filament not found: ${item.filament_id}`);
    }

    const unitCostPerGram = filament.cost_per_gram_cents;
    const lineTotal = unitCostPerGram * item.used_weight_grams;
    filamentTotalUnitCents += lineTotal;

    return {
      id: uuidv4(),
      quote_id: quoteId,
      filament_id: item.filament_id,
      used_weight_grams: item.used_weight_grams,
      unit_cost_per_gram_cents: unitCostPerGram,
      line_total_cost_cents: lineTotal,
      created_at: now,
      updated_at: now,
    };
  });

  const extrasTotalUnitCents = body.extra_costs.reduce((sum, item) => sum + item.item_cost_cents, 0);

  const computed = computeQuote({
    unitsProduced: body.units_produced,
    printTimeMinutes: body.print_time_minutes,
    postProcessingMinutes: body.post_processing_minutes,
    packagingCostCents: body.packaging_cost_cents,
    printerPowerWatts: printer.power_watts,
    printerPurchaseCostCents: printer.purchase_cost_cents,
    laborHourCostCents: settings.labor_hour_cost_cents,
    energyCostKwhCents: settings.energy_cost_kwh_cents,
    taxRateBps: settings.tax_rate_bps,
    printerPaybackMonths: settings.printer_payback_months,
    markupBps: settings.markup_final_sale_bps ?? settings.markup_bps,
    filamentTotalUnitCents,
    extrasTotalUnitCents,
  });

  const persistedMedia = [] as Array<{
    id: string;
    quote_id: string;
    media_type: "photo" | "video" | "3mf";
    local_uri: string;
    created_at: string;
    updated_at: string;
  }>;

  try {
    for (const item of body.media) {
      const persisted = persistMediaFile({
        mediaRoot,
        mediaType: item.media_type,
        localUri: item.local_uri,
        backendRoot,
        ownerType: "quotes",
        ownerId: quoteId,
      });

      persistedMedia.push({
        id: uuidv4(),
        quote_id: quoteId,
        media_type: item.media_type,
        local_uri: persisted.relativePath,
        created_at: now,
        updated_at: now,
      });
    }
  } catch (error: any) {
    reply.code(400);
    return {
      message: error?.message ?? "Failed to persist media files",
    };
  }

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO print_quotes (
        id, print_name, description, printer_id, cost_setting_id,
        units_produced, print_time_minutes, post_processing_minutes, packaging_cost_cents,
        subtotal_cost_cents, tax_cost_cents, final_price_cents, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      quoteId,
      body.print_name,
      body.description || null,
      body.printer_id,
      body.cost_setting_id,
      body.units_produced,
      body.print_time_minutes,
      body.post_processing_minutes,
      body.packaging_cost_cents,
      computed.subtotalUnitCents,
      computed.taxUnitCents,
      computed.finalUnitCents,
      body.status,
      body.notes || null,
      now,
      now
    );

    const insertFilament = db.prepare(
      `INSERT INTO print_quote_filaments (
        id, quote_id, filament_id, used_weight_grams, unit_cost_per_gram_cents,
        line_total_cost_cents, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const row of filamentRows) {
      insertFilament.run(
        row.id,
        row.quote_id,
        row.filament_id,
        row.used_weight_grams,
        row.unit_cost_per_gram_cents,
        row.line_total_cost_cents,
        row.created_at,
        row.updated_at
      );
    }

    const insertExtra = db.prepare(
      `INSERT INTO print_quote_extra_costs (id, quote_id, item_name, item_cost_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const item of body.extra_costs) {
      insertExtra.run(uuidv4(), quoteId, item.item_name, item.item_cost_cents, now, now);
    }

    const insertMedia = db.prepare(
      `INSERT INTO print_quote_media (id, quote_id, media_type, local_uri, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const item of persistedMedia) {
      insertMedia.run(item.id, item.quote_id, item.media_type, item.local_uri, item.created_at, item.updated_at);
    }
  });

  try {
    tx();
  } catch (error: any) {
    reply.code(400);
    return { message: error?.message ?? "Failed to create quote" };
  }

  syncSkusLinkedToQuote(quoteId);
  appendOperationLog({
    eventType: "quote_created",
    entityType: "quote",
    entityId: quoteId,
    summary: "Orçamento criado",
    payload: {
      quote_id: quoteId,
      print_name: body.print_name,
      printer_id: body.printer_id,
      units_produced: body.units_produced,
      final_unit_cents: computed.finalUnitCents,
      status: body.status,
    },
  });

  reply.code(201);
  const contributionMargin = computeContributionMargin({
    revenueCents: computed.finalUnitCents,
    variableCostCents: computed.subtotalUnitCents,
    taxCents: computed.taxUnitCents,
  });
  return {
    id: quoteId,
    subtotal_unit_cents: computed.subtotalUnitCents,
    tax_unit_cents: computed.taxUnitCents,
    final_unit_cents: computed.finalUnitCents,
    subtotal_batch_cents: computed.subtotalBatchCents,
    tax_batch_cents: computed.taxBatchCents,
    final_batch_cents: computed.finalBatchCents,
    ...contributionMargin,
    breakdown: computed.breakdown,
  };
});

app.put("/quotes/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = quoteSchema.parse(request.body);
  const now = nowIso();

  const existing = db.prepare("SELECT * FROM print_quotes WHERE id = ?").get(id) as any;
  if (!existing) {
    reply.code(404);
    return { message: "Quote not found" };
  }

  const printer = db.prepare("SELECT * FROM printers WHERE id = ? AND is_active = 1").get(body.printer_id) as any;
  if (!printer) {
    reply.code(400);
    return { message: "Printer not found or inactive" };
  }

  const settings = db
    .prepare("SELECT * FROM cost_settings WHERE id = ?")
    .get(body.cost_setting_id) as any;
  if (!settings) {
    reply.code(400);
    return { message: "Cost setting not found" };
  }

  let filamentTotalUnitCents = 0;
  const filamentRows = body.filament_items.map((item) => {
    const filament = db
      .prepare("SELECT * FROM filaments WHERE id = ? AND is_active = 1")
      .get(item.filament_id) as any;

    if (!filament) {
      throw new Error(`Filament not found: ${item.filament_id}`);
    }

    const unitCostPerGram = filament.cost_per_gram_cents;
    const lineTotal = unitCostPerGram * item.used_weight_grams;
    filamentTotalUnitCents += lineTotal;

    return {
      id: uuidv4(),
      quote_id: id,
      filament_id: item.filament_id,
      used_weight_grams: item.used_weight_grams,
      unit_cost_per_gram_cents: unitCostPerGram,
      line_total_cost_cents: lineTotal,
      created_at: now,
      updated_at: now,
    };
  });

  const extrasTotalUnitCents = body.extra_costs.reduce((sum, item) => sum + item.item_cost_cents, 0);

  const computed = computeQuote({
    unitsProduced: body.units_produced,
    printTimeMinutes: body.print_time_minutes,
    postProcessingMinutes: body.post_processing_minutes,
    packagingCostCents: body.packaging_cost_cents,
    printerPowerWatts: printer.power_watts,
    printerPurchaseCostCents: printer.purchase_cost_cents,
    laborHourCostCents: settings.labor_hour_cost_cents,
    energyCostKwhCents: settings.energy_cost_kwh_cents,
    taxRateBps: settings.tax_rate_bps,
    printerPaybackMonths: settings.printer_payback_months,
    markupBps: settings.markup_final_sale_bps ?? settings.markup_bps,
    filamentTotalUnitCents,
    extrasTotalUnitCents,
  });

  const persistedMedia = [] as Array<{
    id: string;
    quote_id: string;
    media_type: "photo" | "video" | "3mf";
    local_uri: string;
    created_at: string;
    updated_at: string;
  }>;

  try {
    for (const item of body.media) {
      const persisted = persistMediaFile({
        mediaRoot,
        mediaType: item.media_type,
        localUri: item.local_uri,
        backendRoot,
        ownerType: "quotes",
        ownerId: id,
      });

      persistedMedia.push({
        id: uuidv4(),
        quote_id: id,
        media_type: item.media_type,
        local_uri: persisted.relativePath,
        created_at: now,
        updated_at: now,
      });
    }
  } catch (error: any) {
    reply.code(400);
    return {
      message: error?.message ?? "Failed to persist media files",
    };
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM print_quote_filaments WHERE quote_id = ?").run(id);
    db.prepare("DELETE FROM print_quote_extra_costs WHERE quote_id = ?").run(id);
    db.prepare("DELETE FROM print_quote_media WHERE quote_id = ?").run(id);

    db.prepare(
      `UPDATE print_quotes
       SET print_name = ?, description = ?, printer_id = ?, cost_setting_id = ?,
           units_produced = ?, print_time_minutes = ?, post_processing_minutes = ?,
           packaging_cost_cents = ?, subtotal_cost_cents = ?, tax_cost_cents = ?, final_price_cents = ?,
           status = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      body.print_name,
      body.description || null,
      body.printer_id,
      body.cost_setting_id,
      body.units_produced,
      body.print_time_minutes,
      body.post_processing_minutes,
      body.packaging_cost_cents,
      computed.subtotalUnitCents,
      computed.taxUnitCents,
      computed.finalUnitCents,
      body.status,
      body.notes || null,
      now,
      id
    );

    const insertFilament = db.prepare(
      `INSERT INTO print_quote_filaments (
        id, quote_id, filament_id, used_weight_grams, unit_cost_per_gram_cents,
        line_total_cost_cents, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const row of filamentRows) {
      insertFilament.run(
        row.id,
        row.quote_id,
        row.filament_id,
        row.used_weight_grams,
        row.unit_cost_per_gram_cents,
        row.line_total_cost_cents,
        row.created_at,
        row.updated_at
      );
    }

    const insertExtra = db.prepare(
      `INSERT INTO print_quote_extra_costs (id, quote_id, item_name, item_cost_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const item of body.extra_costs) {
      insertExtra.run(uuidv4(), id, item.item_name, item.item_cost_cents, now, now);
    }

    const insertMedia = db.prepare(
      `INSERT INTO print_quote_media (id, quote_id, media_type, local_uri, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const item of persistedMedia) {
      insertMedia.run(item.id, item.quote_id, item.media_type, item.local_uri, item.created_at, item.updated_at);
    }
  });

  try {
    tx();
  } catch (error: any) {
    reply.code(400);
    return { message: error?.message ?? "Failed to update quote" };
  }

  syncSkusLinkedToQuote(id);
  appendOperationLog({
    eventType: "quote_updated",
    entityType: "quote",
    entityId: id,
    summary: "Orçamento atualizado",
    payload: {
      quote_id: id,
      print_name: body.print_name,
      printer_id: body.printer_id,
      units_produced: body.units_produced,
      final_unit_cents: computed.finalUnitCents,
      status: body.status,
    },
  });

  const contributionMargin = computeContributionMargin({
    revenueCents: computed.finalUnitCents,
    variableCostCents: computed.subtotalUnitCents,
    taxCents: computed.taxUnitCents,
  });
  return {
    id,
    subtotal_unit_cents: computed.subtotalUnitCents,
    tax_unit_cents: computed.taxUnitCents,
    final_unit_cents: computed.finalUnitCents,
    subtotal_batch_cents: computed.subtotalBatchCents,
    tax_batch_cents: computed.taxBatchCents,
    final_batch_cents: computed.finalBatchCents,
    ...contributionMargin,
    breakdown: computed.breakdown,
  };
});

app.delete("/quotes/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const exists = db.prepare("SELECT id FROM print_quotes WHERE id = ?").get(id) as any;
  if (!exists) {
    reply.code(404);
    return { message: "Quote not found" };
  }
  db.prepare("DELETE FROM print_quotes WHERE id = ?").run(id);
  appendOperationLog({
    eventType: "quote_deleted",
    entityType: "quote",
    entityId: id,
    summary: "Orçamento excluído",
    payload: { quote_id: id },
  });
  return { ok: true };
});

const port = Number(process.env.PORT || 3333);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`Backend running on http://localhost:${port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
