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
  | "quoteView";

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

async function uploadMediaFile(file: File, mediaType: "photo" | "video" | "3mf", quoteId: string) {
  const form = new FormData();
  form.append("quote_id", quoteId);
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
    media3mf,
    mediaPhotos,
    mediaVideos,
    filamentUsages,
    extraCosts,
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

  const filamentUnitTotalCents = quote.filamentUsages.reduce((sum, line) => {
    const filament = filaments.find((item) => item.name === line.filamentName);
    const unitCostPerGramCents = filament
      ? filament.purchaseCostCents / filament.purchasedWeightGrams
      : 0;
    const lineTotalCents = Math.round(line.usedWeightGrams * unitCostPerGramCents);
    return sum + lineTotalCents;
  }, 0);

  const extrasUnitTotalCents = quote.extraCosts.reduce((sum, item) => sum + item.itemCostCents, 0);
  const packagingBatchTotalCents = quote.packagingCostCents * unitsProduced;

  const subtotalBatchCents =
    filamentUnitTotalCents * unitsProduced +
    extrasUnitTotalCents * unitsProduced +
    packagingBatchTotalCents +
    energyTotalCents +
    paybackTotalCents +
    laborTotalCents;
  const taxBatchCents = Math.round(subtotalBatchCents * (taxRatePercent / 100));
  const finalBatchCents = Math.round((subtotalBatchCents + taxBatchCents) * (1 + markupPercent / 100));

  return {
    subtotalUnitCents: Math.round(subtotalBatchCents / unitsProduced),
    taxUnitCents: Math.round(taxBatchCents / unitsProduced),
    finalUnitCents: Math.round(finalBatchCents / unitsProduced),
    subtotalBatchCents,
    taxBatchCents,
    finalBatchCents,
  };
}

const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
}: {
  active?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.navButton, active && styles.navButtonActive]}>
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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "numeric";
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[styles.input, multiline && styles.textArea]}
        keyboardType={keyboardType ?? "default"}
        multiline={multiline}
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

  useEffect(() => {
    setName(initialData?.name ?? "");
    setBrand(initialData?.brand ?? "");
    setWeight(initialData ? String(initialData.purchasedWeightGrams) : "");
    setCost(initialData ? String(initialData.purchaseCostCents / 100) : "");
    setColor(initialData?.color ?? "");
    setMaterial(initialData?.materialType ?? "");
    setLink(initialData?.purchaseLink ?? "");
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
  onChangeLaborHourCost,
  onChangeTaxRate,
  onChangeEnergyCostKwh,
  onChangePaybackMonths,
  onSave,
  savedItems,
}: {
  laborHourCost: string;
  taxRate: string;
  energyCostKwh: string;
  paybackMonths: string;
  onChangeLaborHourCost: (value: string) => void;
  onChangeTaxRate: (value: string) => void;
  onChangeEnergyCostKwh: (value: string) => void;
  onChangePaybackMonths: (value: string) => void;
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
        return (
          <View key={q.id} style={styles.card}>
            <Text style={styles.cardTitle}>{q.name}</Text>
            <Text style={styles.text}>Tempo impressao: {q.printTimeMin} min</Text>
            <Text style={styles.text}>Tempo pós-produção: {q.postProcessingMin} min</Text>
            <Text style={styles.text}>Unidades: {Math.max(1, q.unitsProduced || 1)}</Text>
            <Text style={styles.text}>Custo producao (un): {money(totals.subtotalUnitCents)}</Text>
            <Text style={styles.text}>Custo producao (lote): {money(totals.subtotalBatchCents)}</Text>
            <Text style={styles.text}>Preco venda (un): {money(totals.finalUnitCents)}</Text>
            <Text style={styles.text}>Preco venda (lote): {money(totals.finalBatchCents)}</Text>
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
      batchTotalCents: lineTotalCents * unitsProduced,
    };
  });

  const filamentUnitTotalCents = filamentLines.reduce((sum, line) => sum + line.lineTotalCents, 0);
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

  const mediaItems = [
    ...quote.media3mf.map((uri) => ({ mediaType: "3mf", uri })),
    ...quote.mediaPhotos.map((uri) => ({ mediaType: "photo", uri })),
    ...quote.mediaVideos.map((uri) => ({ mediaType: "video", uri })),
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Orçamento Finalizado</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{quote.name}</Text>
        <Text style={styles.text}>Impressora: {printer ? `${printer.name} (${printer.model})` : "Nao definida"}</Text>
        <Text style={styles.text}>Unidades produzidas: {unitsProduced}</Text>
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
        <Text style={styles.cardTitle}>Filamentos (por item)</Text>
        {filamentLines.length === 0 && <Text style={styles.text}>Sem filamentos informados.</Text>}
        {filamentLines.map((line) => (
          <Text key={line.id} style={styles.text}>
            - {line.filamentName}: {line.usedWeightGrams}g x {money(Math.round(line.unitCostPerGramCents))}/g ={" "}
            {money(line.lineTotalCents)} por unidade | {money(line.batchTotalCents)} no lote
          </Text>
        ))}
        <Text style={styles.text}>Total filamentos: {money(filamentUnitTotalCents)} por unidade</Text>
        <Text style={styles.text}>Total filamentos no lote: {money(filamentBatchTotalCents)}</Text>
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
        <Text style={styles.text}>Total extras: {money(extrasUnitTotalCents)} por unidade</Text>
        <Text style={styles.text}>Total extras no lote: {money(extrasBatchTotalCents)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Resumo final</Text>
        <Text style={styles.text}>Custo final de producao: {money(totals.subtotalUnitCents)} por unidade</Text>
        <Text style={styles.text}>Custo de imposto: {money(totals.taxUnitCents)} por unidade</Text>
        <Text style={styles.text}>Valor final com markup: {money(totals.finalUnitCents)} por unidade</Text>
        <Text style={styles.text}>Total de producao no lote: {money(totals.subtotalBatchCents)}</Text>
        <Text style={styles.text}>Total de imposto no lote: {money(totals.taxBatchCents)}</Text>
        <Text style={styles.text}>Total com markup no lote: {money(totals.finalBatchCents)}</Text>
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
  taxRatePercent,
  onSave,
  onCancel,
}: {
  initialData?: Quote;
  filaments: Filament[];
  printers: Printer[];
  taxRatePercent: number;
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

    for (const file of files) {
      const uploaded = await uploadMediaFile(file, type, quoteDraftId);
      if (type === "3mf") {
        setMedia3mfList((prev) => [...prev, uploaded.local_uri]);
      } else if (type === "photo") {
        setMediaPhotos((prev) => [...prev, uploaded.local_uri]);
      } else {
        setMediaVideos((prev) => [...prev, uploaded.local_uri]);
      }
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

  const handleSave = () => {
    const parsedPrintTime = parseLocaleNumber(printTime);
    const parsedPostTime = parseLocaleNumber(postTime);
    const parsedPackaging = Math.round(parseLocaleNumber(packagingCost) * 100);
    const parsedUnitsProduced = Math.max(1, Math.round(parseLocaleNumber(unitsProduced) || 1));

    if (
      !name.trim() ||
      !Number.isFinite(parsedPrintTime) ||
      !Number.isFinite(parsedPostTime) ||
      !Number.isFinite(parsedPackaging) ||
      !selectedPrinterId,
      parsedPrintTime < 0 ||
      parsedPostTime < 0 ||
      parsedPackaging < 0
    ) {
      return;
    }

    const filamentCost = filamentList.reduce((sum, line) => sum + line.usedWeightGrams * 2, 0);
    const extraCostCents = extraList.reduce((sum, item) => sum + item.itemCostCents, 0);
    const subtotal = filamentCost + extraCostCents + parsedPackaging;
    const taxCostCents = Math.round(subtotal * (taxRatePercent / 100));
    const finalWithMarkupCents = Math.round((subtotal + taxCostCents) * 1.65);

    onSave({
      id: quoteDraftId,
      printerId: selectedPrinterId,
      name: name.trim(),
      description: description.trim(),
      unitsProduced: parsedUnitsProduced,
      printTimeMin: parsedPrintTime,
      postProcessingMin: parsedPostTime,
      packagingCostCents: parsedPackaging,
      productionCostCents: subtotal,
      taxCostCents,
      salePriceCents: finalWithMarkupCents,
      media3mf: media3mfList,
      mediaPhotos,
      mediaVideos,
      filamentUsages: filamentList,
      extraCosts: extraList,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>{initialData ? "Editar Orçamento" : "Novo Orçamento"}</Text>

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
        <Field label="Tempo de impressao (min)" value={printTime} onChangeText={setPrintTime} keyboardType="numeric" />
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
  const [activeCostSettingId, setActiveCostSettingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);
  const [editingFilamentId, setEditingFilamentId] = useState<string | null>(null);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [viewingQuoteId, setViewingQuoteId] = useState<string | null>(null);

  const [laborHourCost, setLaborHourCost] = useState("45");
  const [taxRate, setTaxRate] = useState("8");
  const [energyCostKwh, setEnergyCostKwh] = useState(String(costSettings.energyCostKwhCents));
  const [paybackMonths, setPaybackMonths] = useState(String(costSettings.paybackMonths));
  const [savedCosts, setSavedCosts] = useState<string[]>([]);

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
    };
    return map[screen];
  }, [screen, currentPrinter, currentFilament, currentQuote]);

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

  const fetchActiveCostSettings = async () => {
    const settings = await apiFetch<any | null>("/cost-settings/active");
    if (!settings) return;
    setActiveCostSettingId(settings.id);
    setLaborHourCost(String((settings.labor_hour_cost_cents ?? 0) / 100));
    setEnergyCostKwh(String(settings.energy_cost_kwh_cents ?? 0));
    setTaxRate(String((settings.tax_rate_bps ?? 0) / 100));
    setPaybackMonths(String(settings.printer_payback_months ?? 24));
  };

  useEffect(() => {
    const loadAll = async () => {
      setIsSyncing(true);
      setSyncError(null);
      try {
        await Promise.all([fetchPrinters(), fetchFilaments(), fetchQuotes(), fetchActiveCostSettings()]);
      } catch (error: any) {
        setSyncError(error?.message ?? "Falha ao sincronizar com backend");
      } finally {
        setIsSyncing(false);
      }
    };
    void loadAll();
  }, []);

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
        <NavButton label="Home" active={screen === "dashboard"} onPress={() => setScreen("dashboard")} />
        <NavButton label="Impressoras" active={screen === "printers"} onPress={() => setScreen("printers")} />
        <NavButton label="Filamentos" active={screen === "filaments"} onPress={() => setScreen("filaments")} />
        <NavButton label="Custos" active={screen === "fixedCosts"} onPress={() => setScreen("fixedCosts")} />
        <NavButton label="Orçamentos" active={screen === "quotes"} onPress={() => setScreen("quotes")} />
        </View>
      </View>

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
                await fetchFilaments();
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
          onChangeLaborHourCost={setLaborHourCost}
          onChangeTaxRate={setTaxRate}
          onChangeEnergyCostKwh={setEnergyCostKwh}
          onChangePaybackMonths={setPaybackMonths}
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
                    markup_bps: 6500,
                    is_active: 1,
                  }),
                });
                setActiveCostSettingId(created.id);
                setSavedCosts((prev) => [
                  ...prev,
                  `Hora/homem: R$ ${laborHourCost} | kWh: ${energyCostKwh} centavos | Imposto: ${taxRate}% | Payback: ${paybackMonths} meses`,
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
          markupPercent={65}
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
          taxRatePercent={parseLocaleNumber(taxRate) || 0}
          onSave={(quote) => {
            void (async () => {
              try {
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
                await fetchQuotes();
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
          markupPercent={65}
          onBack={() => {
            setViewingQuoteId(null);
            setScreen("quotes");
          }}
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
    height: 56,
    paddingHorizontal: 8,
    backgroundColor: "#ffffff",
  },
  navRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navButton: {
    flex: 1,
    height: 36,
    minWidth: 0,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "#e8ecf7",
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonActive: {
    backgroundColor: "#213b74",
  },
  navButtonText: {
    color: "#23314f",
    fontSize: 12,
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
});
