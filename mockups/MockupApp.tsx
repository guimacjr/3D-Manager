import React, { useMemo, useState } from "react";
import {
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
  | "quoteNew";

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

type Quote = {
  id: string;
  name: string;
  printTimeMin: number;
  postProcessingMin: number;
  productionCostCents: number;
  salePriceCents: number;
};

const costSettings: CostSettings = {
  energyCostKwhCents: 95,
  paybackMonths: 24,
};

const printers: Printer[] = [
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

const filaments: Filament[] = [
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

const quotes: Quote[] = [
  {
    id: "q1",
    name: "Suporte de Monitor",
    printTimeMin: 320,
    postProcessingMin: 25,
    productionCostCents: 2350,
    salePriceCents: 4600,
  },
  {
    id: "q2",
    name: "Organizador de Cabos",
    printTimeMin: 140,
    postProcessingMin: 15,
    productionCostCents: 980,
    salePriceCents: 2200,
  },
];

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function DashboardScreen({ goTo }: { goTo: (key: ScreenKey) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Dashboard</Text>
      <Text style={styles.pageSubtitle}>Atalhos do modulo de precificacao</Text>
      <Section title="Cadastros">
        <NavButton label="Impressoras" onPress={() => goTo("printers")} />
        <NavButton label="Filamentos" onPress={() => goTo("filaments")} />
        <NavButton label="Custos Fixos" onPress={() => goTo("fixedCosts")} />
      </Section>
      <Section title="Orcamentos">
        <NavButton label="Lista de Orcamentos" onPress={() => goTo("quotes")} />
        <NavButton label="Novo Orcamento" onPress={() => goTo("quoteNew")} />
      </Section>
    </ScrollView>
  );
}

function PrintersScreen({ goTo }: { goTo: (key: ScreenKey) => void }) {
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
              <Pressable style={styles.smallButton}>
                <Text style={styles.smallButtonText}>Editar</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      <Pressable style={styles.primaryButtonFixed} onPress={() => goTo("printerForm")}>
        <Text style={styles.primaryButtonText}>Cadastrar nova impressora</Text>
      </Pressable>
    </ScrollView>
  );
}

function PrinterFormScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Cadastro de Impressora</Text>
      <TextInput placeholder="Nome" style={styles.input} />
      <TextInput placeholder="Modelo" style={styles.input} />
      <TextInput placeholder="Custo (R$)" style={styles.input} keyboardType="numeric" />
      <TextInput
        placeholder="Consumo de energia (W)"
        style={styles.input}
        keyboardType="numeric"
      />
      <View style={styles.row}>
        <Pressable style={styles.primaryButtonFixed}>
          <Text style={styles.primaryButtonText}>Salvar</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancelar</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function FilamentsScreen({ goTo }: { goTo: (key: ScreenKey) => void }) {
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
              <Pressable style={styles.smallButton}>
                <Text style={styles.smallButtonText}>Editar</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      <Pressable style={styles.primaryButtonFixed} onPress={() => goTo("filamentForm")}>
        <Text style={styles.primaryButtonText}>Cadastrar novo filamento</Text>
      </Pressable>
    </ScrollView>
  );
}

function FilamentFormScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Cadastro de Filamento</Text>
      <TextInput placeholder="Nome do filamento" style={styles.input} />
      <TextInput placeholder="Marca do filamento" style={styles.input} />
      <TextInput placeholder="Quantidade comprada (g)" style={styles.input} keyboardType="numeric" />
      <TextInput placeholder="Valor pago (R$)" style={styles.input} keyboardType="numeric" />
      <TextInput placeholder="Cor" style={styles.input} />
      <TextInput placeholder="Tipo (PLA, PETG, ASA...)" style={styles.input} />
      <TextInput placeholder="Link de compra" style={styles.input} />
      <View style={styles.row}>
        <Pressable style={styles.primaryButtonFixed}>
          <Text style={styles.primaryButtonText}>Salvar</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancelar</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function FixedCostsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Custos Fixos</Text>
      <View style={styles.card}>
        <Text style={styles.text}>Custo hora/homem: {money(4500)}</Text>
        <Text style={styles.text}>Custo energia kWh: {money(costSettings.energyCostKwhCents)}</Text>
        <Text style={styles.text}>Aliquota imposto: 8.00%</Text>
        <Text style={styles.text}>Payback impressoras: {costSettings.paybackMonths} meses</Text>
        <Text style={styles.text}>Markup: 65.00%</Text>
      </View>
      <Pressable style={styles.primaryButtonFixed}>
        <Text style={styles.primaryButtonText}>Editar configuracao ativa</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Criar nova vigencia</Text>
      </Pressable>
    </ScrollView>
  );
}

function QuotesScreen({ goTo }: { goTo: (key: ScreenKey) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Orcamentos</Text>
      {quotes.map((q) => (
        <View key={q.id} style={styles.card}>
          <Text style={styles.cardTitle}>{q.name}</Text>
          <Text style={styles.text}>Tempo impressao: {q.printTimeMin} min</Text>
          <Text style={styles.text}>Tempo pos-producao: {q.postProcessingMin} min</Text>
          <Text style={styles.text}>Custo producao: {money(q.productionCostCents)}</Text>
          <Text style={styles.text}>Preco venda: {money(q.salePriceCents)}</Text>
          <View style={styles.row}>
            <Pressable style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Editar</Text>
            </Pressable>
            <Pressable style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Ver detalhes</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Pressable style={styles.primaryButtonFixed} onPress={() => goTo("quoteNew")}>
        <Text style={styles.primaryButtonText}>Adicionar novo orcamento</Text>
      </Pressable>
    </ScrollView>
  );
}

function QuoteNewScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Novo Orcamento</Text>
      <TextInput placeholder="Nome do objeto" style={styles.input} />
      <TextInput
        placeholder="Descricao para anuncio"
        style={[styles.input, styles.textArea]}
        multiline
      />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Midias</Text>
        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Adicionar fotos</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Adicionar videos</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Filamentos</Text>
        <TextInput placeholder="Filamento selecionado" style={styles.input} />
        <TextInput placeholder="Quantidade usada (g)" style={styles.input} keyboardType="numeric" />
        <Pressable style={styles.smallButton}>
          <Text style={styles.smallButtonText}>Adicionar filamento</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tempos</Text>
        <TextInput placeholder="Tempo de impressao (min)" style={styles.input} keyboardType="numeric" />
        <TextInput
          placeholder="Tempo de pos-producao (min)"
          style={styles.input}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Itens extras</Text>
        <TextInput placeholder="Nome do item extra" style={styles.input} />
        <TextInput placeholder="Custo (R$)" style={styles.input} keyboardType="numeric" />
        <Pressable style={styles.smallButton}>
          <Text style={styles.smallButtonText}>Adicionar item extra</Text>
        </Pressable>
      </View>

      <TextInput placeholder="Custo de embalagem (R$)" style={styles.input} keyboardType="numeric" />

      <View style={styles.row}>
        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Salvar rascunho</Text>
        </Pressable>
        <Pressable style={styles.primaryButtonFixed}>
          <Text style={styles.primaryButtonText}>Calcular preco</Text>
        </Pressable>
      </View>
      <Pressable style={styles.primaryButtonFixed}>
        <Text style={styles.primaryButtonText}>Finalizar orcamento</Text>
      </Pressable>
    </ScrollView>
  );
}

export default function MockupApp() {
  const [screen, setScreen] = useState<ScreenKey>("dashboard");

  const title = useMemo(() => {
    const map: Record<ScreenKey, string> = {
      dashboard: "Dashboard",
      printers: "Impressoras",
      printerForm: "Cadastro Impressora",
      filaments: "Filamentos",
      filamentForm: "Cadastro Filamento",
      fixedCosts: "Custos Fixos",
      quotes: "Orcamentos",
      quoteNew: "Novo Orcamento",
    };
    return map[screen];
  }, [screen]);

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

      <ScrollView
        horizontal
        style={styles.nav}
        contentContainerStyle={styles.navContent}
        showsHorizontalScrollIndicator={false}
      >
        <NavButton label="Home" active={screen === "dashboard"} onPress={() => setScreen("dashboard")} />
        <NavButton label="Impressoras" active={screen === "printers"} onPress={() => setScreen("printers")} />
        <NavButton label="Nova imp." active={screen === "printerForm"} onPress={() => setScreen("printerForm")} />
        <NavButton label="Filamentos" active={screen === "filaments"} onPress={() => setScreen("filaments")} />
        <NavButton label="Novo fil." active={screen === "filamentForm"} onPress={() => setScreen("filamentForm")} />
        <NavButton label="Custos" active={screen === "fixedCosts"} onPress={() => setScreen("fixedCosts")} />
        <NavButton label="Orcamentos" active={screen === "quotes"} onPress={() => setScreen("quotes")} />
        <NavButton label="Novo orc." active={screen === "quoteNew"} onPress={() => setScreen("quoteNew")} />
      </ScrollView>

      {screen === "dashboard" && <DashboardScreen goTo={setScreen} />}
      {screen === "printers" && <PrintersScreen goTo={setScreen} />}
      {screen === "printerForm" && <PrinterFormScreen />}
      {screen === "filaments" && <FilamentsScreen goTo={setScreen} />}
      {screen === "filamentForm" && <FilamentFormScreen />}
      {screen === "fixedCosts" && <FixedCostsScreen />}
      {screen === "quotes" && <QuotesScreen goTo={setScreen} />}
      {screen === "quoteNew" && <QuoteNewScreen />}
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
  navContent: {
    minHeight: 56,
    alignItems: "center",
  },
  navButton: {
    marginHorizontal: 4,
    marginVertical: 8,
    minWidth: 88,
    height: 36,
    paddingHorizontal: 12,
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
  content: {
    padding: 16,
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
  primaryButtonText: {
    color: "#f5f8ff",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#9cb0d8",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#29467f",
    fontSize: 13,
    fontWeight: "700",
  },
  smallButton: {
    backgroundColor: "#eef3ff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  smallButtonText: {
    color: "#23407e",
    fontSize: 12,
    fontWeight: "700",
  },
});
