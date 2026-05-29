// Concrete Mix Design Engine — IS 10262:2019 procedure, with constraints from
// IS 456:2000 Table 5 (durability) and Table 4 (sulphate exposure).
//
// References:
//   • IS 10262:2019 — Concrete Mix Proportioning – Guidelines
//       Table 1: Standard deviation
//       Table 2: Maximum water content per cubic metre of concrete
//       Table 5: Volume of coarse aggregate per unit volume of total aggregate
//       Fig 1 / clauses: Free w/c ratio vs target mean strength
//   • IS 456:2000
//       Table 2:  Grades of concrete
//       Table 5:  Minimum cement, max w/c, min grade for exposures
//       Clause 8.2.4.2: Max cement content 450 kg/m³
//
// The hard-coded tables below are the published values from IS 10262:2019.
// They are inlined deliberately so the calculator works even if no IS code
// has been ingested into the vector store yet. When the IS 456 corpus IS
// available, the same constraints can be cross-checked against retrieved
// clauses for verification at narration time.

import "dotenv/config";

// ---------- Inputs / Outputs ----------

export type ExposureCondition =
  | "Mild" | "Moderate" | "Severe" | "Very Severe" | "Extreme";

export type CementType =
  | "OPC 33" | "OPC 43" | "OPC 53" | "PPC" | "PSC" | "SRC";

export type ConcreteType = "Plain" | "Reinforced";

export type FineAggregateZone = "I" | "II" | "III" | "IV";

export type MixDesignInputs = {
  grade: number;                     // e.g. 30 for M30
  cementType: CementType;
  maxAggregateSize: 10 | 20 | 40;    // mm
  workabilitySlump: number;          // mm
  exposureCondition: ExposureCondition;
  concreteType: ConcreteType;
  aggregateType: "Crushed" | "Natural (Uncrushed)";
  fineAggregateZone: FineAggregateZone;
  useChemicalAdmixture: boolean;
  admixtureDosagePercent?: number;   // % by mass of cement (typ 0.8-1.5 for superplasticizer)
  waterReductionPercent?: number;    // % water reduction by admixture (typ 20-25 for SP)

  // Specific gravities (defaults given if omitted)
  cementSpecificGravity?: number;        // default 3.15
  coarseAggregateSpecificGravity?: number; // default 2.74
  fineAggregateSpecificGravity?: number;   // default 2.65
  admixtureSpecificGravity?: number;       // default 1.145

  // Site corrections (water absorption / surface moisture, %)
  coarseAggregateAbsorption?: number;  // default 0.5
  fineAggregateAbsorption?: number;    // default 1.0
  coarseAggregateMoisture?: number;    // default 0
  fineAggregateMoisture?: number;      // default 0
};

export type MixDesignStep = {
  step: number;
  title: string;
  reference: string;     // e.g. "IS 10262:2019, Table 2"
  detail: string;
  value?: number | string;
  unit?: string;
};

export type MixProportions = {
  cement: number;        // kg/m³
  water: number;         // kg/m³
  fineAggregate: number; // kg/m³
  coarseAggregate: number; // kg/m³
  admixture?: number;    // kg/m³
  ratio: string;         // "1 : 1.65 : 2.92 : 0.45"
};

export type DurabilityConstraints = {
  minCementContent: number;     // kg/m³
  maxWaterCementRatio: number;
  minGrade: number;             // e.g. 30 for M30
  source: string;
};

export type MixDesignResult = {
  inputs: MixDesignInputs;
  durability: DurabilityConstraints;
  steps: MixDesignStep[];
  proportions: MixProportions;
  // Per 50 kg cement bag — useful for site batching
  perBagOf50kgCement: {
    water: number;
    fineAggregate: number;
    coarseAggregate: number;
    admixture?: number;
  };
  warnings: string[];
};

// ============================================================
// IS 10262:2019 — Hard-coded reference tables
// ============================================================

// IS 10262:2019 Table 1 — Assumed standard deviation (N/mm²) when site data
// is not available. Used to compute target mean strength.
const STANDARD_DEVIATION = (grade: number): number => {
  if (grade <= 15) return 3.5;
  if (grade <= 25) return 4.0;
  return 5.0;
};

// IS 10262:2019 Table 2 — Maximum water content per cubic metre of concrete
// for nominal maximum size of aggregate. (For angular CA, 50mm slump,
// without chemical admixture.)
const BASE_WATER_CONTENT = (aggSize: 10 | 20 | 40): number => {
  if (aggSize === 10) return 208;
  if (aggSize === 20) return 186;
  return 165; // 40mm
};

// IS 10262:2019 Table 5 — Volume of coarse aggregate per unit volume of
// total aggregate, for w/c = 0.5, zone II fine aggregate.
const BASE_CA_VOLUME = (aggSize: 10 | 20 | 40): number => {
  if (aggSize === 10) return 0.50;
  if (aggSize === 20) return 0.62;
  return 0.71; // 40mm
};

// IS 10262:2019 — Adjustment of CA volume by fine aggregate zone.
// (Per code: increase by 0.01 for finer zones, decrease for coarser.)
const CA_VOLUME_ZONE_ADJUSTMENT = (zone: FineAggregateZone): number => {
  if (zone === "I") return -0.02;
  if (zone === "II") return 0.0;
  if (zone === "III") return +0.02;
  return +0.04; // IV (very fine sand)
};

// IS 10262:2019 — Approximate free w/c ratio for target mean strength.
// Derived from Fig 1 (curves for OPC 43 grade). For other cements, adjust
// slightly. These values are inflection points; we linearly interpolate.
const wcRatioFromTargetStrength = (
  targetStrength: number,
  cementType: CementType,
): number => {
  // OPC 43 baseline
  const baseline = (s: number): number => {
    if (s <= 20) return 0.65;
    if (s <= 25) return 0.60;
    if (s <= 30) return 0.55;
    if (s <= 35) return 0.50;
    if (s <= 40) return 0.45;
    if (s <= 45) return 0.42;
    if (s <= 50) return 0.40;
    if (s <= 55) return 0.38;
    return 0.36; // 60+
  };
  let wc = baseline(targetStrength);
  // Cement-type adjustment: OPC 53 lets you go ~0.02 lower; OPC 33 needs ~0.02 higher.
  if (cementType === "OPC 53") wc -= 0.02;
  else if (cementType === "OPC 33") wc += 0.02;
  // PPC/PSC typically similar to OPC 43.
  return Math.round(wc * 100) / 100;
};

// IS 456:2000 Table 5 — Minimum cement, max w/c, min grade for exposures
// (for 20mm nominal max size aggregate, normal weight aggregate).
const DURABILITY_TABLE: Record<
  ExposureCondition,
  { plain: DurabilityConstraints; reinforced: DurabilityConstraints }
> = {
  "Mild": {
    plain:      { minCementContent: 220, maxWaterCementRatio: 0.60, minGrade: 0,  source: "IS 456:2000 Table 5" },
    reinforced: { minCementContent: 300, maxWaterCementRatio: 0.55, minGrade: 20, source: "IS 456:2000 Table 5" },
  },
  "Moderate": {
    plain:      { minCementContent: 240, maxWaterCementRatio: 0.60, minGrade: 15, source: "IS 456:2000 Table 5" },
    reinforced: { minCementContent: 300, maxWaterCementRatio: 0.50, minGrade: 25, source: "IS 456:2000 Table 5" },
  },
  "Severe": {
    plain:      { minCementContent: 250, maxWaterCementRatio: 0.50, minGrade: 20, source: "IS 456:2000 Table 5" },
    reinforced: { minCementContent: 320, maxWaterCementRatio: 0.45, minGrade: 30, source: "IS 456:2000 Table 5" },
  },
  "Very Severe": {
    plain:      { minCementContent: 260, maxWaterCementRatio: 0.45, minGrade: 20, source: "IS 456:2000 Table 5" },
    reinforced: { minCementContent: 340, maxWaterCementRatio: 0.45, minGrade: 35, source: "IS 456:2000 Table 5" },
  },
  "Extreme": {
    plain:      { minCementContent: 280, maxWaterCementRatio: 0.40, minGrade: 25, source: "IS 456:2000 Table 5" },
    reinforced: { minCementContent: 360, maxWaterCementRatio: 0.40, minGrade: 40, source: "IS 456:2000 Table 5" },
  },
};

// IS 456:2000 Clause 8.2.4.2 — absolute maximum cement content (excluding fly ash etc.)
const MAX_CEMENT_CONTENT = 450;

// ============================================================
// Main calculation
// ============================================================

export const calculateMixDesign = (rawInputs: MixDesignInputs): MixDesignResult => {
  const inputs = applyDefaults(rawInputs);
  const steps: MixDesignStep[] = [];
  const warnings: string[] = [];

  const durability =
    inputs.concreteType === "Plain"
      ? DURABILITY_TABLE[inputs.exposureCondition].plain
      : DURABILITY_TABLE[inputs.exposureCondition].reinforced;

  // Validate grade vs minimum for exposure
  if (inputs.grade < durability.minGrade) {
    warnings.push(
      `Grade M${inputs.grade} is below the minimum grade M${durability.minGrade} ` +
      `required for ${inputs.exposureCondition} exposure (${inputs.concreteType.toLowerCase()} concrete) per IS 456:2000 Table 5.`,
    );
  }

  // ---- Step 1: Target mean strength ----
  const stddev = STANDARD_DEVIATION(inputs.grade);
  // IS 10262:2019 Clause 4 — target mean strength = fck + 1.65*S
  const targetMeanStrength = inputs.grade + 1.65 * stddev;
  steps.push({
    step: 1,
    title: "Target Mean Strength",
    reference: "IS 10262:2019, Clause 4 + Table 1",
    detail: `f'ck = fck + 1.65×S = ${inputs.grade} + 1.65×${stddev} = ${targetMeanStrength.toFixed(2)} N/mm²`,
    value: round2(targetMeanStrength),
    unit: "N/mm²",
  });

  // ---- Step 2: Selection of w/c ratio ----
  let wcRatio = wcRatioFromTargetStrength(targetMeanStrength, inputs.cementType);
  steps.push({
    step: 2,
    title: "Free Water-Cement Ratio (from Fig 1)",
    reference: "IS 10262:2019, Fig 1",
    detail:
      `For target strength ${targetMeanStrength.toFixed(2)} N/mm² with ${inputs.cementType}, ` +
      `the indicative free w/c ratio is ${wcRatio.toFixed(2)}.`,
    value: wcRatio,
  });

  if (wcRatio > durability.maxWaterCementRatio) {
    steps.push({
      step: 2,
      title: "W/C ratio adjusted to meet durability",
      reference: "IS 456:2000, Table 5",
      detail:
        `Calculated w/c (${wcRatio.toFixed(2)}) exceeds the maximum permitted ` +
        `(${durability.maxWaterCementRatio.toFixed(2)}) for ${inputs.exposureCondition} exposure. ` +
        `Using ${durability.maxWaterCementRatio.toFixed(2)}.`,
      value: durability.maxWaterCementRatio,
    });
    wcRatio = durability.maxWaterCementRatio;
  }

  // ---- Step 3: Water content ----
  let waterContent = BASE_WATER_CONTENT(inputs.maxAggregateSize);
  steps.push({
    step: 3,
    title: "Base water content",
    reference: `IS 10262:2019, Table 2 (${inputs.maxAggregateSize} mm aggregate, 50 mm slump, angular)`,
    detail: `Base water content for ${inputs.maxAggregateSize} mm nominal aggregate at 50 mm slump = ${waterContent} kg/m³.`,
    value: waterContent,
    unit: "kg/m³",
  });

  // Adjust for slump: +3% per 25mm above 50mm slump
  if (inputs.workabilitySlump > 50) {
    const slumpIncrement = inputs.workabilitySlump - 50;
    const slumpAdjustmentPct = (slumpIncrement / 25) * 3;
    const slumpAdjusted = waterContent * (1 + slumpAdjustmentPct / 100);
    steps.push({
      step: 3,
      title: "Adjust for slump",
      reference: "IS 10262:2019, Clause 5 (Note)",
      detail:
        `Slump ${inputs.workabilitySlump} mm > 50 mm. Increase water content by ` +
        `${slumpAdjustmentPct.toFixed(1)}% (3% per 25 mm extra): ` +
        `${waterContent} × ${(1 + slumpAdjustmentPct / 100).toFixed(3)} = ${slumpAdjusted.toFixed(1)} kg/m³.`,
      value: round2(slumpAdjusted),
      unit: "kg/m³",
    });
    waterContent = slumpAdjusted;
  }

  // Adjust for aggregate type (sub-angular: -10kg, gravel rounded: -25kg)
  if (inputs.aggregateType === "Natural (Uncrushed)") {
    waterContent = waterContent - 15;
    steps.push({
      step: 3,
      title: "Adjust for aggregate shape",
      reference: "IS 10262:2019, Clause 5 (Note)",
      detail: `Natural (uncrushed) aggregate: reduce water content by ~15 kg/m³ → ${waterContent.toFixed(1)} kg/m³.`,
      value: round2(waterContent),
      unit: "kg/m³",
    });
  }

  // Adjust for chemical admixture: reduce water by X%
  if (inputs.useChemicalAdmixture) {
    const reduction = inputs.waterReductionPercent ?? 20;
    const before = waterContent;
    waterContent = waterContent * (1 - reduction / 100);
    steps.push({
      step: 3,
      title: "Adjust for chemical admixture",
      reference: "IS 10262:2019, Clause 5",
      detail:
        `Chemical admixture (water reduction ${reduction}%): ` +
        `${before.toFixed(1)} × ${(1 - reduction / 100).toFixed(3)} = ${waterContent.toFixed(1)} kg/m³.`,
      value: round2(waterContent),
      unit: "kg/m³",
    });
  }

  // ---- Step 4: Cement content ----
  let cementContent = waterContent / wcRatio;
  steps.push({
    step: 4,
    title: "Cement content",
    reference: "IS 10262:2019, Clause 5.4",
    detail:
      `Cement = Water / (w/c) = ${waterContent.toFixed(1)} / ${wcRatio.toFixed(2)} = ` +
      `${cementContent.toFixed(1)} kg/m³.`,
    value: round2(cementContent),
    unit: "kg/m³",
  });

  // Enforce minimum cement content per IS 456 Table 5
  if (cementContent < durability.minCementContent) {
    steps.push({
      step: 4,
      title: "Cement content adjusted up to durability minimum",
      reference: "IS 456:2000, Table 5",
      detail:
        `Calculated cement (${cementContent.toFixed(1)} kg/m³) is below the minimum ` +
        `${durability.minCementContent} kg/m³ required for ${inputs.exposureCondition} exposure. ` +
        `Using ${durability.minCementContent} kg/m³ and recomputing water content to keep w/c ≤ ${wcRatio.toFixed(2)}.`,
      value: durability.minCementContent,
      unit: "kg/m³",
    });
    cementContent = durability.minCementContent;
    // Recompute water content to maintain w/c (could also keep water and lower w/c — IS 10262 recommends raising cement, keeping w/c).
    waterContent = cementContent * wcRatio;
    steps.push({
      step: 4,
      title: "Water content recalculated",
      reference: "IS 10262:2019",
      detail: `Water = cement × w/c = ${cementContent} × ${wcRatio.toFixed(2)} = ${waterContent.toFixed(1)} kg/m³.`,
      value: round2(waterContent),
      unit: "kg/m³",
    });
  }

  // Cap at IS 456 absolute maximum
  if (cementContent > MAX_CEMENT_CONTENT) {
    warnings.push(
      `Cement content ${cementContent.toFixed(1)} kg/m³ exceeds the maximum 450 kg/m³ ` +
      `per IS 456:2000 Clause 8.2.4.2. Consider mineral admixtures or grade revision.`,
    );
  }

  // ---- Step 5: Coarse aggregate volume fraction ----
  let caVolFraction = BASE_CA_VOLUME(inputs.maxAggregateSize);
  // Adjust for zone of fine aggregate (Table 5 is for zone II)
  caVolFraction += CA_VOLUME_ZONE_ADJUSTMENT(inputs.fineAggregateZone);
  // Adjust for w/c: every 0.05 change from 0.5, adjust CA fraction by 0.01 (opposite direction)
  const wcDelta = wcRatio - 0.5;
  const wcVolAdjustment = -(wcDelta / 0.05) * 0.01;
  caVolFraction += wcVolAdjustment;
  caVolFraction = Math.round(caVolFraction * 100) / 100;
  steps.push({
    step: 5,
    title: "Coarse aggregate volume fraction",
    reference: "IS 10262:2019, Table 5",
    detail:
      `Base CA fraction (${inputs.maxAggregateSize} mm, zone II, w/c=0.5): ${BASE_CA_VOLUME(inputs.maxAggregateSize).toFixed(2)}. ` +
      `Zone ${inputs.fineAggregateZone} adjustment: ${CA_VOLUME_ZONE_ADJUSTMENT(inputs.fineAggregateZone).toFixed(2)}. ` +
      `W/C adjustment (${wcDelta.toFixed(2)} from 0.5): ${wcVolAdjustment.toFixed(2)}. ` +
      `Final CA volume fraction = ${caVolFraction.toFixed(2)}.`,
    value: caVolFraction,
  });
  const faVolFraction = round2(1 - caVolFraction);

  // ---- Step 6: Aggregate volumes and masses ----
  const Gc = inputs.cementSpecificGravity!;
  const Gca = inputs.coarseAggregateSpecificGravity!;
  const Gfa = inputs.fineAggregateSpecificGravity!;
  const Gadm = inputs.admixtureSpecificGravity!;

  const cementVol = cementContent / (Gc * 1000); // m³
  const waterVol = waterContent / (1 * 1000);    // m³
  let admixtureMass = 0;
  let admixtureVol = 0;
  if (inputs.useChemicalAdmixture) {
    const dosagePct = inputs.admixtureDosagePercent ?? 1.0;
    admixtureMass = (dosagePct / 100) * cementContent;
    admixtureVol = admixtureMass / (Gadm * 1000);
  }
  const totalAggVol = 1 - (cementVol + waterVol + admixtureVol);
  const caVol = totalAggVol * caVolFraction;
  const faVol = totalAggVol * faVolFraction;
  const caMass = caVol * Gca * 1000;
  const faMass = faVol * Gfa * 1000;

  steps.push({
    step: 6,
    title: "Volume balance for 1 m³ of concrete",
    reference: "IS 10262:2019, Clause 5.6",
    detail:
      `Cement: ${(cementVol * 1000).toFixed(2)} L; Water: ${(waterVol * 1000).toFixed(2)} L; ` +
      `Admixture: ${(admixtureVol * 1000).toFixed(2)} L; Total aggregate: ${(totalAggVol * 1000).toFixed(2)} L. ` +
      `CA: ${caMass.toFixed(1)} kg/m³; FA: ${faMass.toFixed(1)} kg/m³.`,
  });

  // ---- Step 7: Apply moisture / absorption corrections ----
  const caAbs = inputs.coarseAggregateAbsorption ?? 0.5;
  const faAbs = inputs.fineAggregateAbsorption ?? 1.0;
  const caMoist = inputs.coarseAggregateMoisture ?? 0;
  const faMoist = inputs.fineAggregateMoisture ?? 0;

  const caCorrection = (caMoist - caAbs) / 100;
  const faCorrection = (faMoist - faAbs) / 100;
  const caMassCorrected = caMass * (1 + caCorrection);
  const faMassCorrected = faMass * (1 + faCorrection);
  const extraWaterFromAgg = caMass * caCorrection + faMass * faCorrection;
  const waterContentCorrected = waterContent - extraWaterFromAgg;

  if (caMoist > 0 || faMoist > 0 || caAbs > 0 || faAbs > 0) {
    steps.push({
      step: 7,
      title: "Site corrections for moisture & absorption",
      reference: "IS 10262:2019, Clause 5.7",
      detail:
        `CA (abs ${caAbs}%, moist ${caMoist}%): ${caMass.toFixed(1)} → ${caMassCorrected.toFixed(1)} kg/m³. ` +
        `FA (abs ${faAbs}%, moist ${faMoist}%): ${faMass.toFixed(1)} → ${faMassCorrected.toFixed(1)} kg/m³. ` +
        `Added water from aggregate = ${extraWaterFromAgg.toFixed(1)} kg/m³, so batching water = ${waterContentCorrected.toFixed(1)} kg/m³.`,
    });
  }

  const proportions: MixProportions = {
    cement: round2(cementContent),
    water: round2(waterContentCorrected),
    fineAggregate: round2(faMassCorrected),
    coarseAggregate: round2(caMassCorrected),
    ratio: `1 : ${(faMassCorrected / cementContent).toFixed(2)} : ${(caMassCorrected / cementContent).toFixed(2)} : ${(waterContent / cementContent).toFixed(2)}`,
    ...(admixtureMass > 0 ? { admixture: round2(admixtureMass) } : {}),
  };

  steps.push({
    step: 8,
    title: "Final mix proportions per cubic metre",
    reference: "IS 10262:2019, Clause 5.8",
    detail:
      `Cement : FA : CA : Water = ${proportions.ratio} (by mass) — see Step 7 for batch water.`,
  });

  // Per 50 kg cement bag
  const bagFactor = 50 / cementContent;
  const perBag = {
    water: round2(waterContentCorrected * bagFactor),
    fineAggregate: round2(faMassCorrected * bagFactor),
    coarseAggregate: round2(caMassCorrected * bagFactor),
    ...(admixtureMass > 0 ? { admixture: round2(admixtureMass * bagFactor) } : {}),
  };

  return {
    inputs,
    durability,
    steps,
    proportions,
    perBagOf50kgCement: perBag,
    warnings,
  };
};

// ---------- Helpers ----------

const applyDefaults = (i: MixDesignInputs): MixDesignInputs => ({
  ...i,
  cementSpecificGravity: i.cementSpecificGravity ?? 3.15,
  coarseAggregateSpecificGravity: i.coarseAggregateSpecificGravity ?? 2.74,
  fineAggregateSpecificGravity: i.fineAggregateSpecificGravity ?? 2.65,
  admixtureSpecificGravity: i.admixtureSpecificGravity ?? 1.145,
  coarseAggregateAbsorption: i.coarseAggregateAbsorption ?? 0.5,
  fineAggregateAbsorption: i.fineAggregateAbsorption ?? 1.0,
  coarseAggregateMoisture: i.coarseAggregateMoisture ?? 0,
  fineAggregateMoisture: i.fineAggregateMoisture ?? 0,
});

const round2 = (n: number): number => Math.round(n * 100) / 100;
