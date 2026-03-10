export type QuoteComputationInput = {
  unitsProduced: number;
  printTimeMinutes: number;
  postProcessingMinutes: number;
  packagingCostCents: number;
  printerPowerWatts: number;
  printerPurchaseCostCents: number;
  laborHourCostCents: number;
  energyCostKwhCents: number;
  taxRateBps: number;
  printerPaybackMonths: number;
  markupBps: number;
  filamentTotalUnitCents: number;
  extrasTotalUnitCents: number;
};

export type QuoteComputationResult = {
  subtotalBatchCents: number;
  taxBatchCents: number;
  finalBatchCents: number;
  subtotalUnitCents: number;
  taxUnitCents: number;
  finalUnitCents: number;
  breakdown: {
    energyPerMinuteCents: number;
    paybackPerMinuteCents: number;
    energyBatchCents: number;
    paybackBatchCents: number;
    laborBatchCents: number;
    filamentBatchCents: number;
    extrasBatchCents: number;
    packagingBatchCents: number;
  };
};

export function computeQuote(input: QuoteComputationInput): QuoteComputationResult {
  const units = Math.max(1, Math.trunc(input.unitsProduced));

  const energyPerMinuteCents =
    (input.printerPowerWatts / 1000) * (input.energyCostKwhCents / 60);

  const paybackPerMinuteCents =
    input.printerPurchaseCostCents / (input.printerPaybackMonths * 20 * 30 * 60);

  const totalPrintMinutes = input.printTimeMinutes * units;
  const totalPostMinutes = input.postProcessingMinutes * units;

  const energyBatchCents = Math.round(energyPerMinuteCents * totalPrintMinutes);
  const paybackBatchCents = Math.round(paybackPerMinuteCents * totalPrintMinutes);
  // Mao de obra considera apenas tempo humano (pos-processamento).
  const laborBatchCents = Math.round((totalPostMinutes / 60) * input.laborHourCostCents);

  // Filamentos e extras recebidos no formulario sao custos totais do lote.
  const filamentBatchCents = input.filamentTotalUnitCents;
  const extrasBatchCents = input.extrasTotalUnitCents;
  const packagingBatchCents = input.packagingCostCents * units;

  const subtotalBatchCents =
    filamentBatchCents +
    extrasBatchCents +
    packagingBatchCents +
    energyBatchCents +
    paybackBatchCents +
    laborBatchCents;

  const withMarkupBatchCents = Math.round(
    subtotalBatchCents * (1 + input.markupBps / 10000)
  );
  const taxBatchCents = Math.round((withMarkupBatchCents * input.taxRateBps) / 10000);
  const finalBatchCents = withMarkupBatchCents + taxBatchCents;

  return {
    subtotalBatchCents,
    taxBatchCents,
    finalBatchCents,
    subtotalUnitCents: Math.round(subtotalBatchCents / units),
    taxUnitCents: Math.round(taxBatchCents / units),
    finalUnitCents: Math.round(finalBatchCents / units),
    breakdown: {
      energyPerMinuteCents,
      paybackPerMinuteCents,
      energyBatchCents,
      paybackBatchCents,
      laborBatchCents,
      filamentBatchCents,
      extrasBatchCents,
      packagingBatchCents,
    },
  };
}
