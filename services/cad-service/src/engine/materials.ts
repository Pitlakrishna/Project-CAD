/**
 * Industrial engineering materials registry with verified ASTM/ISO physical & mechanical properties.
 */

export interface PhysicalMaterial {
  id: string;
  name: string;
  category: "metal" | "plastic" | "glass" | "rubber" | "composite" | "ceramic";
  density: number; // kg/m³
  youngsModulus: number; // GPa
  yieldStrength: number; // MPa
  ultimateStrength?: number; // MPa
  thermalConductivity?: number; // W/(m·K)
  costPerKg: number; // Estimated market price in USD / kg
  standard: string; // ASTM / ISO specification standard
  // Visual PBR rendering defaults
  color: string;
  roughness: number;
  metalness: number;
  transmission?: number;
  ior?: number;
  anisotropy?: number;
}

export const ENGINEERING_MATERIALS: Record<string, PhysicalMaterial> = {
  "steel-304": {
    id: "steel-304",
    name: "AISI 304 Stainless Steel",
    category: "metal",
    density: 8000,
    youngsModulus: 193,
    yieldStrength: 215,
    ultimateStrength: 505,
    thermalConductivity: 16.2,
    costPerKg: 4.50,
    standard: "ASTM A276 / ISO 15510",
    color: "#cbd5e1",
    roughness: 0.28,
    metalness: 0.95,
  },
  "steel-316": {
    id: "steel-316",
    name: "AISI 316L Marine-Grade Stainless Steel",
    category: "metal",
    density: 8000,
    youngsModulus: 193,
    yieldStrength: 290,
    ultimateStrength: 580,
    thermalConductivity: 16.3,
    costPerKg: 6.20,
    standard: "ASTM A276 / ISO 15510",
    color: "#94a3b8",
    roughness: 0.25,
    metalness: 0.95,
  },
  "aluminum-6061": {
    id: "aluminum-6061",
    name: "Aluminum 6061-T6",
    category: "metal",
    density: 2700,
    youngsModulus: 68.9,
    yieldStrength: 276,
    ultimateStrength: 310,
    thermalConductivity: 167,
    costPerKg: 3.80,
    standard: "ASTM B221 / ISO 209",
    color: "#e2e8f0",
    roughness: 0.32,
    metalness: 0.90,
  },
  "aluminum-7075": {
    id: "aluminum-7075",
    name: "Aluminum 7075-T6 Aerospace",
    category: "metal",
    density: 2810,
    youngsModulus: 71.7,
    yieldStrength: 503,
    ultimateStrength: 572,
    thermalConductivity: 130,
    costPerKg: 6.80,
    standard: "ASTM B221 / AMS 4045",
    color: "#f1f5f9",
    roughness: 0.30,
    metalness: 0.92,
  },
  "brass-c36000": {
    id: "brass-c36000",
    name: "C36000 Free-Cutting Brass",
    category: "metal",
    density: 8500,
    youngsModulus: 97,
    yieldStrength: 310,
    ultimateStrength: 400,
    thermalConductivity: 115,
    costPerKg: 7.50,
    standard: "ASTM B16 / EN 12164",
    color: "#d4af37",
    roughness: 0.38,
    metalness: 0.85,
  },
  "copper-c11000": {
    id: "copper-c11000",
    name: "C11000 Electrolytic Tough Pitch Copper",
    category: "metal",
    density: 8940,
    youngsModulus: 117,
    yieldStrength: 220,
    ultimateStrength: 260,
    thermalConductivity: 388,
    costPerKg: 9.80,
    standard: "ASTM B152",
    color: "#ea580c",
    roughness: 0.30,
    metalness: 0.90,
  },
  "titanium-gr5": {
    id: "titanium-gr5",
    name: "Ti-6Al-4V Grade 5 Titanium",
    category: "metal",
    density: 4430,
    youngsModulus: 113.8,
    yieldStrength: 880,
    ultimateStrength: 950,
    thermalConductivity: 6.7,
    costPerKg: 35.00,
    standard: "ASTM B348 / AMS 4928",
    color: "#64748b",
    roughness: 0.35,
    metalness: 0.90,
  },
  "plastic-pom": {
    id: "plastic-pom",
    name: "POM / Delrin Polyacetal",
    category: "plastic",
    density: 1420,
    youngsModulus: 3.1,
    yieldStrength: 65,
    ultimateStrength: 70,
    thermalConductivity: 0.31,
    costPerKg: 4.20,
    standard: "ISO 9988",
    color: "#18181b",
    roughness: 0.50,
    metalness: 0.0,
  },
  "plastic-abs": {
    id: "plastic-abs",
    name: "ABS Engineering Plastic",
    category: "plastic",
    density: 1050,
    youngsModulus: 2.3,
    yieldStrength: 45,
    ultimateStrength: 50,
    thermalConductivity: 0.25,
    costPerKg: 2.50,
    standard: "ISO 2580",
    color: "#334155",
    roughness: 0.45,
    metalness: 0.0,
  },
  "plastic-petg": {
    id: "plastic-petg",
    name: "PETG Thermoplastic",
    category: "plastic",
    density: 1270,
    youngsModulus: 2.1,
    yieldStrength: 50,
    ultimateStrength: 53,
    thermalConductivity: 0.24,
    costPerKg: 2.80,
    standard: "ISO 1163",
    color: "#38bdf8",
    roughness: 0.40,
    metalness: 0.0,
  },
  "plastic-nylon": {
    id: "plastic-nylon",
    name: "Nylon PA12 Polyamide",
    category: "plastic",
    density: 1010,
    youngsModulus: 1.7,
    yieldStrength: 52,
    ultimateStrength: 55,
    thermalConductivity: 0.22,
    costPerKg: 8.00,
    standard: "ISO 1874",
    color: "#f8fafc",
    roughness: 0.60,
    metalness: 0.0,
  },
  "glass-sodalime": {
    id: "glass-sodalime",
    name: "Soda-Lime Optical Glass",
    category: "glass",
    density: 2500,
    youngsModulus: 70,
    yieldStrength: 40,
    ultimateStrength: 45,
    thermalConductivity: 1.05,
    costPerKg: 3.00,
    standard: "ISO 12543",
    color: "#93c5fd",
    roughness: 0.05,
    metalness: 0.02,
    transmission: 0.95,
    ior: 1.52,
  },
  "rubber-nbr": {
    id: "rubber-nbr",
    name: "NBR Nitrile Rubber 70A",
    category: "rubber",
    density: 1250,
    youngsModulus: 0.015,
    yieldStrength: 15,
    ultimateStrength: 18,
    thermalConductivity: 0.25,
    costPerKg: 4.50,
    standard: "ISO 1629",
    color: "#09090b",
    roughness: 0.85,
    metalness: 0.0,
  },
  "composite-carbon": {
    id: "composite-carbon",
    name: "Carbon Fiber Epoxy Composite",
    category: "composite",
    density: 1600,
    youngsModulus: 135,
    yieldStrength: 600,
    ultimateStrength: 750,
    thermalConductivity: 5.0,
    costPerKg: 45.00,
    standard: "ISO 13003",
    color: "#1e293b",
    roughness: 0.40,
    metalness: 0.15,
  },
  "wood-oak": {
    id: "wood-oak",
    name: "Natural Hardwood / Oak",
    category: "composite",
    density: 750,
    youngsModulus: 12,
    yieldStrength: 40,
    ultimateStrength: 85,
    thermalConductivity: 0.15,
    costPerKg: 1.80,
    standard: "ASTM D143",
    color: "#a16207",
    roughness: 0.48,
    metalness: 0.02,
  },
  "concrete-structural": {
    id: "concrete-structural",
    name: "Structural Concrete / Stucco",
    category: "ceramic",
    density: 2400,
    youngsModulus: 30,
    yieldStrength: 25,
    ultimateStrength: 35,
    thermalConductivity: 1.4,
    costPerKg: 0.12,
    standard: "ASTM C39 / ISO 1920",
    color: "#cbd5e1",
    roughness: 0.85,
    metalness: 0.04,
  },
  "ceramic-tile": {
    id: "ceramic-tile",
    name: "Glazed Architectural Ceramic",
    category: "ceramic",
    density: 2300,
    youngsModulus: 70,
    yieldStrength: 80,
    ultimateStrength: 120,
    thermalConductivity: 1.5,
    costPerKg: 1.20,
    standard: "ISO 10545",
    color: "#f8fafc",
    roughness: 0.16,
    metalness: 0.05,
  },
};

/**
 * Resolves a natural-language or keyword material string to a certified engineering material.
 */
export function resolveEngineeringMaterial(input?: string): PhysicalMaterial {
  if (!input || typeof input !== "string") {
    return ENGINEERING_MATERIALS["aluminum-6061"];
  }

  const query = input.toLowerCase().trim();

  // 1. Direct ID match
  if (ENGINEERING_MATERIALS[query]) {
    return ENGINEERING_MATERIALS[query];
  }

  // 2. Keyword heuristic mapping
  if (/316|marine/.test(query)) {
    return ENGINEERING_MATERIALS["steel-316"];
  }
  if (/steel|stainless|aisi|iron|ferrous/.test(query)) {
    return ENGINEERING_MATERIALS["steel-304"];
  }
  if (/7075|aerospace\s*al/.test(query)) {
    return ENGINEERING_MATERIALS["aluminum-7075"];
  }
  if (/aluminum|aluminium|al-6061|6061|alloy|metal|chrome/.test(query)) {
    return ENGINEERING_MATERIALS["aluminum-6061"];
  }
  if (/brass|bronze|copper\s*alloy/.test(query)) {
    return ENGINEERING_MATERIALS["brass-c36000"];
  }
  if (/copper/.test(query)) {
    return ENGINEERING_MATERIALS["copper-c11000"];
  }
  if (/titanium|ti-6al/.test(query)) {
    return ENGINEERING_MATERIALS["titanium-gr5"];
  }
  if (/pom|delrin|acetal|polyoxymethylene/.test(query)) {
    return ENGINEERING_MATERIALS["plastic-pom"];
  }
  if (/petg/.test(query)) {
    return ENGINEERING_MATERIALS["plastic-petg"];
  }
  if (/nylon|pa12|pa6|polyamide/.test(query)) {
    return ENGINEERING_MATERIALS["plastic-nylon"];
  }
  if (/glass|lens|optics|screen|window|prism/.test(query)) {
    return ENGINEERING_MATERIALS["glass-sodalime"];
  }
  if (/rubber|gasket|seal|o-ring|silicone/.test(query)) {
    return ENGINEERING_MATERIALS["rubber-nbr"];
  }
  if (/carbon\s*fiber|composite/.test(query)) {
    return ENGINEERING_MATERIALS["composite-carbon"];
  }
  if (/wood|timber|oak|pine|tree|teak|cedar/.test(query)) {
    return ENGINEERING_MATERIALS["wood-oak"];
  }
  if (/concrete|stucco|cement|stone|mortar|masonry/.test(query)) {
    return ENGINEERING_MATERIALS["concrete-structural"];
  }
  if (/ceramic|porcelain|tile|marble/.test(query)) {
    return ENGINEERING_MATERIALS["ceramic-tile"];
  }
  if (/plastic|abs|polymer|matte|resin/.test(query)) {
    return ENGINEERING_MATERIALS["plastic-abs"];
  }

  // Default fallback: Aluminum 6061-T6
  return ENGINEERING_MATERIALS["aluminum-6061"];
}
