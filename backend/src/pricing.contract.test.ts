import test from "node:test";
import assert from "node:assert/strict";
import { computeContributionMargin, computeQuote } from "./pricing.js";

test("computeQuote returns consistent unit and batch totals", () => {
  const result = computeQuote({
    unitsProduced: 4,
    printTimeMinutes: 120,
    postProcessingMinutes: 15,
    packagingCostCents: 50,
    printerPowerWatts: 350,
    printerPurchaseCostCents: 250000,
    laborHourCostCents: 4000,
    energyCostKwhCents: 95,
    taxRateBps: 1600,
    printerPaybackMonths: 24,
    markupBps: 10000,
    filamentTotalUnitCents: 800,
    extrasTotalUnitCents: 120,
  });

  assert.equal(result.subtotalUnitCents, Math.round(result.subtotalBatchCents / 4));
  assert.equal(result.taxUnitCents, Math.round(result.taxBatchCents / 4));
  assert.equal(result.finalUnitCents, Math.round(result.finalBatchCents / 4));
});

test("computeContributionMargin does not subtract tax twice", () => {
  const margin = computeContributionMargin({
    revenueCents: 1133,
    variableCostCents: 525,
    taxCents: 168,
  });

  assert.equal(margin.contribution_margin_cents, 440);
  assert.equal(margin.contribution_margin_bps, 3883);
});
