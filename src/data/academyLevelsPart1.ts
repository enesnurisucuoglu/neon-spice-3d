import {
  ACResult,
  AnalysisConfig,
  CircuitComponent,
  CircuitSchematic,
  ComponentParams,
  ComponentType,
  DCOPResult,
  ProbeMarker,
  Rotation,
  SimulationResult,
  TransientResult,
  Wire,
} from '../types/circuit';
import { AcademyLevel, LevelCheckResult } from '../types/academy';

// ============================================================================
// Reusable Analysis Config Helpers
// ============================================================================

function makeDCAnalysis(sourceName = 'V1'): AnalysisConfig {
  return {
    type: 'dc_op',
    transient: { stopTime: 5e-3, timeStep: 20e-6, method: 'trapezoidal' },
    ac: {
      startFreq: 10,
      stopFreq: 100000,
      pointsPerDecade: 30,
      inputSourceName: sourceName,
    },
    dcSweep: { sourceName, startValue: 0, stopValue: 10, stepValue: 0.5 },
  };
}

function makeTransientAnalysis(
  stopTime: number,
  timeStep: number,
  sourceName = 'V1'
): AnalysisConfig {
  return {
    type: 'transient',
    transient: { stopTime, timeStep, method: 'trapezoidal' },
    ac: {
      startFreq: 10,
      stopFreq: 100000,
      pointsPerDecade: 30,
      inputSourceName: sourceName,
    },
    dcSweep: { sourceName, startValue: 0, stopValue: 5, stepValue: 0.25 },
  };
}

function makeACAnalysis(
  startFreq = 10,
  stopFreq = 100000,
  pointsPerDecade = 40,
  sourceName = 'V1'
): AnalysisConfig {
  return {
    type: 'ac',
    transient: { stopTime: 5e-3, timeStep: 20e-6, method: 'trapezoidal' },
    ac: { startFreq, stopFreq, pointsPerDecade, inputSourceName: sourceName },
    dcSweep: { sourceName, startValue: -5, stopValue: 5, stepValue: 0.5 },
  };
}

// ============================================================================
// Verified Pin-Aligned Schematic Builders (Integer Grid, Zero Shorts/Floats)
// ============================================================================

interface CompSpec {
  name: string;
  type: ComponentType;
  params: ComponentParams;
  rotation?: Rotation;
}

/**
 * Topology A: Single vertical load across a voltage source.
 * V1 at (6,8): pos=(6,6), neg=(6,10) -> GND1 at (6,11) [pin (6,10)]
 * Load at (14,8) rot=90: p1=(14,6), p2=(14,10) -> GND2 at (14,11) [pin (14,10)]
 * Wire: (6,6) -> (14,6)
 */
function buildSingleLoadSchematic(
  id: string,
  name: string,
  description: string,
  category: CircuitSchematic['category'],
  source: CompSpec,
  load: CompSpec,
  analysis: AnalysisConfig
): CircuitSchematic {
  const components: CircuitComponent[] = [
    {
      id: `${id}-v1`,
      name: source.name,
      type: source.type,
      x: 6,
      y: 8,
      rotation: 0,
      params: source.params,
    },
    {
      id: `${id}-gnd1`,
      name: 'GND1',
      type: 'ground',
      x: 6,
      y: 11,
      rotation: 0,
      params: {},
    },
    {
      id: `${id}-load`,
      name: load.name,
      type: load.type,
      x: 14,
      y: 8,
      rotation: load.rotation ?? 90,
      params: load.params,
    },
    {
      id: `${id}-gnd2`,
      name: 'GND2',
      type: 'ground',
      x: 14,
      y: 11,
      rotation: 0,
      params: {},
    },
  ];
  const wires: Wire[] = [{ id: `${id}-w1`, x1: 6, y1: 6, x2: 14, y2: 6 }];
  const probes: ProbeMarker[] = [
    { id: `${id}-p1`, label: 'V_IN', x: 6, y: 6, color: '#22d3ee' },
  ];
  return {
    id,
    name,
    description,
    category,
    components,
    wires,
    probes,
    recommendedAnalysis: analysis,
  };
}

/**
 * Topology B: Source + Horizontal Series Element (E1) + Vertical Shunt/Load Element (E2).
 * V1 at (6,8): pos=(6,6), neg=(6,10) -> GND1 at (6,11)
 * E1 at (11,6) rot=0: left=(9,6), right=(13,6)
 * E2 at (16,8) rot=90 (or 270): top=(16,6), bot=(16,10) -> GND2 at (16,11)
 * Wires: (6,6)->(9,6) and (13,6)->(16,6)
 */
function buildSeriesTwoSchematic(
  id: string,
  name: string,
  description: string,
  category: CircuitSchematic['category'],
  source: CompSpec,
  seriesEl: CompSpec,
  shuntEl: CompSpec,
  outProbeLabel: string,
  analysis: AnalysisConfig
): CircuitSchematic {
  const components: CircuitComponent[] = [
    {
      id: `${id}-v1`,
      name: source.name,
      type: source.type,
      x: 6,
      y: 8,
      rotation: 0,
      params: source.params,
    },
    {
      id: `${id}-gnd1`,
      name: 'GND1',
      type: 'ground',
      x: 6,
      y: 11,
      rotation: 0,
      params: {},
    },
    {
      id: `${id}-e1`,
      name: seriesEl.name,
      type: seriesEl.type,
      x: 11,
      y: 6,
      rotation: seriesEl.rotation ?? 0,
      params: seriesEl.params,
    },
    {
      id: `${id}-e2`,
      name: shuntEl.name,
      type: shuntEl.type,
      x: 16,
      y: 8,
      rotation: shuntEl.rotation ?? 90,
      params: shuntEl.params,
    },
    {
      id: `${id}-gnd2`,
      name: 'GND2',
      type: 'ground',
      x: 16,
      y: 11,
      rotation: 0,
      params: {},
    },
  ];
  const wires: Wire[] = [
    { id: `${id}-w1`, x1: 6, y1: 6, x2: 9, y2: 6 },
    { id: `${id}-w2`, x1: 13, y1: 6, x2: 16, y2: 6 },
  ];
  const probes: ProbeMarker[] = [
    { id: `${id}-p1`, label: 'V_IN', x: 6, y: 6, color: '#22d3ee' },
    { id: `${id}-p2`, label: outProbeLabel, x: 16, y: 6, color: '#34d399' },
  ];
  return {
    id,
    name,
    description,
    category,
    components,
    wires,
    probes,
    recommendedAnalysis: analysis,
  };
}

/**
 * Topology C: Two parallel vertical resistors across a voltage source.
 * V1 at (6,8), R1 at (12,8) rot=90, R2 at (18,8) rot=90.
 */
function buildParallelTwoSchematic(
  id: string,
  name: string,
  description: string,
  vdc: number,
  r1: number,
  r2: number,
  analysis: AnalysisConfig
): CircuitSchematic {
  return {
    id,
    name,
    description,
    category: 'Passive',
    components: [
      {
        id: `${id}-v1`,
        name: 'V1',
        type: 'vdc',
        x: 6,
        y: 8,
        rotation: 0,
        params: { voltage: vdc, acMag: 0 },
      },
      {
        id: `${id}-gnd1`,
        name: 'GND1',
        type: 'ground',
        x: 6,
        y: 11,
        rotation: 0,
        params: {},
      },
      {
        id: `${id}-r1`,
        name: 'R1',
        type: 'resistor',
        x: 12,
        y: 8,
        rotation: 90,
        params: { resistance: r1 },
      },
      {
        id: `${id}-gnd2`,
        name: 'GND2',
        type: 'ground',
        x: 12,
        y: 11,
        rotation: 0,
        params: {},
      },
      {
        id: `${id}-r2`,
        name: 'R2',
        type: 'resistor',
        x: 18,
        y: 8,
        rotation: 90,
        params: { resistance: r2 },
      },
      {
        id: `${id}-gnd3`,
        name: 'GND3',
        type: 'ground',
        x: 18,
        y: 11,
        rotation: 0,
        params: {},
      },
    ],
    wires: [
      { id: `${id}-w1`, x1: 6, y1: 6, x2: 12, y2: 6 },
      { id: `${id}-w2`, x1: 12, y1: 6, x2: 18, y2: 6 },
    ],
    probes: [{ id: `${id}-p1`, label: 'V_IN', x: 6, y: 6, color: '#22d3ee' }],
    recommendedAnalysis: analysis,
  };
}

/**
 * Topology D: Potentiometer voltage divider.
 * V1 at (6,8): pos=(6,6), neg=(6,10) -> GND1 at (6,11)
 * RV1 at (14,8) rot=90: p1=(14,6) [+V], p2=(14,10) [GND], wiper=(16,8)
 * Wire (6,6)->(14,6) and wiper stub (16,8)->(19,8) with probe V_WIPER.
 */
function buildPotentiometerSchematic(
  id: string,
  name: string,
  description: string,
  vdc: number,
  resistance: number,
  wiperPos: number,
  analysis: AnalysisConfig
): CircuitSchematic {
  return {
    id,
    name,
    description,
    category: 'Passive',
    components: [
      {
        id: `${id}-v1`,
        name: 'V1',
        type: 'vdc',
        x: 6,
        y: 8,
        rotation: 0,
        params: { voltage: vdc, acMag: 0 },
      },
      {
        id: `${id}-gnd1`,
        name: 'GND1',
        type: 'ground',
        x: 6,
        y: 11,
        rotation: 0,
        params: {},
      },
      {
        id: `${id}-rv1`,
        name: 'RV1',
        type: 'potentiometer',
        x: 14,
        y: 8,
        rotation: 90,
        params: { resistance, wiperPos },
      },
      {
        id: `${id}-gnd2`,
        name: 'GND2',
        type: 'ground',
        x: 14,
        y: 11,
        rotation: 0,
        params: {},
      },
    ],
    wires: [
      { id: `${id}-w1`, x1: 6, y1: 6, x2: 14, y2: 6 },
      { id: `${id}-w2`, x1: 16, y1: 8, x2: 19, y2: 8 },
    ],
    probes: [
      { id: `${id}-p1`, label: 'V_IN', x: 6, y: 6, color: '#22d3ee' },
      { id: `${id}-p2`, label: 'V_WIPER', x: 19, y: 8, color: '#34d399' },
    ],
    recommendedAnalysis: analysis,
  };
}

/**
 * Topology E: Shunt Zener Regulator (V1 -> R_S -> DZ1(rev) || R_L).
 * DZ1 at (16,8) rot=270: cathode=(16,6) [V_REG], anode=(16,10) [GND].
 */
function buildZenerRegulatorSchematic(
  id: string,
  name: string,
  description: string,
  vdc: number,
  rs: number,
  bv: number,
  rl: number,
  analysis: AnalysisConfig
): CircuitSchematic {
  return {
    id,
    name,
    description,
    category: 'Semiconductors',
    components: [
      {
        id: `${id}-v1`,
        name: 'V1',
        type: 'vdc',
        x: 6,
        y: 8,
        rotation: 0,
        params: { voltage: vdc, acMag: 0 },
      },
      {
        id: `${id}-gnd1`,
        name: 'GND1',
        type: 'ground',
        x: 6,
        y: 11,
        rotation: 0,
        params: {},
      },
      {
        id: `${id}-rs`,
        name: 'R_S',
        type: 'resistor',
        x: 11,
        y: 6,
        rotation: 0,
        params: { resistance: rs },
      },
      {
        id: `${id}-dz1`,
        name: 'DZ1',
        type: 'zener',
        x: 16,
        y: 8,
        rotation: 270,
        params: { is: 1e-12, n: 1.0, bv },
      },
      {
        id: `${id}-gnd2`,
        name: 'GND2',
        type: 'ground',
        x: 16,
        y: 11,
        rotation: 0,
        params: {},
      },
      {
        id: `${id}-rl`,
        name: 'R_L',
        type: 'resistor',
        x: 21,
        y: 8,
        rotation: 90,
        params: { resistance: rl },
      },
      {
        id: `${id}-gnd3`,
        name: 'GND3',
        type: 'ground',
        x: 21,
        y: 11,
        rotation: 0,
        params: {},
      },
    ],
    wires: [
      { id: `${id}-w1`, x1: 6, y1: 6, x2: 9, y2: 6 },
      { id: `${id}-w2`, x1: 13, y1: 6, x2: 16, y2: 6 },
      { id: `${id}-w3`, x1: 16, y1: 6, x2: 21, y2: 6 },
    ],
    probes: [
      { id: `${id}-p1`, label: 'V_IN', x: 6, y: 6, color: '#22d3ee' },
      { id: `${id}-p2`, label: 'V_REG', x: 21, y: 6, color: '#34d399' },
    ],
    recommendedAnalysis: analysis,
  };
}

/**
 * Topology F: Series RLC Bandpass Filter (VAC -> L1 -> C1 -> R1 to GND).
 * V1 at (5,8), L1 at (9,6), C1 at (15,6), R1 at (20,8) rot=90.
 */
function buildSeriesRLCSchematic(
  id: string,
  name: string,
  description: string,
  inductance: number,
  capacitance: number,
  resistance: number,
  analysis: AnalysisConfig
): CircuitSchematic {
  return {
    id,
    name,
    description,
    category: 'Filters',
    components: [
      {
        id: `${id}-v1`,
        name: 'V1',
        type: 'vac',
        x: 5,
        y: 8,
        rotation: 0,
        params: { voltage: 0, amplitude: 5, frequency: 1000, phase: 0, acMag: 1 },
      },
      {
        id: `${id}-gnd1`,
        name: 'GND1',
        type: 'ground',
        x: 5,
        y: 11,
        rotation: 0,
        params: {},
      },
      {
        id: `${id}-l1`,
        name: 'L1',
        type: 'inductor',
        x: 9,
        y: 6,
        rotation: 0,
        params: { inductance, ic: 0 },
      },
      {
        id: `${id}-c1`,
        name: 'C1',
        type: 'capacitor',
        x: 15,
        y: 6,
        rotation: 0,
        params: { capacitance, ic: 0 },
      },
      {
        id: `${id}-r1`,
        name: 'R1',
        type: 'resistor',
        x: 20,
        y: 8,
        rotation: 90,
        params: { resistance },
      },
      {
        id: `${id}-gnd2`,
        name: 'GND2',
        type: 'ground',
        x: 20,
        y: 11,
        rotation: 0,
        params: {},
      },
    ],
    wires: [
      { id: `${id}-w1`, x1: 5, y1: 6, x2: 7, y2: 6 },
      { id: `${id}-w2`, x1: 11, y1: 6, x2: 13, y2: 6 },
      { id: `${id}-w3`, x1: 17, y1: 6, x2: 20, y2: 6 },
    ],
    probes: [
      { id: `${id}-p1`, label: 'V_IN', x: 5, y: 6, color: '#22d3ee' },
      { id: `${id}-p2`, label: 'V_OUT', x: 20, y: 6, color: '#34d399' },
    ],
    recommendedAnalysis: analysis,
  };
}

/**
 * Topology G: Step-Down Transformer (VAC -> T1 -> R_LOAD).
 * V1 at (6,8): pos=(6,6), neg=(6,10) -> GND1 at (6,11)
 * T1 at (13,8) rot=0: p1=(11,7), p2=(11,9), s1=(15,7), s2=(15,9)
 * R_LOAD at (20,8) rot=90: p1=(20,6), p2=(20,10) -> GND2 at (20,11)
 */
function buildTransformerSchematic(
  id: string,
  name: string,
  description: string,
  amplitude: number,
  turnsRatio: number,
  rLoad: number,
  analysis: AnalysisConfig
): CircuitSchematic {
  return {
    id,
    name,
    description,
    category: 'Power',
    components: [
      {
        id: `${id}-v1`,
        name: 'V1',
        type: 'vac',
        x: 6,
        y: 8,
        rotation: 0,
        params: { voltage: 0, amplitude, frequency: 60, phase: 0, acMag: 1 },
      },
      {
        id: `${id}-gnd1`,
        name: 'GND1',
        type: 'ground',
        x: 6,
        y: 11,
        rotation: 0,
        params: {},
      },
      {
        id: `${id}-t1`,
        name: 'T1',
        type: 'transformer',
        x: 13,
        y: 8,
        rotation: 0,
        params: { turnsRatio },
      },
      {
        id: `${id}-rload`,
        name: 'R_LOAD',
        type: 'resistor',
        x: 20,
        y: 8,
        rotation: 90,
        params: { resistance: rLoad },
      },
      {
        id: `${id}-gnd2`,
        name: 'GND2',
        type: 'ground',
        x: 20,
        y: 11,
        rotation: 0,
        params: {},
      },
    ],
    wires: [
      // Primary: V1.pos (6,6) -> (9,6) -> (9,7) -> T1.p1 (11,7)
      { id: `${id}-w1`, x1: 6, y1: 6, x2: 9, y2: 6 },
      { id: `${id}-w2`, x1: 9, y1: 6, x2: 9, y2: 7 },
      { id: `${id}-w3`, x1: 9, y1: 7, x2: 11, y2: 7 },
      // Primary return: T1.p2 (11,9) -> (9,9) -> (9,10) -> V1.neg (6,10)
      { id: `${id}-w4`, x1: 11, y1: 9, x2: 9, y2: 9 },
      { id: `${id}-w5`, x1: 9, y1: 9, x2: 9, y2: 10 },
      { id: `${id}-w6`, x1: 9, y1: 10, x2: 6, y2: 10 },
      // Secondary: T1.s1 (15,7) -> (17,7) -> (17,6) -> R_LOAD.p1 (20,6)
      { id: `${id}-w7`, x1: 15, y1: 7, x2: 17, y2: 7 },
      { id: `${id}-w8`, x1: 17, y1: 7, x2: 17, y2: 6 },
      { id: `${id}-w9`, x1: 17, y1: 6, x2: 20, y2: 6 },
      // Secondary return: T1.s2 (15,9) -> (17,9) -> (17,10) -> R_LOAD.p2 (20,10)
      { id: `${id}-w10`, x1: 15, y1: 9, x2: 17, y2: 9 },
      { id: `${id}-w11`, x1: 17, y1: 9, x2: 17, y2: 10 },
      { id: `${id}-w12`, x1: 17, y1: 10, x2: 20, y2: 10 },
    ],
    probes: [
      { id: `${id}-p1`, label: 'V_PRI', x: 6, y: 6, color: '#22d3ee' },
      { id: `${id}-p2`, label: 'V_SEC', x: 20, y: 6, color: '#34d399' },
    ],
    recommendedAnalysis: analysis,
  };
}

// ============================================================================
// Verification Measurement Utilities
// ============================================================================

function fmtCurrent(amps: number): string {
  const abs = Math.abs(amps);
  if (abs >= 1) return `${amps.toFixed(2)} A`;
  if (abs >= 1e-3) return `${(amps * 1e3).toFixed(2)} mA`;
  return `${(amps * 1e6).toFixed(1)} µA`;
}

function fmtFreq(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(2)} kHz`;
  return `${hz.toFixed(1)} Hz`;
}

function sampleTransientAt(
  tr: TransientResult,
  probeLabel: string,
  targetTime: number
): number | null {
  const vals = tr.probeVoltages[probeLabel];
  if (!vals || vals.length === 0 || tr.times.length === 0) return null;
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < tr.times.length; i++) {
    const diff = Math.abs(tr.times[i] - targetTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return vals[bestIdx];
}

function findACLowPassCutoffHz(ac: ACResult, probeLabel: string): number | null {
  const mags = ac.magnitudeDb[probeLabel];
  if (!mags || mags.length < 2) return null;
  const passbandDb = mags[0];
  const targetDb = passbandDb - 3.01;
  for (let i = 1; i < mags.length; i++) {
    if (mags[i] <= targetDb) {
      const f0 = ac.frequencies[i - 1];
      const f1 = ac.frequencies[i];
      const m0 = mags[i - 1];
      const m1 = mags[i];
      const frac = m0 !== m1 ? (targetDb - m0) / (m1 - m0) : 0;
      return f0 * Math.pow(f1 / f0, Math.min(Math.max(frac, 0), 1));
    }
  }
  return null;
}

function sampleACDbAtFreq(
  ac: ACResult,
  probeLabel: string,
  targetFreq: number
): number | null {
  const mags = ac.magnitudeDb[probeLabel];
  if (!mags || mags.length === 0) return null;
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < ac.frequencies.length; i++) {
    const diff = Math.abs(Math.log10(ac.frequencies[i]) - Math.log10(targetFreq));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return mags[bestIdx];
}

function findACPeakFreqHz(ac: ACResult, probeLabel: string): number | null {
  const mags = ac.magnitudeDb[probeLabel];
  if (!mags || mags.length === 0) return null;
  let peakIdx = 0;
  for (let i = 1; i < mags.length; i++) {
    if (mags[i] > mags[peakIdx]) peakIdx = i;
  }
  return ac.frequencies[peakIdx];
}

function buildResult(
  details: LevelCheckResult['details'],
  passMsg: string,
  failMsg: string
): LevelCheckResult {
  const passed = details.every((d) => d.ok);
  return {
    passed,
    summary: passed ? passMsg : failMsg,
    details,
  };
}

// ============================================================================
// ACADEMY LEVELS PART 1 (Levels 1 – 25, Chapters 1 – 5)
// ============================================================================

export const ACADEMY_LEVELS_PART1: AcademyLevel[] = [
  // ==========================================================================
  // BÖLÜM 1: İLK ELEKTRİK KIVILCIMI (L1–L5)
  // ==========================================================================
  {
    id: 1,
    chapter: 1,
    chapterTitle: 'İlk Elektrik Kıvılcımı',
    title: 'İlk Devren: 5V Pil ve 1kΩ Direnç',
    difficulty: 'Başlangıç',
    concept:
      'Elektroniğin en temel kuralı Ohm Kanunu’dur: I = V / R. Sabit bir 5V kaynağa bağlanan direnç, devreden geçecek akım miktarını doğrudan belirler. Direnç küçüldükçe akım büyür; 5V altında tam 5 mA akım elde etmek için 1 kΩ direnç gerekir.',
    steps: [
      'Şemadaki R1 direncine tıkla (şu an 10 kΩ olarak ayarlı).',
      'Sağdaki Özellikler panelinden R1 direnç değerini 1000 Ω (1 kΩ) yap.',
      'Simülasyonu çalıştır ve R1 üzerinden geçen akımın 5 mA olduğunu doğrula.',
    ],
    goalText: 'R1 direncini ayarlayarak devreden 4.5 mA – 5.5 mA arası akım geçir.',
    hint: 'I = V / R formülünden R = 5 V / 0.005 A = 1000 Ω (1 kΩ) çıkar.',
    realWorldNote:
      '1 kΩ direnç elektronik masalarının en sık kullanılan değeridir; 5V devrelerde 5 mA gibi güvenli bir test akımı verir ve yalnızca 25 mW ısı üretir.',
    starterSchematic: buildSingleLoadSchematic(
      'acad-l1-start',
      'Seviye 1: 5V Pil ve Direnç',
      '5V DC kaynak ve R1 direnci ile ilk Ohm Kanunu deneyi.',
      'Passive',
      { name: 'V1', type: 'vdc', params: { voltage: 5, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 10000 } },
      makeDCAnalysis()
    ),
    solutionSchematic: buildSingleLoadSchematic(
      'acad-l1-sol',
      'Seviye 1: 5V Pil ve 1kΩ Direnç (Çözüm)',
      '5V DC kaynak ve 1kΩ direnç ile 5 mA akım.',
      'Passive',
      { name: 'V1', type: 'vdc', params: { voltage: 5, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 1000 } },
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const iR1 = Math.abs(dcOp.branchCurrents['R1'] ?? 0);
      const ok = iR1 >= 4.5e-3 && iR1 <= 5.5e-3;
      return buildResult(
        [
          {
            label: 'R1 Akımı I(R1)',
            actual: fmtCurrent(iR1),
            target: '4.5 – 5.5 mA',
            ok,
          },
        ],
        'Harika başlangıç! İlk devrende 5V ile tam 5 mA akım elde ettin.',
        'R1 akımı henüz hedef aralıkta değil. R1 değerini 1000 Ω (1 kΩ) yapmayı dene.'
      );
    },
  },

  {
    id: 2,
    chapter: 1,
    chapterTitle: 'İlk Elektrik Kıvılcımı',
    title: 'Ohm Kanunu: Direnci Yarıya İndir',
    difficulty: 'Başlangıç',
    concept:
      'Ohm Kanunu (I = V / R) akım ile direncin ters orantılı olduğunu söyler. Gerilim 5V sabit kalırken direnci yarıya indirirsen, borudaki daralma genişlediği için akım tam iki katına (10 mA) çıkar.',
    steps: [
      'Mevcut devrede V1 = 5V ve R1 = 1 kΩ iken akım 5 mA’dir.',
      'R1 direncini seç ve değerini yarıya yani 500 Ω (veya standart 470 Ω–510 Ω) indir.',
      'Doğrula butonuna basarak akımın 10 mA civarına yükseldiğini gör.',
    ],
    goalText: 'R1 direncini azaltarak I(R1) akımını 9.0 mA – 11.0 mA aralığına getir.',
    hint: '5 V / 10 mA = 500 Ω. R1 direncini 500 yapman yeterli.',
    realWorldNote:
      'Gerçek hayatta tam 500 Ω yerine en yakın E24 standart değeri olan 510 Ω (veya iki adet 1 kΩ paralel) kullanılır.',
    starterSchematic: buildSingleLoadSchematic(
      'acad-l2-start',
      'Seviye 2: Direnci Yarıya İndir',
      '5V kaynakta direnci yarıya indirerek akımı iki katına çıkarma.',
      'Passive',
      { name: 'V1', type: 'vdc', params: { voltage: 5, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 1000 } },
      makeDCAnalysis()
    ),
    solutionSchematic: buildSingleLoadSchematic(
      'acad-l2-sol',
      'Seviye 2: 500Ω ile 10mA (Çözüm)',
      '5V kaynak ve 500Ω direnç ile 10 mA akım.',
      'Passive',
      { name: 'V1', type: 'vdc', params: { voltage: 5, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 500 } },
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const iR1 = Math.abs(dcOp.branchCurrents['R1'] ?? 0);
      const ok = iR1 >= 9.0e-3 && iR1 <= 11.0e-3;
      return buildResult(
        [
          {
            label: 'R1 Akımı I(R1)',
            actual: fmtCurrent(iR1),
            target: '9.0 – 11.0 mA',
            ok,
          },
        ],
        'Süper! Direnci yarıya indirince akım tam iki katına çıktı.',
        'Akım hedef aralıkta değil. R1 direncini 500 Ω civarına düşürmeyi dene.'
      );
    },
  },

  {
    id: 3,
    chapter: 1,
    chapterTitle: 'İlk Elektrik Kıvılcımı',
    title: "İlk LED'ini Güvenle Yak!",
    difficulty: 'Başlangıç',
    concept:
      'Kırmızı bir LED iletime geçtiğinde üzerinde yaklaşık 1.85V gerilim düşürür. LED’i doğrudan 5V pile bağlarsan aşırı akımdan anında yanar! Seri bir direnç ekleyerek kalan (5V - 1.85V = 3.15V) gerilimi direncin üstüne alır ve LED akımını güvenli 10–20 mA aralığında tutarız.',
    steps: [
      'Devredeki R1 şu an 10 kΩ olduğu için LED üzerinden sadece ~0.3 mA geçiyor ve LED sönük kalıyor.',
      'R1 direncine tıkla ve değerini 220 Ω yap (3.15 V / 220 Ω ≈ 14.3 mA).',
      'Simülasyonu çalıştırıp LED akımının güvenli parlaklık aralığında olduğunu gör.',
    ],
    goalText: 'R1 direncini seçerek kırmızı LED akımını 10 mA – 20 mA aralığına getir.',
    hint: 'R = (V_kaynak - V_LED) / I = (5 - 1.85) / 0.015 ≈ 210 Ω → standart 220 Ω harika çalışır.',
    realWorldNote:
      'Arduino ve Raspberry Pi projelerinde 5V çıkışa kırmızı LED bağlarken 220 Ω veya 330 Ω direnç kullanmak altın standarttır.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l3-start',
      'Seviye 3: 5V ile Kırmızı LED',
      '5V kaynak, seri akım sınırlama direnci ve kırmızı LED.',
      'Semiconductors',
      { name: 'V1', type: 'vdc', params: { voltage: 5, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 10000 } },
      { name: 'LED1', type: 'led', params: { ledColor: 'red', is: 1e-20 } },
      'V_LED',
      makeDCAnalysis()
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l3-sol',
      'Seviye 3: 5V ile Kırmızı LED (Çözüm)',
      '220Ω dirençle 14.3 mA akımda güvenle yanan kırmızı LED.',
      'Semiconductors',
      { name: 'V1', type: 'vdc', params: { voltage: 5, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 220 } },
      { name: 'LED1', type: 'led', params: { ledColor: 'red', is: 1e-20 } },
      'V_LED',
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const iLed = dcOp.branchCurrents['LED1'] ?? 0;
      const ok = iLed >= 10e-3 && iLed <= 20e-3;
      return buildResult(
        [
          {
            label: 'LED1 Akımı I(LED1)',
            actual: fmtCurrent(iLed),
            target: '10.0 – 20.0 mA',
            ok,
          },
        ],
        'Tebrikler! İlk LED’ini yakmadan, tam ideal parlaklıkta çalıştırdın.',
        'LED akımı hedef aralıkta değil. 220 Ω veya 270 Ω direnç kullanmayı dene.'
      );
    },
  },

  {
    id: 4,
    chapter: 1,
    chapterTitle: 'İlk Elektrik Kıvılcımı',
    title: '9V Pil ile Yeşil LED Sürme',
    difficulty: 'Başlangıç',
    concept:
      'Besleme gerilimi 9V’a çıktığında ve LED rengi yeşile (V_f ≈ 2.2V) döndüğünde seri direnci yeniden hesaplamamız gerekir. Direnç üzerinde artık 9V - 2.2V = 6.8V düşecektir; bu nedenle 5V’ta kullandığımız 220 Ω yerine daha büyük bir direnç seçmeliyiz.',
    steps: [
      'R1 direncinin üzerinde düşecek gerilimi hesapla: V_R = 9V - 2.2V = 6.8V.',
      '~17 mA akım için R1 direncini 390 Ω (veya 470 Ω) olarak değiştir.',
      'Doğrula butonuna bas ve yeşil LED’in 12–22 mA arasında güvenle çalıştığını gör.',
    ],
    goalText: 'R1 değerini ayarlayarak yeşil LED akımını 12 mA – 22 mA aralığına getir.',
    hint: 'R = (9 - 2.2) / 0.017 ≈ 400 Ω → standart 390 Ω ile ~17.4 mA elde edersin.',
    realWorldNote:
      '9V pil ile 17 mA çekerken 390 Ω direnç üzerinde P = 6.8V × 0.017A ≈ 0.12 W ısı oluşur; standart 1/4W (0.25W) direnç bunu rahatlıkla taşır.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l4-start',
      'Seviye 4: 9V Pil ile Yeşil LED',
      '9V besleme ve yeşil LED için doğru akım sınırlama direnci seçimi.',
      'Semiconductors',
      { name: 'V1', type: 'vdc', params: { voltage: 9, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 10000 } },
      { name: 'LED1', type: 'led', params: { ledColor: 'green', is: 1e-20 } },
      'V_LED',
      makeDCAnalysis()
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l4-sol',
      'Seviye 4: 9V Pil ile Yeşil LED (Çözüm)',
      '390Ω direnç ile 9V pilden güvenle sürülen yeşil LED.',
      'Semiconductors',
      { name: 'V1', type: 'vdc', params: { voltage: 9, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 390 } },
      { name: 'LED1', type: 'led', params: { ledColor: 'green', is: 1e-20 } },
      'V_LED',
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const iLed = dcOp.branchCurrents['LED1'] ?? 0;
      const ok = iLed >= 12e-3 && iLed <= 22e-3;
      return buildResult(
        [
          {
            label: 'LED1 Akımı I(LED1)',
            actual: fmtCurrent(iLed),
            target: '12.0 – 22.0 mA',
            ok,
          },
        ],
        'Mükemmel! 9V pil ve yeşil LED için doğru direnci nokta atışı hesapladın.',
        'Yeşil LED akımı 12–22 mA aralığında değil. R1 için 390 Ω veya 470 Ω dene.'
      );
    },
  },

  {
    id: 5,
    chapter: 1,
    chapterTitle: 'İlk Elektrik Kıvılcımı',
    title: 'Sigorta Koruması',
    difficulty: 'Başlangıç',
    concept:
      'Sigorta, devrede kısa devre veya aşırı yük oluştuğunda kabloların ve güç kaynağının zarar görmesini önler. 12V kaynakta 5 Ω yük bağlandığında akım ~2.4A olur ve 1A’lik sigortayı attırır! Yük direncini artırarak akımı güvenli sınırın altına çekmeliyiz.',
    steps: [
      'Şu an R_LOAD = 5 Ω olduğundan F1 (1A) sigortasından 2.4A geçiyor ve aşırı akım uyarısı oluşuyor.',
      'R_LOAD direncine tıkla ve değerini 22 Ω (veya 15 Ω üzerinde bir değer) yap.',
      'Doğrula butonuna basarak akımın 0.95A altına indiğini ve sigorta uyarısının kalktığını gör.',
    ],
    goalText: 'R_LOAD değerini yükselterek |I(F1)| < 0.95 A yap ve sigorta uyarısını gider.',
    hint: '12 V / 1 A = 12 Ω minimum sınırdır. Güvenli pay için R_LOAD = 22 Ω seç (~0.54 A).',
    realWorldNote:
      'Otomobil elektrik sistemlerinde (12V) her alt devre (far, radyo, çakmaklık) ayrı bir bıçak sigorta ile korunur; sigorta her zaman kablonun taşıyabileceği akımdan düşük seçilir.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l5-start',
      'Seviye 5: Sigorta Koruması',
      '12V kaynak, 1A sigorta (F1) ve aşırı akım çeken 5Ω yük.',
      'Power',
      { name: 'V1', type: 'vdc', params: { voltage: 12, acMag: 0 } },
      { name: 'F1', type: 'fuse', params: { fuseRating: 1.0, rOn: 0.05 } },
      { name: 'R_LOAD', type: 'resistor', params: { resistance: 5 } },
      'V_LOAD',
      makeDCAnalysis()
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l5-sol',
      'Seviye 5: Sigorta Koruması (Çözüm)',
      '22Ω güvenli yük ile 1A sigorta sınırının altında çalışma.',
      'Power',
      { name: 'V1', type: 'vdc', params: { voltage: 12, acMag: 0 } },
      { name: 'F1', type: 'fuse', params: { fuseRating: 1.0, rOn: 0.05 } },
      { name: 'R_LOAD', type: 'resistor', params: { resistance: 22 } },
      'V_LOAD',
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const iF1 = Math.abs(dcOp.branchCurrents['F1'] ?? 0);
      const hasFuseWarn = dcOp.warnings.some((w) =>
        w.toLowerCase().includes('fuse')
      );
      const okCurr = iF1 > 1e-3 && iF1 < 0.95;
      const okWarn = !hasFuseWarn;
      return buildResult(
        [
          {
            label: 'Sigorta Akımı |I(F1)|',
            actual: fmtCurrent(iF1),
            target: '< 0.95 A',
            ok: okCurr,
          },
          {
            label: 'Sigorta Durumu',
            actual: hasFuseWarn ? 'Aşırı Akım Uyarısı!' : 'Güvenli (Sağlam)',
            target: 'Uyarı Yok',
            ok: okWarn,
          },
        ],
        'Harika! Akımı güvenli sınıra çektin ve sigorta artık sağlam kalıyor.',
        'Sigorta hâlâ aşırı akım altında! R_LOAD direncini 15 Ω–22 Ω üzerine çıkar.'
      );
    },
  },

  // ==========================================================================
  // BÖLÜM 2: SERİ, PARALEL VE GERİLİM BÖLÜCÜ (L6–L10)
  // ==========================================================================
  {
    id: 6,
    chapter: 2,
    chapterTitle: 'Seri, Paralel ve Gerilim Bölücü',
    title: 'Seri Dirençler',
    difficulty: 'Başlangıç',
    concept:
      'Uç uca (seri) bağlanan dirençlerin değerleri doğrudan toplanır: R_toplam = R1 + R2. Seri devrede her iki dirençten de aynı akım geçer (I = V / (R1 + R2)).',
    steps: [
      'Devrede V1 = 10V ve R1 = 1 kΩ sabit. Toplam akımı 2 mA yapmak istiyoruz.',
      'R_toplam = 10V / 2 mA = 5 kΩ olmalı. R1 = 1 kΩ olduğuna göre R2’yi 4 kΩ (4000 Ω) yap.',
      'Doğrula butonuna bas ve akımın 2.0 mA olduğunu kontrol et.',
    ],
    goalText: 'R2 değerini ayarlayarak seri kol akımı I(R1)’i 1.8 mA – 2.2 mA aralığına getir.',
    hint: 'R_toplam = 10V / 0.002A = 5000 Ω. R2 = 5000 - 1000 = 4000 Ω.',
    realWorldNote:
      'Elinde tam istediğin değerde direnç yoksa, iki veya daha fazla direnci seri bağlayarak (örneğin 1 kΩ + 3.9 kΩ ≈ 4.9 kΩ) istediğin toplam direnci kolayca elde edebilirsin.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l6-start',
      'Seviye 6: Seri Dirençler',
      '10V kaynak üzerinde seri bağlı R1 ve R2 dirençleri.',
      'Passive',
      { name: 'V1', type: 'vdc', params: { voltage: 10, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 1000 } },
      { name: 'R2', type: 'resistor', params: { resistance: 1000 } },
      'V_MID',
      makeDCAnalysis()
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l6-sol',
      'Seviye 6: Seri Dirençler (Çözüm)',
      '1kΩ + 4kΩ = 5kΩ toplam direnç ile 2 mA seri akım.',
      'Passive',
      { name: 'V1', type: 'vdc', params: { voltage: 10, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 1000 } },
      { name: 'R2', type: 'resistor', params: { resistance: 4000 } },
      'V_MID',
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const iR1 = Math.abs(dcOp.branchCurrents['R1'] ?? 0);
      const ok = iR1 >= 1.8e-3 && iR1 <= 2.2e-3;
      return buildResult(
        [
          {
            label: 'Seri Akım I(R1)',
            actual: fmtCurrent(iR1),
            target: '1.8 – 2.2 mA',
            ok,
          },
        ],
        'Süper! Seri dirençlerin toplamı 5 kΩ oldu ve devreden tam 2 mA akıyor.',
        'Akım hedef aralıkta değil. R1 + R2 = 5 kΩ olacak şekilde R2 = 4000 Ω dene.'
      );
    },
  },

  {
    id: 7,
    chapter: 2,
    chapterTitle: 'Seri, Paralel ve Gerilim Bölücü',
    title: 'Gerilim Bölücü: 10V → 5V',
    difficulty: 'Başlangıç',
    concept:
      'İki seri direncin orta noktasından alınan gerilim, dirençlerin oranına göre bölünür: V_OUT = V_IN · R2 / (R1 + R2). İki eşit direnç (R1 = R2) kullandığında giriş gerilimini tam yarıya bölersin!',
    steps: [
      'Şu an R1 = 1 kΩ ve R2 = 100 Ω olduğu için V_OUT sadece ~0.91V seviyesinde.',
      'R2 direncini seç ve R1’e eşit olacak şekilde 1000 Ω (1 kΩ) yap.',
      'Doğrula butonuna basarak V_OUT probunun tam 5.0V okuduğunu gör.',
    ],
    goalText: 'R2 direncini ayarlayarak çıkış gerilimi V_OUT’u 4.8 V – 5.2 V aralığına getir.',
    hint: 'Gerilimi tam ikiye bölmek için R2 = R1 = 1000 Ω seçmelisin.',
    realWorldNote:
      'Gerilim bölücüler sensör okumalarında ve ADC girişlerini ölçeklemede her yerde kullanılır; ancak çıkışa düşük dirençli yük bağlarsan gerilim çöker (yükleme etkisi).',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l7-start',
      'Seviye 7: Gerilim Bölücü 10V → 5V',
      'R1 ve R2 ile 10V giriş gerilimini yarıya bölme.',
      'Passive',
      { name: 'V1', type: 'vdc', params: { voltage: 10, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 1000 } },
      { name: 'R2', type: 'resistor', params: { resistance: 100 } },
      'V_OUT',
      makeDCAnalysis()
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l7-sol',
      'Seviye 7: Gerilim Bölücü 10V → 5V (Çözüm)',
      'Eşit 1kΩ dirençlerle tam 5.0V çıkış.',
      'Passive',
      { name: 'V1', type: 'vdc', params: { voltage: 10, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 1000 } },
      { name: 'R2', type: 'resistor', params: { resistance: 1000 } },
      'V_OUT',
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const vOut = dcOp.probeVoltages['V_OUT'] ?? 0;
      const ok = vOut >= 4.8 && vOut <= 5.2;
      return buildResult(
        [
          {
            label: 'Çıkış Gerilimi V_OUT',
            actual: `${vOut.toFixed(2)} V`,
            target: '4.80 – 5.20 V',
            ok,
          },
        ],
        'Harika! 10V kaynağını iki eşit dirençle pürüzsüzce 5.0V’a böldün.',
        'V_OUT henüz 5V değil. R2 değerini R1’e eşit (1000 Ω) yapmayı dene.'
      );
    },
  },

  {
    id: 8,
    chapter: 2,
    chapterTitle: 'Seri, Paralel ve Gerilim Bölücü',
    title: 'MCU İçin 9V → 3.3V Bölücü',
    difficulty: 'Başlangıç',
    concept:
      'ESP32, STM32 veya Raspberry Pi gibi modern mikrodenetleyicilerin (MCU) giriş pinleri en fazla 3.3V dayanır. 9V pil seviyesini güvenli şekilde ölçmek için gerilim bölücü formülünü kullanırız: R2 = R1 · V_OUT / (V_IN - V_OUT).',
    steps: [
      'V_IN = 9V, R1 = 10 kΩ ve hedef V_OUT = 3.3V.',
      'Formüle göre R2 = 10k × 3.3 / (9 - 3.3) ≈ 5.79 kΩ.',
      'R2 direncini 5800 Ω (5.8 kΩ) yap ve V_OUT değerinin 3.3V olduğunu doğrula.',
    ],
    goalText: 'R2 direncini ayarlayarak V_OUT gerilimini 3.15 V – 3.45 V aralığına getir.',
    hint: 'R2 = 10000 × 3.3 / 5.7 ≈ 5789 Ω. 5600 Ω ile 6000 Ω arası (ör. 5800 Ω) tam hedefi tutturur.',
    realWorldNote:
      'Batarya gerilimi ölçerken 10 kΩ–100 kΩ gibi büyük dirençler seçilir ki bölücü sürekli akım çekip pili bitirmesin.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l8-start',
      'Seviye 8: 9V → 3.3V MCU Bölücü',
      '9V pil gerilimini 3.3V mikrodenetleyici girişine uyarlama.',
      'Passive',
      { name: 'V1', type: 'vdc', params: { voltage: 9, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 10000 } },
      { name: 'R2', type: 'resistor', params: { resistance: 10000 } },
      'V_OUT',
      makeDCAnalysis()
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l8-sol',
      'Seviye 8: 9V → 3.3V MCU Bölücü (Çözüm)',
      '10kΩ ve 5.8kΩ ile tam 3.30V çıkış.',
      'Passive',
      { name: 'V1', type: 'vdc', params: { voltage: 9, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 10000 } },
      { name: 'R2', type: 'resistor', params: { resistance: 5800 } },
      'V_OUT',
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const vOut = dcOp.probeVoltages['V_OUT'] ?? 0;
      const ok = vOut >= 3.15 && vOut <= 3.45;
      return buildResult(
        [
          {
            label: 'Çıkış Gerilimi V_OUT',
            actual: `${vOut.toFixed(2)} V`,
            target: '3.15 – 3.45 V',
            ok,
          },
        ],
        'Tebrikler! 9V gerilimi mikrodenetleyici için güvenli 3.3V seviyesine indirdin.',
        'V_OUT henüz 3.3V aralığında değil. R2 değerini 5800 Ω (5.8 kΩ) civarına ayarla.'
      );
    },
  },

  {
    id: 9,
    chapter: 2,
    chapterTitle: 'Seri, Paralel ve Gerilim Bölücü',
    title: 'Paralel Dirençler',
    difficulty: 'Başlangıç',
    concept:
      'Paralel bağlanan dirençler akıma birden fazla yol sunar; bu yüzden eşdeğer direnç her zaman en küçük dirençten bile küçüktür: 1/R_eş = 1/R1 + 1/R2. İki adet 1 kΩ paralel bağlandığında toplam direnç 500 Ω olur ve kaynaktan çekilen toplam akım iki katına (20 mA) çıkar.',
    steps: [
      '10V kaynakta R1 = 1 kΩ tek başına 10 mA çeker; R2 = 10 kΩ ise 1 mA ekler (toplam 11 mA).',
      'Toplam kaynak akımını 20 mA yapmak için R2 direncini 1000 Ω (1 kΩ) yap.',
      'Doğrula butonuna bas ve V1 kaynağından çekilen toplam akımın 20 mA olduğunu gör.',
    ],
    goalText: 'R2 değerini ayarlayarak kaynak akımı |I(V1)|’i 18.0 mA – 22.0 mA aralığına getir.',
    hint: 'I_toplam = I_R1 + I_R2 = 10 mA + 10 mA = 20 mA için R2 = 1000 Ω (1 kΩ) olmalıdır.',
    realWorldNote:
      'Evindeki tüm prizler ve lambalar birbirine paralel bağlıdır; böylece her cihaz aynı gerilimi alır ve birini kapattığında diğerleri çalışmaya devam eder.',
    starterSchematic: buildParallelTwoSchematic(
      'acad-l9-start',
      'Seviye 9: Paralel Dirençler',
      '10V kaynak üzerinde paralel bağlı R1 ve R2 kolları.',
      10,
      1000,
      10000,
      makeDCAnalysis()
    ),
    solutionSchematic: buildParallelTwoSchematic(
      'acad-l9-sol',
      'Seviye 9: Paralel Dirençler (Çözüm)',
      '1kΩ || 1kΩ = 500Ω eşdeğer direnç ile 20 mA toplam akım.',
      10,
      1000,
      1000,
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const iV1 = Math.abs(dcOp.branchCurrents['V1'] ?? 0);
      const ok = iV1 >= 18e-3 && iV1 <= 22e-3;
      return buildResult(
        [
          {
            label: 'Toplam Kaynak Akımı |I(V1)|',
            actual: fmtCurrent(iV1),
            target: '18.0 – 22.0 mA',
            ok,
          },
        ],
        'Harika! İki paralel 1 kΩ kolu toplamda 500 Ω gibi davranarak 20 mA çekti.',
        'Toplam akım hedef aralıkta değil. R2 değerini 1000 Ω (1 kΩ) yapmayı dene.'
      );
    },
  },

  {
    id: 10,
    chapter: 2,
    chapterTitle: 'Seri, Paralel ve Gerilim Bölücü',
    title: 'Potansiyometre ile Ayarlanabilir Gerilim',
    difficulty: 'Başlangıç',
    concept:
      'Potansiyometre, tek bir gövde içinde sürekli ayarlanabilen bir gerilim bölücüdür! Üst uç (1) +10V’a, alt uç (2) toprağa bağlıyken orta uç (Wiper) konumu (wiperPos) üst taraftaki direnç oranını belirler: R_üst = R · wiperPos, R_alt = R · (1 - wiperPos), dolayısıyla V_WIPER = 10V · (1 - wiperPos) olur.',
    steps: [
      'RV1 potansiyometresine tıkla (şu an wiperPos = 0.1 olduğu için V_WIPER = 9.0V okunuyor).',
      'V_WIPER gerilimini 2.5V yapmak için wiperPos değerini 0.75 olarak ayarla.',
      'Doğrula butonuna bas ve orta uç geriliminin 2.5V olduğunu gör.',
    ],
    goalText: 'RV1 potansiyometresinin wiperPos değerini ayarlayarak V_WIPER’ı 2.2 V – 2.8 V aralığına getir.',
    hint: 'V_WIPER = 10V × (1 - wiperPos) = 2.5V için 1 - wiperPos = 0.25 → wiperPos = 0.75.',
    realWorldNote:
      'Ses kontrol düğmeleri, ekran parlaklık ayarları ve joystick eksenleri aslında birer potansiyometreden ibarettir.',
    starterSchematic: buildPotentiometerSchematic(
      'acad-l10-start',
      'Seviye 10: Potansiyometre Gerilim Ayarı',
      '10V kaynak ve 10kΩ potansiyometre ile ayarlanabilir çıkış.',
      10,
      10000,
      0.1,
      makeDCAnalysis()
    ),
    solutionSchematic: buildPotentiometerSchematic(
      'acad-l10-sol',
      'Seviye 10: Potansiyometre Gerilim Ayarı (Çözüm)',
      'wiperPos = 0.75 ile tam 2.5V çıkış gerilimi.',
      10,
      10000,
      0.75,
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const vWiper = dcOp.probeVoltages['V_WIPER'] ?? 0;
      const ok = vWiper >= 2.2 && vWiper <= 2.8;
      return buildResult(
        [
          {
            label: 'Orta Uç Gerilimi V_WIPER',
            actual: `${vWiper.toFixed(2)} V`,
            target: '2.20 – 2.80 V',
            ok,
          },
        ],
        'Süper! Potansiyometreyle tam 2.5V hassas referans gerilimi ürettin.',
        'V_WIPER henüz hedef aralıkta değil. wiperPos değerini 0.75 yapmayı dene.'
      );
    },
  },

  // ==========================================================================
  // BÖLÜM 3: DİYOTLAR — TEK YÖNLÜ VALF (L11–L15)
  // ==========================================================================
  {
    id: 11,
    chapter: 3,
    chapterTitle: 'Diyotlar — Tek Yönlü Valf',
    title: 'Silikon Diyot İleri İletim',
    difficulty: 'Temel',
    concept:
      'Silikon bir diyot ileri yönde (Anot pozitif, Katot negatif) polarlandığında yaklaşık 0.6V – 0.7V eşik gerilimini aşar aşmaz iletime geçer. Akım ne kadar değişirse değişsin diyot üzerindeki gerilim düşümü neredeyse sabit (~0.6V–0.7V) kalır.',
    steps: [
      'Şu an R1 = 100 kΩ olduğu için diyot akımı sadece ~45 µA seviyesinde.',
      'R1 direncini 1000 Ω (1 kΩ) yaparak diyot akımını ~4.4 mA seviyesine çıkar.',
      'Doğrula butonuna basıp hem diyot gerilimini (V_D) hem de akımını (I(D1)) incele.',
    ],
    goalText: 'R1’i ayarlayarak V_D’yi 0.55 – 0.75 V ve I(D1)’i 3.5 – 5.0 mA aralığına getir.',
    hint: 'I ≈ (5V - 0.6V) / 1000 Ω ≈ 4.4 mA. R1 = 1000 Ω tam doğru değerdir.',
    realWorldNote:
      '1N4148 ve 1N4007 gibi standart silikon diyotların bu ~0.65V’luk sabit düşümü, bazen basit gerilim referansı veya sıcaklık sensörü olarak bile kullanılır.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l11-start',
      'Seviye 11: Silikon Diyot İleri İletim',
      '5V kaynak, R1 ve ileri polarlı silikon diyot D1.',
      'Semiconductors',
      { name: 'V1', type: 'vdc', params: { voltage: 5, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 100000 } },
      { name: 'D1', type: 'diode', params: { is: 1e-12, n: 1.0 } },
      'V_D',
      makeDCAnalysis()
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l11-sol',
      'Seviye 11: Silikon Diyot İleri İletim (Çözüm)',
      '1kΩ direnç ile ~0.6V düşüm ve ~4.4 mA diyot akımı.',
      'Semiconductors',
      { name: 'V1', type: 'vdc', params: { voltage: 5, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 1000 } },
      { name: 'D1', type: 'diode', params: { is: 1e-12, n: 1.0 } },
      'V_D',
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const vD = dcOp.probeVoltages['V_D'] ?? 0;
      const iD = dcOp.branchCurrents['D1'] ?? 0;
      const okV = vD >= 0.55 && vD <= 0.75;
      const okI = iD >= 3.5e-3 && iD <= 5.0e-3;
      return buildResult(
        [
          {
            label: 'Diyot Gerilimi V_D',
            actual: `${vD.toFixed(3)} V`,
            target: '0.55 – 0.75 V',
            ok: okV,
          },
          {
            label: 'Diyot Akımı I(D1)',
            actual: fmtCurrent(iD),
            target: '3.5 – 5.0 mA',
            ok: okI,
          },
        ],
        'Harika! Silikon diyotun ileri iletim eşik gerilimini ve akımını başarıyla ölçtün.',
        'Diyot henüz istenen çalışma noktasında değil. R1 değerini 1000 Ω (1 kΩ) yapmayı dene.'
      );
    },
  },

  {
    id: 12,
    chapter: 3,
    chapterTitle: 'Diyotlar — Tek Yönlü Valf',
    title: 'Ters Polarma Koruması',
    difficulty: 'Temel',
    concept:
      'Bir diyot ters yönde bağlandığında (veya pil ters takıldığında) akımı neredeyse tamamen sıfıra keser. Bu özellik, pahalı elektronik kartları yanlışlıkla ters pil takılmasına karşı korumanın en basit yoludur.',
    steps: [
      'Şu an V1 = -5V (ters takılmış pil!) olduğu için D1 ters polarlı ve akım ~0 A.',
      'V1 gerilim kaynağına tıkla ve gerilimi +5V olarak düzelt.',
      'Doğrula butonuna basarak diyotun iletime geçtiğini ve ~4.4 mA aktığını gör.',
    ],
    goalText: 'V1 polaritesini düzelterek diyot akımı I(D1)’i 3.5 mA – 5.0 mA aralığına getir.',
    hint: 'V1 kaynağının voltage değerini -5 yerine +5 yap.',
    realWorldNote:
      'Ters polarma koruma diyotu girişe seri bağlandığında ters pil takılsa bile devrene tek bir mikroamper bile zarar veremez.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l12-start',
      'Seviye 12: Ters Polarma Koruması',
      'Ters (-5V) beslemede akımı kesen koruma diyotu.',
      'Semiconductors',
      { name: 'V1', type: 'vdc', params: { voltage: -5, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 1000 } },
      { name: 'D1', type: 'diode', params: { is: 1e-12, n: 1.0 } },
      'V_D',
      makeDCAnalysis()
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l12-sol',
      'Seviye 12: Ters Polarma Koruması (Çözüm)',
      'Doğru (+5V) beslemede iletime geçen diyot.',
      'Semiconductors',
      { name: 'V1', type: 'vdc', params: { voltage: 5, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 1000 } },
      { name: 'D1', type: 'diode', params: { is: 1e-12, n: 1.0 } },
      'V_D',
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const iD = dcOp.branchCurrents['D1'] ?? 0;
      const ok = iD >= 3.5e-3 && iD <= 5.0e-3;
      return buildResult(
        [
          {
            label: 'Diyot Akımı I(D1)',
            actual: fmtCurrent(iD),
            target: '3.5 – 5.0 mA',
            ok,
          },
        ],
        'Süper! Pilin yönünü düzelttiğin anda diyot vanayı açtı ve devre çalıştı.',
        'Diyot hâlâ kesimde! V1 kaynağını +5V olarak ayarladığından emin ol.'
      );
    },
  },

  {
    id: 13,
    chapter: 3,
    chapterTitle: 'Diyotlar — Tek Yönlü Valf',
    title: 'Schottky Diyot: Düşük Kayıp',
    difficulty: 'Temel',
    concept:
      'Standart silikon diyot 0.65V kayıp yaratırken, metal-yarı iletken eklemli Schottky diyot yalnızca ~0.23V gerilim düşürür! 5V bir beslemede çıkışta ~4.77V kalarak çok daha yüksek verimlilik sağlar.',
    steps: [
      'Devrede seri Schottky diyot DS1 ve 1 kΩ yük bulunuyor; ancak V1 şu an 1V ayarlı.',
      'V1 gerilimini 5V yap ve çıkış gerilimi V_OUT’u gözlemle.',
      'Standart diyotta 4.35V olacak çıkışın Schottky sayesinde ~4.77V olduğunu doğrula.',
    ],
    goalText: 'V1 kaynağını 5V yaparak yük gerilimi V_OUT’u 4.55 V – 4.85 V aralığına getir.',
    hint: 'V1 değerini 5V yap; Schottky diyot üzerinde sadece ~0.23V düşecektir.',
    realWorldNote:
      'USB güç seçim devrelerinde ve güneş paneli şarj sistemlerinde enerji kaybını en aza indirmek için 1N5819 gibi Schottky diyotlar tercih edilir.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l13-start',
      'Seviye 13: Schottky Diyot Düşük Kayıp',
      'Seri Schottky diyot DS1 ve 1kΩ yük direnci.',
      'Semiconductors',
      { name: 'V1', type: 'vdc', params: { voltage: 1, acMag: 0 } },
      { name: 'DS1', type: 'schottky', params: { is: 1e-6, n: 1.05 } },
      { name: 'R_LOAD', type: 'resistor', params: { resistance: 1000 } },
      'V_OUT',
      makeDCAnalysis()
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l13-sol',
      'Seviye 13: Schottky Diyot Düşük Kayıp (Çözüm)',
      '5V kaynakta ~0.23V kayıpla 4.77V yük gerilimi.',
      'Semiconductors',
      { name: 'V1', type: 'vdc', params: { voltage: 5, acMag: 0 } },
      { name: 'DS1', type: 'schottky', params: { is: 1e-6, n: 1.05 } },
      { name: 'R_LOAD', type: 'resistor', params: { resistance: 1000 } },
      'V_OUT',
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const vOut = dcOp.probeVoltages['V_OUT'] ?? 0;
      const ok = vOut >= 4.55 && vOut <= 4.85;
      return buildResult(
        [
          {
            label: 'Yük Gerilimi V_OUT',
            actual: `${vOut.toFixed(2)} V`,
            target: '4.55 – 4.85 V',
            ok,
          },
        ],
        'Harika! Schottky diyot sadece ~0.23V düşürerek çok verimli bir geçiş sağladı.',
        'V_OUT hedef aralıkta değil. V1 kaynağını 5V olarak ayarla.'
      );
    },
  },

  {
    id: 14,
    chapter: 3,
    chapterTitle: 'Diyotlar — Tek Yönlü Valf',
    title: 'Mavi LED Besleme Eşiği',
    difficulty: 'Temel',
    concept:
      'Mavi ve beyaz LED’ler daha yüksek enerjili foton ürettikleri için ileri iletim gerilimleri (~3.0V) kırmızı LED’e (~1.85V) göre çok daha yüksektir. Bu yüzden 2V’luk bir kaynak mavi LED’i hiç yakamaz!',
    steps: [
      'Şu an V1 = 2V olduğu için mavi LED eşik geriliminin altında kalıyor ve akım geçmiyor.',
      'V1 kaynağını seçip 5V yap.',
      'R1 = 220 Ω üzerinden ~(5V - 3.0V)/220 Ω ≈ 9 mA geçtiğini doğrula.',
    ],
    goalText: 'V1 beslemesini yükselterek mavi LED akımı I(LED1)’i 6.0 mA – 14.0 mA aralığına getir.',
    hint: 'Mavi LED’in ~3.0V eşiği vardır; V1 = 5V yaptığında ~9.1 mA akım elde edersin.',
    realWorldNote:
      'Tek bir 1.5V kalem pil (hatta iki pil = 3.0V) mavi veya beyaz LED’i parlak yakmaya yetmez; el fenerlerinde bu yüzden 3 pil (4.5V) veya yükseltici (boost) sürücü kullanılır.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l14-start',
      'Seviye 14: Mavi LED Besleme Eşiği',
      '2V beslemede eşik altında kalan mavi LED devresi.',
      'Semiconductors',
      { name: 'V1', type: 'vdc', params: { voltage: 2, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 220 } },
      { name: 'LED1', type: 'led', params: { ledColor: 'blue', is: 1e-20 } },
      'V_LED',
      makeDCAnalysis()
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l14-sol',
      'Seviye 14: Mavi LED Besleme Eşiği (Çözüm)',
      '5V besleme ve 220Ω direnç ile parlayan mavi LED.',
      'Semiconductors',
      { name: 'V1', type: 'vdc', params: { voltage: 5, acMag: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 220 } },
      { name: 'LED1', type: 'led', params: { ledColor: 'blue', is: 1e-20 } },
      'V_LED',
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const iLed = dcOp.branchCurrents['LED1'] ?? 0;
      const ok = iLed >= 6e-3 && iLed <= 14e-3;
      return buildResult(
        [
          {
            label: 'Mavi LED Akımı I(LED1)',
            actual: fmtCurrent(iLed),
            target: '6.0 – 14.0 mA',
            ok,
          },
        ],
        'Tebrikler! 3.0V eşiğini aşarak mavi LED’i güvenle yaktın.',
        'Mavi LED henüz yeterince akım almıyor. V1 kaynağını 5V yapmayı dene.'
      );
    },
  },

  {
    id: 15,
    chapter: 3,
    chapterTitle: 'Diyotlar — Tek Yönlü Valf',
    title: '5.1V Zener Gerilim Regülatörü',
    difficulty: 'Temel',
    concept:
      'Zener diyot ters yönde bağlandığında, üzerindeki gerilim kırılma gerilimine (5.1V) ulaştığı anda iletime geçer ve çıkış gerilimini 5.1V civarında sabitler. Ancak regülasyonun çalışması için giriş gerilimi V1, Zener geriliminden yeterince büyük olmalıdır!',
    steps: [
      'Şu an V1 = 4V olduğu için Zener (5.1V) kırılma bölgesine giremiyor ve V_REG düşük kalıyor.',
      'V1 kaynağını 12V yap (böylece R_S = 220 Ω üzerinden Zener’e yeterli regülasyon akımı akar).',
      'Doğrula butonuna bas ve V_REG çıkışının 5.1V civarında kilitlendiğini gör.',
    ],
    goalText: 'V1 giriş gerilimini yükselterek regüleli çıkış V_REG’i 5.05 V – 5.30 V aralığına getir.',
    hint: 'V1 değerini 12V yap; fazla gerilim R_S (220 Ω) üzerinde düşerken DZ1 çıkışı ~5.18V’ta sabitler.',
    realWorldNote:
      'Zener regülatörler düşük akımlı referans gerilimleri ve aşırı gerilim (ESD/TVS) korumaları için mükemmeldir; yüksek akımlı yüklerde ise verimlilik için lineer veya anahtarlamalı regülatör (LM7805, buck) kullanılır.',
    starterSchematic: buildZenerRegulatorSchematic(
      'acad-l15-start',
      'Seviye 15: 5.1V Zener Regülatörü',
      'Giriş gerilimi yetersiz (4V) olan 5.1V Zener regülatör devresi.',
      4,
      220,
      5.1,
      1000,
      makeDCAnalysis()
    ),
    solutionSchematic: buildZenerRegulatorSchematic(
      'acad-l15-sol',
      'Seviye 15: 5.1V Zener Regülatörü (Çözüm)',
      '12V girişten 5.1V sabit çıkış üreten Zener regülatör.',
      12,
      220,
      5.1,
      1000,
      makeDCAnalysis()
    ),
    verificationAnalysis: makeDCAnalysis(),
    verify: (dcOp: DCOPResult) => {
      const vReg = dcOp.probeVoltages['V_REG'] ?? 0;
      const ok = vReg >= 5.05 && vReg <= 5.3;
      return buildResult(
        [
          {
            label: 'Regüleli Çıkış V_REG',
            actual: `${vReg.toFixed(2)} V`,
            target: '5.05 – 5.30 V',
            ok,
          },
        ],
        'Harika! Zener diyot kırılma bölgesine girerek çıkışı 5.1V civarında taş gibi sabitledi.',
        'V_REG henüz 5.1V seviyesinde değil. V1 giriş gerilimini 12V yapmayı dene.'
      );
    },
  },

  // ==========================================================================
  // BÖLÜM 4: KAPASİTÖR & ZAMAN SABİTİ (L16–L20)
  // ==========================================================================
  {
    id: 16,
    chapter: 4,
    chapterTitle: 'Kapasitör & Zaman Sabiti',
    title: 'RC Basamak Yanıtı ve 5τ Kuralı',
    difficulty: 'Temel',
    concept:
      'Bir kapasitör direnç üzerinden şarj olurken hızını zaman sabiti τ = R · C belirler. Kapasitör 1τ sürede %63.2, 5τ sürede ise %99.3 oranında tam dolar! R1 = 1 kΩ ve C1 = 100 nF olduğunda τ = 0.1 ms olur ve 0.5 ms (5τ) sonunda kapasitör 5V’a ulaşır.',
    steps: [
      'Şu an R1 = 10 kΩ olduğundan τ = 1 ms ve t = 0.5 ms anında kapasitör henüz ~2V’ta kalıyor.',
      'R1 direncini 1000 Ω (1 kΩ) yaparak zaman sabitini 0.1 ms’ye indir.',
      'Transient simülasyonunu doğrula ve t = 0.5 ms’de V_CAP’in 4.8V üzerine çıktığını gör.',
    ],
    goalText: 'R1’i küçülterek t = 0.5 ms anında kapasitör gerilimi V_CAP > 4.8 V yap.',
    hint: '5τ = 0.5 ms → τ = 0.1 ms = R1 × 100 nF → R1 = 1000 Ω (1 kΩ).',
    realWorldNote:
      '5τ kuralı elektronik mühendislerinin ezbere bildiği en pratik kurallardan biridir: bir RC devresinin kararlı hale gelmesi için her zaman yaklaşık 5 zaman sabiti beklenir.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l16-start',
      'Seviye 16: RC Basamak Yanıtı',
      '0-5V darbe kaynağı, R1 ve 100nF kapasitör ile şarj hızı deneyi.',
      'Passive',
      {
        name: 'V1',
        type: 'vpulse',
        params: {
          vLow: 0,
          vHigh: 5,
          delay: 0,
          riseTime: 1e-6,
          fallTime: 1e-6,
          pulseWidth: 1e-3,
          period: 2e-3,
        },
      },
      { name: 'R1', type: 'resistor', params: { resistance: 10000 } },
      { name: 'C1', type: 'capacitor', params: { capacitance: 100e-9, ic: 0 } },
      'V_CAP',
      makeTransientAnalysis(2e-3, 10e-6)
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l16-sol',
      'Seviye 16: RC Basamak Yanıtı (Çözüm)',
      'R1=1kΩ, C1=100nF (τ=0.1ms) ile 0.5ms sonunda tam şarj.',
      'Passive',
      {
        name: 'V1',
        type: 'vpulse',
        params: {
          vLow: 0,
          vHigh: 5,
          delay: 0,
          riseTime: 1e-6,
          fallTime: 1e-6,
          pulseWidth: 1e-3,
          period: 2e-3,
        },
      },
      { name: 'R1', type: 'resistor', params: { resistance: 1000 } },
      { name: 'C1', type: 'capacitor', params: { capacitance: 100e-9, ic: 0 } },
      'V_CAP',
      makeTransientAnalysis(2e-3, 10e-6)
    ),
    verificationAnalysis: makeTransientAnalysis(2e-3, 10e-6),
    verify: (_dcOp: DCOPResult, simResult: SimulationResult) => {
      if (simResult.type !== 'transient') {
        return buildResult(
          [{ label: 'Analiz Türü', actual: simResult.type, target: 'Transient', ok: false }],
          '',
          'Transient (zaman alanı) analizi çalıştırılmalıdır.'
        );
      }
      const vAt05ms = sampleTransientAt(simResult, 'V_CAP', 0.5e-3) ?? 0;
      const ok = vAt05ms > 4.8;
      return buildResult(
        [
          {
            label: 'V_CAP (t = 0.5 ms)',
            actual: `${vAt05ms.toFixed(2)} V`,
            target: '> 4.80 V',
            ok,
          },
        ],
        'Süper! τ = 0.1 ms ile kapasitör 5τ (0.5 ms) sonunda neredeyse tamamen doldu.',
        'Kapasitör 0.5 ms’de hâlâ yeterince dolmadı. R1 değerini 1000 Ω (1 kΩ) yapmayı dene.'
      );
    },
  },

  {
    id: 17,
    chapter: 4,
    chapterTitle: 'Kapasitör & Zaman Sabiti',
    title: '1 ms Gecikme Devresi',
    difficulty: 'Temel',
    concept:
      'RC devreleri mikrodenetleyicilerin açılış reset (power-on reset) ve buton arkı önleme (debounce) devrelerinde hassas gecikme üretmek için kullanılır. Tam t = τ anında kapasitör gerilimi 5V × (1 - 1/e) = 5V × 0.632 = 3.16V olur.',
    steps: [
      'R1 = 10 kΩ sabit. Zaman sabitini τ = 1 ms yapmak için C1 = τ / R1 = 1 ms / 10 kΩ = 100 nF olmalıdır.',
      'C1 kapasitörünü seç ve değerini 10 nF yerine 100 nF (1e-7 F) yap.',
      'Doğrula butonuna bas ve t = 1 ms anında V_CAP’in ~3.16V olduğunu gör.',
    ],
    goalText: 'C1 değerini ayarlayarak t = 1 ms anında V_CAP’i 2.9 V – 3.4 V aralığına getir.',
    hint: 'τ = R1 × C1 = 1 ms için R1 = 10 kΩ iken C1 = 100 nF (0.1 µF) seçmelisin.',
    realWorldNote:
      '10 kΩ direnç + 100 nF kapasitör ikilisi elektronikte buton gürültüsü temizlemek için en popüler 1 ms RC gecikme bloğudur.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l17-start',
      'Seviye 17: 1 ms RC Gecikme Devresi',
      '10kΩ direnç ve ayarlanacak C1 ile 1 ms zaman sabiti tasarımı.',
      'Passive',
      {
        name: 'V1',
        type: 'vpulse',
        params: {
          vLow: 0,
          vHigh: 5,
          delay: 0,
          riseTime: 1e-6,
          fallTime: 1e-6,
          pulseWidth: 3e-3,
          period: 6e-3,
        },
      },
      { name: 'R1', type: 'resistor', params: { resistance: 10000 } },
      { name: 'C1', type: 'capacitor', params: { capacitance: 10e-9, ic: 0 } },
      'V_CAP',
      makeTransientAnalysis(4e-3, 20e-6)
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l17-sol',
      'Seviye 17: 1 ms RC Gecikme Devresi (Çözüm)',
      '10kΩ × 100nF = 1 ms zaman sabiti ile t=1ms anında 3.16V.',
      'Passive',
      {
        name: 'V1',
        type: 'vpulse',
        params: {
          vLow: 0,
          vHigh: 5,
          delay: 0,
          riseTime: 1e-6,
          fallTime: 1e-6,
          pulseWidth: 3e-3,
          period: 6e-3,
        },
      },
      { name: 'R1', type: 'resistor', params: { resistance: 10000 } },
      { name: 'C1', type: 'capacitor', params: { capacitance: 100e-9, ic: 0 } },
      'V_CAP',
      makeTransientAnalysis(4e-3, 20e-6)
    ),
    verificationAnalysis: makeTransientAnalysis(4e-3, 20e-6),
    verify: (_dcOp: DCOPResult, simResult: SimulationResult) => {
      if (simResult.type !== 'transient') {
        return buildResult(
          [{ label: 'Analiz Türü', actual: simResult.type, target: 'Transient', ok: false }],
          '',
          'Transient analizi çalıştırılmalıdır.'
        );
      }
      const vAt1ms = sampleTransientAt(simResult, 'V_CAP', 1e-3) ?? 0;
      const ok = vAt1ms >= 2.9 && vAt1ms <= 3.4;
      return buildResult(
        [
          {
            label: 'V_CAP (t = 1.0 ms)',
            actual: `${vAt1ms.toFixed(2)} V`,
            target: '2.90 – 3.40 V',
            ok,
          },
        ],
        'Mükemmel! t = 1 ms anında tam %63.2 seviyesine (~3.16V) ulaştın.',
        't = 1 ms anındaki gerilim hedef aralıkta değil. C1 değerini 100 nF (100e-9 F) yap.'
      );
    },
  },

  {
    id: 18,
    chapter: 4,
    chapterTitle: 'Kapasitör & Zaman Sabiti',
    title: 'Pasif RC Alçak Geçiren Filtre (1 kHz)',
    difficulty: 'Temel',
    concept:
      'Seri direnç ve toprağa bağlı kapasitörden oluşan RC Alçak Geçiren Filtre (LPF), düşük frekanslı sinyalleri rahatça geçirirken yüksek frekanslı gürültüyü zayıflatır. Kesim frekansı (-3 dB noktası): f_c = 1 / (2π · R · C).',
    steps: [
      'C1 = 100 nF sabit; şu an R1 = 10 kΩ olduğu için kesim frekansı sadece ~159 Hz.',
      'f_c = 1 kHz elde etmek için R1 = 1 / (2π × 1000 × 100e-9) ≈ 1590 Ω (1.59 kΩ) yap.',
      'AC Bode analizini doğrula ve -3 dB noktasının 1 kHz civarında olduğunu gör.',
    ],
    goalText: 'R1 değerini ayarlayarak -3 dB kesim frekansını 850 Hz – 1150 Hz aralığına getir.',
    hint: 'R1 = 1590 Ω (veya standart 1.5 kΩ / 1.6 kΩ) seçtiğinde f_c ≈ 1000 Hz olur.',
    realWorldNote:
      'Ses sistemlerinde tiz gürültüyü kesmek veya PWM sinyalini düz analog gerilime çevirmek için ilk başvurulan devre RC alçak geçiren filtredir.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l18-start',
      'Seviye 18: RC Alçak Geçiren Filtre',
      'VAC kaynak, R1 ve 100nF C1 ile pasif alçak geçiren filtre.',
      'Filters',
      {
        name: 'V1',
        type: 'vac',
        params: { voltage: 0, amplitude: 5, frequency: 1000, phase: 0, acMag: 1 },
      },
      { name: 'R1', type: 'resistor', params: { resistance: 10000 } },
      { name: 'C1', type: 'capacitor', params: { capacitance: 100e-9, ic: 0 } },
      'V_OUT',
      makeACAnalysis(10, 100000, 40)
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l18-sol',
      'Seviye 18: RC Alçak Geçiren Filtre (Çözüm)',
      '1.59kΩ ve 100nF ile 1 kHz (-3 dB) kesim frekansı.',
      'Filters',
      {
        name: 'V1',
        type: 'vac',
        params: { voltage: 0, amplitude: 5, frequency: 1000, phase: 0, acMag: 1 },
      },
      { name: 'R1', type: 'resistor', params: { resistance: 1590 } },
      { name: 'C1', type: 'capacitor', params: { capacitance: 100e-9, ic: 0 } },
      'V_OUT',
      makeACAnalysis(10, 100000, 40)
    ),
    verificationAnalysis: makeACAnalysis(10, 100000, 40),
    verify: (_dcOp: DCOPResult, simResult: SimulationResult) => {
      if (simResult.type !== 'ac') {
        return buildResult(
          [{ label: 'Analiz Türü', actual: simResult.type, target: 'AC Sweep', ok: false }],
          '',
          'AC Frekans Yanıtı (Bode) analizi çalıştırılmalıdır.'
        );
      }
      const fc = findACLowPassCutoffHz(simResult, 'V_OUT');
      const ok = fc !== null && fc >= 850 && fc <= 1150;
      return buildResult(
        [
          {
            label: '-3 dB Kesim Frekansı f_c',
            actual: fc !== null ? fmtFreq(fc) : 'Bulunamadı',
            target: '850 Hz – 1.15 kHz',
            ok,
          },
        ],
        'Harika! 1 kHz kesim frekanslı RC alçak geçiren filtreni başarıyla ayarladın.',
        'Kesim frekansı henüz 1 kHz civarında değil. R1 değerini 1590 Ω (1.59 kΩ) yapmayı dene.'
      );
    },
  },

  {
    id: 19,
    chapter: 4,
    chapterTitle: 'Kapasitör & Zaman Sabiti',
    title: 'Pasif RC Yüksek Geçiren Filtre',
    difficulty: 'Temel',
    concept:
      'Kapasitör ile direncin yerini değiştirdiğimizde (C1 seri, R1 toprağa) Yüksek Geçiren Filtre (HPF) elde ederiz! Kapasitör DC’yi ve düşük frekanslı uğultuyu engellerken yüksek frekanslı sinyalleri çıkışa aktarır.',
    steps: [
      'Şu an R1 = 100 Ω olduğu için kesim frekansı ~15.9 kHz ve 10 kHz sinyali bile aşırı zayıflıyor.',
      'R1 direncini 1600 Ω (1.6 kΩ) yaparak kesim frekansını ~1 kHz’e çek.',
      'AC Bode analizinde 100 Hz’in bastırıldığını (< -10 dB) ve 10 kHz’in neredeyse kayıpsız geçtiğini (> -1 dB) doğrula.',
    ],
    goalText: 'R1’i ayarlayarak V_OUT kazancını 100 Hz’de < -10 dB ve 10 kHz’de > -1 dB yap.',
    hint: 'f_c ≈ 1 kHz için R1 = 1600 Ω (1.6 kΩ) seçtiğinde 100 Hz ≈ -20 dB, 10 kHz ≈ -0.04 dB olur.',
    realWorldNote:
      'Ses yükselteçlerinin girişindeki "AC kuplaj kapasitörü" aslında bir yüksek geçiren filtredir; DC ofseti kesip sadece müzik sinyalini içeri alır.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l19-start',
      'Seviye 19: RC Yüksek Geçiren Filtre',
      'Seri 100nF C1 ve toprağa bağlı R1 ile yüksek geçiren filtre.',
      'Filters',
      {
        name: 'V1',
        type: 'vac',
        params: { voltage: 0, amplitude: 5, frequency: 1000, phase: 0, acMag: 1 },
      },
      { name: 'C1', type: 'capacitor', params: { capacitance: 100e-9, ic: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 100 } },
      'V_OUT',
      makeACAnalysis(10, 100000, 40)
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l19-sol',
      'Seviye 19: RC Yüksek Geçiren Filtre (Çözüm)',
      '100nF ve 1.6kΩ ile 1 kHz yüksek geçiren filtre.',
      'Filters',
      {
        name: 'V1',
        type: 'vac',
        params: { voltage: 0, amplitude: 5, frequency: 1000, phase: 0, acMag: 1 },
      },
      { name: 'C1', type: 'capacitor', params: { capacitance: 100e-9, ic: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 1600 } },
      'V_OUT',
      makeACAnalysis(10, 100000, 40)
    ),
    verificationAnalysis: makeACAnalysis(10, 100000, 40),
    verify: (_dcOp: DCOPResult, simResult: SimulationResult) => {
      if (simResult.type !== 'ac') {
        return buildResult(
          [{ label: 'Analiz Türü', actual: simResult.type, target: 'AC Sweep', ok: false }],
          '',
          'AC Frekans Yanıtı analizi çalıştırılmalıdır.'
        );
      }
      const db100 = sampleACDbAtFreq(simResult, 'V_OUT', 100) ?? 0;
      const db10k = sampleACDbAtFreq(simResult, 'V_OUT', 10000) ?? -100;
      const okLow = db100 < -10;
      const okHigh = db10k > -1;
      return buildResult(
        [
          {
            label: '100 Hz Kazanç',
            actual: `${db100.toFixed(1)} dB`,
            target: '< -10.0 dB',
            ok: okLow,
          },
          {
            label: '10 kHz Kazanç',
            actual: `${db10k.toFixed(2)} dB`,
            target: '> -1.0 dB',
            ok: okHigh,
          },
        ],
        'Süper! Düşük frekanslar güçlüce bastırıldı, yüksek frekanslar tertemiz geçti.',
        'Filtre henüz hedef bantta değil. R1 değerini 1600 Ω (1.6 kΩ) yapmayı dene.'
      );
    },
  },

  {
    id: 20,
    chapter: 4,
    chapterTitle: 'Kapasitör & Zaman Sabiti',
    title: 'RC Dalga Yumuşatıcı / İntegratör',
    difficulty: 'Temel',
    concept:
      'Bir kare dalganın periyodu T iken, RC zaman sabitini τ ≈ T/2 civarına ayarladığında kapasitör her darbede tam dolmaya veya boşalmaya vakit bulamaz. Sonuçta keskin 0–5V kare dalga, yumuşak üçgenimsi bir dalgaya (integratör / PWM yumuşatıcı) dönüşür.',
    steps: [
      'Giriş sinyali 1 ms periyotlu (1 kHz) 0–5V kare dalga; şu an R1 = 100 Ω olduğundan kapasitör neredeyse kare dalgayı aynen takip ediyor (Vpp ≈ 5V).',
      'R1 direncini 4700 Ω (4.7 kΩ) yaparak zaman sabitini 0.47 ms’ye çıkar.',
      'Kararlı haldeki tepeden tepeye salınımın (Vpp) 0.8V – 3.2V arasına yumuşadığını doğrula.',
    ],
    goalText: 'R1’i artırarak kararlı hal çıkış dalgalanması Vpp’yi 0.8 V – 3.2 V aralığına getir.',
    hint: 'R1 = 4700 Ω (4.7 kΩ) yaptığında τ = 0.47 ms olur ve Vpp ≈ 2.4 V civarında güzel bir üçgen dalga oluşur.',
    realWorldNote:
      'Arduino’nun analogWrite() (PWM) çıkışından gerçek analog gerilim üretmek için tam olarak bu RC yumuşatıcı devre kullanılır!',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l20-start',
      'Seviye 20: RC Dalga Yumuşatıcı',
      '1 kHz kare dalgayı RC zaman sabiti ile yumuşatma.',
      'Passive',
      {
        name: 'V1',
        type: 'vpulse',
        params: {
          vLow: 0,
          vHigh: 5,
          delay: 0,
          riseTime: 1e-6,
          fallTime: 1e-6,
          pulseWidth: 0.5e-3,
          period: 1e-3,
        },
      },
      { name: 'R1', type: 'resistor', params: { resistance: 100 } },
      { name: 'C1', type: 'capacitor', params: { capacitance: 100e-9, ic: 0 } },
      'V_OUT',
      makeTransientAnalysis(5e-3, 10e-6)
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l20-sol',
      'Seviye 20: RC Dalga Yumuşatıcı (Çözüm)',
      '4.7kΩ ve 100nF ile yumuşatılmış üçgenimsi dalga (~2.4 Vpp).',
      'Passive',
      {
        name: 'V1',
        type: 'vpulse',
        params: {
          vLow: 0,
          vHigh: 5,
          delay: 0,
          riseTime: 1e-6,
          fallTime: 1e-6,
          pulseWidth: 0.5e-3,
          period: 1e-3,
        },
      },
      { name: 'R1', type: 'resistor', params: { resistance: 4700 } },
      { name: 'C1', type: 'capacitor', params: { capacitance: 100e-9, ic: 0 } },
      'V_OUT',
      makeTransientAnalysis(5e-3, 10e-6)
    ),
    verificationAnalysis: makeTransientAnalysis(5e-3, 10e-6),
    verify: (_dcOp: DCOPResult, simResult: SimulationResult) => {
      if (simResult.type !== 'transient') {
        return buildResult(
          [{ label: 'Analiz Türü', actual: simResult.type, target: 'Transient', ok: false }],
          '',
          'Transient analizi çalıştırılmalıdır.'
        );
      }
      const vals = simResult.probeVoltages['V_OUT'] ?? [];
      let vMin = Infinity;
      let vMax = -Infinity;
      for (let i = 0; i < simResult.times.length; i++) {
        if (simResult.times[i] >= 3e-3) {
          const v = vals[i];
          if (v < vMin) vMin = v;
          if (v > vMax) vMax = v;
        }
      }
      const vpp = Number.isFinite(vMax - vMin) ? vMax - vMin : 0;
      const ok = vpp >= 0.8 && vpp <= 3.2;
      return buildResult(
        [
          {
            label: 'Kararlı Hal Vpp (t ≥ 3 ms)',
            actual: `${vpp.toFixed(2)} Vpp`,
            target: '0.80 – 3.20 Vpp',
            ok,
          },
        ],
        'Harika! Keskin kare dalgayı yumuşak bir üçgen dalgaya dönüştürdün.',
        'Vpp hedef aralıkta değil. R1 değerini 4700 Ω (4.7 kΩ) yapmayı dene.'
      );
    },
  },

  // ==========================================================================
  // BÖLÜM 5: İNDÜKTÖR, RLC REZONANS VE TRAFO (L21–L25)
  // ==========================================================================
  {
    id: 21,
    chapter: 5,
    chapterTitle: 'İndüktör, RLC Rezonans ve Trafo',
    title: 'RL Alçak Geçiren Filtre',
    difficulty: 'Orta-Alt',
    concept:
      'İndüktörün empedansı frekansla doğru orantılı artar (X_L = 2πfL). Seri bağlı bir bobin ve yük direncinde, düşük frekanslar kolayca geçerken yüksek frekanslar bobin tarafından engellenir. Kesim frekansı: f_c = R / (2πL).',
    steps: [
      'R1 = 100 Ω sabit. Şu an L1 = 1 mH olduğu için kesim frekansı ~15.9 kHz.',
      'f_c ≈ 1 kHz için L1 = R / (2π × 1000) = 100 / 6283 ≈ 16 mH (0.016 H) yap.',
      'AC Bode analizini doğrula ve -3 dB kesim frekansının 1 kHz civarında olduğunu gör.',
    ],
    goalText: 'L1 endüktansını ayarlayarak -3 dB kesim frekansını 800 Hz – 1250 Hz aralığına getir.',
    hint: 'L1 = 16 mH (0.016 H) yaptığında f_c = 100 / (2π × 0.016) ≈ 995 Hz olur.',
    realWorldNote:
      'Hoparlör crossover devrelerinde bas hoparlöre (woofer) yalnızca düşük frekansları göndermek için seri indüktörlü RL alçak geçiren filtreler kullanılır.',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l21-start',
      'Seviye 21: RL Alçak Geçiren Filtre',
      'VAC kaynak, seri L1 bobini ve 100Ω R1 ile RL alçak geçiren filtre.',
      'Filters',
      {
        name: 'V1',
        type: 'vac',
        params: { voltage: 0, amplitude: 5, frequency: 1000, phase: 0, acMag: 1 },
      },
      { name: 'L1', type: 'inductor', params: { inductance: 1e-3, ic: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 100 } },
      'V_OUT',
      makeACAnalysis(10, 100000, 40)
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l21-sol',
      'Seviye 21: RL Alçak Geçiren Filtre (Çözüm)',
      '16 mH bobin ve 100Ω direnç ile 1 kHz kesim frekansı.',
      'Filters',
      {
        name: 'V1',
        type: 'vac',
        params: { voltage: 0, amplitude: 5, frequency: 1000, phase: 0, acMag: 1 },
      },
      { name: 'L1', type: 'inductor', params: { inductance: 16e-3, ic: 0 } },
      { name: 'R1', type: 'resistor', params: { resistance: 100 } },
      'V_OUT',
      makeACAnalysis(10, 100000, 40)
    ),
    verificationAnalysis: makeACAnalysis(10, 100000, 40),
    verify: (_dcOp: DCOPResult, simResult: SimulationResult) => {
      if (simResult.type !== 'ac') {
        return buildResult(
          [{ label: 'Analiz Türü', actual: simResult.type, target: 'AC Sweep', ok: false }],
          '',
          'AC Frekans Yanıtı analizi çalıştırılmalıdır.'
        );
      }
      const fc = findACLowPassCutoffHz(simResult, 'V_OUT');
      const ok = fc !== null && fc >= 800 && fc <= 1250;
      return buildResult(
        [
          {
            label: '-3 dB Kesim Frekansı f_c',
            actual: fc !== null ? fmtFreq(fc) : 'Bulunamadı',
            target: '800 Hz – 1.25 kHz',
            ok,
          },
        ],
        'Harika! 16 mH bobin ile tam 1 kHz kesim frekanslı RL filtresini kurdun.',
        'Kesim frekansı henüz hedef aralıkta değil. L1 değerini 16 mH (0.016 H) yapmayı dene.'
      );
    },
  },

  {
    id: 22,
    chapter: 5,
    chapterTitle: 'İndüktör, RLC Rezonans ve Trafo',
    title: 'Seri RLC Rezonans (1 kHz)',
    difficulty: 'Orta-Alt',
    concept:
      'Seri bağlı bobin (L) ve kapasitör (C) belirli bir rezonans frekansında birbirinin etkisini tam olarak sıfırlar (X_L = X_C)! Bu frekans f₀ = 1 / (2π√(LC)) ile hesaplanır ve çıkışta yalnızca bu frekans en yüksek genlikle (0 dB tepe) geçer.',
    steps: [
      'L1 = 10 mH sabit; şu an C1 = 10 µF olduğu için rezonans ~503 Hz’de oluşuyor.',
      'f₀ = 1 kHz için C1 = 1 / ((2π × 1000)² × 0.01) ≈ 2.53 µF (2.53e-6 F) yap.',
      'AC Bode grafiğinde tepe frekansının 1 kHz’e oturduğunu doğrula.',
    ],
    goalText: 'C1 kapasitansını ayarlayarak RLC tepe (rezonans) frekansını 940 Hz – 1060 Hz aralığına getir.',
    hint: 'C1 = 2.53 µF (2.53e-6 F) seçtiğinde f₀ = 1000.6 Hz çıkar.',
    realWorldNote:
      'Radyo alıcılarında istediğin istasyonu seçmek için tam olarak bir LC rezonans devresinin C veya L değerini ayarlayarak o istasyonun frekansına kilitlenirsin.',
    starterSchematic: buildSeriesRLCSchematic(
      'acad-l22-start',
      'Seviye 22: Seri RLC Rezonans',
      '10 mH bobin ve ayarlanacak C1 ile 1 kHz rezonans devresi.',
      10e-3,
      10e-6,
      100,
      makeACAnalysis(10, 100000, 40)
    ),
    solutionSchematic: buildSeriesRLCSchematic(
      'acad-l22-sol',
      'Seviye 22: Seri RLC Rezonans (Çözüm)',
      '10 mH ve 2.53 µF ile tam 1 kHz rezonans tepesi.',
      10e-3,
      2.53e-6,
      100,
      makeACAnalysis(10, 100000, 40)
    ),
    verificationAnalysis: makeACAnalysis(10, 100000, 40),
    verify: (_dcOp: DCOPResult, simResult: SimulationResult) => {
      if (simResult.type !== 'ac') {
        return buildResult(
          [{ label: 'Analiz Türü', actual: simResult.type, target: 'AC Sweep', ok: false }],
          '',
          'AC Frekans Yanıtı analizi çalıştırılmalıdır.'
        );
      }
      const fPeak = findACPeakFreqHz(simResult, 'V_OUT');
      const ok = fPeak !== null && fPeak >= 940 && fPeak <= 1060;
      return buildResult(
        [
          {
            label: 'Rezonans Tepe Frekansı f₀',
            actual: fPeak !== null ? fmtFreq(fPeak) : 'Bulunamadı',
            target: '940 Hz – 1.06 kHz',
            ok,
          },
        ],
        'Süper! Bobin ve kapasitörü tam 1 kHz’de mükemmel rezonansa getirdin.',
        'Rezonans tepesi henüz 1 kHz’de değil. C1 değerini 2.53 µF (2.53e-6 F) yap.'
      );
    },
  },

  {
    id: 23,
    chapter: 5,
    chapterTitle: 'İndüktör, RLC Rezonans ve Trafo',
    title: 'Yüksek Q-Faktörlü Keskin Filtre',
    difficulty: 'Orta-Alt',
    concept:
      'Bir RLC band-geçiren filtrenin seçiciliğini Kalite Faktörü (Q = ω₀L / R) belirler. Direnç R küçüldükçe Q büyür, filtre tepesi çok daha keskinleşir ve rezonans dışındaki frekanslar (ör. 100 Hz) çok daha sert bastırılır.',
    steps: [
      'L1 = 10 mH ve C1 = 2.533 µF ile rezonans 1 kHz’de kilitli; ancak R1 = 200 Ω iken Q düşük (0.31) ve 100 Hz sadece -10 dB bastırılıyor.',
      'R1 direncini 20 Ω yaparak Q faktörünü 10 kat artır (Q ≈ 3.14).',
      'Doğrula butonuna basıp 100 Hz’in -25 dB altına indiğini ve 1 kHz’in 0 dB civarında kaldığını gör.',
    ],
    goalText: 'R1’i küçülterek 100 Hz kazancını < -25 dB ve 1 kHz kazancını > -0.5 dB yap.',
    hint: 'R1 = 20 Ω yaptığında 100 Hz kazancı yaklaşık -30 dB olur, 1 kHz ise ~0 dB kalır.',
    realWorldNote:
      'Ses ekolayzırlarında dar bir frekans bandını (örneğin sadece 1 kHz vokal bandını) seçmek için yüksek Q faktörlü filtreler kullanılır.',
    starterSchematic: buildSeriesRLCSchematic(
      'acad-l23-start',
      'Seviye 23: Yüksek Q-Faktörlü Filtre',
      'Geniş bantlı (R1=200Ω) 1 kHz RLC band-geçiren filtre.',
      10e-3,
      2.533e-6,
      200,
      makeACAnalysis(10, 100000, 40)
    ),
    solutionSchematic: buildSeriesRLCSchematic(
      'acad-l23-sol',
      'Seviye 23: Yüksek Q-Faktörlü Filtre (Çözüm)',
      'R1=20Ω ile yüksek Q-faktörlü keskin 1 kHz band-geçiren filtre.',
      10e-3,
      2.533e-6,
      20,
      makeACAnalysis(10, 100000, 40)
    ),
    verificationAnalysis: makeACAnalysis(10, 100000, 40),
    verify: (_dcOp: DCOPResult, simResult: SimulationResult) => {
      if (simResult.type !== 'ac') {
        return buildResult(
          [{ label: 'Analiz Türü', actual: simResult.type, target: 'AC Sweep', ok: false }],
          '',
          'AC Frekans Yanıtı analizi çalıştırılmalıdır.'
        );
      }
      const db100 = sampleACDbAtFreq(simResult, 'V_OUT', 100) ?? 0;
      const db1k = sampleACDbAtFreq(simResult, 'V_OUT', 1000) ?? -100;
      const okStop = db100 < -25;
      const okPass = db1k > -0.5;
      return buildResult(
        [
          {
            label: '100 Hz Bastırma',
            actual: `${db100.toFixed(1)} dB`,
            target: '< -25.0 dB',
            ok: okStop,
          },
          {
            label: '1 kHz Geçiş Kazancı',
            actual: `${db1k.toFixed(2)} dB`,
            target: '> -0.5 dB',
            ok: okPass,
          },
        ],
        'Mükemmel! Direnci düşürerek çok keskin ve seçici bir yüksek-Q filtre elde ettin.',
        'Filtre henüz yeterince keskin değil. R1 değerini 20 Ω civarına düşürmeyi dene.'
      );
    },
  },

  {
    id: 24,
    chapter: 5,
    chapterTitle: 'İndüktör, RLC Rezonans ve Trafo',
    title: '10:1 İndirgeyici Trafo',
    difficulty: 'Orta-Alt',
    concept:
      'İdeal bir transformatör, AC gerilimi sarım oranına (n = Ns / Np = turnsRatio) göre ölçekler: V_sekonder = n · V_primer. Örneğin 170 Vpk (120 Vrms) şebeke gerilimini 10:1 oranıyla (turnsRatio = 0.1) güvenli 17 Vpk seviyesine düşürebilirsin.',
    steps: [
      'Primerde 170 Vpk / 60 Hz AC kaynak bağlı; şu an turnsRatio = 0.5 olduğu için sekonderde 85 Vpk çıkıyor.',
      'T1 trafosuna tıkla ve turnsRatio değerini 0.1 (10:1 indirgeyici) yap.',
      'Transient simülasyonunda sekonder tepe geriliminin ~17 Vpk olduğunu doğrula.',
    ],
    goalText: 'T1 turnsRatio değerini ayarlayarak sekonder tepe gerilimi V_SEC’i 15.5 V – 18.5 V aralığına getir.',
    hint: 'V_SEC = 170 V × turnsRatio = 17 V için turnsRatio = 0.1 olmalıdır.',
    realWorldNote:
      'Trafo yalnızca gerilimi düşürmekle kalmaz, aynı zamanda primer (şebeke) ile sekonder (elektronik devre) arasında galvanik elektriksel yalıtım sağlayarak kullanıcıyı korur.',
    starterSchematic: buildTransformerSchematic(
      'acad-l24-start',
      'Seviye 24: 10:1 İndirgeyici Trafo',
      '170 Vpk 60 Hz primerden sekonder yüke trafo bağlantısı.',
      170,
      0.5,
      1000,
      makeTransientAnalysis(34e-3, 100e-6)
    ),
    solutionSchematic: buildTransformerSchematic(
      'acad-l24-sol',
      'Seviye 24: 10:1 İndirgeyici Trafo (Çözüm)',
      'turnsRatio = 0.1 ile 170 Vpk → 17 Vpk indirgeme.',
      170,
      0.1,
      1000,
      makeTransientAnalysis(34e-3, 100e-6)
    ),
    verificationAnalysis: makeTransientAnalysis(34e-3, 100e-6),
    verify: (_dcOp: DCOPResult, simResult: SimulationResult) => {
      if (simResult.type !== 'transient') {
        return buildResult(
          [{ label: 'Analiz Türü', actual: simResult.type, target: 'Transient', ok: false }],
          '',
          'Transient analizi çalıştırılmalıdır.'
        );
      }
      const vals = simResult.probeVoltages['V_SEC'] ?? [];
      let vPeak = 0;
      for (const v of vals) {
        if (v > vPeak) vPeak = v;
      }
      const ok = vPeak >= 15.5 && vPeak <= 18.5;
      return buildResult(
        [
          {
            label: 'Sekonder Tepe Gerilimi V_SEC',
            actual: `${vPeak.toFixed(2)} Vpk`,
            target: '15.5 – 18.5 Vpk',
            ok,
          },
        ],
        'Harika! 10:1 trafo ile 170 Vpk şebeke gerilimini güvenli 17 Vpk seviyesine indirdin.',
        'Sekonder tepe gerilimi hedef aralıkta değil. T1 turnsRatio değerini 0.1 yapmayı dene.'
      );
    },
  },

  {
    id: 25,
    chapter: 5,
    chapterTitle: 'İndüktör, RLC Rezonans ve Trafo',
    title: 'Yarım Dalga Doğrultucu',
    difficulty: 'Orta-Alt',
    concept:
      'AC sinüs dalgasını tek yönlü DC darbelere dönüştürmenin en basit yolu seri bir diyot (D1) kullanmaktır. Pozitif yarı periyotta diyot iletime geçer ve çıkış V_peak - 0.65V’a ulaşır; negatif yarı periyotta diyot kesime gider ve çıkış 0V’ta kalır!',
    steps: [
      'Şu an V1 AC kaynağının genliği (amplitude) sadece 2V olduğu için çıkış tepesi ~1.4V’ta kalıyor.',
      'V1 kaynağına tıkla ve amplitude değerini 10 V yap.',
      'Transient analizini doğrula: pozitif tepelerin ~9.3V’a ulaştığını ve negatif yarı periyotların 0V’ta kırpıldığını gör.',
    ],
    goalText: 'V1 genliğini ayarlayarak V_OUT tepe değerini 8.8 V – 9.6 V ve minimum değerini ≥ -0.05 V yap.',
    hint: 'V1 amplitude = 10 V yaptığında diyot düşümü (~0.65V) sonrası çıkış tepesi ~9.35V olur.',
    realWorldNote:
      'Yarım dalga doğrultucu AC’nin sadece pozitif yarısını kullanır; ilerideki bölümlerde 4 diyotlu köprü doğrultucu ve filtre kapasitörü ile pürüzsüz DC güç kaynağı yapacağız!',
    starterSchematic: buildSeriesTwoSchematic(
      'acad-l25-start',
      'Seviye 25: Yarım Dalga Doğrultucu',
      '60 Hz AC kaynak, doğrultucu diyot D1 ve 1kΩ yük.',
      'Power',
      {
        name: 'V1',
        type: 'vac',
        params: { voltage: 0, amplitude: 2, frequency: 60, phase: 0, acMag: 1 },
      },
      { name: 'D1', type: 'diode', params: { is: 1e-12, n: 1.0 } },
      { name: 'R_LOAD', type: 'resistor', params: { resistance: 1000 } },
      'V_OUT',
      makeTransientAnalysis(34e-3, 100e-6)
    ),
    solutionSchematic: buildSeriesTwoSchematic(
      'acad-l25-sol',
      'Seviye 25: Yarım Dalga Doğrultucu (Çözüm)',
      '10 Vpk AC giriş ile ~9.35 Vpk doğrultulmuş çıkış.',
      'Power',
      {
        name: 'V1',
        type: 'vac',
        params: { voltage: 0, amplitude: 10, frequency: 60, phase: 0, acMag: 1 },
      },
      { name: 'D1', type: 'diode', params: { is: 1e-12, n: 1.0 } },
      { name: 'R_LOAD', type: 'resistor', params: { resistance: 1000 } },
      'V_OUT',
      makeTransientAnalysis(34e-3, 100e-6)
    ),
    verificationAnalysis: makeTransientAnalysis(34e-3, 100e-6),
    verify: (_dcOp: DCOPResult, simResult: SimulationResult) => {
      if (simResult.type !== 'transient') {
        return buildResult(
          [{ label: 'Analiz Türü', actual: simResult.type, target: 'Transient', ok: false }],
          '',
          'Transient analizi çalıştırılmalıdır.'
        );
      }
      const vals = simResult.probeVoltages['V_OUT'] ?? [];
      let vMax = -Infinity;
      let vMin = Infinity;
      for (const v of vals) {
        if (v > vMax) vMax = v;
        if (v < vMin) vMin = v;
      }
      const okMax = vMax >= 8.8 && vMax <= 9.6;
      const okMin = vMin >= -0.05;
      return buildResult(
        [
          {
            label: 'Çıkış Tepesi V_OUT (max)',
            actual: `${vMax.toFixed(2)} V`,
            target: '8.80 – 9.60 V',
            ok: okMax,
          },
          {
            label: 'Minimum Değer V_OUT (min)',
            actual: `${vMin.toFixed(3)} V`,
            target: '≥ -0.05 V',
            ok: okMin,
          },
        ],
        'Tebrikler! Bölüm 5’i yarım dalga doğrultucu ile muhteşem bir şekilde tamamladın!',
        'Çıkış tepesi hedef aralıkta değil. V1 AC genliğini (amplitude) 10 V yapmayı dene.'
      );
    },
  },
];
