// Every price in the app lives here. Edit freely; the quote recalculates from these.
// A "square" is 100 sq ft of roof, the unit roofers price in.

export const COMPANY = {
  name: "Woof Roofing",
  tagline: "Top Notch Protection",
  phone: "(555) 010-2026",
};

export type Tier = {
  id: string;
  name: string;
  material: string;
  warranty: string;
  materialPerSquare: number;
  laborPerSquare: number;
  recommended?: boolean;
};

export const TIERS: Tier[] = [
  { id: "good", name: "Essential", material: "3-tab asphalt shingles", warranty: "25-year", materialPerSquare: 135, laborPerSquare: 215 },
  { id: "better", name: "Signature", material: "Architectural asphalt shingles", warranty: "50-year", materialPerSquare: 185, laborPerSquare: 245, recommended: true },
  { id: "best", name: "Lifetime", material: "Standing-seam metal", warranty: "Lifetime", materialPerSquare: 525, laborPerSquare: 465 },
];

export const RATES = {
  tearOffPerSquare: 95, // remove one layer of old roofing
  underlaymentPerSquare: 45, // synthetic underlayment + ice & water shield
  flashingPerSquare: 38, // drip edge, flashing, ridge vent, pipe boots
  lowSlopePerSquare: 650, // installed membrane roofing for near-flat sections (patio covers, flat roofs)
  lowSlopeMaxRise: 3, // planes flatter than 3/12 can't take shingles or metal panels
  dumpster: 575,
  permit: 450,
  materialTaxRate: 0.07,
  minimumJob: 6500,
  rangeSpread: 0.08, // show the total as +/- 8%
};

// Pitch in degrees to the roofer's "rise over 12" notation.
export const pitchToRise = (deg: number) => Math.tan((deg * Math.PI) / 180) * 12;

// More roof planes means more cuts, valleys, and wasted material.
export function wasteFactor(planes: number) {
  if (planes <= 4) return 0.1;
  if (planes <= 8) return 0.12;
  return 0.15;
}

// Steep roofs need harnesses, roof jacks, and slower crews.
export function steepMultiplier(pitchDegrees: number) {
  const rise = pitchToRise(pitchDegrees);
  if (rise >= 10) return { mult: 1.4, label: "Very steep roof (10/12+)" };
  if (rise >= 7) return { mult: 1.2, label: "Steep roof (7/12 to 10/12)" };
  return { mult: 1, label: "" };
}

export type LineItem = { label: string; detail: string; amount: number };

export type Quote = {
  tier: Tier;
  squares: number;
  orderSquares: number;
  waste: number;
  items: LineItem[];
  total: number;
  low: number;
  high: number;
  perSqft: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export type Plane = { areaSqft: number; pitchDegrees: number };

// Splits the roof into pitched planes (priced per tier) and low-slope planes (membrane, one rate
// for every tier). Low-slope planes also don't count toward the steep-roof labor surcharge.
export function splitRoof(planes: Plane[]) {
  const isLow = (p: Plane) => pitchToRise(p.pitchDegrees) < RATES.lowSlopeMaxRise;
  const pitched = planes.filter((p) => !isLow(p));
  const lowSqft = planes.filter(isLow).reduce((s, p) => s + p.areaSqft, 0);
  const pitchedSqft = pitched.reduce((s, p) => s + p.areaSqft, 0);
  const pitchedDegrees = pitchedSqft ? pitched.reduce((s, p) => s + p.pitchDegrees * p.areaSqft, 0) / pitchedSqft : 0;
  return { pitchedSqft, pitchedDegrees, pitchedPlanes: pitched.length, lowSqft };
}

export function buildQuote(tier: Tier, planes: Plane[], layers = 1): Quote {
  const roof = splitRoof(planes);
  const totalSqft = roof.pitchedSqft + roof.lowSqft;
  const squares = r2(roof.pitchedSqft / 100);
  const lowSquares = r2(roof.lowSqft / 100);
  const waste = wasteFactor(roof.pitchedPlanes || 6);
  const orderSquares = Math.ceil(squares * (1 + waste) * 3) / 3; // shingles ship in 1/3-square bundles
  const steep = steepMultiplier(roof.pitchedDegrees);

  const material = orderSquares * tier.materialPerSquare;
  const underlayment = orderSquares * RATES.underlaymentPerSquare;
  const flashing = squares * RATES.flashingPerSquare;
  const labor = squares * tier.laborPerSquare * steep.mult;
  const lowSlope = lowSquares * RATES.lowSlopePerSquare;
  const tearOff = (squares + lowSquares) * RATES.tearOffPerSquare * layers + RATES.dumpster;
  const tax = (material + underlayment + flashing) * RATES.materialTaxRate;

  const items: LineItem[] = [
    { label: tier.material, detail: `${orderSquares.toFixed(1)} squares incl. ${Math.round(waste * 100)}% waste`, amount: material },
    { label: "Underlayment & ice shield", detail: `${orderSquares.toFixed(1)} squares`, amount: underlayment },
    { label: "Flashing, drip edge & ridge vent", detail: `${squares.toFixed(1)} squares`, amount: flashing },
    { label: "Installation labor", detail: steep.label || `${squares.toFixed(1)} squares`, amount: labor },
    ...(lowSquares > 0
      ? [{ label: "Low-slope section (membrane)", detail: `${lowSquares.toFixed(1)} squares under ${RATES.lowSlopeMaxRise}/12, e.g. a patio cover`, amount: lowSlope }]
      : []),
    { label: "Tear-off & disposal", detail: `${layers} layer${layers > 1 ? "s" : ""} + dumpster`, amount: tearOff },
    { label: "Permit & inspection", detail: "Flat fee", amount: RATES.permit },
    { label: "Sales tax on materials", detail: `${(RATES.materialTaxRate * 100).toFixed(0)}%`, amount: tax },
  ].map((i) => ({ ...i, amount: Math.round(i.amount) }));

  const sum = items.reduce((s, i) => s + i.amount, 0);
  const total = Math.max(RATES.minimumJob, Math.round(sum / 10) * 10);
  return {
    tier,
    squares,
    orderSquares,
    waste,
    items,
    total,
    low: Math.round((total * (1 - RATES.rangeSpread)) / 100) * 100,
    high: Math.round((total * (1 + RATES.rangeSpread)) / 100) * 100,
    perSqft: total / Math.max(totalSqft, 1),
  };
}
