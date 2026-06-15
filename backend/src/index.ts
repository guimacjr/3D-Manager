import path from "node:path";
import { createReadStream } from "node:fs";
import fs from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { SpanStatusCode } from "@opentelemetry/api";
import Fastify from "fastify";
import { v4 as uuidv4 } from "uuid";
import { ZodError, z } from "zod";
import { createDb, nowIso, runMigrations } from "./db.js";
import { ensureMediaStorage, persistMediaFile, persistUploadedBuffer } from "./media-store.js";
import { computeContributionMargin, computeQuote } from "./pricing.js";
import { activeTraceContext, initializeTelemetry, runWithSpan } from "./telemetry.js";
import {
  MercadoLivreApiError,
  buildMercadoLivreAuthorizationUrl,
  computeTokenExpiresAtIso,
  exchangeMercadoLivreAuthorizationCode,
  fetchMercadoLivreItems,
  fetchMercadoLivreItemPricing,
  fetchMercadoLivreItemVariations,
  fetchMercadoLivreListingFeeEstimate,
  fetchMercadoLivreOrderBillingDetail,
  fetchMercadoLivreOrderDetail,
  fetchMercadoLivrePackOrderIds,
  fetchMercadoLivrePaymentDetail,
  fetchMercadoLivreProductAdsAdvertisers,
  fetchMercadoLivreProductAdsMetrics,
  fetchMercadoLivreSellerOrders,
  fetchMercadoLivreSellerItemIds,
  fetchMercadoLivreShipmentCosts,
  fetchMercadoLivreShipmentDetail,
  fetchMercadoLivreUser,
  getMercadoLivreConfig,
  isTokenExpiringSoon,
  refreshMercadoLivreAccessToken,
} from "./marketplace-ml.js";
import {
  ShopeeApiError,
  buildShopeeAuthorizationUrl,
  computeShopeeTokenExpiresAtIso,
  exchangeShopeeAuthorizationCode,
  getShopeeConfig,
  refreshShopeeAccessToken,
  shopeeSignedShopRequest,
} from "./marketplace-shopee.js";
import type { MercadoLivreOrderSnapshot } from "./marketplace-ml.js";

const currentFilePath = fileURLToPath(import.meta.url);
const backendRoot = path.resolve(path.dirname(currentFilePath), "..");
const envFilePath = path.resolve(backendRoot, ".env");

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    const value = line.slice(eqIndex + 1).trim();
    process.env[key] = value;
  }
}

loadEnvFile(envFilePath);
initializeTelemetry();

const dbPath = process.env.DB_PATH ?? path.resolve(backendRoot, "data.sqlite");
const migrationsDir = path.resolve(backendRoot, "migrations");
const mediaRoot = process.env.MEDIA_ROOT ?? path.resolve(backendRoot, "storage", "media");

const db = createDb(dbPath);
runMigrations(db, migrationsDir);
const marketplaceSyncCancelRequests = new Set<string>();
const marketplaceOrdersSyncRunningAccounts = new Set<string>();

function ensureMarketplaceCatalogVariationColumns() {
  const columns = db
    .prepare("PRAGMA table_info('marketplace_catalog_variations')")
    .all() as Array<{ name?: string }>;
  const names = new Set(columns.map((column) => String(column.name ?? "")));

  if (!names.has("linked_sku_id")) {
    db.prepare("ALTER TABLE marketplace_catalog_variations ADD COLUMN linked_sku_id TEXT").run();
  }

  if (!names.has("is_ignored")) {
    db.prepare(
      "ALTER TABLE marketplace_catalog_variations ADD COLUMN is_ignored INTEGER NOT NULL DEFAULT 0 CHECK (is_ignored IN (0,1))"
    ).run();
  }

  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_marketplace_catalog_variations_ignored
      ON marketplace_catalog_variations (account_id, is_ignored, updated_at DESC)`
  ).run();
}

function ensureMarketplaceCatalogItemColumns() {
  const columns = db
    .prepare("PRAGMA table_info('marketplace_catalog_items')")
    .all() as Array<{ name?: string }>;
  const names = new Set(columns.map((column) => String(column.name ?? "")));

  if (!names.has("category_id")) {
    db.prepare("ALTER TABLE marketplace_catalog_items ADD COLUMN category_id TEXT").run();
  }
  if (!names.has("shipping_mode")) {
    db.prepare("ALTER TABLE marketplace_catalog_items ADD COLUMN shipping_mode TEXT").run();
  }
  if (!names.has("shipping_logistic_type")) {
    db.prepare("ALTER TABLE marketplace_catalog_items ADD COLUMN shipping_logistic_type TEXT").run();
  }
  if (!names.has("shipping_free")) {
    db.prepare("ALTER TABLE marketplace_catalog_items ADD COLUMN shipping_free INTEGER CHECK (shipping_free IN (0,1))").run();
  }
  if (!names.has("shipping_tags_json")) {
    db.prepare("ALTER TABLE marketplace_catalog_items ADD COLUMN shipping_tags_json TEXT").run();
  }

  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_marketplace_catalog_items_shipping_logistic
      ON marketplace_catalog_items (marketplace, shipping_logistic_type)`
  ).run();
}

function ensureSalesSkuPriceColumns() {
  const columns = db
    .prepare("PRAGMA table_info('sales_skus')")
    .all() as Array<{ name?: string }>;
  const names = new Set(columns.map((column) => String(column.name ?? "")));

  if (!names.has("presential_sale_price_cents")) {
    db.prepare(
      "ALTER TABLE sales_skus ADD COLUMN presential_sale_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (presential_sale_price_cents >= 0)"
    ).run();
  }
  if (!names.has("wholesale_consignment_price_cents")) {
    db.prepare(
      "ALTER TABLE sales_skus ADD COLUMN wholesale_consignment_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (wholesale_consignment_price_cents >= 0)"
    ).run();
  }
  if (!names.has("wholesale_cash_price_cents")) {
    db.prepare(
      "ALTER TABLE sales_skus ADD COLUMN wholesale_cash_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (wholesale_cash_price_cents >= 0)"
    ).run();
  }
  if (!names.has("sync_final_sale_price_with_suggested")) {
    db.prepare(
      "ALTER TABLE sales_skus ADD COLUMN sync_final_sale_price_with_suggested INTEGER NOT NULL DEFAULT 1 CHECK (sync_final_sale_price_with_suggested IN (0,1))"
    ).run();
  }
  if (!names.has("sync_presential_sale_price_with_suggested")) {
    db.prepare(
      "ALTER TABLE sales_skus ADD COLUMN sync_presential_sale_price_with_suggested INTEGER NOT NULL DEFAULT 1 CHECK (sync_presential_sale_price_with_suggested IN (0,1))"
    ).run();
  }
  if (!names.has("sync_wholesale_consignment_price_with_suggested")) {
    db.prepare(
      "ALTER TABLE sales_skus ADD COLUMN sync_wholesale_consignment_price_with_suggested INTEGER NOT NULL DEFAULT 1 CHECK (sync_wholesale_consignment_price_with_suggested IN (0,1))"
    ).run();
  }
  if (!names.has("sync_wholesale_cash_price_with_suggested")) {
    db.prepare(
      "ALTER TABLE sales_skus ADD COLUMN sync_wholesale_cash_price_with_suggested INTEGER NOT NULL DEFAULT 1 CHECK (sync_wholesale_cash_price_with_suggested IN (0,1))"
    ).run();
  }

  db.prepare(
    `UPDATE sales_skus
     SET default_sale_price_cents = CASE
           WHEN sync_final_sale_price_with_suggested = 1
             AND suggested_final_price_cents IS NOT NULL
             AND suggested_final_price_cents > 0
           THEN suggested_final_price_cents
           ELSE default_sale_price_cents
         END,
         presential_sale_price_cents = CASE
           WHEN presential_sale_price_cents = 0
             AND suggested_presential_price_cents IS NOT NULL
             AND suggested_presential_price_cents > 0
           THEN suggested_presential_price_cents
           WHEN presential_sale_price_cents = 0 THEN default_sale_price_cents
           ELSE presential_sale_price_cents
         END,
         wholesale_consignment_price_cents = CASE
           WHEN wholesale_consignment_price_cents = 0
             AND suggested_wholesale_consignment_price_cents IS NOT NULL
           THEN suggested_wholesale_consignment_price_cents
           ELSE wholesale_consignment_price_cents
         END,
         wholesale_cash_price_cents = CASE
           WHEN wholesale_cash_price_cents = 0
             AND suggested_wholesale_cash_price_cents IS NOT NULL
           THEN suggested_wholesale_cash_price_cents
           ELSE wholesale_cash_price_cents
         END`
  ).run();
}

function ensureMarketplaceProductAdsMetricsTable() {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS marketplace_product_ads_daily_metrics (
      id TEXT PRIMARY KEY,
      marketplace TEXT NOT NULL,
      account_id TEXT NOT NULL,
      advertiser_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      metric_date TEXT NOT NULL,
      cost_cents INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      ads_orders INTEGER NOT NULL DEFAULT 0,
      ads_revenue_cents INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT,
      last_synced_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (marketplace, account_id, advertiser_id, site_id, metric_date),
      FOREIGN KEY (account_id) REFERENCES marketplace_accounts(id) ON DELETE CASCADE
    )`
  ).run();

  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_product_ads_metrics_account_date
      ON marketplace_product_ads_daily_metrics (marketplace, account_id, metric_date)`
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS marketplace_product_ads_metric_snapshots (
      id TEXT PRIMARY KEY,
      marketplace TEXT NOT NULL,
      account_id TEXT NOT NULL,
      run_id TEXT,
      advertiser_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      metric_date TEXT NOT NULL,
      sync_mode TEXT NOT NULL,
      sync_source TEXT NOT NULL,
      cost_cents INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      ads_orders INTEGER NOT NULL DEFAULT 0,
      ads_revenue_cents INTEGER NOT NULL DEFAULT 0,
      previous_snapshot_id TEXT,
      delta_cost_cents INTEGER NOT NULL DEFAULT 0,
      delta_impressions INTEGER NOT NULL DEFAULT 0,
      delta_clicks INTEGER NOT NULL DEFAULT 0,
      delta_ads_orders INTEGER NOT NULL DEFAULT 0,
      delta_ads_revenue_cents INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT,
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES marketplace_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (run_id) REFERENCES marketplace_sync_runs(id) ON DELETE SET NULL,
      FOREIGN KEY (previous_snapshot_id) REFERENCES marketplace_product_ads_metric_snapshots(id) ON DELETE SET NULL
    )`
  ).run();

  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_product_ads_snapshots_account_date
      ON marketplace_product_ads_metric_snapshots (marketplace, account_id, metric_date, fetched_at DESC)`
  ).run();

  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_product_ads_snapshots_run
      ON marketplace_product_ads_metric_snapshots (run_id)`
  ).run();
}

ensureMarketplaceCatalogItemColumns();
ensureMarketplaceCatalogVariationColumns();
ensureSalesSkuPriceColumns();
ensureMarketplaceProductAdsMetricsTable();
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
  presential_sale_price_cents: z.number().int().nonnegative().optional(),
  wholesale_consignment_price_cents: z.number().int().nonnegative().optional(),
  wholesale_cash_price_cents: z.number().int().nonnegative().optional(),
  sync_final_sale_price_with_suggested: z.boolean().optional(),
  sync_presential_sale_price_with_suggested: z.boolean().optional(),
  sync_wholesale_consignment_price_with_suggested: z.boolean().optional(),
  sync_wholesale_cash_price_with_suggested: z.boolean().optional(),
  production_cost_cents: z.number().int().nonnegative().optional(),
  suggested_wholesale_consignment_price_cents: z.number().int().nonnegative().optional(),
  suggested_wholesale_cash_price_cents: z.number().int().nonnegative().optional(),
  parent_sku_id: z.string().optional().or(z.literal("")),
  source_quote_id: z.string().optional().or(z.literal("")),
  sync_with_quote_pricing: z.boolean().optional(),
  copy_from_quote: z.boolean().optional().default(false),
  copy_media_from_quote: z.boolean().optional().default(false),
  barcodes: z.array(z.string()).optional().default([]),
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

const consignmentPointSaleSchema = z.object({
  sku_id: z.string().min(1),
  sold_quantity: z.number().int().positive(),
  sold_at: z.string().optional().or(z.literal("")),
  notes: z.string().optional().default(""),
});

const consignmentPointReturnSchema = z.object({
  sku_id: z.string().min(1),
  returned_quantity: z.number().int().positive(),
  returned_at: z.string().optional().or(z.literal("")),
  notes: z.string().optional().default(""),
});

const consignmentDashboardQuerySchema = z.object({
  date_from: z.string().optional().or(z.literal("")),
  date_to: z.string().optional().or(z.literal("")),
  sales_point_id: z.string().optional().or(z.literal("")),
  limit: z.coerce.number().int().positive().max(500).optional().default(100),
});

const mercadoLivreConnectSchema = z.object({
  account_label: z.string().optional().default(""),
});

const mercadoLivreCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const mercadoLivreDisconnectSchema = z.object({
  account_id: z.string().optional().or(z.literal("")),
});

const mercadoLivreCatalogSyncSchema = z.object({
  account_id: z.string().optional().or(z.literal("")),
  limit: z.number().int().positive().max(1000).optional().default(200),
});

const mercadoLivreCatalogListQuerySchema = z.object({
  account_id: z.string().optional().or(z.literal("")),
  q: z.string().optional().or(z.literal("")),
  limit: z.coerce.number().int().positive().max(500).optional().default(100),
});

const mercadoLivreCatalogVariationsListQuerySchema = z.object({
  account_id: z.string().optional().or(z.literal("")),
  q: z.string().optional().or(z.literal("")),
  item_id: z.string().optional().or(z.literal("")),
  limit: z.coerce.number().int().positive().max(500).optional().default(100),
});

const mercadoLivreCatalogVariationLinkSkuSchema = z.object({
  variation_id: z.string().min(1),
  sku_id: z.string().optional().or(z.literal("")),
});

const mercadoLivreCatalogVariationIgnoreSchema = z.object({
  variation_id: z.string().min(1),
  is_ignored: z.boolean().optional().default(true),
});

const mercadoLivreOrdersSyncSchema = z.object({
  account_id: z.string().optional().or(z.literal("")),
  order_id: z.string().optional().or(z.literal("")),
  mode: z.enum(["incremental", "light", "normal", "full"]).optional().default("normal"),
  limit: z.number().int().positive().max(50000).optional(),
  source: z.enum(["manual", "scheduler"]).optional().default("manual"),
});

const mercadoLivreProductAdsSyncSchema = z.object({
  account_id: z.string().optional().or(z.literal("")),
  mode: z.enum(["incremental", "light", "normal", "full"]).optional().default("incremental"),
  source: z.enum(["manual", "scheduler"]).optional().default("manual"),
});

const mercadoLivreOrdersListQuerySchema = z.object({
  account_id: z.string().optional().or(z.literal("")),
  status: z.string().optional().or(z.literal("")),
  q: z.string().optional().or(z.literal("")),
  limit: z.coerce.number().int().positive().max(5000).optional().default(500),
});

const mercadoLivreOrdersDashboardQuerySchema = z.object({
  account_id: z.string().optional().or(z.literal("")),
  date_from: z.string().optional().or(z.literal("")),
  date_to: z.string().optional().or(z.literal("")),
});

const mercadoLivreOrdersRecalculateSnapshotsSchema = z.object({
  account_id: z.string().optional().or(z.literal("")),
});

const marketplaceNormalizationRulesQuerySchema = z.object({
  marketplace: z.string().optional().default("mercadolivre"),
  category: z.string().optional().default("shipping_logistic_type"),
});

const marketplaceNormalizationRulesSaveSchema = z.object({
  marketplace: z.string().optional().default("mercadolivre"),
  category: z.string().optional().default("shipping_logistic_type"),
  rules: z.array(
    z.object({
      raw_value: z.string().min(1),
      normalized_label: z.string().min(1),
      is_active: z.boolean().optional().default(true),
    })
  ),
});

const mercadoLivreCustomRequestSchema = z.object({
  account_id: z.string().optional().or(z.literal("")),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional().default("GET"),
  path: z.string().min(1),
  query: z.record(z.string(), z.string()).optional().default({}),
  headers: z.record(z.string(), z.string()).optional().default({}),
  body: z.string().optional().default(""),
});

const shopeeCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  shop_id: z.coerce.string().optional(),
  merchant_id: z.coerce.string().optional(),
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

function getOpenConsignmentBatchItemsForPointSku(salesPointId: string, skuId: string) {
  return db
    .prepare(
      `SELECT cbi.id,
              cbi.sku_id,
              cb.id AS batch_id,
              cb.sales_point_id,
              cbi.quantity_sent,
              COALESCE((SELECT SUM(sold_quantity) FROM consignment_sales cs WHERE cs.batch_item_id = cbi.id), 0) AS sold_quantity,
              COALESCE((SELECT SUM(returned_quantity) FROM consignment_returns cr WHERE cr.batch_item_id = cbi.id), 0) AS returned_quantity
       FROM consignment_batch_items cbi
       JOIN consignment_batches cb ON cb.id = cbi.batch_id
       WHERE cb.sales_point_id = ?
         AND cbi.sku_id = ?
         AND cb.status = 'open'
       ORDER BY cb.dispatched_at ASC, cbi.created_at ASC`
    )
    .all(salesPointId, skuId)
    .map((row: any) => ({
      id: String(row.id),
      sku_id: String(row.sku_id),
      batch_id: String(row.batch_id),
      sales_point_id: String(row.sales_point_id),
      remaining_quantity:
        Number(row.quantity_sent ?? 0) - Number(row.sold_quantity ?? 0) - Number(row.returned_quantity ?? 0),
    }))
    .filter((row) => row.remaining_quantity > 0);
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

type MarketplaceFilamentCostBreakdownEntry = {
  material_type: string;
  unit_cost_cents: number;
  total_cost_cents: number;
  used_weight_grams_per_unit: number;
  used_weight_grams_total: number;
};

type MarketplaceOrderSnapshotReasonCode =
  | "linked_sku_missing"
  | "production_cost_unavailable";

function computeQuoteCostSnapshotWithActiveSettings(quoteId: string): {
  subtotalUnitCents: number;
  taxUnitCents: number;
  finalUnitCents: number;
  unitEnergyCostCents: number;
  unitPaybackCostCents: number;
  unitFilamentCostCents: number;
  unitOtherCostCents: number;
  filamentBreakdown: MarketplaceFilamentCostBreakdownEntry[];
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
    .prepare(
      `SELECT qf.filament_id, qf.used_weight_grams, f.material_type, f.cost_per_gram_cents
       FROM print_quote_filaments qf
       JOIN filaments f ON f.id = qf.filament_id
       WHERE qf.quote_id = ?`
    )
    .all(quoteId) as Array<{
    filament_id: string;
    used_weight_grams: number;
    material_type: string | null;
    cost_per_gram_cents: number;
  }>;

  let filamentTotalBatchCents = 0;
  const unitsProduced = Math.max(1, Math.round(Number(quote.units_produced ?? 1)));
  const filamentTotalsByMaterial = new Map<
    string,
    { material_type: string; total_cost_cents: number; used_weight_grams_total: number }
  >();
  for (const item of quoteFilaments) {
    const lineTotal = Number(item.cost_per_gram_cents ?? 0) * Number(item.used_weight_grams ?? 0);
    filamentTotalBatchCents += lineTotal;

    const materialType = String(item.material_type ?? "").trim() || "Nao informado";
    const current = filamentTotalsByMaterial.get(materialType) ?? {
      material_type: materialType,
      total_cost_cents: 0,
      used_weight_grams_total: 0,
    };

    current.total_cost_cents += lineTotal;
    current.used_weight_grams_total += Number(item.used_weight_grams ?? 0);
    filamentTotalsByMaterial.set(materialType, current);
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
    filamentTotalUnitCents: filamentTotalBatchCents,
    extrasTotalUnitCents: Number(extrasTotalUnitCents?.total ?? 0),
  });

  const unitEnergyCostCents = Math.round(computed.breakdown.energyBatchCents / unitsProduced);
  const unitPaybackCostCents = Math.round(computed.breakdown.paybackBatchCents / unitsProduced);
  const unitFilamentCostCents = Math.round(computed.breakdown.filamentBatchCents / unitsProduced);
  const unitOtherCostCents = Math.max(
    0,
    computed.subtotalUnitCents - unitEnergyCostCents - unitPaybackCostCents - unitFilamentCostCents
  );

  return {
    subtotalUnitCents: computed.subtotalUnitCents,
    taxUnitCents: computed.taxUnitCents,
    finalUnitCents: computed.finalUnitCents,
    unitEnergyCostCents,
    unitPaybackCostCents,
    unitFilamentCostCents,
    unitOtherCostCents,
    filamentBreakdown: Array.from(filamentTotalsByMaterial.values())
      .sort((a, b) => b.total_cost_cents - a.total_cost_cents)
      .map((entry) => ({
        material_type: entry.material_type,
        unit_cost_cents: Math.round(entry.total_cost_cents / unitsProduced),
        total_cost_cents: entry.total_cost_cents,
        used_weight_grams_per_unit: Number((entry.used_weight_grams_total / unitsProduced).toFixed(2)),
        used_weight_grams_total: entry.used_weight_grams_total,
      })),
  };
}

function recomputeQuoteWithActiveSettings(quoteId: string): {
  subtotalUnitCents: number;
  taxUnitCents: number;
  finalUnitCents: number;
} | null {
  const snapshot = computeQuoteCostSnapshotWithActiveSettings(quoteId);
  if (!snapshot) return null;

  return {
    subtotalUnitCents: snapshot.subtotalUnitCents,
    taxUnitCents: snapshot.taxUnitCents,
    finalUnitCents: snapshot.finalUnitCents,
  };
}

function upsertMarketplaceOrderItemCostSnapshot(params: {
  orderItemId: string;
  linkedSkuId?: string | null;
  linkedSkuCode?: string | null;
  linkedSkuName?: string | null;
  linkedSkuProductionCostCents?: number | null;
  linkedSkuSourceQuoteId?: string | null;
  force?: boolean;
}): { updated: boolean; reason?: string } {
  const existing = db
    .prepare(
      `SELECT unit_production_cost_cents, cost_snapshot_at
       FROM marketplace_order_items
       WHERE id = ?`
    )
    .get(params.orderItemId) as
    | {
        unit_production_cost_cents?: number | null;
        cost_snapshot_at?: string | null;
      }
    | undefined;

  if (!existing) return { updated: false, reason: "order_item_not_found" };
  if (
    !params.force &&
    typeof existing.unit_production_cost_cents === "number" &&
    Number.isFinite(existing.unit_production_cost_cents) &&
    existing.cost_snapshot_at
  ) {
    return { updated: false, reason: "snapshot_already_exists" };
  }

  if (!params.linkedSkuId) return { updated: false, reason: "linked_sku_missing" };

  const quoteSnapshot = params.linkedSkuSourceQuoteId
    ? computeQuoteCostSnapshotWithActiveSettings(params.linkedSkuSourceQuoteId)
    : null;

  const unitProductionCostCents =
    typeof params.linkedSkuProductionCostCents === "number" &&
    Number.isFinite(params.linkedSkuProductionCostCents)
      ? Math.max(0, Math.round(params.linkedSkuProductionCostCents))
      : typeof quoteSnapshot?.subtotalUnitCents === "number"
        ? Math.max(0, Math.round(quoteSnapshot.subtotalUnitCents))
        : null;

  if (unitProductionCostCents === null) {
    return { updated: false, reason: "production_cost_unavailable" };
  }

  const trackedUnitCostCents = sumNumber([
    quoteSnapshot?.unitEnergyCostCents,
    quoteSnapshot?.unitPaybackCostCents,
    quoteSnapshot?.unitFilamentCostCents,
  ]);

  db.prepare(
    `UPDATE marketplace_order_items
     SET cost_snapshot_sku_id = ?,
         cost_snapshot_sku_code = ?,
         cost_snapshot_sku_name = ?,
         cost_snapshot_source_quote_id = ?,
         unit_production_cost_cents = ?,
         unit_energy_cost_cents = ?,
         unit_payback_cost_cents = ?,
         unit_filament_cost_cents = ?,
         unit_other_cost_cents = ?,
         filament_cost_breakdown_json = ?,
         cost_snapshot_at = ?
     WHERE id = ?`
  ).run(
    params.linkedSkuId,
    params.linkedSkuCode ?? null,
    params.linkedSkuName ?? null,
    params.linkedSkuSourceQuoteId ?? null,
    unitProductionCostCents,
    quoteSnapshot?.unitEnergyCostCents ?? null,
    quoteSnapshot?.unitPaybackCostCents ?? null,
    quoteSnapshot?.unitFilamentCostCents ?? null,
    quoteSnapshot ? Math.max(0, unitProductionCostCents - trackedUnitCostCents) : null,
    quoteSnapshot ? JSON.stringify(quoteSnapshot.filamentBreakdown) : null,
    params.force ? nowIso() : existing.cost_snapshot_at ?? nowIso(),
    params.orderItemId
  );

  return { updated: true };
}

function ensureMarketplaceOrderItemCostSnapshot(params: {
  orderItemId: string;
  linkedSkuId?: string | null;
  linkedSkuCode?: string | null;
  linkedSkuName?: string | null;
  linkedSkuProductionCostCents?: number | null;
  linkedSkuSourceQuoteId?: string | null;
}): void {
  upsertMarketplaceOrderItemCostSnapshot(params);
}

function resolveMarketplaceOrderItemEffectiveVariation(params: {
  marketplaceVariationId?: string | null;
  variationKey: string;
  rawJson?: string | null;
}) {
  let effectiveMarketplaceVariationId = params.marketplaceVariationId?.trim() || null;

  if (!effectiveMarketplaceVariationId && params.rawJson) {
    try {
      const parsed = JSON.parse(params.rawJson) as any;
      const rawVariationId =
        parsed?.item?.variation_id ?? parsed?.variation_id ?? null;
      if (rawVariationId !== null && rawVariationId !== undefined && String(rawVariationId).trim()) {
        effectiveMarketplaceVariationId = String(rawVariationId);
      }
    } catch {
      // Ignore malformed raw payload and keep fallback values below.
    }
  }

  return {
    effectiveMarketplaceVariationId,
    effectiveVariationKey: effectiveMarketplaceVariationId
      ? `var:${effectiveMarketplaceVariationId}`
      : params.variationKey,
  };
}

function resolveMarketplaceOrderItemCurrentLink(orderItemId: string):
  | {
      effectiveMarketplaceVariationId: string | null;
      effectiveVariationKey: string;
      linkedCatalogVariationId: string | null;
      linkedCatalogVariationLabel: string | null;
      linkedSkuId: string | null;
      linkedSkuCode: string | null;
      linkedSkuName: string | null;
      linkedSkuProductionCostCents: number | null;
      linkedSkuSourceQuoteId: string | null;
    }
  | undefined {
  const orderItem = db
    .prepare(
      `SELECT oi.id, oi.account_id, oi.marketplace_item_id, oi.marketplace_variation_id,
              oi.variation_key, oi.linked_catalog_variation_id, oi.linked_catalog_variation_label,
              oi.raw_json
       FROM marketplace_order_items oi
       WHERE oi.id = ?`
    )
    .get(orderItemId) as
    | {
        id: string;
        account_id: string;
        marketplace_item_id: string;
        marketplace_variation_id: string | null;
        variation_key: string;
        linked_catalog_variation_id: string | null;
        linked_catalog_variation_label: string | null;
        raw_json: string | null;
      }
    | undefined;

  if (!orderItem) return undefined;

  const { effectiveMarketplaceVariationId, effectiveVariationKey } =
    resolveMarketplaceOrderItemEffectiveVariation({
      marketplaceVariationId: orderItem.marketplace_variation_id,
      variationKey: orderItem.variation_key,
      rawJson: orderItem.raw_json,
    });

  const byLinkedVariationId = orderItem.linked_catalog_variation_id
    ? (db
        .prepare(
          `SELECT v.id AS linked_catalog_variation_id,
                  v.variation_label AS linked_catalog_variation_label,
                  v.linked_sku_id,
                  s.sku_code AS linked_sku_code,
                  s.name AS linked_sku_name,
                  s.production_cost_cents AS linked_sku_production_cost_cents,
                  s.source_quote_id AS linked_sku_source_quote_id
           FROM marketplace_catalog_variations v
           LEFT JOIN sales_skus s ON s.id = v.linked_sku_id
           WHERE v.id = ?`
        )
        .get(orderItem.linked_catalog_variation_id) as
        | {
            linked_catalog_variation_id: string | null;
            linked_catalog_variation_label: string | null;
            linked_sku_id: string | null;
            linked_sku_code: string | null;
            linked_sku_name: string | null;
            linked_sku_production_cost_cents: number | null;
            linked_sku_source_quote_id: string | null;
          }
        | undefined)
    : undefined;

  const row =
    byLinkedVariationId ??
    (effectiveMarketplaceVariationId
      ? (db
          .prepare(
            `SELECT v.id AS linked_catalog_variation_id,
                    v.variation_label AS linked_catalog_variation_label,
                    v.linked_sku_id,
                    s.sku_code AS linked_sku_code,
                    s.name AS linked_sku_name,
                    s.production_cost_cents AS linked_sku_production_cost_cents,
                    s.source_quote_id AS linked_sku_source_quote_id
             FROM marketplace_catalog_variations v
             LEFT JOIN sales_skus s ON s.id = v.linked_sku_id
             WHERE v.account_id = ?
               AND v.marketplace_item_id = ?
               AND v.marketplace_variation_id = ?
             LIMIT 1`
          )
          .get(
            orderItem.account_id,
            orderItem.marketplace_item_id,
            effectiveMarketplaceVariationId
          ) as
          | {
              linked_catalog_variation_id: string | null;
              linked_catalog_variation_label: string | null;
              linked_sku_id: string | null;
              linked_sku_code: string | null;
              linked_sku_name: string | null;
              linked_sku_production_cost_cents: number | null;
              linked_sku_source_quote_id: string | null;
            }
          | undefined)
      : undefined) ??
    (db
      .prepare(
        `SELECT v.id AS linked_catalog_variation_id,
                v.variation_label AS linked_catalog_variation_label,
                v.linked_sku_id,
                s.sku_code AS linked_sku_code,
                s.name AS linked_sku_name,
                s.production_cost_cents AS linked_sku_production_cost_cents,
                s.source_quote_id AS linked_sku_source_quote_id
         FROM marketplace_catalog_variations v
         LEFT JOIN sales_skus s ON s.id = v.linked_sku_id
         WHERE v.account_id = ?
           AND v.marketplace_item_id = ?
           AND v.variation_key = ?
         LIMIT 1`
      )
      .get(orderItem.account_id, orderItem.marketplace_item_id, effectiveVariationKey) as
      | {
          linked_catalog_variation_id: string | null;
          linked_catalog_variation_label: string | null;
          linked_sku_id: string | null;
          linked_sku_code: string | null;
          linked_sku_name: string | null;
          linked_sku_production_cost_cents: number | null;
          linked_sku_source_quote_id: string | null;
        }
      | undefined);

  const linkedCatalogVariationId = row?.linked_catalog_variation_id ?? null;
  const linkedCatalogVariationLabel = row?.linked_catalog_variation_label ?? null;

  if (
    orderItem.marketplace_variation_id !== effectiveMarketplaceVariationId ||
    orderItem.variation_key !== effectiveVariationKey ||
    orderItem.linked_catalog_variation_id !== linkedCatalogVariationId ||
    (orderItem.linked_catalog_variation_label ?? null) !== linkedCatalogVariationLabel
  ) {
    db.prepare(
      `UPDATE marketplace_order_items
       SET marketplace_variation_id = ?,
           variation_key = ?,
           linked_catalog_variation_id = ?,
           linked_catalog_variation_label = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(
      effectiveMarketplaceVariationId,
      effectiveVariationKey,
      linkedCatalogVariationId,
      linkedCatalogVariationLabel,
      nowIso(),
      orderItem.id
    );
  }

  return {
    effectiveMarketplaceVariationId,
    effectiveVariationKey,
    linkedCatalogVariationId,
    linkedCatalogVariationLabel,
    linkedSkuId: row?.linked_sku_id ?? null,
    linkedSkuCode: row?.linked_sku_code ?? null,
    linkedSkuName: row?.linked_sku_name ?? null,
    linkedSkuProductionCostCents: row?.linked_sku_production_cost_cents ?? null,
    linkedSkuSourceQuoteId: row?.linked_sku_source_quote_id ?? null,
  };
}

function resolveMarketplaceOrderItemLinkedSku(orderItemId: string):
  | {
      linkedSkuId: string | null;
      linkedSkuCode: string | null;
      linkedSkuName: string | null;
      linkedSkuProductionCostCents: number | null;
      linkedSkuSourceQuoteId: string | null;
    }
  | undefined {
  const resolved = resolveMarketplaceOrderItemCurrentLink(orderItemId);
  if (!resolved) return undefined;

  return {
    linkedSkuId: resolved.linkedSkuId,
    linkedSkuCode: resolved.linkedSkuCode,
    linkedSkuName: resolved.linkedSkuName,
    linkedSkuProductionCostCents: resolved.linkedSkuProductionCostCents,
    linkedSkuSourceQuoteId: resolved.linkedSkuSourceQuoteId,
  };
}

function isMarketplaceFulfillmentLogisticType(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "fulfillment" || normalized === "fullfilment";
}

function isMarketplaceCancelledStatus(status: string | null | undefined, substatus?: string | null): boolean {
  return `${status ?? ""} ${substatus ?? ""}`.toLowerCase().includes("cancel");
}

function reconcileMarketplaceOrderItemLocalStockMovement(orderItemId: string): void {
  const row = db
    .prepare(
      `SELECT oi.id,
              oi.quantity,
              oi.title,
              o.marketplace_order_id,
              o.pack_id,
              o.status,
              o.substatus,
              o.shipping_logistic_type,
              o.date_created
       FROM marketplace_order_items oi
       JOIN marketplace_orders o ON o.id = oi.order_id
       WHERE oi.id = ?`
    )
    .get(orderItemId) as
    | {
        id: string;
        quantity: number;
        title: string | null;
        marketplace_order_id: string;
        pack_id: string | null;
        status: string | null;
        substatus: string | null;
        shipping_logistic_type: string | null;
        date_created: string | null;
      }
    | undefined;

  if (!row) return;

  const linkedSku = resolveMarketplaceOrderItemLinkedSku(orderItemId);
  const quantity = Math.max(1, Math.round(Number(row.quantity ?? 1)));
  const isFulfillment = isMarketplaceFulfillmentLogisticType(row.shipping_logistic_type);
  const isCancelled = isMarketplaceCancelledStatus(row.status, row.substatus);
  const shouldMoveLocalStock = Boolean(linkedSku?.linkedSkuId) && !isFulfillment && !isCancelled;
  const targetBySku = new Map<string, number>();

  if (shouldMoveLocalStock && linkedSku?.linkedSkuId) {
    targetBySku.set(linkedSku.linkedSkuId, -quantity);
  }

  const currentRows = db
    .prepare(
      `SELECT sku_id, COALESCE(SUM(quantity_delta), 0) AS quantity_delta
       FROM stock_movements
       WHERE reference_type = 'marketplace_order_item'
         AND reference_id = ?
         AND movement_type IN ('marketplace_sale_out', 'marketplace_sale_reversal')
       GROUP BY sku_id`
    )
    .all(orderItemId) as Array<{ sku_id: string; quantity_delta: number }>;

  const currentBySku = new Map(currentRows.map((item) => [item.sku_id, Number(item.quantity_delta ?? 0)]));
  const skuIds = new Set([...currentBySku.keys(), ...targetBySku.keys()]);
  const now = nowIso();
  const occurredAt = row.date_created?.trim() || now;
  const logisticLabel = row.shipping_logistic_type?.trim() || "sem_logistica";
  const referenceOrder = row.pack_id?.trim() || row.marketplace_order_id;

  for (const skuId of skuIds) {
    const currentDelta = currentBySku.get(skuId) ?? 0;
    const targetDelta = targetBySku.get(skuId) ?? 0;
    const correctionDelta = targetDelta - currentDelta;
    if (correctionDelta === 0) continue;

    const isStockOut = correctionDelta < 0;
    const reason = shouldMoveLocalStock
      ? `Venda Mercado Livre ${referenceOrder}`
      : isCancelled
        ? `Reversão Mercado Livre ${referenceOrder}: pedido cancelado`
        : isFulfillment
          ? `Reversão Mercado Livre ${referenceOrder}: logística fulfillment não movimenta estoque local`
          : `Reversão Mercado Livre ${referenceOrder}: SKU local removido`;

    db.prepare(
      `INSERT INTO stock_movements (
        id, sku_id, movement_type, quantity_delta, occurred_at, reference_type, reference_id, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'marketplace_order_item', ?, ?, ?, ?)`
    ).run(
      uuidv4(),
      skuId,
      isStockOut ? "marketplace_sale_out" : "marketplace_sale_reversal",
      correctionDelta,
      occurredAt,
      orderItemId,
      `${reason}. Logística: ${logisticLabel}. Item: ${row.title ?? "-"}`,
      now,
      now
    );
  }
}

function getMarketplaceOrderItemLocalStockStatus(params: {
  orderItemId: string;
  quantity: number;
  linkedSkuId?: string | null;
  status?: string | null;
  substatus?: string | null;
  shippingLogisticType?: string | null;
}) {
  const quantity = Math.max(1, Math.round(Number(params.quantity ?? 1)));
  const movedQuantity = db
    .prepare(
      `SELECT COALESCE(SUM(quantity_delta), 0) AS quantity_delta
       FROM stock_movements
       WHERE reference_type = 'marketplace_order_item'
         AND reference_id = ?
         AND movement_type IN ('marketplace_sale_out', 'marketplace_sale_reversal')`
    )
    .get(params.orderItemId) as { quantity_delta: number } | undefined;
  const localMovedDelta = Number(movedQuantity?.quantity_delta ?? 0);
  const isFulfillment = isMarketplaceFulfillmentLogisticType(params.shippingLogisticType);
  const isCancelled = isMarketplaceCancelledStatus(params.status, params.substatus);
  const expectedDelta = params.linkedSkuId && !isFulfillment && !isCancelled ? -quantity : 0;

  if (!params.linkedSkuId) {
    return {
      code: "missing_sku",
      label: "Sem SKU local",
      summary: "Vincule um SKU local para permitir baixa de estoque.",
      expected_delta: expectedDelta,
      moved_delta: localMovedDelta,
    };
  }

  if (isFulfillment) {
    return {
      code: "ignored_fulfillment",
      label: "Ignorado: fulfillment",
      summary: "Logística fulfillment não movimenta estoque local.",
      expected_delta: expectedDelta,
      moved_delta: localMovedDelta,
    };
  }

  if (isCancelled) {
    return {
      code: "ignored_cancelled",
      label: "Ignorado: cancelado",
      summary: "Pedido cancelado não deve baixar estoque local.",
      expected_delta: expectedDelta,
      moved_delta: localMovedDelta,
    };
  }

  if (localMovedDelta === expectedDelta) {
    return {
      code: "moved",
      label: "Estoque baixado",
      summary: "Baixa de estoque local já registrada.",
      expected_delta: expectedDelta,
      moved_delta: localMovedDelta,
    };
  }

  return {
    code: "pending_movement",
    label: "Baixa pendente",
    summary: "O pedido tem SKU local, mas a baixa de estoque ainda não está reconciliada.",
    expected_delta: expectedDelta,
    moved_delta: localMovedDelta,
  };
}

function recalculateMarketplaceOrderSnapshots(params: {
  orderId?: string;
  accountId?: string | null;
}): {
  ordersProcessed: number;
  itemsProcessed: number;
  itemsUpdated: number;
  itemsSkipped: number;
} {
  const orderRows = params.orderId
    ? db
        .prepare(
          `SELECT id
           FROM marketplace_orders
           WHERE id = ?`
        )
        .all(params.orderId)
    : params.accountId
      ? db
          .prepare(
            `SELECT id
             FROM marketplace_orders
             WHERE marketplace = 'mercadolivre'
               AND account_id = ?`
          )
          .all(params.accountId)
      : db
          .prepare(
            `SELECT id
             FROM marketplace_orders
             WHERE marketplace = 'mercadolivre'`
          )
          .all();

  let ordersProcessed = 0;
  let itemsProcessed = 0;
  let itemsUpdated = 0;
  let itemsSkipped = 0;

  for (const orderRow of orderRows as Array<{ id: string }>) {
    const itemRows = db
      .prepare(
        `SELECT id
         FROM marketplace_order_items
         WHERE order_id = ?`
      )
      .all(orderRow.id) as Array<{ id: string }>;

    ordersProcessed += 1;
    for (const item of itemRows) {
      itemsProcessed += 1;
      const linkedSku = resolveMarketplaceOrderItemLinkedSku(item.id);
      const result = upsertMarketplaceOrderItemCostSnapshot({
        orderItemId: item.id,
        linkedSkuId: linkedSku?.linkedSkuId ?? null,
        linkedSkuCode: linkedSku?.linkedSkuCode ?? null,
        linkedSkuName: linkedSku?.linkedSkuName ?? null,
        linkedSkuProductionCostCents: linkedSku?.linkedSkuProductionCostCents ?? null,
        linkedSkuSourceQuoteId: linkedSku?.linkedSkuSourceQuoteId ?? null,
        force: true,
      });

      if (result.updated) {
        itemsUpdated += 1;
      } else {
        itemsSkipped += 1;
      }
      reconcileMarketplaceOrderItemLocalStockMovement(item.id);
    }
  }

  return {
    ordersProcessed,
    itemsProcessed,
    itemsUpdated,
    itemsSkipped,
  };
}

function getMarketplaceOrderSnapshotReasonLabel(reason: MarketplaceOrderSnapshotReasonCode): string {
  if (reason === "linked_sku_missing") return "Sem SKU vinculado";
  return "Sem custo de producao ou orcamento valido";
}

function resolveMarketplaceOrderItemSnapshotReason(params: {
  orderItemId: string;
  unitProductionCostCents?: number | null;
}): "ok" | "pending_recalculation" | MarketplaceOrderSnapshotReasonCode {
  if (
    typeof params.unitProductionCostCents === "number" &&
    Number.isFinite(params.unitProductionCostCents)
  ) {
    return "ok";
  }

  const linkedSku = resolveMarketplaceOrderItemLinkedSku(params.orderItemId);
  if (!linkedSku?.linkedSkuId) {
    return "linked_sku_missing";
  }

  if (
    typeof linkedSku.linkedSkuProductionCostCents === "number" &&
    Number.isFinite(linkedSku.linkedSkuProductionCostCents)
  ) {
    return "pending_recalculation";
  }

  const quoteSnapshot = linkedSku.linkedSkuSourceQuoteId
    ? computeQuoteCostSnapshotWithActiveSettings(linkedSku.linkedSkuSourceQuoteId)
    : null;

  if (quoteSnapshot) {
    return "pending_recalculation";
  }

  return "production_cost_unavailable";
}

function computeMarketplaceOrderSnapshotStatus(
  items: Array<{
    id: string;
    unit_production_cost_cents?: number | null;
  }>
) {
  let okItems = 0;
  let pendingItems = 0;
  let unresolvedItems = 0;
  const reasons = new Map<MarketplaceOrderSnapshotReasonCode, number>();

  for (const item of items) {
    const reason = resolveMarketplaceOrderItemSnapshotReason({
      orderItemId: item.id,
      unitProductionCostCents: item.unit_production_cost_cents,
    });

    if (reason === "ok") {
      okItems += 1;
      continue;
    }

    if (reason === "pending_recalculation") {
      pendingItems += 1;
      continue;
    }

    unresolvedItems += 1;
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  const reasonItems = Array.from(reasons.entries()).map(([code, count]) => ({
    code,
    count,
    label: getMarketplaceOrderSnapshotReasonLabel(code),
  }));

  if (unresolvedItems === 0 && pendingItems === 0) {
    return {
      code: "ok",
      label: "Snapshot completo",
      summary: "Todos os itens do pedido possuem snapshot de custo.",
      ok_items: okItems,
      pending_items: pendingItems,
      unresolved_items: unresolvedItems,
      reasons: reasonItems,
    };
  }

  if (unresolvedItems === 0) {
    return {
      code: "pending",
      label: "Pronto para recalcular",
      summary: `${pendingItems} item(ns) podem ter snapshot recalculado agora.`,
      ok_items: okItems,
      pending_items: pendingItems,
      unresolved_items: unresolvedItems,
      reasons: reasonItems,
    };
  }

  const reasonsSummary = reasonItems.map((item) => `${item.label}: ${item.count}`).join(" | ");

  return {
    code: okItems > 0 || pendingItems > 0 ? "partial" : "ignored",
    label: okItems > 0 || pendingItems > 0 ? "Parcialmente ignorado" : "Ignorado",
    summary: reasonsSummary || "Nao foi possivel recalcular o snapshot deste pedido.",
    ok_items: okItems,
    pending_items: pendingItems,
    unresolved_items: unresolvedItems,
    reasons: reasonItems,
  };
}

function parseMarketplaceFilamentCostBreakdown(
  value: string | null | undefined
): MarketplaceFilamentCostBreakdownEntry[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item: any) => ({
        material_type: String(item.material_type ?? "").trim() || "Nao informado",
        unit_cost_cents: Math.max(0, Math.round(Number(item.unit_cost_cents ?? 0))),
        total_cost_cents: Math.max(0, Math.round(Number(item.total_cost_cents ?? 0))),
        used_weight_grams_per_unit: Number(item.used_weight_grams_per_unit ?? 0) || 0,
        used_weight_grams_total: Number(item.used_weight_grams_total ?? 0) || 0,
      }))
      .filter((item) => item.unit_cost_cents > 0 || item.used_weight_grams_total > 0);
  } catch {
    return [];
  }
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
       SET default_sale_price_cents = CASE WHEN sync_final_sale_price_with_suggested = 1 THEN ? ELSE default_sale_price_cents END,
           presential_sale_price_cents = CASE WHEN sync_presential_sale_price_with_suggested = 1 THEN ? ELSE presential_sale_price_cents END,
           wholesale_consignment_price_cents = CASE WHEN sync_wholesale_consignment_price_with_suggested = 1 THEN ? ELSE wholesale_consignment_price_cents END,
           wholesale_cash_price_cents = CASE WHEN sync_wholesale_cash_price_with_suggested = 1 THEN ? ELSE wholesale_cash_price_cents END,
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
      suggested.suggested_final_price_cents,
      suggested.suggested_presential_price_cents,
      suggested.suggested_wholesale_consignment_price_cents,
      suggested.suggested_wholesale_cash_price_cents,
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

class MarketplaceSyncCancelledError extends Error {
  constructor() {
    super("Sincronização interrompida pelo usuário.");
    this.name = "MarketplaceSyncCancelledError";
  }
}

function beginSqlTransaction(): void {
  db.exec("BEGIN");
}

function commitSqlTransaction(): void {
  db.exec("COMMIT");
}

function rollbackSqlTransactionIfOpen(): void {
  if ((db as any).inTransaction) {
    db.exec("ROLLBACK");
  }
}

function isMarketplaceSyncCancellationRequested(runId: string): boolean {
  if (marketplaceSyncCancelRequests.has(runId)) return true;
  const row = db
    .prepare("SELECT run_id FROM marketplace_sync_cancel_requests WHERE run_id = ?")
    .get(runId);
  return Boolean(row);
}

function assertMarketplaceSyncNotCancelled(runId: string): void {
  if (isMarketplaceSyncCancellationRequested(runId)) {
    throw new MarketplaceSyncCancelledError();
  }
}

function appendMarketplaceSyncLog(params: {
  phase: "started" | "finished" | "cancelled" | "error";
  syncType: "catalog_read" | "orders_read";
  accountId: string;
  runId: string;
  recordsRead?: number;
  recordsUpserted?: number;
  recordsFailed?: number;
  message?: string;
  extraPayload?: Record<string, unknown>;
}): void {
  const traceContext = activeTraceContext();
  const kind = params.syncType === "catalog_read" ? "catálogo" : "pedidos";
  const eventSuffix =
    params.phase === "started"
      ? "started"
      : params.phase === "finished"
        ? "finished"
        : params.phase === "cancelled"
          ? "cancelled"
          : "failed";

  appendOperationLog({
    eventType: `marketplace_${params.syncType}_${eventSuffix}`,
    entityType: "marketplace_sync_run",
    entityId: params.runId,
    summary:
      params.phase === "started"
        ? `Sincronização de ${kind} Mercado Livre iniciada`
        : params.phase === "finished"
          ? `Sincronização de ${kind} Mercado Livre concluída`
          : params.phase === "cancelled"
            ? `Sincronização de ${kind} Mercado Livre interrompida`
            : `Sincronização de ${kind} Mercado Livre falhou`,
    payload: {
      marketplace: "mercadolivre",
      account_id: params.accountId,
      run_id: params.runId,
      sync_type: params.syncType,
      phase: params.phase,
      records_read: params.recordsRead ?? 0,
      records_upserted: params.recordsUpserted ?? 0,
      records_failed: params.recordsFailed ?? 0,
      message: params.message ?? null,
      trace_id: traceContext.traceId ?? null,
      span_id: traceContext.spanId ?? null,
      ...(params.extraPayload ?? {}),
    },
  });
}

function resolveMercadoLivreOrdersSyncWindow(
  mode: "incremental" | "light" | "normal" | "full",
  requestedLimit?: number
) {
  const now = new Date();
  const from = new Date(now);
  const defaultLimit = mode === "light" ? 500 : mode === "normal" ? 5000 : 50000;

  if (mode === "light") {
    from.setTime(now.getTime() - 48 * 60 * 60 * 1000);
  } else if (mode === "normal") {
    from.setUTCDate(from.getUTCDate() - 60);
  } else {
    from.setUTCFullYear(from.getUTCFullYear() - 1);
  }

  return {
    mode,
    stopAtFirstImported: mode === "incremental",
    dateCreatedFrom: from.toISOString(),
    dateCreatedTo: now.toISOString(),
    limit: Math.min(requestedLimit ?? defaultLimit, defaultLimit),
    label:
      mode === "incremental"
        ? "últimas vendas"
        : mode === "light"
        ? "últimas 48h"
        : mode === "normal"
          ? "últimos 60 dias"
          : "último ano",
  };
}

type MarketplaceAccountRow = {
  id: string;
  marketplace: string;
  account_label: string | null;
  marketplace_user_id: string;
  seller_nickname: string | null;
  country_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  last_connected_at: string;
  last_token_refresh_at: string | null;
  metadata_json?: string | null;
};

function toMarketplaceAccountResponse(account: MarketplaceAccountRow) {
  const nowMs = Date.now();
  const expiresAtMs = Date.parse(account.token_expires_at ?? "");
  const tokenValid = Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;

  return {
    id: account.id,
    marketplace: account.marketplace,
    account_label: account.account_label,
    marketplace_user_id: account.marketplace_user_id,
    seller_nickname: account.seller_nickname,
    country_id: account.country_id,
    scope: account.scope,
    is_active: account.is_active === 1,
    token_expires_at: account.token_expires_at,
    token_status: tokenValid ? (isTokenExpiringSoon(account.token_expires_at, 180) ? "expiring_soon" : "valid") : "expired",
    created_at: account.created_at,
    updated_at: account.updated_at,
    last_connected_at: account.last_connected_at,
    last_token_refresh_at: account.last_token_refresh_at,
  };
}

app.post("/integrations/shopee/connect", async (_request, reply) => {
  if (!getShopeeConfig()) {
    reply.code(503);
    return {
      message: "Shopee Open Platform não configurado no backend. Defina SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY e SHOPEE_REDIRECT_URI.",
    };
  }

  const state = uuidv4().replace(/-/g, "");
  const now = nowIso();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO marketplace_oauth_states (
      id, marketplace, state, created_at, expires_at, consumed_at
    ) VALUES (?, 'shopee', ?, ?, ?, NULL)`
  ).run(uuidv4(), state, now, expiresAt);

  appendOperationLog({
    eventType: "marketplace_connect_started",
    entityType: "marketplace_account",
    entityId: null,
    summary: "Conexão Shopee iniciada",
    payload: {
      marketplace: "shopee",
      state,
    },
  });

  return {
    marketplace: "shopee",
    authorize_url: buildShopeeAuthorizationUrl(state),
    state,
    expires_at: expiresAt,
  };
});

app.get("/integrations/shopee/callback", async (request, reply) => {
  const query = shopeeCallbackQuerySchema.parse(request.query ?? {});
  const now = nowIso();

  const stateRow = db
    .prepare(
      `SELECT id, state, expires_at
       FROM marketplace_oauth_states
       WHERE marketplace = 'shopee'
         AND state = ?
         AND consumed_at IS NULL`
    )
    .get(query.state) as { id: string; state: string; expires_at: string } | undefined;

  if (!stateRow) {
    reply.code(400);
    return { message: "State OAuth Shopee inválido ou já utilizado." };
  }

  if (Date.parse(stateRow.expires_at) < Date.now()) {
    reply.code(400);
    return { message: "State OAuth Shopee expirado. Gere uma nova conexão." };
  }

  try {
    const token = await exchangeShopeeAuthorizationCode({
      code: query.code,
      shopId: query.shop_id,
      merchantId: query.merchant_id,
    });
    const shopId = token.shop_id ?? Number(query.shop_id);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      reply.code(502);
      return { message: "Shopee não retornou shop_id válido.", marketplace_error: token.raw };
    }

    const accountId = uuidv4();
    const expiresAt = computeShopeeTokenExpiresAtIso(token.expire_in);
    const metadataJson = JSON.stringify({
      merchant_id: token.merchant_id ?? (query.merchant_id ? Number(query.merchant_id) : null),
      request_id: token.request_id ?? null,
    });

    const tx = db.transaction(() => {
      db.prepare("UPDATE marketplace_oauth_states SET consumed_at = ? WHERE id = ?").run(now, stateRow.id);
      db.prepare(
        `INSERT INTO marketplace_accounts (
          id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
          access_token, refresh_token, token_expires_at, scope, is_active, metadata_json,
          created_at, updated_at, last_connected_at, last_token_refresh_at
        ) VALUES (?, 'shopee', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
        ON CONFLICT(marketplace, marketplace_user_id) DO UPDATE SET
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          token_expires_at = excluded.token_expires_at,
          is_active = 1,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at,
          last_connected_at = excluded.last_connected_at,
          last_token_refresh_at = excluded.last_token_refresh_at`
      ).run(
        accountId,
        null,
        String(shopId),
        `Shopee ${shopId}`,
        null,
        token.access_token,
        token.refresh_token,
        expiresAt,
        null,
        metadataJson,
        now,
        now,
        now,
        now
      );
    });

    tx();

    const account = db
      .prepare(
        `SELECT id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
                access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at,
                last_connected_at, last_token_refresh_at
         FROM marketplace_accounts
         WHERE marketplace = 'shopee'
           AND marketplace_user_id = ?`
      )
      .get(String(shopId)) as MarketplaceAccountRow | undefined;

    appendOperationLog({
      eventType: "marketplace_connected",
      entityType: "marketplace_account",
      entityId: account?.id,
      summary: "Conta Shopee conectada",
      payload: {
        marketplace: "shopee",
        marketplace_user_id: String(shopId),
      },
    });

    return {
      ok: true,
      marketplace: "shopee",
      account: account ? toMarketplaceAccountResponse(account) : null,
    };
  } catch (error: unknown) {
    if (error instanceof ShopeeApiError) {
      reply.code(502);
      return {
        message: "Falha ao concluir OAuth com Shopee.",
        marketplace_error_status: error.statusCode,
        marketplace_error: error.details,
      };
    }
    throw error;
  }
});

app.get("/integrations/shopee/status", async (request, reply) => {
  const config = getShopeeConfig();
  const rows = db
    .prepare(
      `SELECT id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
              access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at,
              last_connected_at, last_token_refresh_at
       FROM marketplace_accounts
       WHERE marketplace = 'shopee'
         AND is_active = 1
       ORDER BY updated_at DESC`
    )
    .all() as MarketplaceAccountRow[];

  const accounts = [] as ReturnType<typeof toMarketplaceAccountResponse>[];
  const refreshErrors = [] as Array<{ account_id: string; message: string; status?: number; details?: unknown }>;

  for (const row of rows) {
    let account = row;
    const shouldRefresh = !!config && isTokenExpiringSoon(account.token_expires_at, 180);
    if (shouldRefresh) {
      try {
        const refreshed = await refreshShopeeAccountToken(account.id);
        if (refreshed) {
          account = refreshed;
        }
      } catch (error: unknown) {
        if (error instanceof ShopeeApiError) {
          refreshErrors.push({
            account_id: account.id,
            message: "Falha ao atualizar token com Shopee.",
            status: error.statusCode,
            details: error.details,
          });
        } else {
          refreshErrors.push({
            account_id: account.id,
            message: "Falha inesperada ao atualizar token Shopee.",
          });
        }
      }
    }
    accounts.push(toMarketplaceAccountResponse(account));
  }

  if (refreshErrors.length > 0) {
    reply.code(207);
  }

  return {
    marketplace: "shopee",
    configured: Boolean(config),
    connected: accounts.length > 0,
    accounts,
    refresh_errors: refreshErrors,
  };
});

app.post("/integrations/shopee/disconnect", async (request, reply) => {
  const body = mercadoLivreDisconnectSchema.parse(request.body ?? {});
  const now = nowIso();
  const result = body.account_id && body.account_id.trim()
    ? db
        .prepare(
          `UPDATE marketplace_accounts
           SET is_active = 0,
               access_token = NULL,
               refresh_token = NULL,
               token_expires_at = NULL,
               updated_at = ?
           WHERE id = ?
             AND marketplace = 'shopee'
             AND is_active = 1`
        )
        .run(now, body.account_id.trim())
    : db
        .prepare(
          `UPDATE marketplace_accounts
           SET is_active = 0,
               access_token = NULL,
               refresh_token = NULL,
               token_expires_at = NULL,
               updated_at = ?
           WHERE marketplace = 'shopee'
             AND is_active = 1`
        )
        .run(now);

  if (result.changes === 0) {
    reply.code(404);
    return { message: "Nenhuma conta Shopee ativa encontrada para desconectar." };
  }

  appendOperationLog({
    eventType: "marketplace_disconnected",
    entityType: "marketplace_account",
    entityId: body.account_id?.trim() || null,
    summary: "Conta Shopee desconectada",
    payload: {
      marketplace: "shopee",
      account_id: body.account_id?.trim() || null,
      deactivated_accounts: result.changes,
    },
  });

  return {
    ok: true,
    marketplace: "shopee",
    deactivated_accounts: result.changes,
  };
});

app.post("/integrations/shopee/custom-request", async (request, reply) => {
  const body = mercadoLivreCustomRequestSchema.parse(request.body ?? {});
  const account = resolveShopeeAccount(body.account_id?.trim() || undefined);
  if (!account) {
    reply.code(404);
    return { message: "Conta Shopee ativa não encontrada." };
  }

  let activeAccount = account;
  if (isTokenExpiringSoon(activeAccount.token_expires_at, 180)) {
    const refreshed = await refreshShopeeAccountToken(activeAccount.id);
    if (refreshed) {
      activeAccount = refreshed;
    }
  }

  if (!activeAccount.access_token) {
    reply.code(409);
    return { message: "Conta Shopee sem access_token ativo." };
  }

  const rawPath = body.path.trim();
  const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  if (normalizedPath.includes("://")) {
    reply.code(400);
    return { message: "Informe apenas path relativo da API Shopee (ex.: /api/v2/shop/get_shop_info)." };
  }

  const { response, data, url } = await shopeeSignedShopRequest({
    accessToken: activeAccount.access_token,
    shopId: activeAccount.marketplace_user_id,
    method: body.method,
    path: normalizedPath,
    query: body.query,
    body: body.body,
    headers: body.headers,
  });

  const responseHeaders = Object.fromEntries(
    Array.from(response.headers.entries()).filter(([key]) => {
      const k = key.toLowerCase();
      return k === "content-type" || k === "x-request-id" || k.startsWith("x-ratelimit");
    })
  );

  return {
    marketplace: "shopee",
    account_id: activeAccount.id,
    method: body.method,
    url,
    status: response.status,
    ok: response.ok,
    headers: responseHeaders,
    data,
  };
});

async function refreshMercadoLivreAccountToken(accountId: string): Promise<MarketplaceAccountRow | null> {
  const account = db
    .prepare(
      `SELECT id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
              access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at,
              last_connected_at, last_token_refresh_at
       FROM marketplace_accounts
       WHERE id = ?
         AND marketplace = 'mercadolivre'
         AND is_active = 1`
    )
    .get(accountId) as MarketplaceAccountRow | undefined;

  if (!account || !account.refresh_token) return account ?? null;

  const token = await refreshMercadoLivreAccessToken(account.refresh_token);
  const now = nowIso();
  const nextExpiresAt = computeTokenExpiresAtIso(token.expires_in);
  const nextRefreshToken = token.refresh_token || account.refresh_token;
  const nextScope = token.scope ?? account.scope;

  db.prepare(
    `UPDATE marketplace_accounts
     SET access_token = ?, refresh_token = ?, token_expires_at = ?, scope = ?,
         updated_at = ?, last_token_refresh_at = ?
     WHERE id = ?`
  ).run(token.access_token, nextRefreshToken, nextExpiresAt, nextScope ?? null, now, now, accountId);

  return db
    .prepare(
      `SELECT id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
              access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at,
              last_connected_at, last_token_refresh_at
       FROM marketplace_accounts
       WHERE id = ?`
    )
    .get(accountId) as MarketplaceAccountRow | undefined ?? null;
}

function resolveMercadoLivreAccount(accountId?: string | null): MarketplaceAccountRow | null {
  const trimmedAccountId = (accountId ?? "").trim();
  const row = trimmedAccountId
    ? db
        .prepare(
          `SELECT id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
                  access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at,
                  last_connected_at, last_token_refresh_at
           FROM marketplace_accounts
           WHERE id = ?
             AND marketplace = 'mercadolivre'
             AND is_active = 1`
        )
        .get(trimmedAccountId)
    : db
        .prepare(
          `SELECT id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
                  access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at,
                  last_connected_at, last_token_refresh_at
           FROM marketplace_accounts
           WHERE marketplace = 'mercadolivre'
             AND is_active = 1
           ORDER BY updated_at DESC
           LIMIT 1`
        )
        .get();

  return (row as MarketplaceAccountRow | undefined) ?? null;
}

function listActiveMercadoLivreAccountIds(): string[] {
  const rows = db
    .prepare(
      `SELECT id
       FROM marketplace_accounts
       WHERE marketplace = 'mercadolivre'
         AND is_active = 1
       ORDER BY updated_at DESC`
    )
    .all() as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

async function refreshShopeeAccountToken(accountId: string): Promise<MarketplaceAccountRow | null> {
  const account = db
    .prepare(
      `SELECT id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
              access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at,
              last_connected_at, last_token_refresh_at
       FROM marketplace_accounts
       WHERE id = ?
         AND marketplace = 'shopee'
         AND is_active = 1`
    )
    .get(accountId) as MarketplaceAccountRow | undefined;

  if (!account || !account.refresh_token) return account ?? null;

  const token = await refreshShopeeAccessToken({
    refreshToken: account.refresh_token,
    shopId: account.marketplace_user_id,
  });
  const now = nowIso();
  const nextExpiresAt = computeShopeeTokenExpiresAtIso(token.expire_in);

  db.prepare(
    `UPDATE marketplace_accounts
     SET access_token = ?, refresh_token = ?, token_expires_at = ?,
         updated_at = ?, last_token_refresh_at = ?
     WHERE id = ?`
  ).run(token.access_token, token.refresh_token, nextExpiresAt, now, now, accountId);

  return db
    .prepare(
      `SELECT id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
              access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at,
              last_connected_at, last_token_refresh_at
       FROM marketplace_accounts
       WHERE id = ?`
    )
    .get(accountId) as MarketplaceAccountRow | undefined ?? null;
}

function resolveShopeeAccount(accountId?: string | null): MarketplaceAccountRow | null {
  const trimmedAccountId = (accountId ?? "").trim();
  const row = trimmedAccountId
    ? db
        .prepare(
          `SELECT id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
                  access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at,
                  last_connected_at, last_token_refresh_at
           FROM marketplace_accounts
           WHERE id = ?
             AND marketplace = 'shopee'
             AND is_active = 1`
        )
        .get(trimmedAccountId)
    : db
        .prepare(
          `SELECT id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
                  access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at,
                  last_connected_at, last_token_refresh_at
           FROM marketplace_accounts
           WHERE marketplace = 'shopee'
             AND is_active = 1
           ORDER BY updated_at DESC
           LIMIT 1`
        )
        .get();

  return (row as MarketplaceAccountRow | undefined) ?? null;
}

function parsePriceToCents(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function normalizeDateFilterBoundary(value: string | null, boundary: "start" | "end"): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return boundary === "start" ? `${trimmed}T00:00:00.000Z` : `${trimmed}T23:59:59.999Z`;
  }
  return trimmed;
}

function parseSignedPriceToCents(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function toPositiveCents(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.abs(Math.round(value)));
}

function deriveEffectiveVariationPriceCents(params: {
  variationPriceCents: number | null;
  itemPriceCents: number | null;
  itemBasePriceCents: number | null;
  itemPromotionPriceCents: number | null;
  itemEffectivePriceCents: number | null;
}): number | null {
  const {
    variationPriceCents,
    itemPriceCents,
    itemBasePriceCents,
    itemPromotionPriceCents,
    itemEffectivePriceCents,
  } = params;

  const promoOrEffectiveItemPriceCents = itemPromotionPriceCents ?? itemEffectivePriceCents;
  const fallbackItemPriceCents = promoOrEffectiveItemPriceCents ?? itemPriceCents;

  if (variationPriceCents === null) {
    return fallbackItemPriceCents;
  }

  if (promoOrEffectiveItemPriceCents === null) {
    return variationPriceCents;
  }

  const referenceBaseCents = itemBasePriceCents ?? itemPriceCents;
  if (
    typeof referenceBaseCents === "number" &&
    referenceBaseCents > 0 &&
    promoOrEffectiveItemPriceCents >= 0 &&
    promoOrEffectiveItemPriceCents < referenceBaseCents
  ) {
    const discountRatio = promoOrEffectiveItemPriceCents / referenceBaseCents;
    return Math.max(0, Math.round(variationPriceCents * discountRatio));
  }

  return Math.min(variationPriceCents, promoOrEffectiveItemPriceCents);
}

function sumNumber(values: Array<number | null | undefined>): number {
  return values.reduce<number>(
    (sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0),
    0
  );
}

function resolveEstimatedSellingFeeCents(params: {
  saleFeeCents: number | null;
  listingFeeCents: number | null;
  saleFeeGrossCents: number | null;
  saleFeeFixedCents: number | null;
}): number {
  if (params.saleFeeGrossCents !== null) return Math.max(0, params.saleFeeGrossCents);
  if (params.saleFeeCents !== null && params.saleFeeFixedCents !== null) {
    return Math.max(0, params.saleFeeCents) + Math.max(0, params.saleFeeFixedCents);
  }
  if (params.saleFeeCents !== null) return Math.max(0, params.saleFeeCents);
  if (params.listingFeeCents !== null) return Math.max(0, params.listingFeeCents);
  return 0;
}

function getLinkedSkuBillableWeightGrams(params: {
  accountId: string;
  marketplaceItemId: string;
  variationKey: string;
}): number | undefined {
  const row = db
    .prepare(
      `SELECT s.id AS sku_id,
              q.units_produced AS units_produced,
              COALESCE(SUM(qf.used_weight_grams), 0) AS total_used_weight_grams
       FROM marketplace_catalog_variations v
       LEFT JOIN sales_skus s ON s.id = v.linked_sku_id
       LEFT JOIN print_quotes q ON q.id = s.source_quote_id
       LEFT JOIN print_quote_filaments qf ON qf.quote_id = q.id
       WHERE v.account_id = ?
         AND v.marketplace_item_id = ?
         AND v.variation_key = ?
       GROUP BY s.id, q.units_produced`
    )
    .get(params.accountId, params.marketplaceItemId, params.variationKey) as
    | {
        sku_id?: string | null;
        units_produced?: number | null;
        total_used_weight_grams?: number | null;
      }
    | undefined;

  if (!row?.sku_id) return undefined;

  const unitsProduced = Math.max(1, Math.round(Number(row.units_produced ?? 1)));
  const totalUsedWeightGrams = Math.max(0, Number(row.total_used_weight_grams ?? 0));
  if (!Number.isFinite(totalUsedWeightGrams) || totalUsedWeightGrams <= 0) return undefined;

  const unitWeight = totalUsedWeightGrams / unitsProduced;
  if (!Number.isFinite(unitWeight) || unitWeight <= 0) return undefined;

  return Math.max(1, Math.round(unitWeight));
}

function deriveShippingStage(params: {
  status?: string | null;
  substatus?: string | null;
}): string | null {
  const status = (params.status ?? "").toLowerCase();
  const substatus = (params.substatus ?? "").toLowerCase();

  if (status === "ready_to_ship") {
    if (substatus.includes("printed")) return "label_printed";
    if (substatus.includes("print")) return "label_to_print";
    return "ready_to_ship";
  }
  if (status === "shipped") return "in_transit";
  if (status === "delivered") return "delivered";
  if (status) return status;
  return null;
}

async function recomputeMercadoLivreVariationFeeEstimate(variationId: string): Promise<void> {
  const row = db
    .prepare(
      `SELECT v.id, v.account_id, v.marketplace_item_id, v.variation_key, v.price_cents, v.effective_price_cents,
              COALESCE(v.currency_id, i.currency_id) AS currency_id,
              i.site_id, i.listing_type_id, COALESCE(i.category_id, json_extract(i.raw_json, '$.category_id')) AS category_id,
              i.shipping_mode, i.shipping_logistic_type
       FROM marketplace_catalog_variations v
       LEFT JOIN marketplace_catalog_items i
         ON i.account_id = v.account_id
        AND i.marketplace_item_id = v.marketplace_item_id
       WHERE v.id = ?
         AND v.marketplace = 'mercadolivre'`
    )
    .get(variationId) as
    | {
        id: string;
        account_id: string;
        marketplace_item_id: string;
        variation_key: string;
        price_cents: number | null;
        effective_price_cents: number | null;
        currency_id: string | null;
        site_id: string | null;
        listing_type_id: string | null;
        category_id: string | null;
        shipping_mode: string | null;
        shipping_logistic_type: string | null;
      }
    | undefined;

  if (!row || !row.site_id) return;

  const priceForFeesCents = row.effective_price_cents ?? row.price_cents;
  if (!priceForFeesCents || priceForFeesCents <= 0) return;

  let account = resolveMercadoLivreAccount(row.account_id);
  if (!account) return;
  if (isTokenExpiringSoon(account.token_expires_at, 180)) {
    const refreshed = await refreshMercadoLivreAccountToken(account.id);
    if (refreshed) account = refreshed;
  }
  if (!account.access_token) return;

  const feeEstimate = await fetchMercadoLivreListingFeeEstimate({
    accessToken: account.access_token,
    siteId: row.site_id,
    price: priceForFeesCents / 100,
    listingTypeId: row.listing_type_id ?? undefined,
    categoryId: row.category_id ?? undefined,
    currencyId: row.currency_id ?? undefined,
    shippingMode: row.shipping_mode ?? "me2",
    logisticType: row.shipping_logistic_type ?? "self_service",
    billableWeight: getLinkedSkuBillableWeightGrams({
      accountId: row.account_id,
      marketplaceItemId: row.marketplace_item_id,
      variationKey: row.variation_key,
    }),
  }).catch(() => null);

  if (!feeEstimate) return;

  const estimatedSaleFeeCents = parsePriceToCents(feeEstimate.saleFeeAmount);
  const estimatedListingFeeCents = parsePriceToCents(feeEstimate.listingFeeAmount);
  const estimatedSaleFeeGrossCents = parsePriceToCents(feeEstimate.saleFeeGrossAmount);
  const estimatedSaleFeeFixedCents = parsePriceToCents(feeEstimate.saleFeeFixedAmount);
  const estimatedSellingFeeCents = resolveEstimatedSellingFeeCents({
    saleFeeCents: estimatedSaleFeeCents,
    listingFeeCents: estimatedListingFeeCents,
    saleFeeGrossCents: estimatedSaleFeeGrossCents,
    saleFeeFixedCents: estimatedSaleFeeFixedCents,
  });
  const estimatedNetProceedsCents = Math.max(0, priceForFeesCents - estimatedSellingFeeCents);
  const now = nowIso();

  db.prepare(
    `UPDATE marketplace_catalog_variations
     SET estimated_sale_fee_cents = ?,
         estimated_listing_fee_cents = ?,
         estimated_net_proceeds_cents = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(estimatedSaleFeeCents, estimatedListingFeeCents, estimatedNetProceedsCents, now, variationId);
}

app.get("/health", async () => ({ ok: true }));

app.post("/integrations/mercadolivre/connect", async (request, reply) => {
  if (!getMercadoLivreConfig()) {
    reply.code(503);
    return {
      message: "Mercado Livre OAuth não configurado no backend. Defina ML_APP_ID, ML_CLIENT_SECRET e ML_REDIRECT_URI.",
    };
  }

  const body = mercadoLivreConnectSchema.parse(request.body ?? {});
  const state = uuidv4().replace(/-/g, "");
  const now = nowIso();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO marketplace_oauth_states (
      id, marketplace, state, created_at, expires_at, consumed_at
    ) VALUES (?, 'mercadolivre', ?, ?, ?, NULL)`
  ).run(uuidv4(), state, now, expiresAt);

  if (body.account_label.trim()) {
    appendOperationLog({
      eventType: "marketplace_connect_started",
      entityType: "marketplace_account",
      entityId: null,
      summary: "Conexão Mercado Livre iniciada",
      payload: {
        marketplace: "mercadolivre",
        account_label: body.account_label.trim(),
        state,
      },
    });
  }

  return {
    marketplace: "mercadolivre",
    authorize_url: buildMercadoLivreAuthorizationUrl(state),
    state,
    expires_at: expiresAt,
  };
});

app.get("/integrations/mercadolivre/callback", async (request, reply) => {
  const query = mercadoLivreCallbackQuerySchema.parse(request.query ?? {});
  const now = nowIso();

  const stateRow = db
    .prepare(
      `SELECT id, state, expires_at
       FROM marketplace_oauth_states
       WHERE marketplace = 'mercadolivre'
         AND state = ?
         AND consumed_at IS NULL`
    )
    .get(query.state) as { id: string; state: string; expires_at: string } | undefined;

  if (!stateRow) {
    reply.code(400);
    return { message: "State OAuth inválido ou já utilizado." };
  }

  if (Date.parse(stateRow.expires_at) < Date.now()) {
    reply.code(400);
    return { message: "State OAuth expirado. Gere uma nova conexão." };
  }

  try {
    const token = await exchangeMercadoLivreAuthorizationCode(query.code);
    const user = await fetchMercadoLivreUser(token.access_token);
    const accountId = uuidv4();
    const expiresAt = computeTokenExpiresAtIso(token.expires_in);
    const metadataJson = JSON.stringify({ site_id: user.site_id ?? null });

    const tx = db.transaction(() => {
      db.prepare("UPDATE marketplace_oauth_states SET consumed_at = ? WHERE id = ?").run(now, stateRow.id);

      db.prepare(
        `INSERT INTO marketplace_accounts (
          id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
          access_token, refresh_token, token_expires_at, scope, is_active, metadata_json,
          created_at, updated_at, last_connected_at, last_token_refresh_at
        ) VALUES (?, 'mercadolivre', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
        ON CONFLICT(marketplace, marketplace_user_id) DO UPDATE SET
          seller_nickname = excluded.seller_nickname,
          country_id = excluded.country_id,
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          token_expires_at = excluded.token_expires_at,
          scope = excluded.scope,
          is_active = 1,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at,
          last_connected_at = excluded.last_connected_at,
          last_token_refresh_at = excluded.last_token_refresh_at`
      ).run(
        accountId,
        null,
        String(user.id),
        user.nickname ?? null,
        user.country_id ?? null,
        token.access_token,
        token.refresh_token,
        expiresAt,
        token.scope ?? null,
        metadataJson,
        now,
        now,
        now,
        now
      );
    });

    tx();

    const account = db
      .prepare(
        `SELECT id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
                access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at,
                last_connected_at, last_token_refresh_at
         FROM marketplace_accounts
         WHERE marketplace = 'mercadolivre'
           AND marketplace_user_id = ?`
      )
      .get(String(user.id)) as MarketplaceAccountRow | undefined;

    appendOperationLog({
      eventType: "marketplace_connected",
      entityType: "marketplace_account",
      entityId: account?.id,
      summary: "Conta Mercado Livre conectada",
      payload: {
        marketplace: "mercadolivre",
        marketplace_user_id: String(user.id),
        seller_nickname: user.nickname ?? null,
        country_id: user.country_id ?? null,
      },
    });

    return {
      ok: true,
      marketplace: "mercadolivre",
      account: account ? toMarketplaceAccountResponse(account) : null,
    };
  } catch (error: unknown) {
    if (error instanceof MercadoLivreApiError) {
      reply.code(502);
      return {
        message: "Falha ao concluir OAuth com Mercado Livre.",
        marketplace_error_status: error.statusCode,
        marketplace_error: error.details,
      };
    }
    throw error;
  }
});

app.get("/integrations/mercadolivre/status", async (_request, reply) => {
  const config = getMercadoLivreConfig();
  const rows = db
    .prepare(
      `SELECT id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
              access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at,
              last_connected_at, last_token_refresh_at
       FROM marketplace_accounts
       WHERE marketplace = 'mercadolivre'
         AND is_active = 1
       ORDER BY updated_at DESC`
    )
    .all() as MarketplaceAccountRow[];

  const accounts = [] as Array<ReturnType<typeof toMarketplaceAccountResponse> & {
    scheduled_order_syncs: ReturnType<typeof getMercadoLivreOrderSchedulerStateForAccount>;
  }>;
  const refreshErrors = [] as Array<{ account_id: string; message: string; status?: number; details?: unknown }>;

  for (const row of rows) {
    let account = row;
    const shouldRefresh = !!config && isTokenExpiringSoon(account.token_expires_at, 180);

    if (shouldRefresh) {
      try {
        const refreshed = await refreshMercadoLivreAccountToken(account.id);
        if (refreshed) {
          account = refreshed;
        }
      } catch (error: unknown) {
        if (error instanceof MercadoLivreApiError) {
          refreshErrors.push({
            account_id: account.id,
            message: "Falha ao atualizar token com Mercado Livre.",
            status: error.statusCode,
            details: error.details,
          });
        } else {
          refreshErrors.push({
            account_id: account.id,
            message: "Falha inesperada ao atualizar token.",
          });
        }
      }
    }

    accounts.push({
      ...toMarketplaceAccountResponse(account),
      scheduled_order_syncs: getMercadoLivreOrderSchedulerStateForAccount(account.id),
    });
  }

  if (refreshErrors.length > 0) {
    reply.code(207);
  }

  return {
    marketplace: "mercadolivre",
    configured: Boolean(config),
    connected: accounts.length > 0,
    accounts,
    refresh_errors: refreshErrors,
  };
});

app.post("/integrations/mercadolivre/disconnect", async (request, reply) => {
  const body = mercadoLivreDisconnectSchema.parse(request.body ?? {});
  const now = nowIso();

  const result = body.account_id && body.account_id.trim()
    ? db
        .prepare(
          `UPDATE marketplace_accounts
           SET is_active = 0,
               access_token = NULL,
               refresh_token = NULL,
               token_expires_at = NULL,
               updated_at = ?
           WHERE id = ?
             AND marketplace = 'mercadolivre'
             AND is_active = 1`
        )
        .run(now, body.account_id.trim())
    : db
        .prepare(
          `UPDATE marketplace_accounts
           SET is_active = 0,
               access_token = NULL,
               refresh_token = NULL,
               token_expires_at = NULL,
               updated_at = ?
           WHERE marketplace = 'mercadolivre'
             AND is_active = 1`
        )
        .run(now);

  if (result.changes === 0) {
    reply.code(404);
    return { message: "Nenhuma conta Mercado Livre ativa encontrada para desconectar." };
  }

  appendOperationLog({
    eventType: "marketplace_disconnected",
    entityType: "marketplace_account",
    entityId: body.account_id?.trim() || null,
    summary: "Conta Mercado Livre desconectada",
    payload: {
      marketplace: "mercadolivre",
      account_id: body.account_id?.trim() || null,
      deactivated_accounts: result.changes,
    },
  });

  return {
    ok: true,
    marketplace: "mercadolivre",
    deactivated_accounts: result.changes,
  };
});

app.post("/integrations/mercadolivre/custom-request", async (request, reply) => {
  const body = mercadoLivreCustomRequestSchema.parse(request.body ?? {});
  const requestedAccountId = body.account_id?.trim() || undefined;
  const account = resolveMercadoLivreAccount(requestedAccountId);

  if (!account) {
    reply.code(404);
    return { message: "Conta Mercado Livre ativa não encontrada." };
  }

  let activeAccount = account;
  if (isTokenExpiringSoon(activeAccount.token_expires_at, 180)) {
    const refreshed = await refreshMercadoLivreAccountToken(activeAccount.id);
    if (refreshed) {
      activeAccount = refreshed;
    }
  }

  if (!activeAccount.access_token) {
    reply.code(409);
    return { message: "Conta Mercado Livre sem access_token ativo." };
  }

  const rawPath = body.path.trim();
  const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  if (normalizedPath.includes("://")) {
    reply.code(400);
    return { message: "Informe apenas path relativo da API (ex.: /orders/123)." };
  }

  const url = new URL(`https://api.mercadolibre.com${normalizedPath}`);
  for (const [key, value] of Object.entries(body.query ?? {})) {
    const k = key.trim();
    if (!k) continue;
    url.searchParams.set(k, value);
  }

  const method = body.method;
  const headers: Record<string, string> = {
    authorization: `Bearer ${activeAccount.access_token}`,
    accept: "application/json",
  };

  for (const [key, value] of Object.entries(body.headers ?? {})) {
    const headerName = key.trim().toLowerCase();
    if (!headerName) continue;
    if (headerName === "authorization" || headerName === "host" || headerName === "content-length") continue;
    headers[headerName] = value;
  }

  let payload: string | undefined;
  if (method !== "GET" && method !== "DELETE" && body.body.trim()) {
    payload = body.body;
    headers["content-type"] = "application/json";
  }

  const mlResponse = await fetch(url.toString(), {
    method,
    headers,
    body: payload,
  });

  const responseHeaders = Object.fromEntries(
    Array.from(mlResponse.headers.entries()).filter(([key]) => {
      const k = key.toLowerCase();
      return (
        k === "content-type" ||
        k === "x-request-id" ||
        k === "x-correlation-id" ||
        k.startsWith("x-ratelimit")
      );
    })
  );

  const contentType = mlResponse.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await mlResponse.json().catch(() => null)
    : await mlResponse.text().catch(() => "");

  return {
    marketplace: "mercadolivre",
    account_id: activeAccount.id,
    method,
    url: url.toString(),
    status: mlResponse.status,
    ok: mlResponse.ok,
    headers: responseHeaders,
    data,
  };
});

app.post("/integrations/mercadolivre/sync/catalog", async (request, reply) => {
  const body = mercadoLivreCatalogSyncSchema.parse(request.body ?? {});
  const requestedAccountId = body.account_id?.trim() || undefined;
  const account = resolveMercadoLivreAccount(requestedAccountId);

  if (!account) {
    reply.code(404);
    return { message: "Conta Mercado Livre ativa não encontrada." };
  }

  if (marketplaceOrdersSyncRunningAccounts.has(account.id)) {
    reply.code(409);
    return { message: "Já existe uma sincronização de vendas em andamento para esta conta." };
  }
  marketplaceOrdersSyncRunningAccounts.add(account.id);

  const runId = uuidv4();
  const startedAt = nowIso();
  db.prepare(
    `INSERT INTO marketplace_sync_runs (
      id, marketplace, account_id, sync_type, status, started_at, finished_at,
      records_read, records_upserted, records_failed, error_message, created_at, updated_at
    ) VALUES (?, 'mercadolivre', ?, 'catalog_read', 'running', ?, NULL, 0, 0, 0, NULL, ?, ?)`
  ).run(runId, account.id, startedAt, startedAt, startedAt);
  return runWithSpan(
    "mercadolivre.sync.catalog",
    {
      "marketplace.name": "mercadolivre",
      "marketplace.account_id": account.id,
      "marketplace.sync.run_id": runId,
      "marketplace.sync.type": "catalog_read",
      "marketplace.sync.limit": body.limit,
    },
    async (span) => {
      appendMarketplaceSyncLog({
        phase: "started",
        syncType: "catalog_read",
        accountId: account.id,
        runId,
      });

      let recordsRead = 0;
      let recordsUpserted = 0;
      let recordsFailed = 0;

      try {
    let activeAccount = account;
    if (isTokenExpiringSoon(activeAccount.token_expires_at, 180)) {
      const refreshed = await refreshMercadoLivreAccountToken(activeAccount.id);
      if (refreshed) {
        activeAccount = refreshed;
      }
    }

    if (!activeAccount.access_token) {
      throw new Error("Conta Mercado Livre sem access_token ativo.");
    }
    const accessToken = activeAccount.access_token;

    let offset = 0;
    let remaining = Math.max(1, body.limit);
    let totalKnown = Number.MAX_SAFE_INTEGER;

    const upsertItemStmt = db.prepare(
      `INSERT INTO marketplace_catalog_items (
        id, marketplace, account_id, marketplace_item_id, seller_id, title, status, condition, permalink,
        thumbnail, currency_id, listing_type_id, category_id, price_cents, base_price_cents, promotion_price_cents,
        effective_price_cents, effective_currency_id, estimated_sale_fee_cents, estimated_listing_fee_cents,
        estimated_net_proceeds_cents, estimated_fee_currency_id, promotion_id, promotion_type,
        available_quantity, sold_quantity, site_id, shipping_mode, shipping_logistic_type, shipping_free,
        shipping_tags_json, raw_json, last_seen_at, created_at, updated_at
      ) VALUES (?, 'mercadolivre', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, marketplace_item_id) DO UPDATE SET
        seller_id = excluded.seller_id,
        title = excluded.title,
        status = excluded.status,
        condition = excluded.condition,
        permalink = excluded.permalink,
        thumbnail = excluded.thumbnail,
        currency_id = excluded.currency_id,
        listing_type_id = excluded.listing_type_id,
        category_id = excluded.category_id,
        price_cents = excluded.price_cents,
        base_price_cents = excluded.base_price_cents,
        promotion_price_cents = excluded.promotion_price_cents,
        effective_price_cents = excluded.effective_price_cents,
        effective_currency_id = excluded.effective_currency_id,
        estimated_sale_fee_cents = excluded.estimated_sale_fee_cents,
        estimated_listing_fee_cents = excluded.estimated_listing_fee_cents,
        estimated_net_proceeds_cents = excluded.estimated_net_proceeds_cents,
        estimated_fee_currency_id = excluded.estimated_fee_currency_id,
        promotion_id = excluded.promotion_id,
        promotion_type = excluded.promotion_type,
        available_quantity = excluded.available_quantity,
        sold_quantity = excluded.sold_quantity,
        site_id = excluded.site_id,
        shipping_mode = excluded.shipping_mode,
        shipping_logistic_type = excluded.shipping_logistic_type,
        shipping_free = excluded.shipping_free,
        shipping_tags_json = excluded.shipping_tags_json,
        raw_json = excluded.raw_json,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at`
    );

    const upsertVariationStmt = db.prepare(
      `INSERT INTO marketplace_catalog_variations (
        id, marketplace, account_id, marketplace_item_id, marketplace_variation_id, variation_key,
        title, variation_label, attribute_combinations_json, status, currency_id, price_cents,
        effective_price_cents, estimated_sale_fee_cents, estimated_listing_fee_cents,
        estimated_net_proceeds_cents, available_quantity, sold_quantity, raw_json,
        last_seen_at, created_at, updated_at
      ) VALUES (?, 'mercadolivre', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, marketplace_item_id, variation_key) DO UPDATE SET
        marketplace_variation_id = excluded.marketplace_variation_id,
        title = excluded.title,
        variation_label = excluded.variation_label,
        attribute_combinations_json = excluded.attribute_combinations_json,
        status = excluded.status,
        currency_id = excluded.currency_id,
        price_cents = excluded.price_cents,
        effective_price_cents = excluded.effective_price_cents,
        estimated_sale_fee_cents = excluded.estimated_sale_fee_cents,
        estimated_listing_fee_cents = excluded.estimated_listing_fee_cents,
        estimated_net_proceeds_cents = excluded.estimated_net_proceeds_cents,
        available_quantity = excluded.available_quantity,
        sold_quantity = excluded.sold_quantity,
        raw_json = excluded.raw_json,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at`
    );

    beginSqlTransaction();

    while (remaining > 0 && offset < totalKnown) {
      assertMarketplaceSyncNotCancelled(runId);
      const pageSize = Math.min(50, remaining);
      const page = await fetchMercadoLivreSellerItemIds({
        accessToken,
        sellerId: activeAccount.marketplace_user_id,
        offset,
        limit: pageSize,
      });

      totalKnown = Math.min(totalKnown, Math.max(0, page.total));
      if (!page.itemIds.length) break;

      recordsRead += page.itemIds.length;
      const snapshots = await fetchMercadoLivreItems({
        accessToken,
        itemIds: page.itemIds,
      });
      assertMarketplaceSyncNotCancelled(runId);

      const now = nowIso();
      for (const item of snapshots) {
        assertMarketplaceSyncNotCancelled(runId);
        try {
          const pricing = await fetchMercadoLivreItemPricing({
            accessToken,
            itemId: item.id,
          }).catch(() => null);
          assertMarketplaceSyncNotCancelled(runId);

          const basePriceCents = parsePriceToCents(pricing?.baseAmount);
          const promotionPriceCents = parsePriceToCents(pricing?.promotionAmount);
          const effectivePriceCents = parsePriceToCents(pricing?.effectiveAmount);
          const itemPriceCents = parsePriceToCents(item.price);
          const effectiveItemPriceForFeesCents = effectivePriceCents ?? promotionPriceCents ?? itemPriceCents;
          const itemBillableWeightGrams = getLinkedSkuBillableWeightGrams({
            accountId: activeAccount.id,
            marketplaceItemId: item.id,
            variationKey: "__item__",
          });

          const feeEstimate =
            item.siteId && effectiveItemPriceForFeesCents !== null && effectiveItemPriceForFeesCents > 0
              ? await fetchMercadoLivreListingFeeEstimate({
                  accessToken,
                  siteId: item.siteId,
                  price: effectiveItemPriceForFeesCents / 100,
                  listingTypeId: item.listingTypeId,
                  categoryId: item.categoryId,
                  currencyId: pricing?.currencyId ?? item.currencyId,
                  shippingMode: item.shippingMode ?? "me2",
                  logisticType: item.shippingLogisticType ?? "self_service",
                  billableWeight: itemBillableWeightGrams,
                }).catch(() => null)
              : null;
          assertMarketplaceSyncNotCancelled(runId);

          const estimatedSaleFeeCents = parsePriceToCents(feeEstimate?.saleFeeAmount);
          const estimatedListingFeeCents = parsePriceToCents(feeEstimate?.listingFeeAmount);
          const estimatedSaleFeeGrossCents = parsePriceToCents(feeEstimate?.saleFeeGrossAmount);
          const estimatedSaleFeeFixedCents = parsePriceToCents(feeEstimate?.saleFeeFixedAmount);
          const estimatedSellingFeeCents = resolveEstimatedSellingFeeCents({
            saleFeeCents: estimatedSaleFeeCents,
            listingFeeCents: estimatedListingFeeCents,
            saleFeeGrossCents: estimatedSaleFeeGrossCents,
            saleFeeFixedCents: estimatedSaleFeeFixedCents,
          });
          const estimatedNetProceedsCents =
            effectiveItemPriceForFeesCents !== null
              ? Math.max(
                  0,
                  effectiveItemPriceForFeesCents -
                    estimatedSellingFeeCents
                )
              : null;

          upsertItemStmt.run(
            `${activeAccount.id}:${item.id}`,
            activeAccount.id,
            item.id,
            item.sellerId ?? activeAccount.marketplace_user_id,
            item.title,
            item.status ?? null,
            item.condition ?? null,
            item.permalink ?? null,
            item.thumbnail ?? null,
            item.currencyId ?? null,
            item.listingTypeId ?? null,
            item.categoryId ?? null,
            itemPriceCents,
            basePriceCents,
            promotionPriceCents,
            effectiveItemPriceForFeesCents,
            pricing?.currencyId ?? null,
            estimatedSaleFeeCents,
            estimatedListingFeeCents,
            estimatedNetProceedsCents,
            feeEstimate?.currencyId ?? null,
            pricing?.promotionId ?? null,
            pricing?.promotionType ?? null,
            item.availableQuantity ?? null,
            item.soldQuantity ?? null,
            item.siteId ?? null,
            item.shippingMode ?? null,
            item.shippingLogisticType ?? null,
            typeof item.shippingFree === "boolean" ? (item.shippingFree ? 1 : 0) : null,
            item.shippingTags ? JSON.stringify(item.shippingTags) : null,
            JSON.stringify(item.raw),
            now,
            now,
            now
          );

          const variations = await fetchMercadoLivreItemVariations({
            accessToken,
            itemId: item.id,
          }).catch(() => []);
          assertMarketplaceSyncNotCancelled(runId);

          const upsertVariation = async (params: {
            variationId?: string;
            variationKey: string;
            variationLabel?: string;
            attributesJson?: string | null;
            priceCents: number | null;
            effectivePriceCents: number | null;
            availableQuantity: number | null;
            soldQuantity: number | null;
            rawJson: string;
          }) => {
            const priceForFeesCents = params.effectivePriceCents ?? params.priceCents;
            const feeEstimate =
              item.siteId && priceForFeesCents !== null && priceForFeesCents > 0
                ? await fetchMercadoLivreListingFeeEstimate({
                    accessToken,
                    siteId: item.siteId,
                    price: priceForFeesCents / 100,
                    listingTypeId: item.listingTypeId,
                    categoryId: item.categoryId,
                    currencyId: pricing?.currencyId ?? item.currencyId,
                    shippingMode: item.shippingMode ?? "me2",
                    logisticType: item.shippingLogisticType ?? "self_service",
                    billableWeight: getLinkedSkuBillableWeightGrams({
                      accountId: activeAccount.id,
                      marketplaceItemId: item.id,
                      variationKey: params.variationKey,
                      }),
                    }).catch(() => null)
                  : null;
            assertMarketplaceSyncNotCancelled(runId);

            const estimatedSaleFeeCents = parsePriceToCents(feeEstimate?.saleFeeAmount);
            const estimatedListingFeeCents = parsePriceToCents(feeEstimate?.listingFeeAmount);
            const estimatedSaleFeeGrossCents = parsePriceToCents(feeEstimate?.saleFeeGrossAmount);
            const estimatedSaleFeeFixedCents = parsePriceToCents(feeEstimate?.saleFeeFixedAmount);
            const estimatedSellingFeeCents = resolveEstimatedSellingFeeCents({
              saleFeeCents: estimatedSaleFeeCents,
              listingFeeCents: estimatedListingFeeCents,
              saleFeeGrossCents: estimatedSaleFeeGrossCents,
              saleFeeFixedCents: estimatedSaleFeeFixedCents,
            });
            const estimatedNetProceedsCents =
              priceForFeesCents !== null
                ? Math.max(
                    0,
                    priceForFeesCents -
                      estimatedSellingFeeCents
                  )
                : null;

            upsertVariationStmt.run(
              `${activeAccount.id}:${item.id}:${params.variationKey}`,
              activeAccount.id,
              item.id,
              params.variationId ?? null,
              params.variationKey,
              item.title,
              params.variationLabel ?? null,
              params.attributesJson ?? null,
              item.status ?? null,
              pricing?.currencyId ?? item.currencyId ?? null,
              params.priceCents,
              params.effectivePriceCents,
              estimatedSaleFeeCents,
              estimatedListingFeeCents,
              estimatedNetProceedsCents,
              params.availableQuantity,
              params.soldQuantity,
              params.rawJson,
              now,
              now,
              now
            );
          };

          if (variations.length > 0) {
            for (const variation of variations) {
              const priceCents = parsePriceToCents(variation.price);
              const effectiveVariationCents = deriveEffectiveVariationPriceCents({
                variationPriceCents: priceCents,
                itemPriceCents,
                itemBasePriceCents: basePriceCents,
                itemPromotionPriceCents: promotionPriceCents,
                itemEffectivePriceCents: effectiveItemPriceForFeesCents,
              });
              await upsertVariation({
                variationId: variation.id,
                variationKey: variation.key,
                variationLabel: variation.label,
                attributesJson: JSON.stringify(variation.attributes),
                priceCents,
                effectivePriceCents: effectiveVariationCents,
                availableQuantity: variation.availableQuantity ?? null,
                soldQuantity: variation.soldQuantity ?? null,
                rawJson: JSON.stringify(variation.raw),
              });
            }
          } else {
            await upsertVariation({
              variationId: undefined,
              variationKey: "__item__",
              variationLabel: "Anúncio principal",
              attributesJson: JSON.stringify([]),
              priceCents: itemPriceCents,
              effectivePriceCents: effectiveItemPriceForFeesCents,
              availableQuantity: item.availableQuantity ?? null,
              soldQuantity: item.soldQuantity ?? null,
              rawJson: JSON.stringify(item.raw),
            });
          }

          recordsUpserted += 1;
        } catch (error: any) {
          if (error instanceof MarketplaceSyncCancelledError) {
            throw error;
          }
          recordsFailed += 1;
          db.prepare(
            `INSERT INTO marketplace_sync_errors (
              id, run_id, account_id, marketplace, error_code, error_message, payload_json, created_at
            ) VALUES (?, ?, ?, 'mercadolivre', ?, ?, ?, ?)`
          ).run(
            uuidv4(),
            runId,
            activeAccount.id,
            "item_upsert_failed",
            String(error?.message ?? "Failed to upsert marketplace item"),
            JSON.stringify({ marketplace_item_id: item.id }),
            nowIso()
          );
        }
      }

      const missingCount = Math.max(0, page.itemIds.length - snapshots.length);
      if (missingCount > 0) {
        recordsFailed += missingCount;
      }

      offset += page.itemIds.length;
      remaining -= page.itemIds.length;
    }

    commitSqlTransaction();
    marketplaceSyncCancelRequests.delete(runId);

    const finishedAt = nowIso();
    db.prepare(
      `UPDATE marketplace_sync_runs
       SET status = 'success',
           finished_at = ?,
           records_read = ?,
           records_upserted = ?,
           records_failed = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(finishedAt, recordsRead, recordsUpserted, recordsFailed, finishedAt, runId);
    span.setAttributes({
      "marketplace.sync.records_read": recordsRead,
      "marketplace.sync.records_upserted": recordsUpserted,
      "marketplace.sync.records_failed": recordsFailed,
      "marketplace.sync.cancelled": false,
    });

    appendMarketplaceSyncLog({
      phase: "finished",
      syncType: "catalog_read",
      accountId: activeAccount.id,
      runId,
      recordsRead,
      recordsUpserted,
      recordsFailed,
    });

    return {
      ok: true,
      run_id: runId,
      account_id: activeAccount.id,
      marketplace: "mercadolivre",
      records_read: recordsRead,
      records_upserted: recordsUpserted,
      records_failed: recordsFailed,
    };
  } catch (error: unknown) {
    rollbackSqlTransactionIfOpen();
    marketplaceSyncCancelRequests.delete(runId);
    const finishedAt = nowIso();
    const message =
      error instanceof MercadoLivreApiError
        ? `Mercado Livre API error (${error.statusCode})`
        : (error as any)?.message ?? "Falha ao sincronizar catálogo";
    span.setAttributes({
      "marketplace.sync.records_read": recordsRead,
      "marketplace.sync.records_upserted": recordsUpserted,
      "marketplace.sync.records_failed": recordsFailed,
      "marketplace.sync.cancelled": error instanceof MarketplaceSyncCancelledError,
    });

    db.prepare(
      `UPDATE marketplace_sync_runs
       SET status = 'error',
           finished_at = ?,
           records_read = ?,
           records_upserted = ?,
           records_failed = ?,
           error_message = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(finishedAt, recordsRead, recordsUpserted, recordsFailed, message, finishedAt, runId);

    appendMarketplaceSyncLog({
      phase: error instanceof MarketplaceSyncCancelledError ? "cancelled" : "error",
      syncType: "catalog_read",
      accountId: account.id,
      runId,
      recordsRead,
      recordsUpserted,
      recordsFailed,
      message,
    });

    if (error instanceof MarketplaceSyncCancelledError) {
      return {
        ok: false,
        cancelled: true,
        message,
        run_id: runId,
        records_read: recordsRead,
        records_upserted: recordsUpserted,
        records_failed: recordsFailed,
      };
    }

    db.prepare(
      `INSERT INTO marketplace_sync_errors (
        id, run_id, account_id, marketplace, error_code, error_message, payload_json, created_at
      ) VALUES (?, ?, ?, 'mercadolivre', ?, ?, ?, ?)`
    ).run(
      uuidv4(),
      runId,
      account.id,
      error instanceof MercadoLivreApiError ? `ml_api_${error.statusCode}` : "sync_failed",
      message,
      JSON.stringify(
        error instanceof MercadoLivreApiError
          ? { details: error.details }
          : { error: String((error as any)?.message ?? error) }
      ),
      finishedAt
    );

    reply.code(error instanceof MercadoLivreApiError ? 502 : 500);
    return {
      message,
      run_id: runId,
      marketplace_error:
        error instanceof MercadoLivreApiError
          ? {
              status: error.statusCode,
              details: error.details,
            }
          : undefined,
    };
      }
    }
  );
});

app.get("/integrations/mercadolivre/catalog", async (request) => {
  const query = mercadoLivreCatalogListQuerySchema.parse(request.query ?? {});
  const accountId = query.account_id?.trim() || null;
  const likeValue = `%${(query.q ?? "").trim()}%`;

  const rows = accountId
    ? db
        .prepare(
          `SELECT i.id, i.account_id, i.marketplace_item_id, i.seller_id, i.title, i.status, i.condition,
                  i.permalink, i.thumbnail, i.currency_id, i.listing_type_id, i.price_cents,
                  i.base_price_cents, i.promotion_price_cents, i.effective_price_cents, i.effective_currency_id,
                  i.estimated_sale_fee_cents, i.estimated_listing_fee_cents, i.estimated_net_proceeds_cents,
                  i.estimated_fee_currency_id, i.promotion_id, i.promotion_type,
                  i.available_quantity, i.sold_quantity, i.site_id,
                  i.shipping_mode, i.shipping_logistic_type, i.shipping_free, i.shipping_tags_json,
                  i.last_seen_at, i.updated_at
           FROM marketplace_catalog_items i
           WHERE i.marketplace = 'mercadolivre'
             AND i.account_id = ?
             AND (? = '%%' OR i.title LIKE ? OR i.marketplace_item_id LIKE ?)
           ORDER BY i.updated_at DESC
           LIMIT ?`
        )
        .all(accountId, likeValue, likeValue, likeValue, query.limit)
    : db
        .prepare(
          `SELECT i.id, i.account_id, i.marketplace_item_id, i.seller_id, i.title, i.status, i.condition,
                  i.permalink, i.thumbnail, i.currency_id, i.listing_type_id, i.price_cents,
                  i.base_price_cents, i.promotion_price_cents, i.effective_price_cents, i.effective_currency_id,
                  i.estimated_sale_fee_cents, i.estimated_listing_fee_cents, i.estimated_net_proceeds_cents,
                  i.estimated_fee_currency_id, i.promotion_id, i.promotion_type,
                  i.available_quantity, i.sold_quantity, i.site_id,
                  i.shipping_mode, i.shipping_logistic_type, i.shipping_free, i.shipping_tags_json,
                  i.last_seen_at, i.updated_at
           FROM marketplace_catalog_items i
           WHERE i.marketplace = 'mercadolivre'
             AND (? = '%%' OR i.title LIKE ? OR i.marketplace_item_id LIKE ?)
           ORDER BY i.updated_at DESC
           LIMIT ?`
        )
        .all(likeValue, likeValue, likeValue, query.limit);

  return rows;
});

app.get("/integrations/mercadolivre/catalog/variations", async (request) => {
  const query = mercadoLivreCatalogVariationsListQuerySchema.parse(request.query ?? {});
  const accountId = query.account_id?.trim() || null;
  const itemId = query.item_id?.trim() || null;
  const likeValue = `%${(query.q ?? "").trim()}%`;

  const rows = accountId
    ? db
        .prepare(
          `SELECT v.id, v.account_id, v.marketplace_item_id, v.marketplace_variation_id, v.variation_key,
                  v.title, v.variation_label, v.status, v.currency_id, v.price_cents, v.effective_price_cents,
                  v.estimated_sale_fee_cents, v.estimated_listing_fee_cents, v.estimated_net_proceeds_cents,
                  v.available_quantity, v.sold_quantity, v.last_seen_at, v.updated_at, v.is_ignored,
                  i.listing_type_id, COALESCE(i.category_id, json_extract(i.raw_json, '$.category_id')) AS category_id,
                  i.shipping_mode, i.shipping_logistic_type, i.shipping_free, i.shipping_tags_json,
                  v.linked_sku_id, s.sku_code AS linked_sku_code, s.name AS linked_sku_name, s.is_active AS linked_sku_is_active
           FROM marketplace_catalog_variations v
           LEFT JOIN marketplace_catalog_items i
             ON i.account_id = v.account_id
            AND i.marketplace_item_id = v.marketplace_item_id
           LEFT JOIN sales_skus s ON s.id = v.linked_sku_id
           WHERE v.marketplace = 'mercadolivre'
             AND v.account_id = ?
             AND (? IS NULL OR v.marketplace_item_id = ?)
             AND (? = '%%' OR v.title LIKE ? OR COALESCE(v.variation_label, '') LIKE ? OR v.marketplace_item_id LIKE ?)
           ORDER BY v.updated_at DESC
           LIMIT ?`
        )
        .all(accountId, itemId, itemId, likeValue, likeValue, likeValue, likeValue, query.limit)
    : db
        .prepare(
          `SELECT v.id, v.account_id, v.marketplace_item_id, v.marketplace_variation_id, v.variation_key,
                  v.title, v.variation_label, v.status, v.currency_id, v.price_cents, v.effective_price_cents,
                  v.estimated_sale_fee_cents, v.estimated_listing_fee_cents, v.estimated_net_proceeds_cents,
                  v.available_quantity, v.sold_quantity, v.last_seen_at, v.updated_at, v.is_ignored,
                  i.listing_type_id, COALESCE(i.category_id, json_extract(i.raw_json, '$.category_id')) AS category_id,
                  i.shipping_mode, i.shipping_logistic_type, i.shipping_free, i.shipping_tags_json,
                  v.linked_sku_id, s.sku_code AS linked_sku_code, s.name AS linked_sku_name, s.is_active AS linked_sku_is_active
           FROM marketplace_catalog_variations v
           LEFT JOIN marketplace_catalog_items i
             ON i.account_id = v.account_id
            AND i.marketplace_item_id = v.marketplace_item_id
           LEFT JOIN sales_skus s ON s.id = v.linked_sku_id
           WHERE v.marketplace = 'mercadolivre'
             AND (? IS NULL OR v.marketplace_item_id = ?)
             AND (? = '%%' OR v.title LIKE ? OR COALESCE(v.variation_label, '') LIKE ? OR v.marketplace_item_id LIKE ?)
           ORDER BY v.updated_at DESC
           LIMIT ?`
        )
        .all(itemId, itemId, likeValue, likeValue, likeValue, likeValue, query.limit);

  return rows;
});

app.post("/integrations/mercadolivre/catalog/variations/link-sku", async (request, reply) => {
  const body = mercadoLivreCatalogVariationLinkSkuSchema.parse(request.body ?? {});
  const variationId = body.variation_id.trim();
  const requestedSkuId = body.sku_id?.trim() || null;

  const variation = db
    .prepare(
      `SELECT id, account_id, marketplace_item_id, marketplace_variation_id, variation_key
       FROM marketplace_catalog_variations
       WHERE marketplace = 'mercadolivre'
         AND id = ?`
    )
    .get(variationId) as
    | {
        id: string;
        account_id: string;
        marketplace_item_id: string;
        marketplace_variation_id: string | null;
        variation_key: string;
      }
    | undefined;

  if (!variation) {
    reply.code(404);
    return { message: "Anúncio/variação local não encontrado." };
  }

  if (requestedSkuId) {
    const sku = db
      .prepare("SELECT id FROM sales_skus WHERE id = ?")
      .get(requestedSkuId) as { id: string } | undefined;
    if (!sku) {
      reply.code(404);
      return { message: "SKU informado não encontrado." };
    }
  }

  const now = nowIso();
  db.prepare(
    `UPDATE marketplace_catalog_variations
     SET linked_sku_id = ?, updated_at = ?
     WHERE id = ?`
  ).run(requestedSkuId, now, variationId);

  const affectedOrderItems = db
    .prepare(
      `SELECT id
       FROM marketplace_order_items
       WHERE account_id = ?
         AND marketplace_item_id = ?
         AND (
           (? IS NOT NULL AND marketplace_variation_id = ?)
           OR variation_key = ?
           OR linked_catalog_variation_id = ?
         )`
    )
    .all(
      variation.account_id,
      variation.marketplace_item_id,
      variation.marketplace_variation_id,
      variation.marketplace_variation_id,
      variation.variation_key,
      variation.id
    ) as Array<{ id: string }>;

  for (const item of affectedOrderItems) {
    reconcileMarketplaceOrderItemLocalStockMovement(item.id);
  }

  await recomputeMercadoLivreVariationFeeEstimate(variationId);

  const row = db
    .prepare(
      `SELECT v.id, v.account_id, v.marketplace_item_id, v.marketplace_variation_id, v.variation_key,
              v.title, v.variation_label, v.status, v.currency_id, v.price_cents, v.effective_price_cents,
              v.estimated_sale_fee_cents, v.estimated_listing_fee_cents, v.estimated_net_proceeds_cents,
              v.available_quantity, v.sold_quantity, v.last_seen_at, v.updated_at, v.is_ignored,
              i.listing_type_id, COALESCE(i.category_id, json_extract(i.raw_json, '$.category_id')) AS category_id,
              i.shipping_mode, i.shipping_logistic_type, i.shipping_free, i.shipping_tags_json,
              v.linked_sku_id, s.sku_code AS linked_sku_code, s.name AS linked_sku_name, s.is_active AS linked_sku_is_active
       FROM marketplace_catalog_variations v
       LEFT JOIN marketplace_catalog_items i
         ON i.account_id = v.account_id
        AND i.marketplace_item_id = v.marketplace_item_id
       LEFT JOIN sales_skus s ON s.id = v.linked_sku_id
       WHERE v.id = ?`
    )
    .get(variationId);

  appendOperationLog({
    eventType: "marketplace_listing_sku_link_updated",
    entityType: "marketplace_listing",
    entityId: variationId,
    summary: requestedSkuId
      ? "Vínculo de anúncio com SKU local atualizado"
      : "Vínculo de anúncio com SKU local removido",
    payload: {
      marketplace: "mercadolivre",
      variation_id: variationId,
      linked_sku_id: requestedSkuId,
    },
  });

  return {
    ok: true,
    variation: row,
  };
});

app.post("/integrations/mercadolivre/catalog/variations/ignore", async (request, reply) => {
  const body = mercadoLivreCatalogVariationIgnoreSchema.parse(request.body ?? {});
  const variationId = body.variation_id.trim();
  const isIgnored = body.is_ignored ? 1 : 0;

  const variation = db
    .prepare(
      `SELECT id
       FROM marketplace_catalog_variations
       WHERE marketplace = 'mercadolivre'
         AND id = ?`
    )
    .get(variationId) as { id: string } | undefined;

  if (!variation) {
    reply.code(404);
    return { message: "Anúncio/variação local não encontrado." };
  }

  const now = nowIso();
  db.prepare(
    `UPDATE marketplace_catalog_variations
     SET is_ignored = ?, updated_at = ?
     WHERE id = ?`
  ).run(isIgnored, now, variationId);

  const row = db
    .prepare(
      `SELECT v.id, v.account_id, v.marketplace_item_id, v.marketplace_variation_id, v.variation_key,
              v.title, v.variation_label, v.status, v.currency_id, v.price_cents, v.effective_price_cents,
              v.estimated_sale_fee_cents, v.estimated_listing_fee_cents, v.estimated_net_proceeds_cents,
              v.available_quantity, v.sold_quantity, v.last_seen_at, v.updated_at, v.is_ignored,
              i.listing_type_id, COALESCE(i.category_id, json_extract(i.raw_json, '$.category_id')) AS category_id,
              i.shipping_mode, i.shipping_logistic_type, i.shipping_free, i.shipping_tags_json,
              v.linked_sku_id, s.sku_code AS linked_sku_code, s.name AS linked_sku_name, s.is_active AS linked_sku_is_active
       FROM marketplace_catalog_variations v
       LEFT JOIN marketplace_catalog_items i
         ON i.account_id = v.account_id
        AND i.marketplace_item_id = v.marketplace_item_id
       LEFT JOIN sales_skus s ON s.id = v.linked_sku_id
       WHERE v.id = ?`
    )
    .get(variationId);

  appendOperationLog({
    eventType: "marketplace_listing_ignore_updated",
    entityType: "marketplace_listing",
    entityId: variationId,
    summary: isIgnored === 1 ? "Anúncio ignorado" : "Anúncio removido da lista de ignorados",
    payload: {
      marketplace: "mercadolivre",
      variation_id: variationId,
      is_ignored: isIgnored === 1,
    },
  });

  return {
    ok: true,
    variation: row,
  };
});

app.post("/integrations/mercadolivre/sync/:runId/cancel", async (request, reply) => {
  const { runId } = request.params as { runId: string };
  const run = db
    .prepare(
      `SELECT id, account_id, sync_type, status, finished_at
       FROM marketplace_sync_runs
       WHERE id = ?`
    )
    .get(runId) as
    | {
        id: string;
        account_id: string;
        sync_type: "catalog_read" | "orders_read";
        status: string;
        finished_at: string | null;
      }
    | undefined;

  if (!run) {
    reply.code(404);
    return { message: "Sincronização não encontrada." };
  }

  if (run.status !== "running" || run.finished_at) {
    return {
      ok: false,
      run_id: runId,
      message: "Sincronização já finalizada.",
    };
  }

  const now = nowIso();
  marketplaceSyncCancelRequests.add(runId);
  db.prepare(
    `INSERT INTO marketplace_sync_cancel_requests (run_id, requested_at, reason)
     VALUES (?, ?, ?)
     ON CONFLICT(run_id) DO UPDATE SET
       requested_at = excluded.requested_at,
       reason = excluded.reason`
  ).run(runId, now, "user_requested");

  appendOperationLog({
    eventType: "marketplace_sync_cancel_requested",
    entityType: "marketplace_sync_run",
    entityId: runId,
    summary: "Interrupção de sincronização solicitada",
    payload: {
      marketplace: "mercadolivre",
      account_id: run.account_id,
      run_id: runId,
      sync_type: run.sync_type,
      phase: "cancel_requested",
    },
  });

  return {
    ok: true,
    run_id: runId,
  };
});

app.post("/integrations/mercadolivre/sync/orders", async (request, reply) => {
  const body = mercadoLivreOrdersSyncSchema.parse(request.body ?? {});
  const requestedAccountId = body.account_id?.trim() || undefined;
  const requestedOrderId = body.order_id?.trim() || undefined;
  const account = resolveMercadoLivreAccount(requestedAccountId);
  const syncWindow = resolveMercadoLivreOrdersSyncWindow(body.mode, body.limit);

  if (!account) {
    reply.code(404);
    return { message: "Conta Mercado Livre ativa não encontrada." };
  }

  if (marketplaceOrdersSyncRunningAccounts.has(account.id)) {
    reply.code(409);
    return { message: "Já existe uma sincronização de vendas em andamento para esta conta." };
  }
  marketplaceOrdersSyncRunningAccounts.add(account.id);

  const runId = uuidv4();
  const startedAt = nowIso();
  db.prepare(
    `INSERT INTO marketplace_sync_runs (
      id, marketplace, account_id, sync_type, status, started_at, finished_at,
      records_read, records_upserted, records_failed, error_message, created_at, updated_at
    ) VALUES (?, 'mercadolivre', ?, 'orders_read', 'running', ?, NULL, 0, 0, 0, NULL, ?, ?)`
  ).run(runId, account.id, startedAt, startedAt, startedAt);
  return runWithSpan(
    "mercadolivre.sync.orders",
    {
      "marketplace.name": "mercadolivre",
      "marketplace.account_id": account.id,
      "marketplace.sync.run_id": runId,
      "marketplace.sync.type": "orders_read",
      "marketplace.sync.mode": syncWindow.mode,
      "marketplace.sync.window": syncWindow.label,
      "marketplace.sync.source": body.source,
      "marketplace.sync.order_id": requestedOrderId ?? "",
      "marketplace.sync.date_created_from": syncWindow.dateCreatedFrom,
      "marketplace.sync.date_created_to": syncWindow.dateCreatedTo,
      "marketplace.sync.limit": syncWindow.limit,
    },
    async (span) => {
      appendMarketplaceSyncLog({
        phase: "started",
        syncType: "orders_read",
        accountId: account.id,
        runId,
        extraPayload: {
          sync_mode: syncWindow.mode,
          sync_window: syncWindow.label,
          sync_source: body.source,
          order_id: requestedOrderId ?? null,
          date_created_from: syncWindow.dateCreatedFrom,
          date_created_to: syncWindow.dateCreatedTo,
        },
      });

      let recordsRead = 0;
      let recordsUpserted = 0;
      let recordsFailed = 0;

      try {
    let activeAccount = account;
    if (isTokenExpiringSoon(activeAccount.token_expires_at, 180)) {
      const refreshed = await refreshMercadoLivreAccountToken(activeAccount.id);
      if (refreshed) {
        activeAccount = refreshed;
      }
    }

    if (!activeAccount.access_token) {
      throw new Error("Conta Mercado Livre sem access_token ativo.");
    }
    const accessToken = activeAccount.access_token;

    let requestedOrderIds: string[] | null = null;
    let requestedOrderPackId: string | null = null;
    if (requestedOrderId) {
      const initialDetail = await fetchMercadoLivreOrderDetail({
        accessToken,
        orderId: requestedOrderId,
      }).catch(() => null);
      requestedOrderPackId = initialDetail?.order.packId ?? null;
      const packOrderIds =
        requestedOrderPackId
          ? await fetchMercadoLivrePackOrderIds({
              accessToken,
              packId: requestedOrderPackId,
            }).catch(() => [])
          : [];
      requestedOrderIds = Array.from(new Set([requestedOrderId, ...packOrderIds]));
      if (requestedOrderIds.length === 0) {
        requestedOrderIds = [requestedOrderId];
      }
      span.setAttributes({
        "marketplace.sync.requested_pack_id": requestedOrderPackId ?? "",
        "marketplace.sync.requested_order_ids_count": requestedOrderIds.length,
      });
    }

    const upsertOrderStmt = db.prepare(
      `INSERT INTO marketplace_orders (
	        id, marketplace, account_id, marketplace_order_id, pack_id, seller_id, buyer_id, buyer_nickname, status,
        substatus, order_total_cents, paid_amount_cents, currency_id, shipping_id, shipping_status,
        shipping_substatus, shipping_mode, shipping_logistic_type, shipping_type, shipping_tracking_number,
        shipping_stage, billed_total_cents, gross_received_cents, net_received_cents, ml_fee_total_cents,
        refunds_total_cents, shipping_cost_cents, shipping_compensation_cents,
        date_created, date_closed, raw_json, last_seen_at, created_at, updated_at
	      ) VALUES (?, 'mercadolivre', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	      ON CONFLICT(account_id, marketplace_order_id) DO UPDATE SET
	        pack_id = excluded.pack_id,
	        seller_id = excluded.seller_id,
        buyer_id = excluded.buyer_id,
        buyer_nickname = excluded.buyer_nickname,
        status = excluded.status,
        substatus = excluded.substatus,
        order_total_cents = excluded.order_total_cents,
        paid_amount_cents = excluded.paid_amount_cents,
        currency_id = excluded.currency_id,
        shipping_id = excluded.shipping_id,
        shipping_status = excluded.shipping_status,
        shipping_substatus = excluded.shipping_substatus,
        shipping_mode = excluded.shipping_mode,
        shipping_logistic_type = excluded.shipping_logistic_type,
        shipping_type = excluded.shipping_type,
        shipping_tracking_number = excluded.shipping_tracking_number,
        shipping_stage = excluded.shipping_stage,
        billed_total_cents = excluded.billed_total_cents,
        gross_received_cents = excluded.gross_received_cents,
        net_received_cents = excluded.net_received_cents,
        ml_fee_total_cents = excluded.ml_fee_total_cents,
        refunds_total_cents = excluded.refunds_total_cents,
        shipping_cost_cents = excluded.shipping_cost_cents,
        shipping_compensation_cents = excluded.shipping_compensation_cents,
        date_created = excluded.date_created,
        date_closed = excluded.date_closed,
        raw_json = excluded.raw_json,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at`
    );

    const upsertOrderItemStmt = db.prepare(
      `INSERT INTO marketplace_order_items (
        id, marketplace, account_id, order_id, marketplace_order_id, marketplace_item_id,
        marketplace_variation_id, variation_key, title, quantity, unit_price_cents, total_price_cents,
        currency_id, linked_catalog_variation_id, linked_catalog_variation_label, raw_json, created_at, updated_at
      ) VALUES (?, 'mercadolivre', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_id, marketplace_item_id, variation_key) DO UPDATE SET
        marketplace_variation_id = excluded.marketplace_variation_id,
        title = excluded.title,
        quantity = excluded.quantity,
        unit_price_cents = excluded.unit_price_cents,
        total_price_cents = excluded.total_price_cents,
        currency_id = excluded.currency_id,
        linked_catalog_variation_id = excluded.linked_catalog_variation_id,
        linked_catalog_variation_label = excluded.linked_catalog_variation_label,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at`
    );

    let offset = 0;
    let remaining = Math.max(1, syncWindow.limit);
    let totalKnown = Number.MAX_SAFE_INTEGER;
    let stoppedAtExistingOrder = false;

    beginSqlTransaction();

    while (remaining > 0 && offset < totalKnown) {
      assertMarketplaceSyncNotCancelled(runId);
      const pageSize = Math.min(50, remaining);
      const page = requestedOrderIds
        ? {
            orders: requestedOrderIds.map((orderId): MercadoLivreOrderSnapshot => ({
              id: orderId,
              sellerId: activeAccount.marketplace_user_id,
              raw: { id: orderId },
            })),
            total: requestedOrderIds.length,
            offset: 0,
            limit: requestedOrderIds.length,
          }
        : await fetchMercadoLivreSellerOrders({
            accessToken,
            sellerId: activeAccount.marketplace_user_id,
            offset,
            limit: pageSize,
            dateCreatedFrom: syncWindow.dateCreatedFrom,
            dateCreatedTo: syncWindow.dateCreatedTo,
          });

      totalKnown = Math.min(totalKnown, Math.max(0, page.total));
      if (!page.orders.length) break;

      const now = nowIso();
      for (const order of page.orders) {
        assertMarketplaceSyncNotCancelled(runId);
        recordsRead += 1;
        try {
          if (syncWindow.stopAtFirstImported && !requestedOrderId) {
            const existingOrder = db
              .prepare(
                `SELECT id
                 FROM marketplace_orders
                 WHERE account_id = ?
                   AND marketplace_order_id = ?
                 LIMIT 1`
              )
              .get(activeAccount.id, order.id) as { id: string } | undefined;
            if (existingOrder) {
              stoppedAtExistingOrder = true;
              remaining = 0;
              break;
            }
          }

          const detail = await fetchMercadoLivreOrderDetail({
            accessToken,
            orderId: order.id,
          }).catch(() => null);
          assertMarketplaceSyncNotCancelled(runId);

          const effectiveOrder = detail?.order ?? order;
          const orderItems = detail?.items ?? [];
          const paymentIds = detail?.paymentIds ?? [];

          const shipmentDetail =
            effectiveOrder.shippingId
              ? await fetchMercadoLivreShipmentDetail({
                  accessToken,
                  shipmentId: effectiveOrder.shippingId,
                }).catch(() => null)
              : null;

          const shipmentCosts =
            effectiveOrder.shippingId
              ? await fetchMercadoLivreShipmentCosts({
                  accessToken,
                  shipmentId: effectiveOrder.shippingId,
                }).catch(() => null)
              : null;

          const billingDetail = await fetchMercadoLivreOrderBillingDetail({
            accessToken,
            orderId: effectiveOrder.id,
          }).catch(() => null);
          assertMarketplaceSyncNotCancelled(runId);

          const paymentDetails = [] as Array<{
            grossReceivedCents: number | null;
            netReceivedCents: number | null;
            mlFeeTotalCents: number | null;
            refundsTotalCents: number | null;
          }>;

          for (const paymentId of paymentIds) {
            const payment = await fetchMercadoLivrePaymentDetail({
              accessToken,
              paymentId,
            }).catch(() => null);
            assertMarketplaceSyncNotCancelled(runId);
            paymentDetails.push({
              grossReceivedCents: parsePriceToCents(payment?.grossReceived),
              netReceivedCents: parsePriceToCents(payment?.netReceived),
              mlFeeTotalCents: parseSignedPriceToCents(payment?.mlFeeTotal),
              refundsTotalCents: parsePriceToCents(payment?.refundsTotal),
            });
          }

          const grossReceivedCents = sumNumber(paymentDetails.map((item) => item.grossReceivedCents));
          const netReceivedCentsBase = sumNumber(paymentDetails.map((item) => item.netReceivedCents));
          const netReceivedCount = paymentDetails.filter((item) => (item.netReceivedCents ?? 0) > 0).length;
          const mlFeeTotalCentsFromPayments = sumNumber(
            paymentDetails.map((item) => toPositiveCents(item.mlFeeTotalCents))
          );
          const mlFeeTotalCentsFromBillingNet = toPositiveCents(
            parseSignedPriceToCents(billingDetail?.saleFeeNet)
          );
          const mlFeeTotalCentsFromBillingGross = toPositiveCents(
            parseSignedPriceToCents(billingDetail?.saleFeeGross)
          );
          const mlFeeRebateCents = toPositiveCents(
            parsePriceToCents(billingDetail?.saleFeeRebate)
          );
          const mlFeeDiscountCents = toPositiveCents(
            parsePriceToCents(billingDetail?.saleFeeDiscount)
          );
          const mlFeeTotalCentsFromBilling =
            mlFeeTotalCentsFromBillingNet > 0
              ? mlFeeTotalCentsFromBillingNet
              : Math.max(0, mlFeeTotalCentsFromBillingGross - mlFeeRebateCents - mlFeeDiscountCents);
          const mlFeeTotalCents =
            Math.abs(mlFeeTotalCentsFromPayments) > 0 ? mlFeeTotalCentsFromPayments : mlFeeTotalCentsFromBilling;
          const refundsTotalCents = sumNumber(
            paymentDetails.map((item) => toPositiveCents(item.refundsTotalCents))
          );
          const shippingCostCentsFromShipment = toPositiveCents(
            parsePriceToCents(shipmentCosts?.shippingCost)
          );
          const shippingCompensationCentsFromShipment = toPositiveCents(
            parsePriceToCents(shipmentCosts?.shippingCompensation)
          );
          const shippingCostCentsFromBilling = toPositiveCents(
            parsePriceToCents(billingDetail?.shippingCost)
          );
          const shippingCompensationCentsFromBilling = toPositiveCents(
            parsePriceToCents(billingDetail?.shippingCompensation)
          );
          const shippingCostCents =
            shippingCostCentsFromShipment > 0 ? shippingCostCentsFromShipment : shippingCostCentsFromBilling;
          const shippingCompensationCents =
            shippingCompensationCentsFromShipment > 0
              ? shippingCompensationCentsFromShipment
              : shippingCompensationCentsFromBilling;
          const buyerShippingPaidCents = Math.max(
            toPositiveCents(parsePriceToCents(shipmentCosts?.buyerShippingPaid)),
            toPositiveCents(parsePriceToCents(billingDetail?.buyerShippingPaid))
          );

          const itemBilledTotalCents =
            parsePriceToCents(billingDetail?.billedTotal) ??
            parsePriceToCents(effectiveOrder.totalAmount);
          const billedTotalCents =
            itemBilledTotalCents !== null ? itemBilledTotalCents + buyerShippingPaidCents : null;
          const grossPaymentBaseCents =
            grossReceivedCents > 0
              ? grossReceivedCents
              : parsePriceToCents(effectiveOrder.paidAmount) ?? itemBilledTotalCents ?? 0;
          const grossFallbackCents = grossPaymentBaseCents + buyerShippingPaidCents;
          const hasMlFeeSignals = Math.abs(mlFeeTotalCents) > 0;
          const hasOtherCostSignals =
            refundsTotalCents > 0 ||
            shippingCostCents > 0 ||
            shippingCompensationCents > 0;
          const billingNetAmountCents = parsePriceToCents(billingDetail?.netAmount);
          const operationalAdjustmentsCents =
            mlFeeTotalCents + refundsTotalCents + shippingCostCents - shippingCompensationCents;
          const hasPaymentEvidence =
            paymentIds.length > 0 ||
            paymentDetails.some(
              (item) =>
                item.grossReceivedCents !== null ||
                item.netReceivedCents !== null ||
                item.mlFeeTotalCents !== null ||
                item.refundsTotalCents !== null
            ) ||
            grossFallbackCents > 0 ||
              (parsePriceToCents(effectiveOrder.paidAmount) ?? 0) > 0;
          const netFinalCents =
            billingNetAmountCents !== null
              ? Math.max(0, billingNetAmountCents)
              : netReceivedCount > 0
              ? Math.max(0, netReceivedCentsBase - shippingCostCents + shippingCompensationCents)
              : grossFallbackCents > 0 && (hasMlFeeSignals || hasOtherCostSignals)
                ? Math.max(0, grossFallbackCents - operationalAdjustmentsCents)
                : grossFallbackCents > 0 && hasPaymentEvidence
                  ? grossFallbackCents
                : null;

          upsertOrderStmt.run(
	            `${activeAccount.id}:${effectiveOrder.id}`,
	            activeAccount.id,
	            effectiveOrder.id,
	            effectiveOrder.packId ?? null,
	            effectiveOrder.sellerId,
            effectiveOrder.buyerId ?? null,
            effectiveOrder.buyerNickname ?? null,
            effectiveOrder.status ?? null,
            effectiveOrder.substatus ?? null,
            parsePriceToCents(effectiveOrder.totalAmount),
            parsePriceToCents(effectiveOrder.paidAmount),
            effectiveOrder.currencyId ?? null,
            effectiveOrder.shippingId ?? null,
            shipmentDetail?.status ?? effectiveOrder.shippingStatus ?? null,
            shipmentDetail?.substatus ?? null,
            shipmentDetail?.mode ?? null,
            shipmentDetail?.logisticType ?? null,
            shipmentDetail?.shippingType ?? null,
            shipmentDetail?.trackingNumber ?? null,
            deriveShippingStage({
              status: shipmentDetail?.status ?? effectiveOrder.shippingStatus,
              substatus: shipmentDetail?.substatus,
            }),
            billedTotalCents ?? null,
            grossFallbackCents || null,
            netFinalCents,
            mlFeeTotalCents || null,
            refundsTotalCents || null,
            shippingCostCents || null,
            shippingCompensationCents || null,
            effectiveOrder.dateCreated ?? null,
            effectiveOrder.dateClosed ?? null,
            JSON.stringify(effectiveOrder.raw),
            now,
            now,
            now
          );

          const orderRowId = `${activeAccount.id}:${effectiveOrder.id}`;
          const syncedOrderItemIds = [] as string[];
          for (const item of orderItems) {
            const variationKey = item.marketplaceVariationId ? `var:${item.marketplaceVariationId}` : "__item__";
            const linkedVariation = db
              .prepare(
                `SELECT v.id, v.variation_label, v.linked_sku_id,
                        s.sku_code AS linked_sku_code, s.name AS linked_sku_name,
                        s.production_cost_cents AS linked_sku_production_cost_cents,
                        s.source_quote_id AS linked_sku_source_quote_id
                 FROM marketplace_catalog_variations v
                 LEFT JOIN sales_skus s ON s.id = v.linked_sku_id
                 WHERE v.account_id = ?
                   AND v.marketplace_item_id = ?
                   AND (
                     (? IS NOT NULL AND v.marketplace_variation_id = ?)
                     OR v.variation_key = ?
                   )
                 ORDER BY CASE
                   WHEN ? IS NOT NULL AND v.marketplace_variation_id = ? THEN 0
                   WHEN v.variation_key = ? THEN 1
                   ELSE 2
                 END
                 LIMIT 1`
              )
              .get(
                activeAccount.id,
                item.marketplaceItemId,
                item.marketplaceVariationId ?? null,
                item.marketplaceVariationId ?? null,
                variationKey,
                item.marketplaceVariationId ?? null,
                item.marketplaceVariationId ?? null,
                variationKey
              ) as
              | {
                  id: string;
                  variation_label: string | null;
                  linked_sku_id: string | null;
                  linked_sku_code: string | null;
                  linked_sku_name: string | null;
                  linked_sku_production_cost_cents: number | null;
                  linked_sku_source_quote_id: string | null;
                }
              | undefined;

            const orderItemId = `${orderRowId}:${item.marketplaceItemId}:${variationKey}`;
            syncedOrderItemIds.push(orderItemId);
            upsertOrderItemStmt.run(
              orderItemId,
              activeAccount.id,
              orderRowId,
              effectiveOrder.id,
              item.marketplaceItemId,
              item.marketplaceVariationId ?? null,
              variationKey,
              item.title,
              Math.max(1, Math.round(item.quantity)),
              parsePriceToCents(item.unitPrice),
              parsePriceToCents(item.totalPrice),
              item.currencyId ?? effectiveOrder.currencyId ?? null,
              linkedVariation?.id ?? null,
              linkedVariation?.variation_label ?? null,
              JSON.stringify(item.raw),
              now,
              now
            );

            ensureMarketplaceOrderItemCostSnapshot({
              orderItemId,
              linkedSkuId: linkedVariation?.linked_sku_id ?? null,
              linkedSkuCode: linkedVariation?.linked_sku_code ?? null,
              linkedSkuName: linkedVariation?.linked_sku_name ?? null,
              linkedSkuProductionCostCents: linkedVariation?.linked_sku_production_cost_cents ?? null,
              linkedSkuSourceQuoteId: linkedVariation?.linked_sku_source_quote_id ?? null,
            });
            reconcileMarketplaceOrderItemLocalStockMovement(orderItemId);
          }

          if (syncedOrderItemIds.length > 0) {
            const placeholders = syncedOrderItemIds.map(() => "?").join(", ");
            db.prepare(
              `DELETE FROM marketplace_order_items
               WHERE order_id = ?
                 AND id NOT IN (${placeholders})`
            ).run(orderRowId, ...syncedOrderItemIds);
          } else {
            db.prepare("DELETE FROM marketplace_order_items WHERE order_id = ?").run(orderRowId);
          }

          recordsUpserted += 1;
        } catch (error: any) {
          if (error instanceof MarketplaceSyncCancelledError) {
            throw error;
          }
          recordsFailed += 1;
          db.prepare(
            `INSERT INTO marketplace_sync_errors (
              id, run_id, account_id, marketplace, error_code, error_message, payload_json, created_at
            ) VALUES (?, ?, ?, 'mercadolivre', ?, ?, ?, ?)`
          ).run(
            uuidv4(),
            runId,
            activeAccount.id,
            "order_upsert_failed",
            String(error?.message ?? "Failed to upsert marketplace order"),
            JSON.stringify({ marketplace_order_id: order.id }),
            nowIso()
          );
        }
      }

      offset += page.orders.length;
      remaining -= page.orders.length;
    }

    commitSqlTransaction();
    marketplaceSyncCancelRequests.delete(runId);

    const finishedAt = nowIso();
    db.prepare(
      `UPDATE marketplace_sync_runs
       SET status = 'success',
           finished_at = ?,
           records_read = ?,
           records_upserted = ?,
           records_failed = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(finishedAt, recordsRead, recordsUpserted, recordsFailed, finishedAt, runId);
    span.setAttributes({
      "marketplace.sync.records_read": recordsRead,
      "marketplace.sync.records_upserted": recordsUpserted,
      "marketplace.sync.records_failed": recordsFailed,
      "marketplace.sync.cancelled": false,
      "marketplace.sync.stopped_at_existing_order": stoppedAtExistingOrder,
    });

    appendMarketplaceSyncLog({
      phase: "finished",
      syncType: "orders_read",
      accountId: activeAccount.id,
      runId,
      recordsRead,
      recordsUpserted,
      recordsFailed,
        extraPayload: {
          sync_mode: syncWindow.mode,
          sync_window: syncWindow.label,
          sync_source: body.source,
          order_id: requestedOrderId ?? null,
          resolved_order_ids: requestedOrderIds ?? null,
          pack_id: requestedOrderPackId,
          date_created_from: syncWindow.dateCreatedFrom,
          date_created_to: syncWindow.dateCreatedTo,
          stopped_at_existing_order: stoppedAtExistingOrder,
      },
    });

    return {
      ok: true,
      run_id: runId,
      account_id: activeAccount.id,
      marketplace: "mercadolivre",
      records_read: recordsRead,
      records_upserted: recordsUpserted,
      records_failed: recordsFailed,
      stopped_at_existing_order: stoppedAtExistingOrder,
      order_id: requestedOrderId ?? null,
      resolved_order_ids: requestedOrderIds ?? null,
      pack_id: requestedOrderPackId,
    };
  } catch (error: unknown) {
    rollbackSqlTransactionIfOpen();
    marketplaceSyncCancelRequests.delete(runId);
    const finishedAt = nowIso();
    const message =
      error instanceof MercadoLivreApiError
        ? `Mercado Livre API error (${error.statusCode})`
        : (error as any)?.message ?? "Falha ao sincronizar pedidos";
    span.setAttributes({
      "marketplace.sync.records_read": recordsRead,
      "marketplace.sync.records_upserted": recordsUpserted,
      "marketplace.sync.records_failed": recordsFailed,
      "marketplace.sync.cancelled": error instanceof MarketplaceSyncCancelledError,
    });

    db.prepare(
      `UPDATE marketplace_sync_runs
       SET status = 'error',
           finished_at = ?,
           records_read = ?,
           records_upserted = ?,
           records_failed = ?,
           error_message = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(finishedAt, recordsRead, recordsUpserted, recordsFailed, message, finishedAt, runId);

    appendMarketplaceSyncLog({
      phase: error instanceof MarketplaceSyncCancelledError ? "cancelled" : "error",
      syncType: "orders_read",
      accountId: account.id,
      runId,
      recordsRead,
      recordsUpserted,
      recordsFailed,
      message,
      extraPayload: {
        sync_mode: syncWindow.mode,
        sync_window: syncWindow.label,
        sync_source: body.source,
        date_created_from: syncWindow.dateCreatedFrom,
        date_created_to: syncWindow.dateCreatedTo,
      },
    });

    if (error instanceof MarketplaceSyncCancelledError) {
      return {
        ok: false,
        cancelled: true,
        message,
        run_id: runId,
        records_read: recordsRead,
        records_upserted: recordsUpserted,
        records_failed: recordsFailed,
      };
    }

    db.prepare(
      `INSERT INTO marketplace_sync_errors (
        id, run_id, account_id, marketplace, error_code, error_message, payload_json, created_at
      ) VALUES (?, ?, ?, 'mercadolivre', ?, ?, ?, ?)`
    ).run(
      uuidv4(),
      runId,
      account.id,
      error instanceof MercadoLivreApiError ? `ml_api_${error.statusCode}` : "sync_failed",
      message,
      JSON.stringify(
        error instanceof MercadoLivreApiError
          ? { details: error.details }
          : { error: String((error as any)?.message ?? error) }
      ),
      finishedAt
    );

    reply.code(error instanceof MercadoLivreApiError ? 502 : 500);
    return {
      message,
      run_id: runId,
      marketplace_error:
        error instanceof MercadoLivreApiError
          ? {
              status: error.statusCode,
              details: error.details,
            }
          : undefined,
    };
      }
    }
  ).finally(() => {
    marketplaceOrdersSyncRunningAccounts.delete(account.id);
  });
});

app.post("/integrations/mercadolivre/sync/product-ads", async (request, reply) => {
  const body = mercadoLivreProductAdsSyncSchema.parse(request.body ?? {});
  const requestedAccountId = body.account_id?.trim() || undefined;
  const syncWindow = resolveMercadoLivreProductAdsSyncWindow(body.mode);
  const accountRows = requestedAccountId
    ? [resolveMercadoLivreAccount(requestedAccountId)].filter(Boolean)
    : (db
        .prepare(
          `SELECT id, marketplace, account_label, marketplace_user_id, seller_nickname, country_id,
                  access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at,
                  last_connected_at, last_token_refresh_at, metadata_json
           FROM marketplace_accounts
           WHERE marketplace = 'mercadolivre'
             AND is_active = 1`
        )
        .all() as MarketplaceAccountRow[]);

  if (accountRows.length === 0) {
    reply.code(404);
    return { message: "Conta Mercado Livre ativa não encontrada." };
  }

  const runId = uuidv4();
  const startedAt = nowIso();
  const accountRunIds = new Map<string, string>();
  const insertProductAdsRunStmt = db.prepare(
    `INSERT INTO marketplace_sync_runs (
      id, marketplace, account_id, sync_type, status, started_at, finished_at,
      records_read, records_upserted, records_failed, error_message, created_at, updated_at
    ) VALUES (?, 'mercadolivre', ?, 'product_ads_read', 'running', ?, NULL, 0, 0, 0, NULL, ?, ?)`
  );
  for (const account of accountRows) {
    if (!account) continue;
    const accountRunId = accountRows.length === 1 ? runId : uuidv4();
    accountRunIds.set(account.id, accountRunId);
    insertProductAdsRunStmt.run(accountRunId, account.id, startedAt, startedAt, startedAt);
  }
  let recordsRead = 0;
  let recordsUpserted = 0;
  let recordsFailed = 0;

  return runWithSpan(
    "mercadolivre.sync.product_ads",
    {
      "marketplace.name": "mercadolivre",
      "marketplace.sync.run_id": runId,
      "marketplace.sync.type": "product_ads_read",
      "marketplace.sync.mode": body.mode,
      "marketplace.sync.source": body.source,
      "marketplace.sync.date_from": syncWindow.dateFrom,
      "marketplace.sync.date_to": syncWindow.dateTo,
    },
    async (span) => {
      const traceContext = activeTraceContext();
      span.addEvent("product_ads.sync.started", {
        "marketplace.sync.accounts_count": accountRows.length,
        "marketplace.sync.started_at": startedAt,
      });
      appendOperationLog({
        eventType: "marketplace_product_ads_read_started",
        entityType: "marketplace_sync_run",
        entityId: runId,
        summary: "Sincronização de Product Ads Mercado Livre iniciada",
        payload: {
          marketplace: "mercadolivre",
          run_id: runId,
          sync_type: "product_ads_read",
          sync_mode: body.mode,
          sync_window: syncWindow.label,
          sync_source: body.source,
          date_from: syncWindow.dateFrom,
          date_to: syncWindow.dateTo,
          phase: "started",
          trace_id: traceContext.traceId ?? null,
          span_id: traceContext.spanId ?? null,
        },
      });

      const upsertStmt = db.prepare(
        `INSERT INTO marketplace_product_ads_daily_metrics (
          id, marketplace, account_id, advertiser_id, site_id, metric_date,
          cost_cents, impressions, clicks, ads_orders, ads_revenue_cents,
          raw_json, last_synced_at, created_at, updated_at
        ) VALUES (?, 'mercadolivre', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(marketplace, account_id, advertiser_id, site_id, metric_date) DO UPDATE SET
          cost_cents = excluded.cost_cents,
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          ads_orders = excluded.ads_orders,
          ads_revenue_cents = excluded.ads_revenue_cents,
          raw_json = excluded.raw_json,
          last_synced_at = excluded.last_synced_at,
          updated_at = excluded.updated_at`
      );
      const lastSnapshotStmt = db.prepare(
        `SELECT id, cost_cents, impressions, clicks, ads_orders, ads_revenue_cents
         FROM marketplace_product_ads_metric_snapshots
         WHERE marketplace = 'mercadolivre'
           AND account_id = ?
           AND advertiser_id = ?
           AND site_id = ?
           AND metric_date = ?
         ORDER BY fetched_at DESC, created_at DESC
         LIMIT 1`
      );
      const insertSnapshotStmt = db.prepare(
        `INSERT INTO marketplace_product_ads_metric_snapshots (
          id, marketplace, account_id, run_id, advertiser_id, site_id, metric_date,
          sync_mode, sync_source, cost_cents, impressions, clicks, ads_orders, ads_revenue_cents,
          previous_snapshot_id, delta_cost_cents, delta_impressions, delta_clicks,
          delta_ads_orders, delta_ads_revenue_cents, raw_json, fetched_at, created_at
        ) VALUES (?, 'mercadolivre', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const updateRunStmt = db.prepare(
        `UPDATE marketplace_sync_runs
         SET status = ?,
             finished_at = ?,
             records_read = ?,
             records_upserted = ?,
             records_failed = ?,
             error_message = ?,
             updated_at = ?
         WHERE id = ?`
      );

      try {
        for (const rawAccount of accountRows) {
          if (!rawAccount) continue;
          let account = rawAccount;
          const accountRunId = accountRunIds.get(rawAccount.id) ?? runId;
          let accountRecordsRead = 0;
          let accountRecordsUpserted = 0;
          let accountRecordsFailed = 0;
          try {
            span.addEvent("product_ads.account.started", {
              "marketplace.account_id": rawAccount.id,
              "marketplace.sync.run_id": accountRunId,
            });
            if (isTokenExpiringSoon(account.token_expires_at, 180)) {
              const refreshed = await refreshMercadoLivreAccountToken(account.id);
              if (refreshed) account = refreshed;
            }
            if (!account.access_token) {
              recordsFailed += 1;
              accountRecordsFailed += 1;
              const finishedAt = nowIso();
              updateRunStmt.run(
                "error",
                finishedAt,
                accountRecordsRead,
                accountRecordsUpserted,
                accountRecordsFailed,
                "Conta sem access token",
                finishedAt,
                accountRunId
              );
              span.addEvent("product_ads.account.unavailable", {
                "marketplace.account_id": account.id,
                "marketplace.sync.run_id": accountRunId,
                "marketplace.product_ads.unavailable_reason": "missing_access_token",
              });
              appendOperationLog({
                eventType: "marketplace_product_ads_read_failed",
                entityType: "marketplace_account",
                entityId: account.id,
                summary: "Product Ads Mercado Livre indisponível: conta sem access token",
                payload: {
                  marketplace: "mercadolivre",
                  run_id: runId,
                  account_run_id: accountRunId,
                  account_id: account.id,
                  sync_type: "product_ads_read",
                  sync_mode: body.mode,
                  sync_source: body.source,
                  phase: "account_unavailable",
                  reason: "missing_access_token",
                  trace_id: traceContext.traceId ?? null,
                  span_id: traceContext.spanId ?? null,
                },
              });
              continue;
            }

            const siteId = getMarketplaceAccountSiteId(account);
            const advertisers = await fetchMercadoLivreProductAdsAdvertisers({
              accessToken: account.access_token,
              siteId,
            });
            const advertiser = advertisers[0];
            const resolvedSiteId = advertiser?.siteId ?? siteId;
            if (!advertiser || !resolvedSiteId) {
              recordsFailed += 1;
              accountRecordsFailed += 1;
              const finishedAt = nowIso();
              updateRunStmt.run(
                "error",
                finishedAt,
                accountRecordsRead,
                accountRecordsUpserted,
                accountRecordsFailed,
                "Advertiser ou site de Product Ads não encontrado",
                finishedAt,
                accountRunId
              );
              span.addEvent("product_ads.account.unavailable", {
                "marketplace.account_id": account.id,
                "marketplace.sync.run_id": accountRunId,
                "marketplace.product_ads.unavailable_reason": "missing_advertiser_or_site",
              });
              appendOperationLog({
                eventType: "marketplace_product_ads_read_failed",
                entityType: "marketplace_account",
                entityId: account.id,
                summary: "Product Ads Mercado Livre indisponível para a conta",
                payload: {
                  marketplace: "mercadolivre",
                  run_id: runId,
                  account_run_id: accountRunId,
                  account_id: account.id,
                  sync_type: "product_ads_read",
                  sync_mode: body.mode,
                  sync_source: body.source,
                  phase: "account_unavailable",
                  reason: "missing_advertiser_or_site",
                  site_id: siteId,
                  trace_id: traceContext.traceId ?? null,
                  span_id: traceContext.spanId ?? null,
                },
              });
              continue;
            }

            const now = nowIso();
            let accountCostCents = 0;
            let accountImpressions = 0;
            let accountClicks = 0;
            const syncDays = enumerateIsoDateRange(syncWindow.dateFrom, syncWindow.dateTo);
            for (const syncDay of syncDays) {
              const result = await fetchMercadoLivreProductAdsMetrics({
                accessToken: account.access_token,
                siteId: resolvedSiteId,
                advertiserId: advertiser.advertiserId,
                dateFrom: syncDay,
                dateTo: syncDay,
              });

              for (const metric of result.metrics) {
                const costCents = Math.max(0, Math.round(metric.cost * 100));
                const impressions = Math.max(0, Math.round(metric.impressions));
                const clicks = Math.max(0, Math.round(metric.clicks));
                const adsOrders = Math.max(0, Math.round(metric.orders));
                const adsRevenueCents = Math.max(0, Math.round(metric.revenue * 100));
                const rawJson = JSON.stringify(metric);
                recordsRead += 1;
                accountRecordsRead += 1;
                upsertStmt.run(
                  uuidv4(),
                  account.id,
                  advertiser.advertiserId,
                  resolvedSiteId,
                  metric.date,
                  costCents,
                  impressions,
                  clicks,
                  adsOrders,
                  adsRevenueCents,
                  rawJson,
                  now,
                  now,
                  now
                );
                const previousSnapshot = lastSnapshotStmt.get(
                  account.id,
                  advertiser.advertiserId,
                  resolvedSiteId,
                  metric.date
                ) as
                  | {
                      id: string;
                      cost_cents: number;
                      impressions: number;
                      clicks: number;
                      ads_orders: number;
                      ads_revenue_cents: number;
                    }
                  | undefined;
                insertSnapshotStmt.run(
                  uuidv4(),
                  account.id,
                  accountRunId,
                  advertiser.advertiserId,
                  resolvedSiteId,
                  metric.date,
                  body.mode,
                  body.source,
                  costCents,
                  impressions,
                  clicks,
                  adsOrders,
                  adsRevenueCents,
                  previousSnapshot?.id ?? null,
                  Math.max(0, costCents - (previousSnapshot?.cost_cents ?? 0)),
                  Math.max(0, impressions - (previousSnapshot?.impressions ?? 0)),
                  Math.max(0, clicks - (previousSnapshot?.clicks ?? 0)),
                  Math.max(0, adsOrders - (previousSnapshot?.ads_orders ?? 0)),
                  Math.max(0, adsRevenueCents - (previousSnapshot?.ads_revenue_cents ?? 0)),
                  rawJson,
                  now,
                  now
                );
                accountCostCents += costCents;
                accountImpressions += impressions;
                accountClicks += clicks;
                recordsUpserted += 1;
                accountRecordsUpserted += 1;
              }
            }
            const finishedAt = nowIso();
            updateRunStmt.run(
              "success",
              finishedAt,
              accountRecordsRead,
              accountRecordsUpserted,
              accountRecordsFailed,
              null,
              finishedAt,
              accountRunId
            );
            span.addEvent("product_ads.account.finished", {
              "marketplace.account_id": account.id,
              "marketplace.sync.run_id": accountRunId,
              "marketplace.product_ads.advertiser_id": advertiser.advertiserId,
              "marketplace.product_ads.site_id": resolvedSiteId,
              "marketplace.product_ads.records_read": accountRecordsRead,
              "marketplace.product_ads.days_requested": syncDays.length,
              "marketplace.product_ads.cost_cents": accountCostCents,
              "marketplace.product_ads.impressions": accountImpressions,
              "marketplace.product_ads.clicks": accountClicks,
            });
          } catch (error: any) {
            recordsFailed += 1;
            accountRecordsFailed += 1;
            const finishedAt = nowIso();
            const accountErrorMessage =
              error instanceof MercadoLivreApiError
                ? `Mercado Livre API error (${error.statusCode}): ${error.message}`
                : String(error?.message ?? "Failed to sync Product Ads");
            const accountErrorDetails =
              error instanceof MercadoLivreApiError
                ? {
                    status: error.statusCode,
                    details: error.details,
                  }
                : null;
            updateRunStmt.run(
              "error",
              finishedAt,
              accountRecordsRead,
              accountRecordsUpserted,
              accountRecordsFailed,
              accountErrorMessage,
              finishedAt,
              accountRunId
            );
            span.recordException(error as Error);
            span.addEvent("product_ads.account.failed", {
              "marketplace.account_id": rawAccount.id,
              "marketplace.sync.run_id": accountRunId,
              "marketplace.product_ads.error": String(error?.message ?? error),
              "marketplace.product_ads.error_status": error instanceof MercadoLivreApiError ? error.statusCode : undefined,
            });
            db.prepare(
              `INSERT INTO marketplace_sync_errors (
                id, run_id, account_id, marketplace, error_code, error_message, payload_json, created_at
              ) VALUES (?, ?, ?, 'mercadolivre', ?, ?, ?, ?)`
            ).run(
              uuidv4(),
              accountRunId,
              rawAccount.id,
              "product_ads_sync_failed",
              accountErrorMessage,
              JSON.stringify({
                account_id: rawAccount.id,
                mode: body.mode,
                source: body.source,
                error: accountErrorDetails,
              }),
              nowIso()
            );
            appendOperationLog({
              eventType: "marketplace_product_ads_read_failed",
              entityType: "marketplace_account",
              entityId: rawAccount.id,
              summary: "Falha parcial ao sincronizar Product Ads Mercado Livre",
              payload: {
                marketplace: "mercadolivre",
                run_id: runId,
                account_run_id: accountRunId,
                account_id: rawAccount.id,
                sync_type: "product_ads_read",
                sync_mode: body.mode,
                sync_source: body.source,
                phase: "account_failed",
                message: accountErrorMessage,
                error_status: accountErrorDetails?.status ?? null,
                error_details: accountErrorDetails?.details ?? null,
                trace_id: traceContext.traceId ?? null,
                span_id: traceContext.spanId ?? null,
              },
            });
          }
        }

        span.setAttributes({
          "marketplace.sync.records_read": recordsRead,
          "marketplace.sync.records_upserted": recordsUpserted,
          "marketplace.sync.records_failed": recordsFailed,
          "marketplace.sync.accounts_count": accountRows.length,
        });
        span.addEvent("product_ads.sync.finished", {
          "marketplace.sync.records_read": recordsRead,
          "marketplace.sync.records_upserted": recordsUpserted,
          "marketplace.sync.records_failed": recordsFailed,
        });
        const syncFailed = recordsFailed > 0 && recordsRead === 0 && recordsUpserted === 0;
        const finalSummary = syncFailed
          ? "Sincronização de Product Ads Mercado Livre falhou"
          : recordsFailed > 0
            ? "Sincronização de Product Ads Mercado Livre concluída com falhas"
            : "Sincronização de Product Ads Mercado Livre concluída";
        if (syncFailed) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: finalSummary });
        }
        appendOperationLog({
          eventType: syncFailed ? "marketplace_product_ads_read_failed" : "marketplace_product_ads_read_finished",
          entityType: "marketplace_sync_run",
          entityId: runId,
          summary: finalSummary,
          payload: {
            marketplace: "mercadolivre",
            run_id: runId,
            sync_type: "product_ads_read",
            sync_mode: body.mode,
            sync_window: syncWindow.label,
            sync_source: body.source,
            date_from: syncWindow.dateFrom,
            date_to: syncWindow.dateTo,
            phase: syncFailed ? "error" : "finished",
            records_read: recordsRead,
            records_upserted: recordsUpserted,
            records_failed: recordsFailed,
            trace_id: traceContext.traceId ?? null,
            span_id: traceContext.spanId ?? null,
          },
        });

        if (syncFailed) {
          reply.code(502);
        }
        return {
          ok: !syncFailed,
          message: syncFailed ? finalSummary : undefined,
          run_id: runId,
          account_run_ids: Object.fromEntries(accountRunIds),
          marketplace: "mercadolivre",
          records_read: recordsRead,
          records_upserted: recordsUpserted,
          records_failed: recordsFailed,
        };
      } catch (error: any) {
        const message = error?.message ?? "Falha ao sincronizar Product Ads";
        const finishedAt = nowIso();
        for (const accountRunId of accountRunIds.values()) {
          updateRunStmt.run("error", finishedAt, 0, 0, 1, message, finishedAt, accountRunId);
        }
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        span.setAttributes({
          "marketplace.sync.records_read": recordsRead,
          "marketplace.sync.records_upserted": recordsUpserted,
          "marketplace.sync.records_failed": recordsFailed,
        });
        appendOperationLog({
          eventType: "marketplace_product_ads_read_failed",
          entityType: "marketplace_sync_run",
          entityId: runId,
          summary: "Sincronização de Product Ads Mercado Livre falhou",
          payload: {
            marketplace: "mercadolivre",
            run_id: runId,
            sync_type: "product_ads_read",
            sync_mode: body.mode,
            sync_source: body.source,
            phase: "error",
            message,
            trace_id: traceContext.traceId ?? null,
            span_id: traceContext.spanId ?? null,
          },
        });
        reply.code(500);
        return { message, run_id: runId, records_read: recordsRead, records_upserted: recordsUpserted, records_failed: recordsFailed };
      }
    }
  );
});

function loadMarketplaceOrderItemsWithCost(orderId: string) {
  const order = db
    .prepare(
      `SELECT status, substatus, shipping_logistic_type
       FROM marketplace_orders
       WHERE id = ?`
    )
    .get(orderId) as
    | {
        status: string | null;
        substatus: string | null;
        shipping_logistic_type: string | null;
      }
    | undefined;
  const items = db
    .prepare(
      `SELECT oi.id, oi.marketplace_item_id, oi.marketplace_variation_id, oi.variation_key,
              oi.title, oi.quantity, oi.unit_price_cents, oi.total_price_cents, oi.currency_id,
              oi.linked_catalog_variation_id, oi.linked_catalog_variation_label,
              oi.cost_snapshot_sku_id, oi.cost_snapshot_sku_code, oi.cost_snapshot_sku_name,
              oi.cost_snapshot_source_quote_id, oi.unit_production_cost_cents, oi.unit_energy_cost_cents,
              oi.unit_payback_cost_cents, oi.unit_filament_cost_cents, oi.unit_other_cost_cents,
              oi.filament_cost_breakdown_json, oi.cost_snapshot_at
       FROM marketplace_order_items oi
       WHERE oi.order_id = ?
       ORDER BY oi.updated_at DESC`
    )
    .all(orderId);

  return items.map((item: any) => {
    const currentLink = resolveMarketplaceOrderItemCurrentLink(item.id);

    return {
      ...item,
      effective_marketplace_variation_id: currentLink?.effectiveMarketplaceVariationId ?? item.marketplace_variation_id ?? null,
      effective_variation_key: currentLink?.effectiveVariationKey ?? item.variation_key,
      current_linked_catalog_variation_id: currentLink?.linkedCatalogVariationId ?? null,
      current_linked_catalog_variation_label: currentLink?.linkedCatalogVariationLabel ?? null,
      current_linked_sku_id: currentLink?.linkedSkuId ?? null,
      current_linked_sku_code: currentLink?.linkedSkuCode ?? null,
      current_linked_sku_name: currentLink?.linkedSkuName ?? null,
      stock_status: getMarketplaceOrderItemLocalStockStatus({
        orderItemId: item.id,
        quantity: item.quantity,
        linkedSkuId: currentLink?.linkedSkuId ?? null,
        status: order?.status ?? null,
        substatus: order?.substatus ?? null,
        shippingLogisticType: order?.shipping_logistic_type ?? null,
      }),
      filament_cost_breakdown: parseMarketplaceFilamentCostBreakdown(item.filament_cost_breakdown_json),
    };
  });
}

function computeMarketplaceOrderCostMetrics(
  order: {
    billed_total_cents?: number | null;
    order_total_cents?: number | null;
    net_received_cents?: number | null;
  },
  items: Array<{
    quantity?: number | null;
    unit_production_cost_cents?: number | null;
    unit_energy_cost_cents?: number | null;
    unit_payback_cost_cents?: number | null;
    unit_filament_cost_cents?: number | null;
    unit_other_cost_cents?: number | null;
    filament_cost_breakdown?: MarketplaceFilamentCostBreakdownEntry[];
  }>
) {
  const grossRevenueCents = Math.max(0, Math.round(Number(order.billed_total_cents ?? order.order_total_cents ?? 0)));
  const netReceivedCents =
    typeof order.net_received_cents === "number" && Number.isFinite(order.net_received_cents)
      ? Math.max(0, Math.round(order.net_received_cents))
      : null;

  let unitsSold = 0;
  let itemsWithCostSnapshot = 0;
  let itemsWithoutCostSnapshot = 0;
  let productionCostCents = 0;
  let energyCostCents = 0;
  let paybackCostCents = 0;
  let filamentCostCents = 0;
  let otherCostCents = 0;
  const filamentMaterials = new Map<string, { material_type: string; total_cost_cents: number; total_weight_grams: number }>();

  for (const item of items) {
    const quantity = Math.max(1, Math.round(Number(item.quantity ?? 1)));
    unitsSold += quantity;

    if (typeof item.unit_production_cost_cents === "number" && Number.isFinite(item.unit_production_cost_cents)) {
      itemsWithCostSnapshot += 1;
      productionCostCents += Math.max(0, Math.round(item.unit_production_cost_cents)) * quantity;
    } else {
      itemsWithoutCostSnapshot += 1;
    }

    energyCostCents += Math.max(0, Math.round(Number(item.unit_energy_cost_cents ?? 0))) * quantity;
    paybackCostCents += Math.max(0, Math.round(Number(item.unit_payback_cost_cents ?? 0))) * quantity;
    filamentCostCents += Math.max(0, Math.round(Number(item.unit_filament_cost_cents ?? 0))) * quantity;
    otherCostCents += Math.max(0, Math.round(Number(item.unit_other_cost_cents ?? 0))) * quantity;

    for (const breakdown of item.filament_cost_breakdown ?? []) {
      const materialType = String(breakdown.material_type ?? "").trim() || "Nao informado";
      const current = filamentMaterials.get(materialType) ?? {
        material_type: materialType,
        total_cost_cents: 0,
        total_weight_grams: 0,
      };
      current.total_cost_cents += Math.max(0, Math.round(Number(breakdown.unit_cost_cents ?? 0))) * quantity;
      current.total_weight_grams += Number(breakdown.used_weight_grams_per_unit ?? 0) * quantity;
      filamentMaterials.set(materialType, current);
    }
  }

  return {
    itemsCount: items.length,
    itemsWithCostSnapshot,
    itemsWithoutCostSnapshot,
    unitsSold,
    grossRevenueCents,
    netReceivedCents,
    productionCostCents,
    energyCostCents,
    paybackCostCents,
    filamentCostCents,
    otherCostCents,
    grossProfitCents: grossRevenueCents - productionCostCents,
    netProfitCents: netReceivedCents === null ? null : netReceivedCents - productionCostCents,
    filamentMaterials: Array.from(filamentMaterials.values()).sort((a, b) => b.total_cost_cents - a.total_cost_cents),
  };
}

app.get("/integrations/mercadolivre/orders", async (request) => {
  const query = mercadoLivreOrdersListQuerySchema.parse(request.query ?? {});
  const accountId = query.account_id?.trim() || null;
  const status = query.status?.trim() || null;
  const likeValue = `%${(query.q ?? "").trim()}%`;

  const rows = accountId
    ? db
        .prepare(
	          `SELECT o.id, o.account_id, o.marketplace_order_id, o.pack_id, o.seller_id, o.buyer_id, o.buyer_nickname,
                  o.status, o.substatus, o.order_total_cents, o.paid_amount_cents, o.currency_id,
                  o.shipping_id, o.shipping_status, o.shipping_substatus, o.shipping_mode, o.shipping_logistic_type,
                  o.shipping_type, o.shipping_tracking_number, o.shipping_stage, o.billed_total_cents,
                  o.gross_received_cents, o.net_received_cents, o.ml_fee_total_cents, o.refunds_total_cents,
                  o.shipping_cost_cents, o.shipping_compensation_cents,
                  o.date_created, o.date_closed, o.last_seen_at, o.updated_at
           FROM marketplace_orders o
           WHERE o.marketplace = 'mercadolivre'
             AND o.account_id = ?
             AND (? IS NULL OR o.status = ?)
             AND (? = '%%' OR o.marketplace_order_id LIKE ? OR COALESCE(o.buyer_nickname, '') LIKE ?)
           ORDER BY COALESCE(o.date_created, o.updated_at) DESC
           LIMIT ?`
        )
        .all(accountId, status, status, likeValue, likeValue, likeValue, query.limit)
    : db
        .prepare(
	          `SELECT o.id, o.account_id, o.marketplace_order_id, o.pack_id, o.seller_id, o.buyer_id, o.buyer_nickname,
                  o.status, o.substatus, o.order_total_cents, o.paid_amount_cents, o.currency_id,
                  o.shipping_id, o.shipping_status, o.shipping_substatus, o.shipping_mode, o.shipping_logistic_type,
                  o.shipping_type, o.shipping_tracking_number, o.shipping_stage, o.billed_total_cents,
                  o.gross_received_cents, o.net_received_cents, o.ml_fee_total_cents, o.refunds_total_cents,
                  o.shipping_cost_cents, o.shipping_compensation_cents,
                  o.date_created, o.date_closed, o.last_seen_at, o.updated_at
           FROM marketplace_orders o
           WHERE o.marketplace = 'mercadolivre'
             AND (? IS NULL OR o.status = ?)
             AND (? = '%%' OR o.marketplace_order_id LIKE ? OR COALESCE(o.buyer_nickname, '') LIKE ?)
           ORDER BY COALESCE(o.date_created, o.updated_at) DESC
           LIMIT ?`
        )
        .all(status, status, likeValue, likeValue, likeValue, query.limit);

  const expandedRows = rows.map((row: any) => {
    const items = loadMarketplaceOrderItemsWithCost(row.id);
    const metrics = computeMarketplaceOrderCostMetrics(row, items);
    const snapshotStatus = computeMarketplaceOrderSnapshotStatus(items);

    return {
      ...row,
      order_items: items,
      metrics,
      snapshot_status: snapshotStatus,
    };
  });

  const groupedRows = new Map<string, any>();
  for (const row of expandedRows) {
    const groupKey = row.pack_id ? `pack:${row.account_id}:${row.pack_id}` : `order:${row.id}`;
    const current = groupedRows.get(groupKey);
    if (!current) {
      groupedRows.set(groupKey, {
        ...row,
        marketplace_order_ids: [row.marketplace_order_id],
        order_items: [...row.order_items],
        _rows: [row],
      });
      continue;
    }

    current.marketplace_order_ids.push(row.marketplace_order_id);
    current.order_items.push(...row.order_items);
    current._rows.push(row);
    current.marketplace_order_id = current.pack_id
      ? `pack:${current.pack_id}`
      : current.marketplace_order_ids.join(", ");
    current.status = current.status === row.status ? current.status : current.status ?? row.status;
    current.substatus = current.substatus === row.substatus ? current.substatus : current.substatus ?? row.substatus;
    current.date_created =
      Date.parse(row.date_created ?? "") < Date.parse(current.date_created ?? "")
        ? row.date_created
        : current.date_created;
    current.updated_at =
      Date.parse(row.updated_at ?? "") > Date.parse(current.updated_at ?? "")
        ? row.updated_at
        : current.updated_at;
  }

  return Array.from(groupedRows.values()).map((group) => {
    const rowsInGroup = group._rows as any[];
    const grossRevenueCents = rowsInGroup.reduce(
      (sum, row) => sum + Math.max(0, Math.round(Number(row.billed_total_cents ?? row.order_total_cents ?? 0))),
      0
    );
    const grossReceivedCents = rowsInGroup.reduce(
      (sum, row) => sum + Math.max(0, Math.round(Number(row.gross_received_cents ?? 0))),
      0
    );
    const mlFeeTotalCents = rowsInGroup.reduce(
      (sum, row) => sum + Math.max(0, Math.round(Number(row.ml_fee_total_cents ?? 0))),
      0
    );
    const refundsTotalCents = rowsInGroup.reduce(
      (sum, row) => sum + Math.max(0, Math.round(Number(row.refunds_total_cents ?? 0))),
      0
    );
    const shippingCostsByShipment = new Map<string, { cost: number; compensation: number }>();
    for (const row of rowsInGroup) {
      const key = row.shipping_id ? String(row.shipping_id) : row.id;
      const current = shippingCostsByShipment.get(key) ?? { cost: 0, compensation: 0 };
      current.cost = Math.max(current.cost, Math.max(0, Math.round(Number(row.shipping_cost_cents ?? 0))));
      current.compensation = Math.max(
        current.compensation,
        Math.max(0, Math.round(Number(row.shipping_compensation_cents ?? 0)))
      );
      shippingCostsByShipment.set(key, current);
    }
    const shippingCostCents = Array.from(shippingCostsByShipment.values()).reduce((sum, item) => sum + item.cost, 0);
    const shippingCompensationCents = Array.from(shippingCostsByShipment.values()).reduce(
      (sum, item) => sum + item.compensation,
      0
    );
    const hasNetReceived = rowsInGroup.some((row) => row.net_received_cents !== null && row.net_received_cents !== undefined);
    const netReceivedCents = hasNetReceived
      ? Math.max(
          0,
          (grossReceivedCents > 0 ? grossReceivedCents : grossRevenueCents) -
            mlFeeTotalCents -
            refundsTotalCents -
            shippingCostCents +
            shippingCompensationCents
        )
      : null;
    const mergedRow = {
      ...group,
      order_total_cents: grossRevenueCents,
      billed_total_cents: grossRevenueCents,
      gross_received_cents: grossReceivedCents || null,
      net_received_cents: netReceivedCents,
      ml_fee_total_cents: mlFeeTotalCents || null,
      refunds_total_cents: refundsTotalCents || null,
      shipping_cost_cents: shippingCostCents || null,
      shipping_compensation_cents: shippingCompensationCents || null,
    };
    const metrics = computeMarketplaceOrderCostMetrics(mergedRow, group.order_items);
    const snapshotStatus = computeMarketplaceOrderSnapshotStatus(group.order_items);
    const { _rows, ...publicGroup } = mergedRow;
    return {
      ...publicGroup,
      metrics,
      snapshot_status: snapshotStatus,
    };
  });
});

type MarketplaceOrdersDashboardRow = {
  id: string;
  account_id: string;
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
  order_total_cents: number | null;
  billed_total_cents: number | null;
  net_received_cents: number | null;
  date_created: string | null;
  updated_at: string;
  seller_nickname: string | null;
};

function getMarketplaceAccountSiteId(account: MarketplaceAccountRow): string | null {
  try {
    const metadata = account.metadata_json ? JSON.parse(account.metadata_json) : null;
    const siteId = metadata?.site_id ? String(metadata.site_id).trim() : "";
    if (siteId) return siteId;
  } catch {
    // Ignore invalid metadata and fall back to country.
  }

  const country = String(account.country_id ?? "").trim().toUpperCase();
  if (country === "BR") return "MLB";
  if (country === "AR") return "MLA";
  if (country === "MX") return "MLM";
  if (country === "CL") return "MLC";
  if (country === "CO") return "MCO";
  return null;
}

function resolveMercadoLivreProductAdsSyncWindow(mode: "incremental" | "light" | "normal" | "full") {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now);
  if (mode === "incremental") {
    // Hoje. A API de Product Ads trabalha bem com agregação diária.
  } else if (mode === "light") {
    from.setUTCDate(from.getUTCDate() - 1);
  } else if (mode === "normal") {
    from.setUTCDate(from.getUTCDate() - 59);
  } else {
    from.setUTCDate(from.getUTCDate() - 364);
  }
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to,
    label:
      mode === "incremental"
        ? "hoje"
        : mode === "light"
          ? "últimas 48h"
          : mode === "normal"
            ? "últimos 60 dias"
            : "último ano",
  };
}

function enumerateIsoDateRange(dateFrom: string, dateTo: string): string[] {
  const startMs = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const endMs = Date.parse(`${dateTo}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];
  const start = Math.min(startMs, endMs);
  const end = Math.max(startMs, endMs);
  const days: string[] = [];
  for (let cursor = start; cursor <= end; cursor += 24 * 60 * 60 * 1000) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return days;
}

function getMercadoLivreProductAdsDashboardFromDb(params: {
  accountId: string | null;
  dateFrom: string;
  dateTo: string;
}) {
  const whereAccount = params.accountId ? "AND m.account_id = ?" : "";
  const baseParams = params.accountId
    ? [params.dateFrom, params.dateTo, params.accountId]
    : [params.dateFrom, params.dateTo];
  const totals =
    (db
      .prepare(
        `SELECT COALESCE(SUM(cost_cents), 0) AS cost_cents,
                COALESCE(SUM(impressions), 0) AS impressions,
                COALESCE(SUM(clicks), 0) AS clicks,
                COALESCE(SUM(ads_orders), 0) AS orders,
                COALESCE(SUM(ads_revenue_cents), 0) AS revenue_cents
         FROM marketplace_product_ads_daily_metrics m
         WHERE m.marketplace = 'mercadolivre'
           AND m.metric_date BETWEEN ? AND ?
           ${whereAccount}`
      )
      .get(...baseParams) as any) ?? {};

  const daily = db
    .prepare(
      `SELECT metric_date AS date,
              COALESCE(SUM(cost_cents), 0) AS cost_cents,
              COALESCE(SUM(impressions), 0) AS impressions,
              COALESCE(SUM(clicks), 0) AS clicks,
              COALESCE(SUM(ads_orders), 0) AS orders,
              COALESCE(SUM(ads_revenue_cents), 0) AS revenue_cents
       FROM marketplace_product_ads_daily_metrics m
       WHERE m.marketplace = 'mercadolivre'
         AND m.metric_date BETWEEN ? AND ?
         ${whereAccount}
       GROUP BY metric_date
       ORDER BY metric_date ASC`
    )
    .all(...baseParams);

  const accounts = db
    .prepare(
      `SELECT m.account_id,
              a.seller_nickname,
              m.advertiser_id,
              'ok' AS status,
              NULL AS message,
              COALESCE(SUM(m.cost_cents), 0) AS cost_cents
       FROM marketplace_product_ads_daily_metrics m
       LEFT JOIN marketplace_accounts a ON a.id = m.account_id
       WHERE m.marketplace = 'mercadolivre'
         AND m.metric_date BETWEEN ? AND ?
         ${whereAccount}
       GROUP BY m.account_id, a.seller_nickname, m.advertiser_id
       ORDER BY cost_cents DESC`
    )
    .all(...baseParams);

  return {
    date_from: params.dateFrom,
    date_to: params.dateTo,
    totals: {
      cost_cents: Number(totals.cost_cents ?? 0),
      impressions: Number(totals.impressions ?? 0),
      clicks: Number(totals.clicks ?? 0),
      orders: Number(totals.orders ?? 0),
      revenue_cents: Number(totals.revenue_cents ?? 0),
    },
    daily,
    accounts,
  };
}

app.get("/integrations/mercadolivre/orders/dashboard", async (request) => {
  const query = mercadoLivreOrdersDashboardQuerySchema.parse(request.query ?? {});
  const accountId = query.account_id?.trim() || null;
  const dateTo = query.date_to?.trim() || new Date().toISOString().slice(0, 10);
  const dateFrom =
    query.date_from?.trim() || new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const rows = (accountId
	    ? db
	        .prepare(
	          `SELECT o.id, o.account_id, o.marketplace_order_id, o.buyer_nickname, o.status,
	                  o.substatus, o.shipping_status, o.shipping_substatus, o.shipping_mode,
	                  o.shipping_logistic_type, o.shipping_type, o.shipping_stage,
	                  o.order_total_cents, o.billed_total_cents, o.net_received_cents,
	                  o.date_created, o.updated_at, a.seller_nickname
	           FROM marketplace_orders o
           LEFT JOIN marketplace_accounts a ON a.id = o.account_id
           WHERE o.marketplace = 'mercadolivre'
             AND o.account_id = ?
           ORDER BY COALESCE(o.date_created, o.updated_at) DESC`
        )
        .all(accountId)
	    : db
	        .prepare(
	          `SELECT o.id, o.account_id, o.marketplace_order_id, o.buyer_nickname, o.status,
	                  o.substatus, o.shipping_status, o.shipping_substatus, o.shipping_mode,
	                  o.shipping_logistic_type, o.shipping_type, o.shipping_stage,
	                  o.order_total_cents, o.billed_total_cents, o.net_received_cents,
	                  o.date_created, o.updated_at, a.seller_nickname
	           FROM marketplace_orders o
           LEFT JOIN marketplace_accounts a ON a.id = o.account_id
           WHERE o.marketplace = 'mercadolivre'
           ORDER BY COALESCE(o.date_created, o.updated_at) DESC`
        )
        .all()) as MarketplaceOrdersDashboardRow[];

  const totals = {
    orders_count: 0,
    orders_with_net_received: 0,
    items_count: 0,
    items_with_cost_snapshot: 0,
    items_without_cost_snapshot: 0,
    units_sold: 0,
    gross_revenue_cents: 0,
    net_received_cents: 0,
    production_cost_cents: 0,
    energy_cost_cents: 0,
    payback_cost_cents: 0,
    filament_cost_cents: 0,
    other_cost_cents: 0,
    gross_profit_cents: 0,
    net_profit_cents: 0,
  };

  const accounts = new Map<
    string,
    {
      account_id: string;
      seller_nickname: string | null;
      orders_count: number;
      units_sold: number;
      gross_revenue_cents: number;
      net_received_cents: number;
      production_cost_cents: number;
      gross_profit_cents: number;
      net_profit_cents: number;
    }
  >();
  const filamentMaterials = new Map<string, { material_type: string; total_cost_cents: number; total_weight_grams: number }>();

  const recentOrders = rows.slice(0, 12).map((row: any) => {
    const items = loadMarketplaceOrderItemsWithCost(row.id);
    const metrics = computeMarketplaceOrderCostMetrics(row, items);

    totals.orders_count += 1;
    totals.items_count += metrics.itemsCount;
    totals.items_with_cost_snapshot += metrics.itemsWithCostSnapshot;
    totals.items_without_cost_snapshot += metrics.itemsWithoutCostSnapshot;
    totals.units_sold += metrics.unitsSold;
    totals.gross_revenue_cents += metrics.grossRevenueCents;
    totals.production_cost_cents += metrics.productionCostCents;
    totals.energy_cost_cents += metrics.energyCostCents;
    totals.payback_cost_cents += metrics.paybackCostCents;
    totals.filament_cost_cents += metrics.filamentCostCents;
    totals.other_cost_cents += metrics.otherCostCents;
    totals.gross_profit_cents += metrics.grossProfitCents;

    if (metrics.netReceivedCents !== null) {
      totals.orders_with_net_received += 1;
      totals.net_received_cents += metrics.netReceivedCents;
      totals.net_profit_cents += metrics.netProfitCents ?? 0;
    }

    const accountSummary = accounts.get(row.account_id) ?? {
      account_id: row.account_id,
      seller_nickname: row.seller_nickname ?? null,
      orders_count: 0,
      units_sold: 0,
      gross_revenue_cents: 0,
      net_received_cents: 0,
      production_cost_cents: 0,
      gross_profit_cents: 0,
      net_profit_cents: 0,
    };

    accountSummary.orders_count += 1;
    accountSummary.units_sold += metrics.unitsSold;
    accountSummary.gross_revenue_cents += metrics.grossRevenueCents;
    accountSummary.production_cost_cents += metrics.productionCostCents;
    accountSummary.gross_profit_cents += metrics.grossProfitCents;
    if (metrics.netReceivedCents !== null) {
      accountSummary.net_received_cents += metrics.netReceivedCents;
      accountSummary.net_profit_cents += metrics.netProfitCents ?? 0;
    }
    accounts.set(row.account_id, accountSummary);

    for (const material of metrics.filamentMaterials) {
      const current = filamentMaterials.get(material.material_type) ?? {
        material_type: material.material_type,
        total_cost_cents: 0,
        total_weight_grams: 0,
      };
      current.total_cost_cents += material.total_cost_cents;
      current.total_weight_grams += material.total_weight_grams;
      filamentMaterials.set(material.material_type, current);
    }

    return {
      id: row.id,
      account_id: row.account_id,
      seller_nickname: row.seller_nickname ?? null,
	      marketplace_order_id: row.marketplace_order_id,
	      buyer_nickname: row.buyer_nickname ?? null,
	      status: row.status ?? null,
	      substatus: row.substatus ?? null,
	      shipping_status: row.shipping_status ?? null,
	      shipping_substatus: row.shipping_substatus ?? null,
	      shipping_mode: row.shipping_mode ?? null,
	      shipping_logistic_type: row.shipping_logistic_type ?? null,
	      shipping_type: row.shipping_type ?? null,
	      shipping_stage: row.shipping_stage ?? null,
	      date_created: row.date_created ?? null,
	      updated_at: row.updated_at,
      ...metrics,
      snapshot_status: computeMarketplaceOrderSnapshotStatus(items),
    };
  });

  if (rows.length > recentOrders.length) {
    for (const row of rows.slice(recentOrders.length)) {
      const items = loadMarketplaceOrderItemsWithCost(row.id);
      const metrics = computeMarketplaceOrderCostMetrics(row, items);

      totals.orders_count += 1;
      totals.items_count += metrics.itemsCount;
      totals.items_with_cost_snapshot += metrics.itemsWithCostSnapshot;
      totals.items_without_cost_snapshot += metrics.itemsWithoutCostSnapshot;
      totals.units_sold += metrics.unitsSold;
      totals.gross_revenue_cents += metrics.grossRevenueCents;
      totals.production_cost_cents += metrics.productionCostCents;
      totals.energy_cost_cents += metrics.energyCostCents;
      totals.payback_cost_cents += metrics.paybackCostCents;
      totals.filament_cost_cents += metrics.filamentCostCents;
      totals.other_cost_cents += metrics.otherCostCents;
      totals.gross_profit_cents += metrics.grossProfitCents;

      if (metrics.netReceivedCents !== null) {
        totals.orders_with_net_received += 1;
        totals.net_received_cents += metrics.netReceivedCents;
        totals.net_profit_cents += metrics.netProfitCents ?? 0;
      }

      const accountSummary = accounts.get(row.account_id) ?? {
        account_id: row.account_id,
        seller_nickname: row.seller_nickname ?? null,
        orders_count: 0,
        units_sold: 0,
        gross_revenue_cents: 0,
        net_received_cents: 0,
        production_cost_cents: 0,
        gross_profit_cents: 0,
        net_profit_cents: 0,
      };

      accountSummary.orders_count += 1;
      accountSummary.units_sold += metrics.unitsSold;
      accountSummary.gross_revenue_cents += metrics.grossRevenueCents;
      accountSummary.production_cost_cents += metrics.productionCostCents;
      accountSummary.gross_profit_cents += metrics.grossProfitCents;
      if (metrics.netReceivedCents !== null) {
        accountSummary.net_received_cents += metrics.netReceivedCents;
        accountSummary.net_profit_cents += metrics.netProfitCents ?? 0;
      }
      accounts.set(row.account_id, accountSummary);

      for (const material of metrics.filamentMaterials) {
        const current = filamentMaterials.get(material.material_type) ?? {
          material_type: material.material_type,
          total_cost_cents: 0,
          total_weight_grams: 0,
        };
        current.total_cost_cents += material.total_cost_cents;
        current.total_weight_grams += material.total_weight_grams;
        filamentMaterials.set(material.material_type, current);
      }
    }
  }

  return {
    marketplace: "mercadolivre",
    generated_at: nowIso(),
    product_ads: getMercadoLivreProductAdsDashboardFromDb({
      accountId,
      dateFrom,
      dateTo,
    }),
    totals,
    accounts: Array.from(accounts.values()).sort((a, b) => b.gross_revenue_cents - a.gross_revenue_cents),
    filament_materials: Array.from(filamentMaterials.values()).sort((a, b) => b.total_cost_cents - a.total_cost_cents),
    recent_orders: recentOrders,
  };
});

app.get("/integrations/marketplaces/normalization-rules", async (request) => {
  const query = marketplaceNormalizationRulesQuerySchema.parse(request.query ?? {});
  const marketplace = query.marketplace.trim() || "mercadolivre";
  const category = query.category.trim() || "shipping_logistic_type";

  return db
    .prepare(
      `SELECT id, marketplace, category, raw_value, normalized_label, is_active, created_at, updated_at
       FROM marketplace_normalization_rules
       WHERE marketplace = ?
         AND category = ?
       ORDER BY raw_value ASC`
    )
    .all(marketplace, category);
});

app.put("/integrations/marketplaces/normalization-rules", async (request) => {
  const body = marketplaceNormalizationRulesSaveSchema.parse(request.body ?? {});
  const marketplace = body.marketplace.trim() || "mercadolivre";
  const category = body.category.trim() || "shipping_logistic_type";
  const now = nowIso();

  const upsertRule = db.prepare(
    `INSERT INTO marketplace_normalization_rules (
      id, marketplace, category, raw_value, normalized_label, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(marketplace, category, raw_value) DO UPDATE SET
      normalized_label = excluded.normalized_label,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at`
  );

  const saveRules = db.transaction(() => {
    for (const rule of body.rules) {
      const rawValue = rule.raw_value.trim();
      const normalizedLabel = rule.normalized_label.trim();
      upsertRule.run(
        `${marketplace}-${category}-${rawValue}`,
        marketplace,
        category,
        rawValue,
        normalizedLabel,
        rule.is_active ? 1 : 0,
        now,
        now
      );
    }
  });
  saveRules();

  appendOperationLog({
    eventType: "marketplace_normalization_rules_updated",
    entityType: "marketplace_normalization_rules",
    entityId: `${marketplace}:${category}`,
    summary: "Regras de normalização de marketplace atualizadas",
    payload: {
      marketplace,
      category,
      rules_count: body.rules.length,
    },
  });

  return {
    ok: true,
    marketplace,
    category,
    rules: db
      .prepare(
        `SELECT id, marketplace, category, raw_value, normalized_label, is_active, created_at, updated_at
         FROM marketplace_normalization_rules
         WHERE marketplace = ?
           AND category = ?
         ORDER BY raw_value ASC`
      )
      .all(marketplace, category),
  };
});

app.post("/integrations/mercadolivre/orders/recalculate-snapshots", async (request, reply) => {
  const body = mercadoLivreOrdersRecalculateSnapshotsSchema.parse(request.body ?? {});
  const accountId = body.account_id?.trim() || null;

  if (accountId) {
    const account = db
      .prepare(
        `SELECT id
         FROM marketplace_accounts
         WHERE id = ?
           AND marketplace = 'mercadolivre'`
      )
      .get(accountId) as { id: string } | undefined;

    if (!account) {
      reply.code(404);
      return { message: "Conta Mercado Livre não encontrada." };
    }
  }

  const result = recalculateMarketplaceOrderSnapshots({ accountId });

  appendOperationLog({
    eventType: "marketplace_order_snapshots_recalculated",
    entityType: "marketplace_order",
    entityId: accountId,
    summary: accountId
      ? "Recalculo de snapshot de custo executado para a conta Mercado Livre"
      : "Recalculo global de snapshot de custo executado",
    payload: {
      marketplace: "mercadolivre",
      account_id: accountId,
      orders_processed: result.ordersProcessed,
      items_processed: result.itemsProcessed,
      items_updated: result.itemsUpdated,
      items_skipped: result.itemsSkipped,
    },
  });

  return {
    ok: true,
    marketplace: "mercadolivre",
    account_id: accountId,
    orders_processed: result.ordersProcessed,
    items_processed: result.itemsProcessed,
    items_updated: result.itemsUpdated,
    items_skipped: result.itemsSkipped,
  };
});

app.post("/integrations/mercadolivre/orders/:id/recalculate-snapshots", async (request, reply) => {
  const { id } = request.params as { id: string };
  const order = db
    .prepare(
      `SELECT id, account_id, marketplace_order_id
       FROM marketplace_orders
       WHERE id = ?
         AND marketplace = 'mercadolivre'`
    )
    .get(id) as
    | {
        id: string;
        account_id: string;
        marketplace_order_id: string;
      }
    | undefined;

  if (!order) {
    reply.code(404);
    return { message: "Pedido Mercado Livre não encontrado." };
  }

  const result = recalculateMarketplaceOrderSnapshots({ orderId: order.id });

  appendOperationLog({
    eventType: "marketplace_order_snapshot_recalculated",
    entityType: "marketplace_order",
    entityId: order.id,
    summary: "Recalculo de snapshot de custo executado para pedido Mercado Livre",
    payload: {
      marketplace: "mercadolivre",
      account_id: order.account_id,
      marketplace_order_id: order.marketplace_order_id,
      orders_processed: result.ordersProcessed,
      items_processed: result.itemsProcessed,
      items_updated: result.itemsUpdated,
      items_skipped: result.itemsSkipped,
    },
  });

  return {
    ok: true,
    marketplace: "mercadolivre",
    order_id: order.id,
    marketplace_order_id: order.marketplace_order_id,
    orders_processed: result.ordersProcessed,
    items_processed: result.itemsProcessed,
    items_updated: result.itemsUpdated,
    items_skipped: result.itemsSkipped,
  };
});

app.post("/integrations/mercadolivre/orders/:id/refresh", async (request, reply) => {
  const { id } = request.params as { id: string };
  const order = db
    .prepare(
      `SELECT id, account_id, marketplace_order_id
       FROM marketplace_orders
       WHERE id = ?
         AND marketplace = 'mercadolivre'`
    )
    .get(id) as
    | {
        id: string;
        account_id: string;
        marketplace_order_id: string;
      }
    | undefined;

  if (!order) {
    reply.code(404);
    return { message: "Pedido Mercado Livre não encontrado." };
  }

  const response = await app.inject({
    method: "POST",
    url: "/integrations/mercadolivre/sync/orders",
    payload: JSON.stringify({
      account_id: order.account_id,
      order_id: order.marketplace_order_id,
      mode: "normal",
      source: "manual",
    }),
    headers: {
      "content-type": "application/json",
    },
  });

  const payload = response.json<any>();
  reply.code(response.statusCode);
  return {
    ...payload,
    order_id: order.id,
    marketplace_order_id: order.marketplace_order_id,
  };
});

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

function normalizeSkuBarcodes(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getSkuBarcodes(skuId: string): string[] {
  const rows = db
    .prepare("SELECT barcode_value FROM sales_sku_barcodes WHERE sku_id = ? ORDER BY created_at ASC")
    .all(skuId) as Array<{ barcode_value: string }>;
  return rows.map((row) => row.barcode_value);
}

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
     SET default_sale_price_cents = CASE WHEN sync_final_sale_price_with_suggested = 1 THEN ? ELSE default_sale_price_cents END,
         presential_sale_price_cents = CASE WHEN sync_presential_sale_price_with_suggested = 1 THEN ? ELSE presential_sale_price_cents END,
         wholesale_consignment_price_cents = CASE WHEN sync_wholesale_consignment_price_with_suggested = 1 THEN ? ELSE wholesale_consignment_price_cents END,
         wholesale_cash_price_cents = CASE WHEN sync_wholesale_cash_price_with_suggested = 1 THEN ? ELSE wholesale_cash_price_cents END,
         production_cost_cents = ?,
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
          suggested.suggested_final_price_cents,
          suggested.suggested_presential_price_cents,
          suggested.suggested_wholesale_consignment_price_cents,
          suggested.suggested_wholesale_cash_price_cents,
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
            default_sale_price_cents:
              Number(row.sync_final_sale_price_with_suggested ?? 1) === 1
                ? suggested.suggested_final_price_cents
                : row.default_sale_price_cents,
            presential_sale_price_cents:
              Number(row.sync_presential_sale_price_with_suggested ?? 1) === 1
                ? suggested.suggested_presential_price_cents
                : row.presential_sale_price_cents,
            wholesale_consignment_price_cents:
              Number(row.sync_wholesale_consignment_price_with_suggested ?? 1) === 1
                ? suggested.suggested_wholesale_consignment_price_cents
                : row.wholesale_consignment_price_cents,
            wholesale_cash_price_cents:
              Number(row.sync_wholesale_cash_price_with_suggested ?? 1) === 1
                ? suggested.suggested_wholesale_cash_price_cents
                : row.wholesale_cash_price_cents,
            production_cost_cents: recomputed.subtotalUnitCents,
            ...suggested,
            barcodes: getSkuBarcodes(String(row.id)),
          },
          activeTaxRateBps,
          recomputed.taxUnitCents
        );
      }
    }
    return withSkuContributionMargin(
      { ...row, barcodes: getSkuBarcodes(String(row.id)) },
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
         SET default_sale_price_cents = CASE WHEN sync_final_sale_price_with_suggested = 1 THEN ? ELSE default_sale_price_cents END,
             presential_sale_price_cents = CASE WHEN sync_presential_sale_price_with_suggested = 1 THEN ? ELSE presential_sale_price_cents END,
             wholesale_consignment_price_cents = CASE WHEN sync_wholesale_consignment_price_with_suggested = 1 THEN ? ELSE wholesale_consignment_price_cents END,
             wholesale_cash_price_cents = CASE WHEN sync_wholesale_cash_price_with_suggested = 1 THEN ? ELSE wholesale_cash_price_cents END,
             production_cost_cents = ?,
             suggested_final_price_cents = ?, suggested_presential_price_cents = ?,
             suggested_wholesale_consignment_price_cents = ?, suggested_wholesale_cash_price_cents = ?,
             updated_at = ?
        WHERE id = ?`
      ).run(
        suggested.suggested_final_price_cents,
        suggested.suggested_presential_price_cents,
        suggested.suggested_wholesale_consignment_price_cents,
        suggested.suggested_wholesale_cash_price_cents,
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
        default_sale_price_cents:
          Number(sku.sync_final_sale_price_with_suggested ?? 1) === 1
            ? suggested.suggested_final_price_cents
            : sku.default_sale_price_cents,
        presential_sale_price_cents:
          Number(sku.sync_presential_sale_price_with_suggested ?? 1) === 1
            ? suggested.suggested_presential_price_cents
            : sku.presential_sale_price_cents,
        wholesale_consignment_price_cents:
          Number(sku.sync_wholesale_consignment_price_with_suggested ?? 1) === 1
            ? suggested.suggested_wholesale_consignment_price_cents
            : sku.wholesale_consignment_price_cents,
        wholesale_cash_price_cents:
          Number(sku.sync_wholesale_cash_price_with_suggested ?? 1) === 1
            ? suggested.suggested_wholesale_cash_price_cents
            : sku.wholesale_cash_price_cents,
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
    barcodes: getSkuBarcodes(id),
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
  const normalizedBarcodes = normalizeSkuBarcodes(body.barcodes);

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
  const syncFinalSalePriceWithSuggested = body.sync_final_sale_price_with_suggested === false ? 0 : 1;
  const syncPresentialSalePriceWithSuggested = body.sync_presential_sale_price_with_suggested === false ? 0 : 1;
  const syncWholesaleConsignmentPriceWithSuggested =
    body.sync_wholesale_consignment_price_with_suggested === false ? 0 : 1;
  const syncWholesaleCashPriceWithSuggested = body.sync_wholesale_cash_price_with_suggested === false ? 0 : 1;

  const suggestedFinalPriceBaseCents =
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
    finalPriceCents: recomputedFromQuote ? recomputedFromQuote.finalUnitCents : suggestedFinalPriceBaseCents,
    markups,
  });
  const resolvedDefaultSalePriceCents =
    syncFinalSalePriceWithSuggested === 1
      ? suggestedSalesPrices.suggested_final_price_cents
      : suggestedFinalPriceBaseCents;
  const resolvedPresentialSalePriceCents =
    syncPresentialSalePriceWithSuggested === 1
      ? suggestedSalesPrices.suggested_presential_price_cents
      : typeof body.presential_sale_price_cents === "number"
        ? body.presential_sale_price_cents
        : suggestedSalesPrices.suggested_presential_price_cents;
  const resolvedWholesaleConsignmentPriceCents =
    syncWholesaleConsignmentPriceWithSuggested === 1
      ? suggestedSalesPrices.suggested_wholesale_consignment_price_cents
      : typeof body.wholesale_consignment_price_cents === "number"
        ? body.wholesale_consignment_price_cents
        : typeof body.suggested_wholesale_consignment_price_cents === "number"
          ? body.suggested_wholesale_consignment_price_cents
          : suggestedSalesPrices.suggested_wholesale_consignment_price_cents;
  const resolvedWholesaleCashPriceCents =
    syncWholesaleCashPriceWithSuggested === 1
      ? suggestedSalesPrices.suggested_wholesale_cash_price_cents
      : typeof body.wholesale_cash_price_cents === "number"
        ? body.wholesale_cash_price_cents
        : typeof body.suggested_wholesale_cash_price_cents === "number"
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
        presential_sale_price_cents, wholesale_consignment_price_cents, wholesale_cash_price_cents,
        sync_final_sale_price_with_suggested, sync_presential_sale_price_with_suggested,
        sync_wholesale_consignment_price_with_suggested, sync_wholesale_cash_price_with_suggested,
        suggested_final_price_cents, suggested_presential_price_cents,
        suggested_wholesale_consignment_price_cents, suggested_wholesale_cash_price_cents,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
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
      resolvedPresentialSalePriceCents,
      resolvedWholesaleConsignmentPriceCents,
      resolvedWholesaleCashPriceCents,
      syncFinalSalePriceWithSuggested,
      syncPresentialSalePriceWithSuggested,
      syncWholesaleConsignmentPriceWithSuggested,
      syncWholesaleCashPriceWithSuggested,
      suggestedSalesPrices.suggested_final_price_cents,
      suggestedSalesPrices.suggested_presential_price_cents,
      suggestedSalesPrices.suggested_wholesale_consignment_price_cents,
      suggestedSalesPrices.suggested_wholesale_cash_price_cents,
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

    const insertBarcode = db.prepare(
      `INSERT INTO sales_sku_barcodes (id, sku_id, barcode_value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const barcode of normalizedBarcodes) {
      insertBarcode.run(uuidv4(), id, barcode, now, now);
    }
  });

  tx();
  reply.code(201);
  const created = db.prepare("SELECT * FROM sales_skus WHERE id = ?").get(id) as any;
  return withSkuContributionMargin(
    { ...created, barcodes: getSkuBarcodes(id) },
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
  const hasBarcodesField = Object.prototype.hasOwnProperty.call(rawBody, "barcodes");
  const hasSyncField = Object.prototype.hasOwnProperty.call(rawBody, "sync_with_quote_pricing");
  const now = nowIso();
  const normalizedBarcodes = normalizeSkuBarcodes(body.barcodes);

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
  const syncFinalSalePriceWithSuggested =
    typeof body.sync_final_sale_price_with_suggested === "boolean"
      ? body.sync_final_sale_price_with_suggested
        ? 1
        : 0
      : Number(existing.sync_final_sale_price_with_suggested ?? 1);
  const syncPresentialSalePriceWithSuggested =
    typeof body.sync_presential_sale_price_with_suggested === "boolean"
      ? body.sync_presential_sale_price_with_suggested
        ? 1
        : 0
      : Number(existing.sync_presential_sale_price_with_suggested ?? 1);
  const syncWholesaleConsignmentPriceWithSuggested =
    typeof body.sync_wholesale_consignment_price_with_suggested === "boolean"
      ? body.sync_wholesale_consignment_price_with_suggested
        ? 1
        : 0
      : Number(existing.sync_wholesale_consignment_price_with_suggested ?? 1);
  const syncWholesaleCashPriceWithSuggested =
    typeof body.sync_wholesale_cash_price_with_suggested === "boolean"
      ? body.sync_wholesale_cash_price_with_suggested
        ? 1
        : 0
      : Number(existing.sync_wholesale_cash_price_with_suggested ?? 1);

  const resolvedName =
    body.name.trim() ||
    (body.copy_from_quote && sourceQuote ? String(sourceQuote.print_name ?? "").trim() : "") ||
    String(existing.name ?? "").trim();

  const resolvedDescription =
    body.description.trim() ||
    (body.copy_from_quote && sourceQuote ? String(sourceQuote.description ?? "").trim() : "") ||
    String(existing.description ?? "").trim();

  const suggestedFinalPriceBaseCents =
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
    finalPriceCents: recomputedFromQuote ? recomputedFromQuote.finalUnitCents : suggestedFinalPriceBaseCents,
    markups,
  });
  const resolvedDefaultSalePriceCents =
    syncFinalSalePriceWithSuggested === 1
      ? suggestedSalesPrices.suggested_final_price_cents
      : suggestedFinalPriceBaseCents;
  const resolvedPresentialSalePriceCents =
    syncPresentialSalePriceWithSuggested === 1
      ? suggestedSalesPrices.suggested_presential_price_cents
      : typeof body.presential_sale_price_cents === "number"
        ? body.presential_sale_price_cents
        : Number(existing.presential_sale_price_cents ?? suggestedSalesPrices.suggested_presential_price_cents);
  const resolvedWholesaleConsignmentPriceCents =
    syncWholesaleConsignmentPriceWithSuggested === 1
      ? suggestedSalesPrices.suggested_wholesale_consignment_price_cents
      : typeof body.wholesale_consignment_price_cents === "number"
        ? body.wholesale_consignment_price_cents
        : typeof body.suggested_wholesale_consignment_price_cents === "number"
          ? body.suggested_wholesale_consignment_price_cents
          : Number(
              existing.wholesale_consignment_price_cents ??
                suggestedSalesPrices.suggested_wholesale_consignment_price_cents
            );
  const resolvedWholesaleCashPriceCents =
    syncWholesaleCashPriceWithSuggested === 1
      ? suggestedSalesPrices.suggested_wholesale_cash_price_cents
      : typeof body.wholesale_cash_price_cents === "number"
        ? body.wholesale_cash_price_cents
        : typeof body.suggested_wholesale_cash_price_cents === "number"
          ? body.suggested_wholesale_cash_price_cents
          : Number(existing.wholesale_cash_price_cents ?? suggestedSalesPrices.suggested_wholesale_cash_price_cents);

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
           presential_sale_price_cents = ?, wholesale_consignment_price_cents = ?, wholesale_cash_price_cents = ?,
           sync_final_sale_price_with_suggested = ?, sync_presential_sale_price_with_suggested = ?,
           sync_wholesale_consignment_price_with_suggested = ?, sync_wholesale_cash_price_with_suggested = ?,
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
      resolvedPresentialSalePriceCents,
      resolvedWholesaleConsignmentPriceCents,
      resolvedWholesaleCashPriceCents,
      syncFinalSalePriceWithSuggested,
      syncPresentialSalePriceWithSuggested,
      syncWholesaleConsignmentPriceWithSuggested,
      syncWholesaleCashPriceWithSuggested,
      suggestedSalesPrices.suggested_final_price_cents,
      suggestedSalesPrices.suggested_presential_price_cents,
      suggestedSalesPrices.suggested_wholesale_consignment_price_cents,
      suggestedSalesPrices.suggested_wholesale_cash_price_cents,
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

    if (hasBarcodesField) {
      db.prepare("DELETE FROM sales_sku_barcodes WHERE sku_id = ?").run(id);
      const insertBarcode = db.prepare(
        `INSERT INTO sales_sku_barcodes (id, sku_id, barcode_value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const barcode of normalizedBarcodes) {
        insertBarcode.run(uuidv4(), id, barcode, now, now);
      }
    }
  });

  tx();
  const updated = db.prepare("SELECT * FROM sales_skus WHERE id = ?").get(id) as any;
  return withSkuContributionMargin(
    { ...updated, barcodes: getSkuBarcodes(id) },
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

app.get("/sales/consignment/dashboard", async (request) => {
  const query = consignmentDashboardQuerySchema.parse(request.query ?? {});
  const dateFrom = normalizeDateFilterBoundary(query.date_from?.trim() || null, "start");
  const dateTo = normalizeDateFilterBoundary(query.date_to?.trim() || null, "end");
  const salesPointId = query.sales_point_id?.trim() || null;

  const totals = db
    .prepare(
      `WITH item_totals AS (
         SELECT cbi.id,
                cbi.quantity_sent,
                COALESCE((SELECT SUM(sold_quantity) FROM consignment_sales cs WHERE cs.batch_item_id = cbi.id), 0) AS sold_quantity,
                COALESCE((SELECT SUM(returned_quantity) FROM consignment_returns cr WHERE cr.batch_item_id = cbi.id), 0) AS returned_quantity
         FROM consignment_batch_items cbi
       )
       SELECT
         COALESCE((SELECT SUM(sold_quantity) FROM consignment_sales), 0) AS sold_items_count,
         COALESCE(SUM(item_totals.quantity_sent - item_totals.sold_quantity - item_totals.returned_quantity), 0) AS available_items_count,
         COALESCE((
           SELECT COUNT(*)
           FROM (
             SELECT cb.sales_point_id
             FROM consignment_batch_items cbi
             JOIN consignment_batches cb ON cb.id = cbi.batch_id
             JOIN sales_points sp ON sp.id = cb.sales_point_id
             WHERE sp.is_active = 1
             GROUP BY cb.sales_point_id
             HAVING
               SUM(
                 cbi.quantity_sent
                 - COALESCE((SELECT SUM(sold_quantity) FROM consignment_sales cs WHERE cs.batch_item_id = cbi.id), 0)
                 - COALESCE((SELECT SUM(returned_quantity) FROM consignment_returns cr WHERE cr.batch_item_id = cbi.id), 0)
               ) > 0
           )
         ), 0) AS active_sales_points_count
       FROM item_totals`
    )
    .get() as {
    sold_items_count: number;
    available_items_count: number;
    active_sales_points_count: number;
  };

  const filters = `
    WHERE (? IS NULL OR event_at >= ?)
      AND (? IS NULL OR event_at <= ?)
      AND (? IS NULL OR sales_point_id = ?)
  `;
  const params = [dateFrom, dateFrom, dateTo, dateTo, salesPointId, salesPointId];

  const movements = db
    .prepare(
      `WITH movements AS (
         SELECT 'sent' AS movement_type,
                cbi.id AS batch_item_id,
                cb.id AS batch_id,
                cb.sales_point_id,
                sp.name AS sales_point_name,
                cbi.sku_id,
                s.sku_code,
                s.name AS sku_name,
                cbi.quantity_sent AS quantity,
                cb.dispatched_at AS event_at,
                cb.notes AS notes,
                cb.created_at
         FROM consignment_batch_items cbi
         JOIN consignment_batches cb ON cb.id = cbi.batch_id
         JOIN sales_points sp ON sp.id = cb.sales_point_id
         JOIN sales_skus s ON s.id = cbi.sku_id
         UNION ALL
         SELECT 'sold' AS movement_type,
                cbi.id AS batch_item_id,
                cb.id AS batch_id,
                cb.sales_point_id,
                sp.name AS sales_point_name,
                cbi.sku_id,
                s.sku_code,
                s.name AS sku_name,
                cs.sold_quantity AS quantity,
                cs.sold_at AS event_at,
                cs.notes AS notes,
                cs.created_at
         FROM consignment_sales cs
         JOIN consignment_batch_items cbi ON cbi.id = cs.batch_item_id
         JOIN consignment_batches cb ON cb.id = cbi.batch_id
         JOIN sales_points sp ON sp.id = cb.sales_point_id
         JOIN sales_skus s ON s.id = cbi.sku_id
         UNION ALL
         SELECT 'returned' AS movement_type,
                cbi.id AS batch_item_id,
                cb.id AS batch_id,
                cb.sales_point_id,
                sp.name AS sales_point_name,
                cbi.sku_id,
                s.sku_code,
                s.name AS sku_name,
                cr.returned_quantity AS quantity,
                cr.returned_at AS event_at,
                cr.notes AS notes,
                cr.created_at
         FROM consignment_returns cr
         JOIN consignment_batch_items cbi ON cbi.id = cr.batch_item_id
         JOIN consignment_batches cb ON cb.id = cbi.batch_id
         JOIN sales_points sp ON sp.id = cb.sales_point_id
         JOIN sales_skus s ON s.id = cbi.sku_id
       )
       SELECT *
       FROM movements
       ${filters}
       ORDER BY event_at DESC, created_at DESC
       LIMIT ?`
    )
    .all(...params, query.limit);

  return {
    generated_at: nowIso(),
    totals,
    filters: {
      date_from: dateFrom,
      date_to: dateTo,
      sales_point_id: salesPointId,
    },
    movements,
  };
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

app.post("/sales/consignment/points/:pointId/sales", async (request, reply) => {
  const { pointId } = request.params as { pointId: string };
  const body = consignmentPointSaleSchema.parse(request.body);
  const point = db.prepare("SELECT id FROM sales_points WHERE id = ? AND is_active = 1").get(pointId) as any;
  if (!point) {
    reply.code(404);
    return { message: "Sales point not found or inactive" };
  }

  const candidates = getOpenConsignmentBatchItemsForPointSku(pointId, body.sku_id);
  const totalAvailable = candidates.reduce((sum, item) => sum + item.remaining_quantity, 0);
  if (totalAvailable < body.sold_quantity) {
    reply.code(400);
    return { message: "Sold quantity exceeds stock at point", available_quantity: totalAvailable };
  }

  const now = nowIso();
  const soldAt = body.sold_at?.trim() || now;
  let remaining = body.sold_quantity;
  const saleIds: string[] = [];
  const tx = db.transaction(() => {
    for (const item of candidates) {
      if (remaining <= 0) break;
      const quantity = Math.min(remaining, item.remaining_quantity);
      const saleId = uuidv4();
      saleIds.push(saleId);
      db.prepare(
        `INSERT INTO consignment_sales (id, batch_item_id, sold_quantity, sold_at, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(saleId, item.id, quantity, soldAt, body.notes.trim() || null, now, now);
      remaining -= quantity;
    }
  });
  tx();

  appendOperationLog({
    eventType: "consignment_sale_registered",
    entityType: "sales_point",
    entityId: pointId,
    summary: "Venda registrada em ponto de consignação",
    payload: {
      sales_point_id: pointId,
      sku_id: body.sku_id,
      sold_quantity: body.sold_quantity,
      sold_at: soldAt,
      sale_ids: saleIds,
      notes: body.notes.trim() || null,
    },
  });

  reply.code(201);
  return { ok: true, sales_point_id: pointId, sku_id: body.sku_id, sold_quantity: body.sold_quantity, sale_ids: saleIds };
});

app.post("/sales/consignment/points/:pointId/returns", async (request, reply) => {
  const { pointId } = request.params as { pointId: string };
  const body = consignmentPointReturnSchema.parse(request.body);
  const point = db.prepare("SELECT id FROM sales_points WHERE id = ? AND is_active = 1").get(pointId) as any;
  if (!point) {
    reply.code(404);
    return { message: "Sales point not found or inactive" };
  }

  const candidates = getOpenConsignmentBatchItemsForPointSku(pointId, body.sku_id);
  const totalAvailable = candidates.reduce((sum, item) => sum + item.remaining_quantity, 0);
  if (totalAvailable < body.returned_quantity) {
    reply.code(400);
    return { message: "Returned quantity exceeds stock at point", available_quantity: totalAvailable };
  }

  const now = nowIso();
  const returnedAt = body.returned_at?.trim() || now;
  let remaining = body.returned_quantity;
  const returnIds: string[] = [];
  const tx = db.transaction(() => {
    for (const item of candidates) {
      if (remaining <= 0) break;
      const quantity = Math.min(remaining, item.remaining_quantity);
      const returnId = uuidv4();
      returnIds.push(returnId);
      db.prepare(
        `INSERT INTO consignment_returns (id, batch_item_id, returned_quantity, returned_at, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(returnId, item.id, quantity, returnedAt, body.notes.trim() || null, now, now);
      db.prepare(
        `INSERT INTO stock_movements (
          id, sku_id, movement_type, quantity_delta, occurred_at, reference_type, reference_id, notes, created_at, updated_at
        ) VALUES (?, ?, 'consignment_return', ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(),
        body.sku_id,
        quantity,
        returnedAt,
        "consignment_batch_item",
        item.id,
        body.notes.trim() || null,
        now,
        now
      );
      remaining -= quantity;
    }
  });
  tx();

  appendOperationLog({
    eventType: "consignment_return_registered",
    entityType: "sales_point",
    entityId: pointId,
    summary: "Retirada registrada em ponto de consignação",
    payload: {
      sales_point_id: pointId,
      sku_id: body.sku_id,
      returned_quantity: body.returned_quantity,
      returned_at: returnedAt,
      return_ids: returnIds,
      notes: body.notes.trim() || null,
    },
  });

  reply.code(201);
  return {
    ok: true,
    sales_point_id: pointId,
    sku_id: body.sku_id,
    returned_quantity: body.returned_quantity,
    return_ids: returnIds,
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

type ScheduledMercadoLivreOrdersMode = "incremental" | "light" | "normal";
type ScheduledMercadoLivreOrdersJob = {
  mode: ScheduledMercadoLivreOrdersMode;
  label: string;
  intervalMinutes: number;
};

function parseSchedulerIntervalMinutes(envName: string, defaultMinutes: number): number {
  const raw = (process.env[envName] ?? "").trim();
  if (!raw) return defaultMinutes;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultMinutes;
  return parsed;
}

function isOrdersSchedulerEnabled(): boolean {
  const raw = (process.env.ML_ORDERS_SYNC_SCHEDULER_ENABLED ?? "true").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(raw);
}

function getMercadoLivreOrdersSchedulerJobs(): ScheduledMercadoLivreOrdersJob[] {
  return [
    {
      mode: "incremental",
      label: "últimas vendas",
      intervalMinutes: parseSchedulerIntervalMinutes("ML_ORDERS_SYNC_INCREMENTAL_INTERVAL_MINUTES", 10),
    },
    {
      mode: "light",
      label: "últimas 48h",
      intervalMinutes: parseSchedulerIntervalMinutes("ML_ORDERS_SYNC_48H_INTERVAL_MINUTES", 120),
    },
    {
      mode: "normal",
      label: "últimos 60 dias",
      intervalMinutes: parseSchedulerIntervalMinutes("ML_ORDERS_SYNC_60D_INTERVAL_MINUTES", 1440),
    },
  ];
}

function parseSchedulerTickMs(): number {
  const raw = (process.env.ML_ORDERS_SYNC_SCHEDULER_TICK_SECONDS ?? "").trim();
  const parsed = raw ? Number(raw) : 60;
  const seconds = Number.isFinite(parsed) && parsed >= 0 ? parsed : 60;
  return Math.max(5, seconds) * 1000;
}

function getSchedulerStateRow(accountId: string, mode: ScheduledMercadoLivreOrdersMode) {
  return db
    .prepare(
      `SELECT id, marketplace, account_id, mode, interval_minutes, last_started_at, last_finished_at,
              last_status, last_run_id, last_message, updated_at
       FROM marketplace_order_sync_scheduler_state
       WHERE marketplace = 'mercadolivre'
         AND account_id = ?
         AND mode = ?`
    )
    .get(accountId, mode) as
    | {
        id: string;
        marketplace: string;
        account_id: string;
        mode: ScheduledMercadoLivreOrdersMode;
        interval_minutes: number;
        last_started_at: string | null;
        last_finished_at: string | null;
        last_status: string | null;
        last_run_id: string | null;
        last_message: string | null;
        updated_at: string;
      }
    | undefined;
}

function computeSchedulerNextRunAt(
  lastStartedAt: string | null | undefined,
  intervalMinutes: number
): string | null {
  if (intervalMinutes <= 0) return null;
  const lastMs = Date.parse(lastStartedAt ?? "");
  if (!Number.isFinite(lastMs)) return nowIso();
  return new Date(lastMs + intervalMinutes * 60 * 1000).toISOString();
}

function isSchedulerJobDue(accountId: string, job: ScheduledMercadoLivreOrdersJob): boolean {
  if (job.intervalMinutes <= 0) return false;
  const state = getSchedulerStateRow(accountId, job.mode);
  const lastMs = Date.parse(state?.last_started_at ?? "");
  if (!Number.isFinite(lastMs)) return true;
  return Date.now() - lastMs >= job.intervalMinutes * 60 * 1000;
}

function markSchedulerJobStarted(accountId: string, job: ScheduledMercadoLivreOrdersJob, startedAt: string): void {
  db.prepare(
    `INSERT INTO marketplace_order_sync_scheduler_state (
      id, marketplace, account_id, mode, interval_minutes, last_started_at, last_finished_at,
      last_status, last_run_id, last_message, updated_at
    ) VALUES (?, 'mercadolivre', ?, ?, ?, ?, NULL, 'running', NULL, NULL, ?)
    ON CONFLICT(marketplace, account_id, mode) DO UPDATE SET
      interval_minutes = excluded.interval_minutes,
      last_started_at = excluded.last_started_at,
      last_status = excluded.last_status,
      last_message = NULL,
      updated_at = excluded.updated_at`
  ).run(uuidv4(), accountId, job.mode, Math.round(job.intervalMinutes), startedAt, startedAt);
}

function markSchedulerJobFinished(params: {
  accountId: string;
  job: ScheduledMercadoLivreOrdersJob;
  finishedAt: string;
  status: "success" | "error";
  runId?: string | null;
  message?: string | null;
}): void {
  db.prepare(
    `INSERT INTO marketplace_order_sync_scheduler_state (
      id, marketplace, account_id, mode, interval_minutes, last_started_at, last_finished_at,
      last_status, last_run_id, last_message, updated_at
    ) VALUES (?, 'mercadolivre', ?, ?, ?, NULL, ?, ?, ?, ?, ?)
    ON CONFLICT(marketplace, account_id, mode) DO UPDATE SET
      interval_minutes = excluded.interval_minutes,
      last_finished_at = excluded.last_finished_at,
      last_status = excluded.last_status,
      last_run_id = excluded.last_run_id,
      last_message = excluded.last_message,
      updated_at = excluded.updated_at`
  ).run(
    uuidv4(),
    params.accountId,
    params.job.mode,
    Math.round(params.job.intervalMinutes),
    params.finishedAt,
    params.status,
    params.runId ?? null,
    params.message ?? null,
    params.finishedAt
  );
}

function getMercadoLivreOrderSchedulerStateForAccount(accountId: string) {
  return getMercadoLivreOrdersSchedulerJobs().map((job) => {
    const state = getSchedulerStateRow(accountId, job.mode);
    return {
      mode: job.mode,
      label: job.label,
      enabled: isOrdersSchedulerEnabled() && job.intervalMinutes > 0,
      interval_minutes: job.intervalMinutes,
      last_started_at: state?.last_started_at ?? null,
      last_finished_at: state?.last_finished_at ?? null,
      last_status: state?.last_status ?? null,
      last_run_id: state?.last_run_id ?? null,
      last_message: state?.last_message ?? null,
      next_run_at: computeSchedulerNextRunAt(state?.last_started_at, job.intervalMinutes),
    };
  });
}

function startMercadoLivreOrdersScheduler(): NodeJS.Timeout[] {
  if (!isOrdersSchedulerEnabled()) {
    app.log.info("Mercado Livre orders scheduler disabled.");
    return [];
  }

  const jobs = getMercadoLivreOrdersSchedulerJobs().filter((job) => job.intervalMinutes > 0);
  if (jobs.length === 0) {
    app.log.info("Mercado Livre orders scheduler has no enabled jobs.");
    return [];
  }

  const runningKeys = new Set<string>();
  const timers: NodeJS.Timeout[] = [];

  const runJob = async (accountId: string, job: ScheduledMercadoLivreOrdersJob) => {
    return runWithSpan(
      "mercadolivre.scheduler.orders",
      {
        "marketplace.name": "mercadolivre",
        "marketplace.account_id": accountId,
        "marketplace.scheduler.job_mode": job.mode,
        "marketplace.scheduler.interval_minutes": job.intervalMinutes,
      },
      async (span) => {
        const key = accountId;
        if (runningKeys.has(key)) {
          span.setAttribute("marketplace.scheduler.skipped", true);
          span.setAttribute("marketplace.scheduler.skip_reason", "scheduler_job_already_running");
          appendOperationLog({
            eventType: "marketplace_orders_read_failed",
            entityType: "marketplace_scheduler",
            summary: "Sincronização automática de pedidos Mercado Livre ignorada: tarefa já em execução",
            payload: {
              marketplace: "mercadolivre",
              account_id: accountId,
              sync_type: "orders_read",
              sync_mode: job.mode,
              sync_source: "scheduler",
              phase: "skipped",
              message: "Tarefa agendada já estava em execução para esta conta.",
            },
          });
          app.log.info({ account_id: accountId, mode: job.mode }, "Skipping scheduled orders sync already running.");
          return;
        }
        if (marketplaceOrdersSyncRunningAccounts.has(accountId)) {
          span.setAttribute("marketplace.scheduler.skipped", true);
          span.setAttribute("marketplace.scheduler.skip_reason", "account_sync_already_running");
          appendOperationLog({
            eventType: "marketplace_orders_read_failed",
            entityType: "marketplace_scheduler",
            summary: "Sincronização automática de pedidos Mercado Livre ignorada: conta ocupada",
            payload: {
              marketplace: "mercadolivre",
              account_id: accountId,
              sync_type: "orders_read",
              sync_mode: job.mode,
              sync_source: "scheduler",
              phase: "skipped",
              message: "Já existe uma sincronização em andamento para esta conta.",
            },
          });
          app.log.info({ account_id: accountId, mode: job.mode }, "Skipping scheduled orders sync because account is busy.");
          return;
        }

        runningKeys.add(key);
        const startedAt = nowIso();
        markSchedulerJobStarted(accountId, job, startedAt);

        try {
          app.log.info({ account_id: accountId, mode: job.mode }, "Starting scheduled Mercado Livre orders sync.");
          const response = await app.inject({
            method: "POST",
            url: "/integrations/mercadolivre/sync/orders",
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({ account_id: accountId, mode: job.mode, source: "scheduler" }),
          });

          const finishedAt = nowIso();
          let parsed = {} as { run_id?: string; message?: string };
          try {
            parsed = response.json<{ run_id?: string; message?: string }>();
          } catch {
            parsed = {};
          }
          span.setAttribute("marketplace.scheduler.status_code", response.statusCode);
          if (parsed.run_id) {
            span.setAttribute("marketplace.sync.run_id", parsed.run_id);
          }
          if (response.statusCode >= 400) {
        markSchedulerJobFinished({
          accountId,
          job,
          finishedAt,
          status: "error",
          runId: parsed.run_id ?? null,
          message: parsed.message ?? response.body,
        });
        if (!parsed.run_id) {
          appendOperationLog({
            eventType: "marketplace_orders_read_failed",
            entityType: "marketplace_scheduler",
            summary: "Sincronização automática de pedidos Mercado Livre não iniciada",
            payload: {
              marketplace: "mercadolivre",
              account_id: accountId,
              sync_type: "orders_read",
              sync_mode: job.mode,
              sync_source: "scheduler",
              phase: "error",
              status_code: response.statusCode,
              message: parsed.message ?? response.body,
            },
          });
        }
        app.log.error(
          { account_id: accountId, mode: job.mode, status_code: response.statusCode, body: response.body },
          "Scheduled Mercado Livre orders sync failed."
        );
          } else {
            if (job.mode === "incremental") {
              const adsResponse = await app.inject({
                method: "POST",
                url: "/integrations/mercadolivre/sync/product-ads",
                headers: { "content-type": "application/json" },
                payload: JSON.stringify({ account_id: accountId, mode: "incremental", source: "scheduler" }),
              });
              let parsedAds = {} as { run_id?: string; records_read?: number; records_upserted?: number; records_failed?: number; message?: string };
              try {
                parsedAds = adsResponse.json<{
                  run_id?: string;
                  records_read?: number;
                  records_upserted?: number;
                  records_failed?: number;
                  message?: string;
                }>();
              } catch {
                parsedAds = {};
              }
              span.setAttribute("marketplace.scheduler.product_ads_status_code", adsResponse.statusCode);
              if (parsedAds.run_id) {
                span.setAttribute("marketplace.scheduler.product_ads_run_id", parsedAds.run_id);
              }
              span.addEvent("product_ads.scheduler.finished", {
                "marketplace.account_id": accountId,
                "marketplace.scheduler.product_ads_status_code": adsResponse.statusCode,
                "marketplace.sync.run_id": parsedAds.run_id ?? "",
                "marketplace.sync.records_read": parsedAds.records_read ?? 0,
                "marketplace.sync.records_upserted": parsedAds.records_upserted ?? 0,
                "marketplace.sync.records_failed": parsedAds.records_failed ?? 0,
              });
              if (adsResponse.statusCode >= 400) {
                appendOperationLog({
                  eventType: "marketplace_product_ads_read_failed",
                  entityType: "marketplace_scheduler",
                  summary: "Sincronização automática de Product Ads Mercado Livre falhou",
                  payload: {
                    marketplace: "mercadolivre",
                    account_id: accountId,
                    sync_type: "product_ads_read",
                    sync_mode: "incremental",
                    sync_source: "scheduler",
                    phase: "error",
                    status_code: adsResponse.statusCode,
                    run_id: parsedAds.run_id ?? null,
                    message: parsedAds.message ?? adsResponse.body,
                  },
                });
                app.log.error(
                  { account_id: accountId, mode: job.mode, status_code: adsResponse.statusCode, body: adsResponse.body },
                  "Scheduled Mercado Livre Product Ads sync failed."
                );
              }
            }

        markSchedulerJobFinished({
          accountId,
          job,
          finishedAt,
          status: "success",
          runId: parsed.run_id ?? null,
          message: null,
        });
        app.log.info(
          { account_id: accountId, mode: job.mode, status_code: response.statusCode },
          "Scheduled Mercado Livre orders sync finished."
        );
          }
        } catch (error: any) {
      markSchedulerJobFinished({
        accountId,
        job,
        finishedAt: nowIso(),
        status: "error",
        message: error?.message ?? "Scheduled sync crashed.",
      });
      appendOperationLog({
        eventType: "marketplace_orders_read_failed",
        entityType: "marketplace_scheduler",
        summary: "Sincronização automática de pedidos Mercado Livre falhou antes de concluir",
        payload: {
          marketplace: "mercadolivre",
          account_id: accountId,
          sync_type: "orders_read",
          sync_mode: job.mode,
          sync_source: "scheduler",
          phase: "error",
          message: error?.message ?? "Scheduled sync crashed.",
        },
      });
      app.log.error({ account_id: accountId, mode: job.mode, error }, "Scheduled Mercado Livre orders sync crashed.");
        } finally {
      runningKeys.delete(key);
        }
      }
    );
  };

  const tick = async () => {
    const accountIds = listActiveMercadoLivreAccountIds();
    if (accountIds.length === 0) return;

    for (const accountId of accountIds) {
      for (const job of jobs) {
        if (runningKeys.has(accountId)) break;
        if (!isSchedulerJobDue(accountId, job)) continue;
        void runJob(accountId, job);
        break;
      }
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, parseSchedulerTickMs());
  timers.push(timer);
  void tick();

  for (const job of jobs) {
    app.log.info(
      { mode: job.mode, label: job.label, interval_minutes: job.intervalMinutes },
      "Mercado Livre orders scheduler job registered."
    );
  }

  return timers;
}

const port = Number(process.env.PORT || 3333);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`Backend running on http://localhost:${port}`);
    startMercadoLivreOrdersScheduler();
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
