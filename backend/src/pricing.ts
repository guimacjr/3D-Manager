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

export type ContributionMarginInput = {
  revenueCents: number;
  variableCostCents: number;
  taxCents: number;
};

export type ContributionMarginResult = {
  contribution_margin_cents: number;
  contribution_margin_bps: number;
};

export function computeQuote(input: QuoteComputationInput): QuoteComputationResult {
  const units = Math.max(1, Math.trunc(input.unitsProduced));

  const energyPerMinuteCents =
    (input.printerPowerWatts / 1000) * (input.energyCostKwhCents / 60);

  const paybackPerMinuteCents =
    input.printerPurchaseCostCents / (input.printerPaybackMonths * 20 * 30 * 60);

  // Tempo de impressao e informado para o lote inteiro.
  const totalPrintMinutes = input.printTimeMinutes;
  const totalPostMinutes = input.postProcessingMinutes * units;

  const energyBatchCents = Math.round(energyPerMinuteCents * totalPrintMinutes);
  const paybackBatchCents = Math.round(paybackPerMinuteCents * totalPrintMinutes);
  // Mao de obra considera apenas tempo humano (pos-processamento).
  const laborBatchCents = Math.round((totalPostMinutes / 60) * input.laborHourCostCents);

  // Filamentos sao informados como custo total do lote.
  // Extras sao informados como custo por unidade.
  const filamentBatchCents = input.filamentTotalUnitCents;
  const extrasBatchCents = input.extrasTotalUnitCents * units;
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

export function computeContributionMargin(
  input: ContributionMarginInput
): ContributionMarginResult {
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
