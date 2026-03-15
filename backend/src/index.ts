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

app.get("/health", async () => ({ ok: true }));

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

  const quoteId = readMultipartFieldValue(file.fields as Record<string, unknown> | undefined, "quote_id").trim();
  if (!quoteId) {
    reply.code(400);
    return { message: "quote_id is required" };
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
    ownerType: "quotes",
    ownerId: quoteId,
  });

  reply.code(201);
  return {
    media_type: mediaType,
    local_uri: persisted.relativePath,
    original_name: file.filename,
  };
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

  const tx = db.transaction(() => {
    if (body.is_active === 1) {
      db.prepare("UPDATE cost_settings SET is_active = 0, updated_at = ? WHERE is_active = 1").run(now);
    }

    db.prepare(
      `INSERT INTO cost_settings (
        id, effective_from, labor_hour_cost_cents, energy_cost_kwh_cents,
        tax_rate_bps, printer_payback_months, markup_bps, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      body.effective_from,
      body.labor_hour_cost_cents,
      body.energy_cost_kwh_cents,
      body.tax_rate_bps,
      body.printer_payback_months,
      body.markup_bps,
      body.is_active,
      now,
      now
    );
  });

  tx();
  reply.code(201);
  return db.prepare("SELECT * FROM cost_settings WHERE id = ?").get(id);
});

app.get("/quotes", async () => {
  return db
    .prepare(
      `SELECT q.id, q.print_name, q.status, q.units_produced, q.print_time_minutes,
              q.post_processing_minutes, q.subtotal_cost_cents, q.tax_cost_cents,
              q.final_price_cents, q.created_at, p.name AS printer_name
       FROM print_quotes q
       JOIN printers p ON p.id = q.printer_id
       ORDER BY q.created_at DESC`
    )
    .all();
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
    ...quote,
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
    markupBps: settings.markup_bps,
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

  reply.code(201);
  return {
    id: quoteId,
    subtotal_unit_cents: computed.subtotalUnitCents,
    tax_unit_cents: computed.taxUnitCents,
    final_unit_cents: computed.finalUnitCents,
    subtotal_batch_cents: computed.subtotalBatchCents,
    tax_batch_cents: computed.taxBatchCents,
    final_batch_cents: computed.finalBatchCents,
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
    markupBps: settings.markup_bps,
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

  return {
    id,
    subtotal_unit_cents: computed.subtotalUnitCents,
    tax_unit_cents: computed.taxUnitCents,
    final_unit_cents: computed.finalUnitCents,
    subtotal_batch_cents: computed.subtotalBatchCents,
    tax_batch_cents: computed.taxBatchCents,
    final_batch_cents: computed.finalBatchCents,
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
