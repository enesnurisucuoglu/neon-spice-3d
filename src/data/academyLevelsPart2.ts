import {
  AnalysisConfig,
  CircuitComponent,
  CircuitSchematic,
  ComponentParams,
  DCOPResult,
  ProbeMarker,
  SimulationResult,
  Wire,
} from '../types/circuit';
import { AcademyLevel, LevelCheckResult } from '../types/academy';
import { getPresetById } from '../circuits/presets';

function requirePreset(id: string): CircuitSchematic {
  const preset = getPresetById(id);
  if (!preset) {
    throw new Error(`Missing required preset schematic: ${id}`);
  }
  return preset;
}

function cloneSchematic(
  base: CircuitSchematic,
  options: {
    id: string;
    name: string;
    description: string;
    category?: CircuitSchematic['category'];
    compParams?: Record<string, Partial<ComponentParams>>;
    compTypes?: Record<string, CircuitComponent['type']>;
    removeCompIds?: string[];
    removeWireIds?: string[];
    extraComponents?: CircuitComponent[];
    extraWires?: Wire[];
    probes?: ProbeMarker[];
    recommendedAnalysis?: AnalysisConfig;
    theoryNotes?: string;
  }
): CircuitSchematic {
  const removeCompSet = new Set(options.removeCompIds ?? []);
  const removeWireSet = new Set(options.removeWireIds ?? []);

  const components: CircuitComponent[] = base.components
    .filter((c) => !removeCompSet.has(c.id))
    .map((c) => {
      const override = options.compParams?.[c.name];
      const nextType = options.compTypes?.[c.name] ?? c.type;
      return {
        ...c,
        type: nextType,
        params: override ? { ...c.params, ...override } : { ...c.params },
      };
    });

  if (options.extraComponents) {
    components.push(
      ...options.extraComponents.map((c) => ({ ...c, params: { ...c.params } }))
    );
  }

  const wires: Wire[] = [
    ...base.wires.filter((w) => !removeWireSet.has(w.id)).map((w) => ({ ...w })),
    ...(options.extraWires ?? []).map((w) => ({ ...w })),
  ];

  const probes: ProbeMarker[] = (options.probes ?? base.probes).map((p) => ({
    ...p,
  }));

  const ra = options.recommendedAnalysis ?? base.recommendedAnalysis;

  return {
    id: options.id,
    name: options.name,
    description: options.description,
    category: options.category ?? base.category,
    components,
    wires,
    probes,
    recommendedAnalysis: {
      type: ra.type,
      transient: { ...ra.transient },
      ac: { ...ra.ac },
      dcSweep: { ...ra.dcSweep },
    },
    theoryNotes: options.theoryNotes ?? base.theoryNotes,
  };
}

function findClosestFreqIndex(freqs: number[], targetHz: number): number {
  let bestIdx = 0;
  let bestErr = Infinity;
  for (let i = 0; i < freqs.length; i++) {
    const err = Math.abs(Math.log10(freqs[i]) - Math.log10(targetHz));
    if (err < bestErr) {
      bestErr = err;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function findCutoffFreqHz(
  freqs: number[],
  magDb: number[],
  dropDb = 3.01
): number | null {
  if (freqs.length < 2 || magDb.length !== freqs.length) return null;
  const passband = magDb[0];
  const target = passband - dropDb;
  for (let i = 1; i < freqs.length; i++) {
    if (magDb[i] <= target && magDb[i - 1] >= target) {
      const span = magDb[i - 1] - magDb[i];
      const frac = span > 1e-9 ? (magDb[i - 1] - target) / span : 0;
      const logF =
        Math.log10(freqs[i - 1]) +
        frac * (Math.log10(freqs[i]) - Math.log10(freqs[i - 1]));
      return Math.pow(10, logF);
    }
  }
  return null;
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

// ---------------------------------------------------------------------------
// Shared Base Topologies
// ---------------------------------------------------------------------------

const BRIDGE_BASE = requirePreset('bridge-rectifier');
const TRANSFORMER_PSU_BASE = requirePreset('transformer-psu');
const CLIPPER_BASE = requirePreset('diode-clipper');
const BJT_CE_BASE = requirePreset('bjt-ce-amp');
const NMOS_PWM_BASE = requirePreset('nmos-pwm-led');
const CMOS_INV_BASE = requirePreset('cmos-inverter');
const INV_OPAMP_BASE = requirePreset('inverting-opamp');
const SALLEN_KEY_BASE = requirePreset('sallen-key-lpf');

const VSWITCH_LAMP_BASE: CircuitSchematic = {
  id: 'l30-vswitch-lamp',
  name: 'Voltaj Kontrollü Anahtar ile 12V Lamba',
  description: 'Voltaj kontrollü anahtar (vswitch) üzerinden 12V lamba sürme devresi.',
  category: 'Power',
  components: [
    {
      id: 'l30-vctrl',
      name: 'V_CTRL',
      type: 'vdc',
      x: 5,
      y: 5,
      rotation: 0,
      params: { voltage: 0, acMag: 0 },
    },
    {
      id: 'l30-gnd1',
      name: 'GND1',
      type: 'ground',
      x: 5,
      y: 8,
      rotation: 0,
      params: {},
    },
    {
      id: 'l30-s1',
      name: 'S1',
      type: 'vswitch',
      x: 11,
      y: 5,
      rotation: 0,
      params: { vThreshold: 2.5, rOn: 0.1, rOff: 1e7 },
    },
    {
      id: 'l30-gndsw',
      name: 'GND_SW',
      type: 'ground',
      x: 9,
      y: 7,
      rotation: 0,
      params: {},
    },
    {
      id: 'l30-vdd',
      name: 'VDD',
      type: 'vdc',
      x: 13,
      y: 11,
      rotation: 0,
      params: { voltage: 12, acMag: 0 },
    },
    {
      id: 'l30-gnd2',
      name: 'GND2',
      type: 'ground',
      x: 13,
      y: 14,
      rotation: 0,
      params: {},
    },
    {
      id: 'l30-lp1',
      name: 'LP1',
      type: 'lamp',
      x: 17,
      y: 4,
      rotation: 0,
      params: { resistance: 100, ratedPower: 1.44 },
    },
    {
      id: 'l30-gnd3',
      name: 'GND3',
      type: 'ground',
      x: 21,
      y: 7,
      rotation: 0,
      params: {},
    },
  ],
  wires: [
    { id: 'l30-w1', x1: 5, y1: 3, x2: 9, y2: 3 },
    { id: 'l30-w2', x1: 9, y1: 3, x2: 9, y2: 4 },
    { id: 'l30-w3', x1: 13, y1: 9, x2: 13, y2: 6 },
    { id: 'l30-w4', x1: 13, y1: 4, x2: 15, y2: 4 },
    { id: 'l30-w5', x1: 19, y1: 4, x2: 21, y2: 4 },
    { id: 'l30-w6', x1: 21, y1: 4, x2: 21, y2: 6 },
  ],
  probes: [
    { id: 'l30-p1', label: 'V_CTRL', x: 5, y: 3, color: '#22d3ee' },
    { id: 'l30-p2', label: 'V_LAMP', x: 15, y: 4, color: '#fbbf24' },
  ],
  recommendedAnalysis: {
    type: 'dc_op',
    transient: { stopTime: 5e-3, timeStep: 20e-6, method: 'trapezoidal' },
    ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_CTRL' },
    dcSweep: { sourceName: 'V_CTRL', startValue: 0, stopValue: 5, stepValue: 0.1 },
  },
};

const NPN_LED_BASE: CircuitSchematic = {
  id: 'l31-npn-led',
  name: 'NPN Transistör LED Anahtarı',
  description: 'Düşük akımlı kontrol sinyaliyle 12V LED süren NPN BJT anahtarı.',
  category: 'Semiconductors',
  components: [
    {
      id: 'l31-vdd',
      name: 'VDD',
      type: 'vdc',
      x: 5,
      y: 6,
      rotation: 0,
      params: { voltage: 12, acMag: 0 },
    },
    {
      id: 'l31-gnd1',
      name: 'GND1',
      type: 'ground',
      x: 5,
      y: 9,
      rotation: 0,
      params: {},
    },
    {
      id: 'l31-rc',
      name: 'R_C',
      type: 'resistor',
      x: 11,
      y: 3,
      rotation: 0,
      params: { resistance: 470 },
    },
    {
      id: 'l31-led1',
      name: 'LED1',
      type: 'led',
      x: 19,
      y: 6,
      rotation: 90,
      params: { is: 1e-20, n: 1.8, ledColor: 'red' },
    },
    {
      id: 'l31-q1',
      name: 'Q1',
      type: 'bjt_npn',
      x: 18,
      y: 10,
      rotation: 0,
      params: { bf: 150, br: 1, is: 1e-14 },
    },
    {
      id: 'l31-gnd3',
      name: 'GND3',
      type: 'ground',
      x: 19,
      y: 13,
      rotation: 0,
      params: {},
    },
    {
      id: 'l31-vin',
      name: 'V_IN',
      type: 'vdc',
      x: 8,
      y: 11,
      rotation: 0,
      params: { voltage: 0, acMag: 0 },
    },
    {
      id: 'l31-gnd2',
      name: 'GND2',
      type: 'ground',
      x: 8,
      y: 14,
      rotation: 0,
      params: {},
    },
    {
      id: 'l31-rb',
      name: 'R_B',
      type: 'resistor',
      x: 12,
      y: 10,
      rotation: 0,
      params: { resistance: 10000 },
    },
  ],
  wires: [
    { id: 'l31-w1', x1: 5, y1: 4, x2: 5, y2: 3 },
    { id: 'l31-w2', x1: 5, y1: 3, x2: 9, y2: 3 },
    { id: 'l31-w3', x1: 13, y1: 3, x2: 19, y2: 3 },
    { id: 'l31-w4', x1: 19, y1: 3, x2: 19, y2: 4 },
    { id: 'l31-w5', x1: 8, y1: 9, x2: 10, y2: 9 },
    { id: 'l31-w6', x1: 10, y1: 9, x2: 10, y2: 10 },
    { id: 'l31-w7', x1: 14, y1: 10, x2: 16, y2: 10 },
  ],
  probes: [
    { id: 'l31-p1', label: 'V_IN', x: 8, y: 9, color: '#22d3ee' },
    { id: 'l31-p2', label: 'V_COL', x: 19, y: 8, color: '#fbbf24' },
  ],
  recommendedAnalysis: {
    type: 'dc_op',
    transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
    ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
    dcSweep: { sourceName: 'V_IN', startValue: 0, stopValue: 5, stepValue: 0.1 },
  },
};

const NPN_SAT_BASE: CircuitSchematic = {
  id: 'l32-npn-sat',
  name: 'NPN Baz Direnci ve Doyum',
  description: 'NPN BJT doyum anahtarı için baz direnci boyutlandırması.',
  category: 'Semiconductors',
  components: [
    {
      id: 'l32-vdd',
      name: 'VDD',
      type: 'vdc',
      x: 5,
      y: 6,
      rotation: 0,
      params: { voltage: 12, acMag: 0 },
    },
    {
      id: 'l32-gnd1',
      name: 'GND1',
      type: 'ground',
      x: 5,
      y: 9,
      rotation: 0,
      params: {},
    },
    {
      id: 'l32-rc',
      name: 'R_C',
      type: 'resistor',
      x: 19,
      y: 6,
      rotation: 90,
      params: { resistance: 1000 },
    },
    {
      id: 'l32-q1',
      name: 'Q1',
      type: 'bjt_npn',
      x: 18,
      y: 10,
      rotation: 0,
      params: { bf: 150, br: 1, is: 1e-14 },
    },
    {
      id: 'l32-gnd3',
      name: 'GND3',
      type: 'ground',
      x: 19,
      y: 13,
      rotation: 0,
      params: {},
    },
    {
      id: 'l32-vin',
      name: 'V_IN',
      type: 'vdc',
      x: 8,
      y: 11,
      rotation: 0,
      params: { voltage: 5, acMag: 0 },
    },
    {
      id: 'l32-gnd2',
      name: 'GND2',
      type: 'ground',
      x: 8,
      y: 14,
      rotation: 0,
      params: {},
    },
    {
      id: 'l32-rb',
      name: 'R_B',
      type: 'resistor',
      x: 12,
      y: 10,
      rotation: 0,
      params: { resistance: 1e6 },
    },
  ],
  wires: [
    { id: 'l32-w1', x1: 5, y1: 4, x2: 5, y2: 3 },
    { id: 'l32-w2', x1: 5, y1: 3, x2: 19, y2: 3 },
    { id: 'l32-w3', x1: 19, y1: 3, x2: 19, y2: 4 },
    { id: 'l32-w4', x1: 8, y1: 9, x2: 10, y2: 9 },
    { id: 'l32-w5', x1: 10, y1: 9, x2: 10, y2: 10 },
    { id: 'l32-w6', x1: 14, y1: 10, x2: 16, y2: 10 },
  ],
  probes: [
    { id: 'l32-p1', label: 'V_BASE', x: 16, y: 10, color: '#22d3ee' },
    { id: 'l32-p2', label: 'V_COL', x: 19, y: 8, color: '#34d399' },
  ],
  recommendedAnalysis: {
    type: 'dc_op',
    transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
    ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
    dcSweep: { sourceName: 'V_IN', startValue: 0, stopValue: 5, stepValue: 0.1 },
  },
};

const EMITTER_FOLLOWER_BASE: CircuitSchematic = {
  id: 'l33-emitter-follower',
  name: 'Emiter Takipçi (Ortak Kollektör)',
  description: 'Yüksek giriş empedanslı BJT gerilim tampon katı.',
  category: 'Semiconductors',
  components: [
    {
      id: 'l33-vdd',
      name: 'VDD',
      type: 'vdc',
      x: 6,
      y: 6,
      rotation: 0,
      params: { voltage: 12, acMag: 0 },
    },
    {
      id: 'l33-gnd1',
      name: 'GND1',
      type: 'ground',
      x: 6,
      y: 9,
      rotation: 0,
      params: {},
    },
    {
      id: 'l33-vin',
      name: 'V_IN',
      type: 'vdc',
      x: 9,
      y: 10,
      rotation: 0,
      params: { voltage: 1, acMag: 0 },
    },
    {
      id: 'l33-gnd2',
      name: 'GND2',
      type: 'ground',
      x: 9,
      y: 13,
      rotation: 0,
      params: {},
    },
    {
      id: 'l33-q1',
      name: 'Q1',
      type: 'bjt_npn',
      x: 17,
      y: 7,
      rotation: 0,
      params: { bf: 150, br: 1, is: 1e-14 },
    },
    {
      id: 'l33-re',
      name: 'R_E',
      type: 'resistor',
      x: 18,
      y: 11,
      rotation: 90,
      params: { resistance: 1000 },
    },
    {
      id: 'l33-gnd3',
      name: 'GND3',
      type: 'ground',
      x: 18,
      y: 14,
      rotation: 0,
      params: {},
    },
  ],
  wires: [
    { id: 'l33-w1', x1: 6, y1: 4, x2: 18, y2: 4 },
    { id: 'l33-w2', x1: 18, y1: 4, x2: 18, y2: 5 },
    { id: 'l33-w3', x1: 9, y1: 8, x2: 9, y2: 7 },
    { id: 'l33-w4', x1: 9, y1: 7, x2: 15, y2: 7 },
  ],
  probes: [
    { id: 'l33-p1', label: 'V_IN', x: 9, y: 8, color: '#22d3ee' },
    { id: 'l33-p2', label: 'V_EMIT', x: 18, y: 9, color: '#34d399' },
  ],
  recommendedAnalysis: {
    type: 'dc_op',
    transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
    ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
    dcSweep: { sourceName: 'V_IN', startValue: 0, stopValue: 10, stepValue: 0.2 },
  },
};

const PNP_HIGHSIDE_BASE: CircuitSchematic = {
  id: 'l35-pnp-highside',
  name: 'PNP Yüksek Taraf Anahtarı',
  description: '12V besleme hattını aktif-düşük baz sinyaliyle anahtarlayan PNP BJT.',
  category: 'Semiconductors',
  components: [
    {
      id: 'l35-vdd',
      name: 'VDD',
      type: 'vdc',
      x: 5,
      y: 6,
      rotation: 0,
      params: { voltage: 12, acMag: 0 },
    },
    {
      id: 'l35-gnd1',
      name: 'GND1',
      type: 'ground',
      x: 5,
      y: 9,
      rotation: 0,
      params: {},
    },
    {
      id: 'l35-vctrl',
      name: 'V_CTRL',
      type: 'vdc',
      x: 8,
      y: 10,
      rotation: 0,
      params: { voltage: 12, acMag: 0 },
    },
    {
      id: 'l35-gnd2',
      name: 'GND2',
      type: 'ground',
      x: 8,
      y: 13,
      rotation: 0,
      params: {},
    },
    {
      id: 'l35-rb',
      name: 'R_B',
      type: 'resistor',
      x: 12,
      y: 7,
      rotation: 0,
      params: { resistance: 10000 },
    },
    {
      id: 'l35-q1',
      name: 'Q1',
      type: 'bjt_pnp',
      x: 17,
      y: 7,
      rotation: 0,
      params: { bf: 120, br: 1, is: 1e-14 },
    },
    {
      id: 'l35-rload',
      name: 'R_LOAD',
      type: 'resistor',
      x: 18,
      y: 11,
      rotation: 90,
      params: { resistance: 1000 },
    },
    {
      id: 'l35-gnd3',
      name: 'GND3',
      type: 'ground',
      x: 18,
      y: 14,
      rotation: 0,
      params: {},
    },
  ],
  wires: [
    { id: 'l35-w1', x1: 5, y1: 4, x2: 18, y2: 4 },
    { id: 'l35-w2', x1: 18, y1: 4, x2: 18, y2: 5 },
    { id: 'l35-w3', x1: 8, y1: 8, x2: 8, y2: 7 },
    { id: 'l35-w4', x1: 8, y1: 7, x2: 10, y2: 7 },
    { id: 'l35-w5', x1: 14, y1: 7, x2: 15, y2: 7 },
  ],
  probes: [
    { id: 'l35-p1', label: 'V_CTRL', x: 8, y: 8, color: '#22d3ee' },
    { id: 'l35-p2', label: 'V_LOAD', x: 18, y: 9, color: '#34d399' },
  ],
  recommendedAnalysis: {
    type: 'dc_op',
    transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
    ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_CTRL' },
    dcSweep: { sourceName: 'V_CTRL', startValue: 0, stopValue: 12, stepValue: 0.2 },
  },
};

const NMOS_VTH_BASE: CircuitSchematic = {
  id: 'l36-nmos-vth',
  name: 'NMOS Eşik Gerilimi Anahtarı',
  description: 'NMOS transistörün Vth = 1.5 V eşik gerilimi üzerinde iletime geçişi.',
  category: 'Semiconductors',
  components: [
    {
      id: 'l36-vdd',
      name: 'VDD',
      type: 'vdc',
      x: 5,
      y: 6,
      rotation: 0,
      params: { voltage: 10, acMag: 0 },
    },
    {
      id: 'l36-gnd1',
      name: 'GND1',
      type: 'ground',
      x: 5,
      y: 9,
      rotation: 0,
      params: {},
    },
    {
      id: 'l36-rd',
      name: 'R_D',
      type: 'resistor',
      x: 18,
      y: 5,
      rotation: 90,
      params: { resistance: 1000 },
    },
    {
      id: 'l36-m1',
      name: 'M1',
      type: 'nmos',
      x: 17,
      y: 9,
      rotation: 0,
      params: { vth: 1.5, kp: 0.02, lambda: 0.02 },
    },
    {
      id: 'l36-gnd3',
      name: 'GND3',
      type: 'ground',
      x: 18,
      y: 12,
      rotation: 0,
      params: {},
    },
    {
      id: 'l36-vgs',
      name: 'V_GS',
      type: 'vdc',
      x: 10,
      y: 11,
      rotation: 0,
      params: { voltage: 1, acMag: 0 },
    },
    {
      id: 'l36-gnd2',
      name: 'GND2',
      type: 'ground',
      x: 10,
      y: 14,
      rotation: 0,
      params: {},
    },
  ],
  wires: [
    { id: 'l36-w1', x1: 5, y1: 4, x2: 5, y2: 3 },
    { id: 'l36-w2', x1: 5, y1: 3, x2: 18, y2: 3 },
    { id: 'l36-w3', x1: 10, y1: 9, x2: 15, y2: 9 },
  ],
  probes: [
    { id: 'l36-p1', label: 'V_GS', x: 10, y: 9, color: '#22d3ee' },
    { id: 'l36-p2', label: 'V_DRAIN', x: 18, y: 7, color: '#34d399' },
  ],
  recommendedAnalysis: {
    type: 'dc_op',
    transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
    ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_GS' },
    dcSweep: { sourceName: 'V_GS', startValue: 0, stopValue: 5, stepValue: 0.1 },
  },
};

const NMOS_LAMP_BASE: CircuitSchematic = {
  id: 'l37-nmos-lamp',
  name: 'NMOS Güç Anahtarı ile 12V Lamba',
  description: 'Düşük taraf NMOS güç MOSFET ile 12V lamba sürme devresi.',
  category: 'Power',
  components: [
    {
      id: 'l37-vdd',
      name: 'VDD',
      type: 'vdc',
      x: 5,
      y: 6,
      rotation: 0,
      params: { voltage: 12, acMag: 0 },
    },
    {
      id: 'l37-gnd1',
      name: 'GND1',
      type: 'ground',
      x: 5,
      y: 9,
      rotation: 0,
      params: {},
    },
    {
      id: 'l37-lp1',
      name: 'LP1',
      type: 'lamp',
      x: 18,
      y: 5,
      rotation: 90,
      params: { resistance: 100, ratedPower: 1.44 },
    },
    {
      id: 'l37-m1',
      name: 'M1',
      type: 'nmos',
      x: 17,
      y: 9,
      rotation: 0,
      params: { vth: 1.5, kp: 0.05, lambda: 0.02 },
    },
    {
      id: 'l37-gnd3',
      name: 'GND3',
      type: 'ground',
      x: 18,
      y: 12,
      rotation: 0,
      params: {},
    },
    {
      id: 'l37-vg',
      name: 'V_G',
      type: 'vdc',
      x: 10,
      y: 11,
      rotation: 0,
      params: { voltage: 0, acMag: 0 },
    },
    {
      id: 'l37-gnd2',
      name: 'GND2',
      type: 'ground',
      x: 10,
      y: 14,
      rotation: 0,
      params: {},
    },
  ],
  wires: [
    { id: 'l37-w1', x1: 5, y1: 4, x2: 5, y2: 3 },
    { id: 'l37-w2', x1: 5, y1: 3, x2: 18, y2: 3 },
    { id: 'l37-w3', x1: 10, y1: 9, x2: 15, y2: 9 },
  ],
  probes: [
    { id: 'l37-p1', label: 'V_G', x: 10, y: 9, color: '#22d3ee' },
    { id: 'l37-p2', label: 'V_DRAIN', x: 18, y: 7, color: '#fbbf24' },
  ],
  recommendedAnalysis: {
    type: 'dc_op',
    transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
    ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_G' },
    dcSweep: { sourceName: 'V_G', startValue: 0, stopValue: 5, stepValue: 0.1 },
  },
};

const PMOS_HIGHSIDE_BASE: CircuitSchematic = {
  id: 'l39-pmos-highside',
  name: 'PMOS Yüksek Taraf Anahtarı',
  description: '10V pozitif besleme hattını kontrol eden yüksek taraf P-kanallı MOSFET.',
  category: 'Semiconductors',
  components: [
    {
      id: 'l39-vdd',
      name: 'VDD',
      type: 'vdc',
      x: 5,
      y: 6,
      rotation: 0,
      params: { voltage: 10, acMag: 0 },
    },
    {
      id: 'l39-gnd1',
      name: 'GND1',
      type: 'ground',
      x: 5,
      y: 9,
      rotation: 0,
      params: {},
    },
    {
      id: 'l39-vg',
      name: 'V_G',
      type: 'vdc',
      x: 10,
      y: 9,
      rotation: 0,
      params: { voltage: 10, acMag: 0 },
    },
    {
      id: 'l39-gnd2',
      name: 'GND2',
      type: 'ground',
      x: 10,
      y: 12,
      rotation: 0,
      params: {},
    },
    {
      id: 'l39-m1',
      name: 'M1',
      type: 'pmos',
      x: 17,
      y: 7,
      rotation: 0,
      params: { vth: -1.5, kp: 0.05, lambda: 0.02 },
    },
    {
      id: 'l39-rload',
      name: 'R_LOAD',
      type: 'resistor',
      x: 18,
      y: 11,
      rotation: 90,
      params: { resistance: 1000 },
    },
    {
      id: 'l39-gnd3',
      name: 'GND3',
      type: 'ground',
      x: 18,
      y: 14,
      rotation: 0,
      params: {},
    },
  ],
  wires: [
    { id: 'l39-w1', x1: 5, y1: 4, x2: 18, y2: 4 },
    { id: 'l39-w2', x1: 18, y1: 4, x2: 18, y2: 5 },
    { id: 'l39-w3', x1: 10, y1: 7, x2: 15, y2: 7 },
  ],
  probes: [
    { id: 'l39-p1', label: 'V_G', x: 10, y: 7, color: '#22d3ee' },
    { id: 'l39-p2', label: 'V_LOAD', x: 18, y: 9, color: '#34d399' },
  ],
  recommendedAnalysis: {
    type: 'dc_op',
    transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
    ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_G' },
    dcSweep: { sourceName: 'V_G', startValue: 0, stopValue: 10, stepValue: 0.2 },
  },
};

const OPAMP_BUFFER_BASE: CircuitSchematic = {
  id: 'l41-opamp-buffer',
  name: 'Op-Amp Gerilim İzleyici',
  description: 'Birim kazançlı (Av = 1) op-amp gerilim tampon katı.',
  category: 'Analog',
  components: [
    {
      id: 'l41-vin',
      name: 'V_IN',
      type: 'vdc',
      x: 6,
      y: 8,
      rotation: 0,
      params: { voltage: 1, acMag: 0 },
    },
    {
      id: 'l41-gnd1',
      name: 'GND1',
      type: 'ground',
      x: 6,
      y: 11,
      rotation: 0,
      params: {},
    },
    {
      id: 'l41-u1',
      name: 'U1',
      type: 'opamp',
      x: 15,
      y: 7,
      rotation: 0,
      params: { gain: 1e5, vSatPos: 15, vSatNeg: -15 },
    },
    {
      id: 'l41-rl',
      name: 'R_L',
      type: 'resistor',
      x: 22,
      y: 9,
      rotation: 90,
      params: { resistance: 1000 },
    },
    {
      id: 'l41-gnd2',
      name: 'GND2',
      type: 'ground',
      x: 22,
      y: 12,
      rotation: 0,
      params: {},
    },
  ],
  wires: [
    { id: 'l41-w1', x1: 6, y1: 6, x2: 13, y2: 6 },
    { id: 'l41-w2', x1: 17, y1: 7, x2: 18, y2: 7 },
    { id: 'l41-w3', x1: 18, y1: 7, x2: 18, y2: 10 },
    { id: 'l41-w4', x1: 18, y1: 10, x2: 13, y2: 10 },
    { id: 'l41-w5', x1: 13, y1: 10, x2: 13, y2: 8 },
    { id: 'l41-w6', x1: 18, y1: 7, x2: 22, y2: 7 },
  ],
  probes: [
    { id: 'l41-p1', label: 'V_IN', x: 6, y: 6, color: '#22d3ee' },
    { id: 'l41-p2', label: 'V_OUT', x: 22, y: 7, color: '#34d399' },
  ],
  recommendedAnalysis: {
    type: 'dc_op',
    transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
    ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
    dcSweep: { sourceName: 'V_IN', startValue: -10, stopValue: 10, stepValue: 0.5 },
  },
};

const NONINV_OPAMP_BASE: CircuitSchematic = {
  id: 'l43-noninv-opamp',
  name: 'Evirmeyen Op-Amp Yükselteç',
  description: 'Av = 1 + R_FB / R1 formülüyle pozitif kazançlı evirmeyen yükselteç.',
  category: 'Analog',
  components: [
    {
      id: 'l43-vin',
      name: 'V_IN',
      type: 'vdc',
      x: 5,
      y: 8,
      rotation: 0,
      params: { voltage: 1, acMag: 0 },
    },
    {
      id: 'l43-gnd1',
      name: 'GND1',
      type: 'ground',
      x: 5,
      y: 11,
      rotation: 0,
      params: {},
    },
    {
      id: 'l43-u1',
      name: 'U1',
      type: 'opamp',
      x: 15,
      y: 7,
      rotation: 0,
      params: { gain: 1e5, vSatPos: 15, vSatNeg: -15 },
    },
    {
      id: 'l43-r1',
      name: 'R1',
      type: 'resistor',
      x: 10,
      y: 11,
      rotation: 90,
      params: { resistance: 1000 },
    },
    {
      id: 'l43-gnd2',
      name: 'GND2',
      type: 'ground',
      x: 10,
      y: 14,
      rotation: 0,
      params: {},
    },
    {
      id: 'l43-rfb',
      name: 'R_FB',
      type: 'resistor',
      x: 15,
      y: 11,
      rotation: 0,
      params: { resistance: 1000 },
    },
    {
      id: 'l43-rl',
      name: 'R_L',
      type: 'resistor',
      x: 22,
      y: 9,
      rotation: 90,
      params: { resistance: 10000 },
    },
    {
      id: 'l43-gnd3',
      name: 'GND3',
      type: 'ground',
      x: 22,
      y: 12,
      rotation: 0,
      params: {},
    },
  ],
  wires: [
    { id: 'l43-w1', x1: 5, y1: 6, x2: 13, y2: 6 },
    { id: 'l43-w2', x1: 13, y1: 8, x2: 12, y2: 8 },
    { id: 'l43-w3', x1: 12, y1: 8, x2: 10, y2: 8 },
    { id: 'l43-w4', x1: 10, y1: 8, x2: 10, y2: 9 },
    { id: 'l43-w5', x1: 12, y1: 8, x2: 12, y2: 11 },
    { id: 'l43-w6', x1: 12, y1: 11, x2: 13, y2: 11 },
    { id: 'l43-w7', x1: 17, y1: 11, x2: 18, y2: 11 },
    { id: 'l43-w8', x1: 18, y1: 11, x2: 18, y2: 7 },
    { id: 'l43-w9', x1: 17, y1: 7, x2: 18, y2: 7 },
    { id: 'l43-w10', x1: 18, y1: 7, x2: 22, y2: 7 },
  ],
  probes: [
    { id: 'l43-p1', label: 'V_IN', x: 5, y: 6, color: '#22d3ee' },
    { id: 'l43-p2', label: 'V_OUT', x: 22, y: 7, color: '#34d399' },
  ],
  recommendedAnalysis: {
    type: 'dc_op',
    transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
    ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
    dcSweep: { sourceName: 'V_IN', startValue: -2, stopValue: 2, stepValue: 0.1 },
  },
};

const VCCS_BASE: CircuitSchematic = {
  id: 'l49-vccs',
  name: 'VCCS Transkondüktans Yükselteci',
  description: 'Giriş gerilimini çıkış akımına dönüştüren (I_out = gm · V_in) kontrollü kaynak.',
  category: 'Analog',
  components: [
    {
      id: 'l49-vin',
      name: 'V_IN',
      type: 'vdc',
      x: 6,
      y: 9,
      rotation: 0,
      params: { voltage: 2, acMag: 0 },
    },
    {
      id: 'l49-gnd1',
      name: 'GND1',
      type: 'ground',
      x: 6,
      y: 12,
      rotation: 0,
      params: {},
    },
    {
      id: 'l49-g1',
      name: 'G1',
      type: 'vccs',
      x: 13,
      y: 8,
      rotation: 0,
      params: { gm: 1e-3 },
    },
    {
      id: 'l49-gnd2',
      name: 'GND2',
      type: 'ground',
      x: 11,
      y: 11,
      rotation: 0,
      params: {},
    },
    {
      id: 'l49-gnd3',
      name: 'GND3',
      type: 'ground',
      x: 18,
      y: 6,
      rotation: 0,
      params: {},
    },
    {
      id: 'l49-rload',
      name: 'R_LOAD',
      type: 'resistor',
      x: 21,
      y: 11,
      rotation: 90,
      params: { resistance: 1000 },
    },
    {
      id: 'l49-gnd4',
      name: 'GND4',
      type: 'ground',
      x: 21,
      y: 14,
      rotation: 0,
      params: {},
    },
  ],
  wires: [
    { id: 'l49-w1', x1: 6, y1: 7, x2: 11, y2: 7 },
    { id: 'l49-w2', x1: 11, y1: 9, x2: 11, y2: 10 },
    { id: 'l49-w3', x1: 15, y1: 7, x2: 15, y2: 5 },
    { id: 'l49-w4', x1: 15, y1: 5, x2: 18, y2: 5 },
    { id: 'l49-w5', x1: 15, y1: 9, x2: 21, y2: 9 },
  ],
  probes: [
    { id: 'l49-p1', label: 'V_IN', x: 6, y: 7, color: '#22d3ee' },
    { id: 'l49-p2', label: 'V_OUT', x: 21, y: 9, color: '#34d399' },
  ],
  recommendedAnalysis: {
    type: 'dc_op',
    transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
    ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
    dcSweep: { sourceName: 'V_IN', startValue: 0, stopValue: 5, stepValue: 0.2 },
  },
};

const BUFFERED_ZENER_BASE: CircuitSchematic = {
  id: 'l50-buffered-zener',
  name: 'Tamponlu 5.1V Hassas Güç Referansı',
  description: '5.1V Zener referansını op-amp gerilim izleyiciyle tamponlayarak ağır 100 Ω yük sürme.',
  category: 'Power',
  components: [
    {
      id: 'l50-vin',
      name: 'V_IN',
      type: 'vdc',
      x: 4,
      y: 8,
      rotation: 0,
      params: { voltage: 12, acMag: 0 },
    },
    {
      id: 'l50-gnd1',
      name: 'GND1',
      type: 'ground',
      x: 4,
      y: 11,
      rotation: 0,
      params: {},
    },
    {
      id: 'l50-rs',
      name: 'R_S',
      type: 'resistor',
      x: 9,
      y: 5,
      rotation: 0,
      params: { resistance: 10000 },
    },
    {
      id: 'l50-dz1',
      name: 'DZ1',
      type: 'zener',
      x: 13,
      y: 8,
      rotation: 270,
      params: { bv: 5.1, is: 1e-12, n: 1.0 },
    },
    {
      id: 'l50-gnd2',
      name: 'GND2',
      type: 'ground',
      x: 13,
      y: 11,
      rotation: 0,
      params: {},
    },
    {
      id: 'l50-u1',
      name: 'U1',
      type: 'opamp',
      x: 17,
      y: 7,
      rotation: 0,
      params: { gain: 1e5, vSatPos: 15, vSatNeg: -15 },
    },
    {
      id: 'l50-rload',
      name: 'R_LOAD',
      type: 'resistor',
      x: 24,
      y: 9,
      rotation: 90,
      params: { resistance: 100 },
    },
    {
      id: 'l50-gnd3',
      name: 'GND3',
      type: 'ground',
      x: 24,
      y: 12,
      rotation: 0,
      params: {},
    },
  ],
  wires: [
    { id: 'l50-w1', x1: 4, y1: 6, x2: 4, y2: 5 },
    { id: 'l50-w2', x1: 4, y1: 5, x2: 7, y2: 5 },
    { id: 'l50-w3', x1: 11, y1: 5, x2: 13, y2: 5 },
    { id: 'l50-w4', x1: 13, y1: 5, x2: 13, y2: 6 },
    { id: 'l50-w5', x1: 13, y1: 5, x2: 15, y2: 5 },
    { id: 'l50-w6', x1: 15, y1: 5, x2: 15, y2: 6 },
    { id: 'l50-w7', x1: 19, y1: 7, x2: 20, y2: 7 },
    { id: 'l50-w8', x1: 20, y1: 7, x2: 20, y2: 10 },
    { id: 'l50-w9', x1: 20, y1: 10, x2: 15, y2: 10 },
    { id: 'l50-w10', x1: 15, y1: 10, x2: 15, y2: 8 },
    { id: 'l50-w11', x1: 20, y1: 7, x2: 24, y2: 7 },
  ],
  probes: [
    { id: 'l50-p1', label: 'V_ZENER', x: 13, y: 6, color: '#22d3ee' },
    { id: 'l50-p2', label: 'V_OUT', x: 24, y: 7, color: '#34d399' },
  ],
  recommendedAnalysis: {
    type: 'dc_op',
    transient: { stopTime: 5e-3, timeStep: 20e-6, method: 'trapezoidal' },
    ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
    dcSweep: { sourceName: 'V_IN', startValue: 0, stopValue: 15, stepValue: 0.25 },
  },
};

// ---------------------------------------------------------------------------
// Levels 26 .. 50 (Chapters 6 .. 10)
// ---------------------------------------------------------------------------

export const ACADEMY_LEVELS_PART2: AcademyLevel[] = [
  // =========================================================================
  // BÖLÜM 6: Güç Elektroniği — Doğrultma & Anahtarlama (L26 - L30)
  // =========================================================================
  {
    id: 26,
    chapter: 6,
    chapterTitle: 'Güç Elektroniği: Doğrultma & Anahtarlama',
    title: 'Tam Dalga Köprü Doğrultucu',
    difficulty: 'Orta-Alt',
    concept:
      'Dört diyottan oluşan Graetz köprü doğrultucusu, alternatif akımın (AC) hem pozitif hem negatif yarım dalgalarını aynı yöne çevirerek 1 kΩ yük üzerinde tam dalgalı (pulsasyonlu) pozitif DC üretir. Akım her yarım periyotta iki diyot üzerinden aktığı için tepe çıkış gerilimi V_tepe - 2·V_f civarındadır.',
    steps: [
      'Şemadaki V1 AC kaynağına tıklayın ve sağdaki özellik panelini açın.',
      'Başlangıçta V1 genliği 3 V olarak ayarlıdır; çıkış gerilimini yükseltmek için amplitude değerini 10 V yapın.',
      'Simülasyonu (Transient) çalıştırıp V_DC_OUT dalga formunun tepe değerini gözlemleyin.',
    ],
    goalText:
      'V1 AC kaynağının genliğini ayarlayarak tam dalga doğrultulmuş V_DC_OUT tepe gerilimini 8.2–9.0 V aralığına getirin.',
    hint: 'Her iki diyot üzerinden toplam ~1.4 V iletim düşümü olur. 10 V tepe AC girişte V_DC,tepe ≈ 10 - 1.4 = 8.6 V elde edilir.',
    realWorldNote:
      '1N4007 veya 1N4148 köprü doğrultucularda AC girişin eksi ucunu asla DC eksi (GND) hattına doğrudan bağlamayın; aksi halde köprü diyotlarından biri kısa devre olur.',
    starterSchematic: cloneSchematic(BRIDGE_BASE, {
      id: 'l26-bridge-starter',
      name: 'Tam Dalga Köprü Doğrultucu (Başlangıç)',
      description: 'Filtresiz 4 diyotlu tam dalga köprü doğrultucu.',
      removeCompIds: ['br-c1'],
      removeWireIds: ['br-w9', 'br-w11', 'br-w14', 'br-w15'],
      compParams: { V1: { amplitude: 3 } },
    }),
    solutionSchematic: cloneSchematic(BRIDGE_BASE, {
      id: 'l26-bridge-solution',
      name: 'Tam Dalga Köprü Doğrultucu (Çözüm)',
      description: '10 Vpk AC girişli tam dalga köprü doğrultucu.',
      removeCompIds: ['br-c1'],
      removeWireIds: ['br-w9', 'br-w11', 'br-w14', 'br-w15'],
      compParams: { V1: { amplitude: 10 } },
    }),
    verificationAnalysis: {
      type: 'transient',
      transient: { stopTime: 50e-3, timeStep: 100e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 10000, pointsPerDecade: 20, inputSourceName: 'V1' },
      dcSweep: { sourceName: 'V1', startValue: -10, stopValue: 10, stepValue: 0.2 },
    },
    verify: (_dcOp, simResult) => {
      if (simResult.type !== 'transient') {
        return buildResult(
          [{ label: 'Analiz', actual: simResult.type, target: 'transient', ok: false }],
          '',
          'Transient (zaman alanı) simülasyonu çalıştırın.'
        );
      }
      const vOut = simResult.probeVoltages['V_DC_OUT'] ?? [];
      const peak = vOut.length ? Math.max(...vOut) : 0;
      const minV = vOut.length ? Math.min(...vOut) : -1;
      return buildResult(
        [
          {
            label: 'V_DC_OUT Tepe',
            actual: `${peak.toFixed(2)} V`,
            target: '8.20 – 9.00 V',
            ok: peak >= 8.2 && peak <= 9.0,
          },
          {
            label: 'Pozitif Doğrultma',
            actual: `${minV.toFixed(3)} V min`,
            target: '>= -0.05 V',
            ok: minV >= -0.05,
          },
        ],
        'Harika! 4 diyotlu köprü AC sinyalin her iki yarımını da pozitif DC tepeciklerine dönüştürdü (~8.6 Vpk).',
        'V_DC_OUT tepe gerilimi hedef aralıkta değil; V1 genliğini 10 V olarak ayarlayın.'
      );
    },
  },

  {
    id: 27,
    chapter: 6,
    chapterTitle: 'Güç Elektroniği: Doğrultma & Anahtarlama',
    title: 'Kapasitörle Dalgalanma (Ripple) Filtreleme',
    difficulty: 'Orta-Alt',
    concept:
      'Köprü doğrultucunun çıkışına paralel bağlanan büyük bir elektrolitik kondansatör (C1), AC tepe noktalarında şarj olur ve tepe aralarında 1 kΩ yükü besleyerek DC gerilimdeki dalgalanmayı (ripple) büyük ölçüde azaltır: ΔV_r ≈ I_yük / (2·f·C).',
    steps: [
      'Devredeki C1 filtre kondansatörüne tıklayın (başlangıçta 1 µF).',
      'Kapasitansı 100u (100 µF) değerine yükseltin.',
      'Transient analizinde t > 20 ms sonrasındaki V_DC_OUT eğrisinin düzleştiğini doğrulayın.',
    ],
    goalText:
      'C1 değerini artırarak t > 20 ms kararlı durumunda V_DC_OUT minimumunu > 7.5 V ve dalgalanmayı (ripple) < 1.0 V yapın.',
    hint: '1 µF ile τ = R·C = 1 ms olur ve kondansatör her yarım periyotta (8.33 ms) neredeyse tamamen boşalır. 100 µF ile τ = 100 ms olur.',
    realWorldNote:
      'Gerçek güç kaynaklarında 100 µF–2200 µF elektrolitik kondansatörler kullanılır; kutup yönüne (+ tarafı V_DC+ hattına) mutlaka dikkat edilir.',
    starterSchematic: cloneSchematic(BRIDGE_BASE, {
      id: 'l27-ripple-starter',
      name: 'Ripple Filtreleme (Başlangıç)',
      description: 'Yetersiz 1 µF kondansatörlü köprü doğrultucu.',
      compParams: { C1: { capacitance: 1e-6 } },
    }),
    solutionSchematic: cloneSchematic(BRIDGE_BASE, {
      id: 'l27-ripple-solution',
      name: 'Ripple Filtreleme (Çözüm)',
      description: '100 µF filtre kondansatörlü düşük ripple DC çıkış.',
      compParams: { C1: { capacitance: 100e-6 } },
    }),
    verificationAnalysis: {
      type: 'transient',
      transient: { stopTime: 50e-3, timeStep: 100e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 10000, pointsPerDecade: 20, inputSourceName: 'V1' },
      dcSweep: { sourceName: 'V1', startValue: -10, stopValue: 10, stepValue: 0.2 },
    },
    verify: (_dcOp, simResult) => {
      if (simResult.type !== 'transient') {
        return buildResult(
          [{ label: 'Analiz', actual: simResult.type, target: 'transient', ok: false }],
          '',
          'Transient analiz çalıştırın.'
        );
      }
      const times = simResult.times;
      const vOut = simResult.probeVoltages['V_DC_OUT'] ?? [];
      const steady = vOut.filter((_, i) => (times[i] ?? 0) > 20e-3);
      const minV = steady.length ? Math.min(...steady) : 0;
      const maxV = steady.length ? Math.max(...steady) : 0;
      const ripple = maxV - minV;
      return buildResult(
        [
          {
            label: 'Kararlı Min (t>20ms)',
            actual: `${minV.toFixed(2)} V`,
            target: '> 7.50 V',
            ok: minV > 7.5,
          },
          {
            label: 'Dalgalanma (Ripple)',
            actual: `${ripple.toFixed(2)} Vpp`,
            target: '< 1.00 Vpp',
            ok: ripple < 1.0,
          },
        ],
        'Mükemmel! 100 µF filtre kondansatörü ile dalgalanma 1 V altına indi ve kararlı DC hat oluştu.',
        'Dalgalanma hâlâ çok yüksek. C1 kapasitansını 100 µF (100u) seviyesine çıkarın.'
      );
    },
  },

  {
    id: 28,
    chapter: 6,
    chapterTitle: 'Güç Elektroniği: Doğrultma & Anahtarlama',
    title: 'Trafolu + Schottky Köprülü Güç Kaynağı',
    difficulty: 'Orta-Alt',
    concept:
      'Şebeke gerilimini (120 Vrms / 170 Vpk, 60 Hz) güvenli seviyeye düşürmek için transformatör kullanılır. Sekonder/primer sarım oranı n = N_s / N_p olan trafoda sekonder tepe gerilimi V_s = n · V_p olur. Düşük iletim düşümlü Schottky diyotlar verimi artırır.',
    steps: [
      'Şemadaki T1 transformatörüne tıklayın (başlangıçta turnsRatio = 0.25 -> ~42.5 Vpk sekonder).',
      '17 Vpk sekonder ve ~16 V DC çıkış için turnsRatio parametresini 0.1 (10:1 düşürücü) yapın.',
      'Transient analiz ile t > 20 ms kararlı DC çıkış gerilimini kontrol edin.',
    ],
    goalText:
      'T1 sarım oranını ayarlayarak t > 20 ms kararlı V_DC_OUT gerilimini 15.0–16.8 V aralığına getirin.',
    hint: 'V_MAINS tepe genliği 170 V. turnsRatio = 0.1 seçildiğinde sekonder 17 Vpk olur ve iki Schottky diyot düşümünden sonra ~16.2 V DC elde edilir.',
    realWorldNote:
      'Gerçek lineer güç kaynaklarında trafo hem voltajı düşürür hem de kullanıcıyı şebekeden galvanik olarak izole eder.',
    starterSchematic: cloneSchematic(TRANSFORMER_PSU_BASE, {
      id: 'l28-trafo-starter',
      name: 'Trafolu Güç Kaynağı (Başlangıç)',
      description: 'Yanlış sarım oranlı (0.25) trafo güç kaynağı.',
      compParams: { T1: { turnsRatio: 0.25 } },
    }),
    solutionSchematic: cloneSchematic(TRANSFORMER_PSU_BASE, {
      id: 'l28-trafo-solution',
      name: 'Trafolu Güç Kaynağı (Çözüm)',
      description: '10:1 düşürücü trafo + Schottky köprü güç kaynağı.',
      compParams: { T1: { turnsRatio: 0.1 } },
    }),
    verificationAnalysis: {
      type: 'transient',
      transient: { stopTime: 50e-3, timeStep: 100e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 10000, pointsPerDecade: 20, inputSourceName: 'V_MAINS' },
      dcSweep: { sourceName: 'V_MAINS', startValue: -170, stopValue: 170, stepValue: 5 },
    },
    verify: (_dcOp, simResult) => {
      if (simResult.type !== 'transient') {
        return buildResult(
          [{ label: 'Analiz', actual: simResult.type, target: 'transient', ok: false }],
          '',
          'Transient analiz çalıştırın.'
        );
      }
      const times = simResult.times;
      const vOut = simResult.probeVoltages['V_DC_OUT'] ?? [];
      const steady = vOut.filter((_, i) => (times[i] ?? 0) > 20e-3);
      const minV = steady.length ? Math.min(...steady) : 0;
      const maxV = steady.length ? Math.max(...steady) : 0;
      return buildResult(
        [
          {
            label: 'Kararlı V_DC_OUT Min',
            actual: `${minV.toFixed(2)} V`,
            target: '15.00 – 16.80 V',
            ok: minV >= 15.0 && minV <= 16.8,
          },
          {
            label: 'Kararlı V_DC_OUT Max',
            actual: `${maxV.toFixed(2)} V`,
            target: '15.00 – 16.80 V',
            ok: maxV >= 15.0 && maxV <= 16.8,
          },
        ],
        'Harika! 10:1 trafo ve Schottky köprüsü ile ~16 V düşük dalgalanmalı DC güç kaynağı hazır.',
        'DC çıkış gerilimi hedef aralıkta değil; T1 turnsRatio değerini 0.1 yapın.'
      );
    },
  },

  {
    id: 29,
    chapter: 6,
    chapterTitle: 'Güç Elektroniği: Doğrultma & Anahtarlama',
    title: 'Öngerilimli Diyot Gerilim Kırpıcı',
    difficulty: 'Orta-Alt',
    concept:
      'Seri bir direnç ve şönt (paralel) diyot + DC öngerilim kaynağından oluşan kırpıcı (clipper), sinyalin pozitif tepe değerini V_bias + V_f seviyesinde sınırlar; negatif yarım dalgada diyot kesimde kaldığı için sinyal bozulmadan geçer.',
    steps: [
      'Devredeki V_BIAS DC kaynağına tıklayın (başlangıçta 0.5 V).',
      'Pozitif kırpma eşiğini ~2.65 V seviyesine taşımak için V_BIAS gerilimini 2 V yapın.',
      'Transient analizde V_CLIP sinyalinin üstte düzleştiğini, altta ise -5 V değerine indiğini gözlemleyin.',
    ],
    goalText:
      'V_BIAS değerini ayarlayarak V_CLIP pozitif tepe değerini 2.45–2.85 V aralığında sınırlayın (negatif tepe < -4.8 V).',
    hint: 'Silisyum diyot iletim eşiği V_f ≈ 0.55–0.70 V civarındadır. 2.65 V kırpma seviyesi için V_BIAS = 2.0 V seçilmelidir.',
    realWorldNote:
      'Öngerilimli diyot kırpıcılar, mikrodenetleyici ADC girişlerini aşırı gerilim piklerinden korumak için sıkça kullanılır.',
    starterSchematic: cloneSchematic(CLIPPER_BASE, {
      id: 'l29-clipper-starter',
      name: 'Diyot Kırpıcı (Başlangıç)',
      description: '0.5 V öngerilimli diyot kırpıcı.',
      compParams: { V_BIAS: { voltage: 0.5 } },
    }),
    solutionSchematic: cloneSchematic(CLIPPER_BASE, {
      id: 'l29-clipper-solution',
      name: 'Diyot Kırpıcı (Çözüm)',
      description: '2 V öngerilimli ~2.65 V pozitif diyot kırpıcı.',
      compParams: { V_BIAS: { voltage: 2.0 } },
    }),
    verificationAnalysis: {
      type: 'transient',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 30, inputSourceName: 'V1' },
      dcSweep: { sourceName: 'V1', startValue: -5, stopValue: 5, stepValue: 0.1 },
    },
    verify: (_dcOp, simResult) => {
      if (simResult.type !== 'transient') {
        return buildResult(
          [{ label: 'Analiz', actual: simResult.type, target: 'transient', ok: false }],
          '',
          'Transient analiz çalıştırın.'
        );
      }
      const vClip = simResult.probeVoltages['V_CLIP'] ?? [];
      const maxV = vClip.length ? Math.max(...vClip) : 0;
      const minV = vClip.length ? Math.min(...vClip) : 0;
      return buildResult(
        [
          {
            label: 'Pozitif Kırpma (Max)',
            actual: `${maxV.toFixed(2)} V`,
            target: '2.45 – 2.85 V',
            ok: maxV >= 2.45 && maxV <= 2.85,
          },
          {
            label: 'Negatif Geçiş (Min)',
            actual: `${minV.toFixed(2)} V`,
            target: '< -4.80 V',
            ok: minV < -4.8,
          },
        ],
        'Doğru! Pozitif tepe V_bias + V_f seviyesinde güvenle kırpıldı, negatif yarım dalga korundu.',
        'Kırpma seviyesi hedeften farklı; V_BIAS gerilimini 2.0 V olarak ayarlayın.'
      );
    },
  },

  {
    id: 30,
    chapter: 6,
    chapterTitle: 'Güç Elektroniği: Doğrultma & Anahtarlama',
    title: 'Voltaj Kontrollü Röle / Anahtar ile 12V Lamba Kontrolü',
    difficulty: 'Orta-Alt',
    concept:
      'Voltaj kontrollü anahtar (vswitch / röle modeli), kontrol uçlarındaki gerilim vThreshold değerini aştığında güç devresini düşük dirençle (rOn = 0.1 Ω) kapatır. Böylece 5 V lojik sinyaliyle 12 V güçlü bir yük (lamba) izole biçimde anahtarlanabilir.',
    steps: [
      'Kontrol kaynağı V_CTRL bileşenine tıklayın (başlangıçta 0 V, anahtar açık).',
      'S1 eşik gerilimi 2.5 V olduğundan, röleyi çekmek için V_CTRL değerini 5 V yapın.',
      'DC Çalışma Noktasında LP1 lamba akımının ~0.12 A ve gücünün > 1.2 W olduğunu doğrulayın.',
    ],
    goalText:
      'V_CTRL kaynağını açarak LP1 lambasından 0.10–0.13 A akım geçmesini ve P(LP1) > 1.2 W güç üretmesini sağlayın.',
    hint: 'S1 anahtarının eşik gerilimi vThreshold = 2.5 V’tur. V_CTRL = 5 V yapıldığında anahtar kapanır ve 12 V / 100 Ω ≈ 0.12 A akar.',
    realWorldNote:
      'Otomotiv ve endüstriyel otomasyonda röleler ve solid-state switch modülleri düşük voltajlı MCU çıkışlarıyla yüksek güçlü lambaları sürer.',
    starterSchematic: cloneSchematic(VSWITCH_LAMP_BASE, {
      id: 'l30-vswitch-starter',
      name: 'Voltaj Kontrollü Anahtar (Başlangıç)',
      description: 'V_CTRL = 0 V iken açık devre röle ve sönük lamba.',
      compParams: { V_CTRL: { voltage: 0 } },
    }),
    solutionSchematic: cloneSchematic(VSWITCH_LAMP_BASE, {
      id: 'l30-vswitch-solution',
      name: 'Voltaj Kontrollü Anahtar (Çözüm)',
      description: 'V_CTRL = 5 V ile 12V lambayı süren kapalı röle.',
      compParams: { V_CTRL: { voltage: 5 } },
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 5e-3, timeStep: 20e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_CTRL' },
      dcSweep: { sourceName: 'V_CTRL', startValue: 0, stopValue: 5, stepValue: 0.1 },
    },
    verify: (dcOp) => {
      const iLamp = Math.abs(dcOp.branchCurrents['LP1'] ?? 0);
      const pLamp = dcOp.componentPower['LP1'] ?? 0;
      return buildResult(
        [
          {
            label: 'I(LP1)',
            actual: `${(iLamp * 1000).toFixed(1)} mA`,
            target: '100 – 130 mA',
            ok: iLamp >= 0.1 && iLamp <= 0.13,
          },
          {
            label: 'P(LP1)',
            actual: `${pLamp.toFixed(2)} W`,
            target: '> 1.20 W',
            ok: pLamp > 1.2,
          },
        ],
        'Süper! S1 kapandı ve 12V lamba tam güçle (~1.44 W) yandı.',
        'Lamba henüz yanmıyor; S1 eşiği 2.5 V olduğundan V_CTRL gerilimini 5 V yapın.'
      );
    },
  },

  // =========================================================================
  // BÖLÜM 7: BJT Transistörler — NPN & PNP (L31 - L35)
  // =========================================================================
  {
    id: 31,
    chapter: 7,
    chapterTitle: 'BJT Transistörler: NPN & PNP',
    title: 'NPN Transistör Dijital LED Anahtarı',
    difficulty: 'Orta-Alt',
    concept:
      'NPN bipolar transistör, baz-emiter eklemine ~0.7 V üzerinde küçük bir baz akımı (I_B) verildiğinde kollektörden emitere büyük bir akım (I_C) geçirir. Böylece 5 V lojik sinyali ile 12 V beslemeli bir LED güvenle sürülebilir.',
    steps: [
      'Kontrol girişi V_IN kaynağına tıklayın (başlangıçta 0 V, Q1 kesimde).',
      'Q1 transistörünü iletime sokmak için V_IN gerilimini 5 V yapın.',
      'LED1 üzerinden geçen akımın 15–25 mA aralığına geldiğini doğrulayın.',
    ],
    goalText:
      'V_IN gerilimini 5 V yaparak Q1 anahtarını açın ve LED1 akımını 15–25 mA aralığına getirin.',
    hint: 'V_IN = 5 V olduğunda R_B = 10 kΩ üzerinden ~0.43 mA baz akımı akar, Q1 doyuma girer ve I_LED ≈ (12 - 1.9) / 470 ≈ 21 mA olur.',
    realWorldNote:
      'Arduino veya STM32 GPIO pinleri en fazla ~20 mA verebilir; röle, motor veya yüksek güçlü LED sürmek için araya mutlaka bir NPN anahtar katı konur.',
    starterSchematic: cloneSchematic(NPN_LED_BASE, {
      id: 'l31-npn-led-starter',
      name: 'NPN LED Anahtarı (Başlangıç)',
      description: 'V_IN = 0 V iken kesimde olan NPN LED sürücü.',
      compParams: { V_IN: { voltage: 0 } },
    }),
    solutionSchematic: cloneSchematic(NPN_LED_BASE, {
      id: 'l31-npn-led-solution',
      name: 'NPN LED Anahtarı (Çözüm)',
      description: 'V_IN = 5 V ile 21 mA LED süren NPN anahtar.',
      compParams: { V_IN: { voltage: 5 } },
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
      dcSweep: { sourceName: 'V_IN', startValue: 0, stopValue: 5, stepValue: 0.1 },
    },
    verify: (dcOp) => {
      const iLed = dcOp.branchCurrents['LED1'] ?? 0;
      const iMa = iLed * 1000;
      return buildResult(
        [
          {
            label: 'I(LED1)',
            actual: `${iMa.toFixed(2)} mA`,
            target: '15.0 – 25.0 mA',
            ok: iLed >= 0.015 && iLed <= 0.025,
          },
        ],
        `Harika! Q1 doyuma geçti ve LED1 üzerinden ${iMa.toFixed(1)} mA akım akıyor.`,
        'LED akımı çok düşük; Q1 transistörünü sürmek için V_IN kaynağını 5 V yapın.'
      );
    },
  },

  {
    id: 32,
    chapter: 7,
    chapterTitle: 'BJT Transistörler: NPN & PNP',
    title: 'NPN Baz Direnci Hesabı (Doyum Bölgesi)',
    difficulty: 'Orta-Alt',
    concept:
      'Bir BJT’nin dijital anahtar gibi tam iletime (doyum / saturation, V_CE < 0.3 V) geçmesi için I_B > I_C(sat) / β şartı sağlanmalıdır. Baz direnci R_B çok büyük seçilirse I_B yetersiz kalır, transistör aktif bölgede takılır ve V_COL yüksek kalır.',
    steps: [
      'Devredeki R_B baz direncine tıklayın (başlangıçta 1 MΩ — I_B yalnızca ~4.3 µA).',
      'R_C = 1 kΩ yük akımı I_C(sat) ≈ 12 mA olduğundan yeterli baz akımı sağlamak için R_B değerini 10k (10 kΩ) yapın.',
      'Kollektör gerilimi V_COL değerinin 0.35 V altına düştüğünü doğrulayın.',
    ],
    goalText:
      'R_B baz direncini düşürerek Q1 transistörünü doyuma sokun ve V_COL < 0.35 V elde edin.',
    hint: 'β = 150 ve I_C(sat) = 12 mA için en az 80 µA baz akımı gerekir; güvenli doyum (overdrive) için R_B = 10 kΩ seçilir (I_B ≈ 0.43 mA).',
    realWorldNote:
      'Doyumda çalışmayan anahtarlama transistörünün üzerinde yüksek V_CE düşer (P = V_CE·I_C), bu da transistörün aşırı ısınmasına yol açar.',
    starterSchematic: cloneSchematic(NPN_SAT_BASE, {
      id: 'l32-npn-sat-starter',
      name: 'NPN Doyum Hesabı (Başlangıç)',
      description: '1 MΩ baz direnci ile aktif bölgede takılı kalan NPN.',
      compParams: { R_B: { resistance: 1e6 } },
    }),
    solutionSchematic: cloneSchematic(NPN_SAT_BASE, {
      id: 'l32-npn-sat-solution',
      name: 'NPN Doyum Hesabı (Çözüm)',
      description: '10 kΩ baz direnci ile tam doyuma geçen NPN anahtar.',
      compParams: { R_B: { resistance: 10000 } },
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
      dcSweep: { sourceName: 'V_IN', startValue: 0, stopValue: 5, stepValue: 0.1 },
    },
    verify: (dcOp) => {
      const vCol = dcOp.probeVoltages['V_COL'] ?? 12;
      return buildResult(
        [
          {
            label: 'V_COL (V_CE)',
            actual: `${vCol.toFixed(3)} V`,
            target: '< 0.35 V',
            ok: vCol < 0.35,
          },
        ],
        `Mükemmel! V_COL = ${vCol.toFixed(3)} V ile Q1 tam doyum bölgesinde.`,
        'V_COL hâlâ yüksek; Q1 aktif bölgede kalmış. R_B direncini 10 kΩ yapın.'
      );
    },
  },

  {
    id: 33,
    chapter: 7,
    chapterTitle: 'BJT Transistörler: NPN & PNP',
    title: 'Emiter Takipçi (Voltaj Tamponu)',
    difficulty: 'Orta-Alt',
    concept:
      'Ortak kollektörlü (emiter takipçi) devrede çıkış emitörden alınır. Emiter gerilimi baz gerilimini bir diyot düşümü (~0.7 V) geriden takip eder: V_E ≈ V_B - 0.7 V. Giriş empedansı çok yüksek, çıkış empedansı çok düşüktür.',
    steps: [
      'V_IN baz kontrol kaynağına tıklayın (başlangıçta 1 V).',
      'Emiter çıkışında ~4.3 V görmek için V_IN gerilimini 5 V yapın.',
      'V_EMIT düğüm geriliminin 4.1–4.5 V aralığında olduğunu doğrulayın.',
    ],
    goalText:
      'V_IN değerini ayarlayarak emiter takipçi çıkış gerilimi V_EMIT değerini 4.1–4.5 V aralığına getirin.',
    hint: 'V_EMIT ≈ V_IN - V_BE olduğundan ~4.3 V çıkış için V_IN = 5 V olmalıdır.',
    realWorldNote:
      'Emiter takipçi katları güç amplifikatörlerinin çıkışında ve zayıf sensör sinyallerini düşük empedanslı yüklere sürmekte kullanılır.',
    starterSchematic: cloneSchematic(EMITTER_FOLLOWER_BASE, {
      id: 'l33-ef-starter',
      name: 'Emiter Takipçi (Başlangıç)',
      description: 'V_IN = 1 V iken emiter takipçi.',
      compParams: { V_IN: { voltage: 1 } },
    }),
    solutionSchematic: cloneSchematic(EMITTER_FOLLOWER_BASE, {
      id: 'l33-ef-solution',
      name: 'Emiter Takipçi (Çözüm)',
      description: 'V_IN = 5 V iken V_EMIT ≈ 4.3 V emiter takipçi.',
      compParams: { V_IN: { voltage: 5 } },
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
      dcSweep: { sourceName: 'V_IN', startValue: 0, stopValue: 10, stepValue: 0.2 },
    },
    verify: (dcOp) => {
      const vEmit = dcOp.probeVoltages['V_EMIT'] ?? 0;
      return buildResult(
        [
          {
            label: 'V_EMIT',
            actual: `${vEmit.toFixed(3)} V`,
            target: '4.10 – 4.50 V',
            ok: vEmit >= 4.1 && vEmit <= 4.5,
          },
        ],
        `Doğru! Emiter çıkışı girişi V_BE düşümüyle izleyerek ${vEmit.toFixed(2)} V üretti.`,
        'V_EMIT hedef aralıkta değil; V_IN kaynağını 5 V yapın.'
      );
    },
  },

  {
    id: 34,
    chapter: 7,
    chapterTitle: 'BJT Transistörler: NPN & PNP',
    title: 'Ortak Emiterli BJT DC Çalışma Noktası',
    difficulty: 'Orta-Alt',
    concept:
      'Bir BJT yükseltecin sinyal kırpmadan çalışması için Q-noktasının ileri aktif bölgede (V_C > V_B > V_E > 0.5 V) ve kollektör geriliminin beslemenin yaklaşık ortasında (~5–6 V) kurulması gerekir. Gerilim bölücü dirençler R1 ve R2 baz voltajını belirler.',
    steps: [
      'Gerilim bölücü alt direnci R2’ye tıklayın (başlangıçta 1 kΩ — baz voltajı sadece 0.25 V olduğu için Q1 kesimde!).',
      'Baz gerilimini ~2.1 V seviyesine çıkarmak için R2 değerini 10k (10 kΩ) yapın.',
      'DC Çalışma Noktasında V_COL değerinin 4.5–7.5 V aralığında ve V_COL > V_BASE > V_EMIT > 0.5 V olduğunu kontrol edin.',
    ],
    goalText:
      'R2 değerini ayarlayarak Q1’i ileri aktif bölgeye (V_COL ∈ 4.5–7.5 V ve V_COL > V_BASE > V_EMIT > 0.5 V) taşıyın.',
    hint: 'R1 = 47 kΩ ve R2 = 10 kΩ olduğunda V_B ≈ 12·10/(47+10) ≈ 2.1 V, V_E ≈ 1.4 V, I_C ≈ 2.8 mA ve V_C ≈ 5.8 V olur.',
    realWorldNote:
      'Gerilim bölücülü kutuplama (voltage-divider bias) + emiter direnci R_E, transistör β değişimlerine ve sıcaklık kaymasına karşı kararlı Q-noktası sağlar.',
    starterSchematic: cloneSchematic(BJT_CE_BASE, {
      id: 'l34-bjt-q-starter',
      name: 'Ortak Emiterli DC Q-Noktası (Başlangıç)',
      description: 'Yanlış R2 (1 kΩ) nedeniyle kesimde kalan BJT yükselteç.',
      compParams: { R2: { resistance: 1000 } },
      probes: [
        { id: 'l34-p1', label: 'V_BASE', x: 15, y: 8, color: '#22d3ee' },
        { id: 'l34-p2', label: 'V_COL', x: 18, y: 6, color: '#fbbf24' },
        { id: 'l34-p3', label: 'V_EMIT', x: 18, y: 10, color: '#34d399' },
      ],
    }),
    solutionSchematic: cloneSchematic(BJT_CE_BASE, {
      id: 'l34-bjt-q-solution',
      name: 'Ortak Emiterli DC Q-Noktası (Çözüm)',
      description: 'İleri aktif bölgede kutuplanmış ortak emiterli BJT.',
      compParams: { R2: { resistance: 10000 } },
      probes: [
        { id: 'l34-p1', label: 'V_BASE', x: 15, y: 8, color: '#22d3ee' },
        { id: 'l34-p2', label: 'V_COL', x: 18, y: 6, color: '#fbbf24' },
        { id: 'l34-p3', label: 'V_EMIT', x: 18, y: 10, color: '#34d399' },
      ],
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 1000000, pointsPerDecade: 30, inputSourceName: 'V_IN' },
      dcSweep: { sourceName: 'VCC', startValue: 0, stopValue: 15, stepValue: 0.5 },
    },
    verify: (dcOp) => {
      const vBase = dcOp.probeVoltages['V_BASE'] ?? 0;
      const vCol = dcOp.probeVoltages['V_COL'] ?? 0;
      const vEmit = dcOp.probeVoltages['V_EMIT'] ?? 0;
      const qRangeOk = vCol >= 4.5 && vCol <= 7.5;
      const activeOrderOk = vCol > vBase && vBase > vEmit && vEmit > 0.5;
      return buildResult(
        [
          {
            label: 'V_COL (Q-noktası)',
            actual: `${vCol.toFixed(2)} V`,
            target: '4.50 – 7.50 V',
            ok: qRangeOk,
          },
          {
            label: 'Aktif Bölge Sırası',
            actual: `C=${vCol.toFixed(2)} > B=${vBase.toFixed(2)} > E=${vEmit.toFixed(2)}`,
            target: 'V_C > V_B > V_E > 0.5 V',
            ok: activeOrderOk,
          },
        ],
        'Harika! Q1 ileri aktif bölgede ve beslemenin tam ortasında kararlı bir Q-noktasına oturdu.',
        'Q1 kesimde veya yanlış çalışma noktasında; R2 direncini 10 kΩ yapın.'
      );
    },
  },

  {
    id: 35,
    chapter: 7,
    chapterTitle: 'BJT Transistörler: NPN & PNP',
    title: 'PNP Yüksek Taraf (High-Side) Anahtar',
    difficulty: 'Orta-Alt',
    concept:
      'PNP transistörde emiter pozitif beslemeye (12 V) bağlanır. Baz gerilimi emiterle aynı (12 V) iken V_EB = 0 V olur ve transistör kapalıdır. Baz aşağı çekildiğinde (0 V) emiter-baz akımı akar ve yük pozitif hatta bağlanır.',
    steps: [
      'V_CTRL kontrol kaynağına tıklayın (başlangıçta 12 V, PNP kapalı).',
      'PNP transistörü iletime geçirip 1 kΩ yüke güç vermek için V_CTRL değerini 0 V yapın.',
      'V_LOAD çıkış geriliminin 11.0 V üzerine çıktığını doğrulayın.',
    ],
    goalText:
      'V_CTRL kontrol gerilimini düşürerek yüksek taraf PNP anahtarını açın ve V_LOAD > 11.0 V elde edin.',
    hint: 'PNP transistör aktif-düşüktür (active-low): V_CTRL = 0 V yapıldığında R_B üzerinden ~1.13 mA baz akımı akar ve Q1 doyuma geçer.',
    realWorldNote:
      'Yükün bir ucunun mutlaka şaseye (GND) bağlı olması gereken araç şasisi veya ortak-katot sistemlerde yüksek taraf PNP anahtarlar tercih edilir.',
    starterSchematic: cloneSchematic(PNP_HIGHSIDE_BASE, {
      id: 'l35-pnp-starter',
      name: 'PNP Yüksek Taraf Anahtar (Başlangıç)',
      description: 'V_CTRL = 12 V iken kapalı PNP anahtar.',
      compParams: { V_CTRL: { voltage: 12 } },
    }),
    solutionSchematic: cloneSchematic(PNP_HIGHSIDE_BASE, {
      id: 'l35-pnp-solution',
      name: 'PNP Yüksek Taraf Anahtar (Çözüm)',
      description: 'V_CTRL = 0 V ile yüke 12 V veren açık PNP anahtar.',
      compParams: { V_CTRL: { voltage: 0 } },
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_CTRL' },
      dcSweep: { sourceName: 'V_CTRL', startValue: 0, stopValue: 12, stepValue: 0.2 },
    },
    verify: (dcOp) => {
      const vLoad = dcOp.probeVoltages['V_LOAD'] ?? 0;
      return buildResult(
        [
          {
            label: 'V_LOAD',
            actual: `${vLoad.toFixed(2)} V`,
            target: '> 11.00 V',
            ok: vLoad > 11.0,
          },
        ],
        `Harika! PNP yüksek taraf anahtarı iletime geçti ve yüke ${vLoad.toFixed(2)} V aktardı.`,
        'PNP hâlâ kesimde; V_CTRL değerini 0 V yaparak emiter-baz eklemini ileri kutuplayın.'
      );
    },
  },

  // =========================================================================
  // BÖLÜM 8: MOSFET & Dijital CMOS Elektroniği (L36 - L40)
  // =========================================================================
  {
    id: 36,
    chapter: 8,
    chapterTitle: 'MOSFET & Dijital CMOS Elektroniği',
    title: 'NMOS Eşik Gerilimi (Vth = 1.5V) Keşfi',
    difficulty: 'Orta',
    concept:
      'MOSFET’ler akımla değil kapı-kaynak gerilimiyle (V_GS) kontrol edilir ve neredeyse sıfır kapı akımı çeker. V_GS < V_th (1.5 V) iken kanal oluşmaz (kesim); V_GS > V_th olduğunda kanal açılır ve V_DRAIN sıfıra yaklaşır.',
    steps: [
      'Kapı kaynağı V_GS bileşenine tıklayın (başlangıçta 1 V < V_th = 1.5 V).',
      'M1 kanalını güçlü biçimde açmak için V_GS değerini 4 V yapın.',
      'V_DRAIN geriliminin 10 V değerinden 1.0 V altına düştüğünü doğrulayın.',
    ],
    goalText:
      'V_GS gerilimini V_th eşiğinin üzerine çıkararak M1 NMOS’u iletime geçirin ve V_DRAIN < 1.0 V yapın.',
    hint: 'V_th = 1.5 V olduğu için 1 V yetmez; V_GS = 4 V yapıldığında güçlü inversiyon oluşur ve R_D üzerinden akım akar.',
    realWorldNote:
      '3.3 V mikrodenetleyicilerle MOSFET sürerken V_th değeri düşük "Logic-Level" MOSFET seçilmelidir; aksi halde yarı açık kalıp ısınır.',
    starterSchematic: cloneSchematic(NMOS_VTH_BASE, {
      id: 'l36-nmos-vth-starter',
      name: 'NMOS Vth Keşfi (Başlangıç)',
      description: 'V_GS = 1 V iken kesimde olan NMOS.',
      compParams: { V_GS: { voltage: 1 } },
    }),
    solutionSchematic: cloneSchematic(NMOS_VTH_BASE, {
      id: 'l36-nmos-vth-solution',
      name: 'NMOS Vth Keşfi (Çözüm)',
      description: 'V_GS = 4 V ile iletime geçen NMOS.',
      compParams: { V_GS: { voltage: 4 } },
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_GS' },
      dcSweep: { sourceName: 'V_GS', startValue: 0, stopValue: 5, stepValue: 0.1 },
    },
    verify: (dcOp) => {
      const vDrain = dcOp.probeVoltages['V_DRAIN'] ?? 10;
      return buildResult(
        [
          {
            label: 'V_DRAIN',
            actual: `${vDrain.toFixed(3)} V`,
            target: '< 1.00 V',
            ok: vDrain < 1.0,
          },
        ],
        `Süper! V_GS > V_th sağlandı ve M1 drenajı ${vDrain.toFixed(3)} V seviyesine çekti.`,
        'M1 henüz iletime geçmedi; V_GS gerilimini 4 V yapın.'
      );
    },
  },

  {
    id: 37,
    chapter: 8,
    chapterTitle: 'MOSFET & Dijital CMOS Elektroniği',
    title: 'NMOS Güç Anahtarı ile 12V Lamba Sürme',
    difficulty: 'Orta',
    concept:
      'Yüksek transkondüktanslı (kp = 0.05 A/V²) bir NMOS güç MOSFET, düşük iletim direnciyle (R_DS(on)) yüksek akımlı yükleri kayıpsız biçimde anahtarlar. BJT’nin aksine sürekli baz akımı gerektirmez.',
    steps: [
      'Kapı kaynağı V_G bileşenine tıklayın (başlangıçta 0 V).',
      'M1’i tam iletime geçirmek için V_G gerilimini 5 V yapın.',
      'DC Çalışma Noktasında LP1 lamba gücünün 1.0 W üzerine çıktığını doğrulayın.',
    ],
    goalText:
      'V_G gerilimini 5 V yaparak LP1 lambasını tam yakacak güce (P(LP1) > 1.0 W) ulaştırın.',
    hint: 'V_G = 5 V yapıldığında V_GS - V_th = 3.5 V olur ve LP1 üzerinden ~113 mA akarak ~1.28 W güç üretir.',
    realWorldNote:
      'Güç MOSFET’leri (IRLZ44N vb.) birkaç miliohm R_DS(on) değerine sahiptir; bu sayede soğutucusuz amper seviyesinde DC yükleri sürebilir.',
    starterSchematic: cloneSchematic(NMOS_LAMP_BASE, {
      id: 'l37-nmos-lamp-starter',
      name: 'NMOS Lamba Sürücü (Başlangıç)',
      description: 'V_G = 0 V iken sönük 12V lamba.',
      compParams: { V_G: { voltage: 0 } },
    }),
    solutionSchematic: cloneSchematic(NMOS_LAMP_BASE, {
      id: 'l37-nmos-lamp-solution',
      name: 'NMOS Lamba Sürücü (Çözüm)',
      description: 'V_G = 5 V ile 12V lamba süren NMOS güç anahtarı.',
      compParams: { V_G: { voltage: 5 } },
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_G' },
      dcSweep: { sourceName: 'V_G', startValue: 0, stopValue: 5, stepValue: 0.1 },
    },
    verify: (dcOp) => {
      const pLamp = dcOp.componentPower['LP1'] ?? 0;
      return buildResult(
        [
          {
            label: 'P(LP1)',
            actual: `${pLamp.toFixed(2)} W`,
            target: '> 1.00 W',
            ok: pLamp > 1.0,
          },
        ],
        `Harika! M1 tam iletime geçti ve LP1 lambası ${pLamp.toFixed(2)} W güçle parlıyor.`,
        'Lamba gücü düşük; V_G kapı gerilimini 5 V yapın.'
      );
    },
  },

  {
    id: 38,
    chapter: 8,
    chapterTitle: 'MOSFET & Dijital CMOS Elektroniği',
    title: 'NMOS PWM LED Sürücü',
    difficulty: 'Orta',
    concept:
      'Darbe Genişlik Modülasyonu (PWM), bir MOSFET’i saniyede binlerce kez (1 kHz) hızla açıp kapatarak LED parlaklığını kayıpsız biçimde ayarlar. Ancak darbe tepe gerilimi (vHigh) MOSFET eşik gerilimini (1.5 V) mutlaka aşmalıdır.',
    steps: [
      'V_PWM darbe kaynağına tıklayın (başlangıçta vHigh = 1 V < V_th).',
      'M1’i her darbede doyuma sokmak için vHigh değerini 5 V yapın.',
      'Transient analizde V_DRAIN geriliminin 12 V ile < 1 V arasında kare dalga anahtarlandığını gözlemleyin.',
    ],
    goalText:
      'V_PWM tepe gerilimini (vHigh) 5 V yaparak V_DRAIN sinyalinin < 1.0 V ile > 9.5 V arasında anahtarlanmasını sağlayın.',
    hint: 'vHigh = 1 V iken V_GS eşiği geçemez ve drenaj sürekli ~12 V’ta kalır. vHigh = 5 V yapın.',
    realWorldNote:
      'Kapı direnci R_G (100 Ω), MOSFET kapı kapasitansının hızlı anahtarlama sırasında çınlama (ringing) yapmasını sönümler.',
    starterSchematic: cloneSchematic(NMOS_PWM_BASE, {
      id: 'l38-pwm-starter',
      name: 'NMOS PWM LED Sürücü (Başlangıç)',
      description: 'vHigh = 1 V nedeniyle anahtarlama yapamayan PWM sürücü.',
      compParams: { V_PWM: { vHigh: 1 } },
    }),
    solutionSchematic: cloneSchematic(NMOS_PWM_BASE, {
      id: 'l38-pwm-solution',
      name: 'NMOS PWM LED Sürücü (Çözüm)',
      description: '1 kHz 5 V PWM ile LED süren NMOS devresi.',
      compParams: { V_PWM: { vHigh: 5 } },
    }),
    verificationAnalysis: {
      type: 'transient',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_PWM' },
      dcSweep: { sourceName: 'V_PWM', startValue: 0, stopValue: 5, stepValue: 0.1 },
    },
    verify: (_dcOp, simResult) => {
      if (simResult.type !== 'transient') {
        return buildResult(
          [{ label: 'Analiz', actual: simResult.type, target: 'transient', ok: false }],
          '',
          'Transient analiz çalıştırın.'
        );
      }
      const vDrain = simResult.probeVoltages['V_DRAIN'] ?? [];
      const minV = vDrain.length ? Math.min(...vDrain) : 12;
      const maxV = vDrain.length ? Math.max(...vDrain) : 0;
      return buildResult(
        [
          {
            label: 'V_DRAIN Min (ON)',
            actual: `${minV.toFixed(2)} V`,
            target: '< 1.00 V',
            ok: minV < 1.0,
          },
          {
            label: 'V_DRAIN Max (OFF)',
            actual: `${maxV.toFixed(2)} V`,
            target: '> 9.50 V',
            ok: maxV > 9.5,
          },
        ],
        'Harika! 1 kHz PWM sinyali M1’i temiz biçimde açıp kapatarak LED akımını modüle ediyor.',
        'V_DRAIN anahtarlanmıyor; V_PWM vHigh değerini 5 V yapın.'
      );
    },
  },

  {
    id: 39,
    chapter: 8,
    chapterTitle: 'MOSFET & Dijital CMOS Elektroniği',
    title: 'PMOS Yüksek Taraf Anahtarı',
    difficulty: 'Orta',
    concept:
      'P-kanallı MOSFET (PMOS), V_SG > |V_th| (1.5 V) olduğunda iletime geçer. Kaynak (source) 10 V pozitif hatta bağlıyken kapı 10 V’ta tutulursa V_SG = 0 V olur (kapalı); kapı 0 V’a çekilirse V_SG = 10 V olur ve PMOS açılır.',
    steps: [
      'Kapı kontrol kaynağı V_G bileşenine tıklayın (başlangıçta 10 V, PMOS kapalı).',
      'PMOS yüksek taraf anahtarını açmak için V_G değerini 0 V yapın.',
      'R_LOAD üzerindeki V_LOAD geriliminin > 9.0 V olduğunu doğrulayın.',
    ],
    goalText:
      'V_G gerilimini 0 V yaparak PMOS yüksek taraf anahtarını açın ve V_LOAD > 9.0 V elde edin.',
    hint: 'PMOS’u iletime sokmak için kapıyı kaynaktan en az |V_th| = 1.5 V daha negatif yapmalısınız: V_G = 0 V seçin.',
    realWorldNote:
      'PMOS transistörler USB güç anahtarlarında ve ters polarite koruma devrelerinde düşük kayıplı yüksek taraf anahtar olarak yaygın kullanılır.',
    starterSchematic: cloneSchematic(PMOS_HIGHSIDE_BASE, {
      id: 'l39-pmos-starter',
      name: 'PMOS Yüksek Taraf Anahtar (Başlangıç)',
      description: 'V_G = 10 V iken kapalı PMOS.',
      compParams: { V_G: { voltage: 10 } },
    }),
    solutionSchematic: cloneSchematic(PMOS_HIGHSIDE_BASE, {
      id: 'l39-pmos-solution',
      name: 'PMOS Yüksek Taraf Anahtar (Çözüm)',
      description: 'V_G = 0 V ile yüke güç veren PMOS.',
      compParams: { V_G: { voltage: 0 } },
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_G' },
      dcSweep: { sourceName: 'V_G', startValue: 0, stopValue: 10, stepValue: 0.2 },
    },
    verify: (dcOp) => {
      const vLoad = dcOp.probeVoltages['V_LOAD'] ?? 0;
      return buildResult(
        [
          {
            label: 'V_LOAD',
            actual: `${vLoad.toFixed(2)} V`,
            target: '> 9.00 V',
            ok: vLoad > 9.0,
          },
        ],
        `Süper! V_G = 0 V ile PMOS açıldı ve yüke ${vLoad.toFixed(2)} V aktardı.`,
        'PMOS henüz kapalı; V_G değerini 0 V yapın.'
      );
    },
  },

  {
    id: 40,
    chapter: 8,
    chapterTitle: 'MOSFET & Dijital CMOS Elektroniği',
    title: 'CMOS Mantık DEĞİL Kapısı',
    difficulty: 'Orta',
    concept:
      'Tüm modern işlemcilerin temel taşı olan CMOS evirici (NOT gate), üstte bir PMOS ve altta bir NMOS kullanır. Giriş 0 iken PMOS iletir çıkış VDD olur; giriş VDD iken NMOS iletir çıkış 0 V olur. Eşit kp ve |Vth| sayesinde geçiş eşiği tam V_DD / 2 noktasındadır.',
    steps: [
      'Besleme kaynağı VDD’ye tıklayın (başlangıçta 1 V — transistor |V_th| = 1.5 V altında olduğu için mantık kapısı çalışmaz!).',
      'Standart 5 V CMOS lojik beslemesi için VDD değerini 5 V yapın.',
      'DC Sweep (0–5 V) eğrisinde V_OUT(0V) > 4.9 V, V_OUT(5V) < 0.1 V ve geçiş eşiği V_M ≈ 2.5 V olduğunu doğrulayın.',
    ],
    goalText:
      'VDD beslemesini 5 V yaparak V_OUT(0V) > 4.9 V, V_OUT(5V) < 0.1 V ve geçiş eşiği V_M ∈ 2.35–2.65 V sağlayın.',
    hint: 'VDD = 5 V yapıldığında hem M1 (PMOS) hem M2 (NMOS) eşik gerilimlerini rahatça aşar ve simetrik V_M = 2.5 V geçişi elde edilir.',
    realWorldNote:
      'CMOS kapıları yalnızca anahtarlama anında (kapasitans şarj/deşarj olurken) akım çeker; durgun halde statik güç tüketimi neredeyse sıfırdır.',
    starterSchematic: cloneSchematic(CMOS_INV_BASE, {
      id: 'l40-cmos-starter',
      name: 'CMOS DEĞİL Kapısı (Başlangıç)',
      description: 'Yetersiz VDD = 1 V ile çalışmayan CMOS evirici.',
      compParams: { VDD: { voltage: 1 } },
    }),
    solutionSchematic: cloneSchematic(CMOS_INV_BASE, {
      id: 'l40-cmos-solution',
      name: 'CMOS DEĞİL Kapısı (Çözüm)',
      description: '5 V beslemeli tam simetrik CMOS evirici.',
      compParams: { VDD: { voltage: 5 } },
    }),
    verificationAnalysis: {
      type: 'dc_sweep',
      dcSweep: { sourceName: 'V_IN', startValue: 0, stopValue: 5, stepValue: 0.05 },
      transient: { stopTime: 3e-3, timeStep: 5e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 1000000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
    },
    verify: (_dcOp, simResult) => {
      if (simResult.type !== 'dc_sweep') {
        return buildResult(
          [{ label: 'Analiz', actual: simResult.type, target: 'dc_sweep', ok: false }],
          '',
          'DC Sweep (V_IN 0–5 V) çalıştırın.'
        );
      }
      const xVals = simResult.sweepValues;
      const vOut = simResult.probeVoltages['V_OUT'] ?? [];
      const vHighOut = vOut[0] ?? 0;
      const vLowOut = vOut[vOut.length - 1] ?? 5;

      let vm: number | null = null;
      for (let i = 1; i < xVals.length; i++) {
        if (vOut[i - 1] >= 2.5 && vOut[i] <= 2.5) {
          const span = vOut[i - 1] - vOut[i];
          const frac = span > 1e-9 ? (vOut[i - 1] - 2.5) / span : 0;
          vm = xVals[i - 1] + frac * (xVals[i] - xVals[i - 1]);
          break;
        }
      }

      return buildResult(
        [
          {
            label: 'V_OUT (V_IN=0V)',
            actual: `${vHighOut.toFixed(3)} V`,
            target: '> 4.90 V',
            ok: vHighOut > 4.9,
          },
          {
            label: 'V_OUT (V_IN=5V)',
            actual: `${vLowOut.toFixed(3)} V`,
            target: '< 0.10 V',
            ok: vLowOut < 0.1,
          },
          {
            label: 'Geçiş Eşiği V_M',
            actual: vm !== null ? `${vm.toFixed(2)} V` : 'Yok',
            target: '2.35 – 2.65 V',
            ok: vm !== null && vm >= 2.35 && vm <= 2.65,
          },
        ],
        'Mükemmel! CMOS evirici tam 0–5 V salınım ve VDD/2 = 2.5 V geçiş eşiğiyle çalışıyor.',
        'CMOS geçiş eğrisi hatalı; VDD değerini 5 V olarak ayarlayın.'
      );
    },
  },

  // =========================================================================
  // BÖLÜM 9: Op-Amp Analog Devre Tasarımı (L41 - L45)
  // =========================================================================
  {
    id: 41,
    chapter: 9,
    chapterTitle: 'Op-Amp Analog Devre Tasarımı',
    title: 'Op-Amp Gerilim İzleyici (Unity-Gain Buffer)',
    difficulty: 'Orta',
    concept:
      'Çıkışı doğrudan eviren (-) girişe bağlanan Op-Amp, %100 negatif geri besleme ile birim kazançlı tampon (A_v = 1) oluşturur. Girişten neredeyse hiç akım çekmeden 1 kΩ gibi düşük empedanslı yükleri aynı gerilimle sürer.',
    steps: [
      'Giriş gerilim kaynağı V_IN bileşenine tıklayın (başlangıçta 1 V).',
      'Standart 3.3 V referansı tamponlamak için V_IN gerilimini 3.3 V yapın.',
      '1 kΩ yük üzerindeki V_OUT geriliminin 3.25–3.35 V aralığında olduğunu doğrulayın.',
    ],
    goalText:
      'V_IN kaynağını 3.3 V yapın ve gerilim izleyici çıkışının 3.25–3.35 V arasında olduğunu doğrulayın.',
    hint: 'Negatif geri besleme V- = V+ eşitliğini zorlar; V_OUT doğrudan V- ucuna bağlı olduğu için V_OUT ≈ V_IN = 3.3 V olur.',
    realWorldNote:
      'Gerilim izleyiciler yüksek empedanslı sensör veya gerilim bölücü çıkışlarını, yük bağlandığında çökmeden ADC’ye aktarmak için kullanılır.',
    starterSchematic: cloneSchematic(OPAMP_BUFFER_BASE, {
      id: 'l41-buffer-starter',
      name: 'Op-Amp Gerilim İzleyici (Başlangıç)',
      description: 'V_IN = 1 V iken gerilim izleyici.',
      compParams: { V_IN: { voltage: 1 } },
    }),
    solutionSchematic: cloneSchematic(OPAMP_BUFFER_BASE, {
      id: 'l41-buffer-solution',
      name: 'Op-Amp Gerilim İzleyici (Çözüm)',
      description: 'V_IN = 3.3 V iken 1 kΩ yük süren gerilim izleyici.',
      compParams: { V_IN: { voltage: 3.3 } },
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
      dcSweep: { sourceName: 'V_IN', startValue: -10, stopValue: 10, stepValue: 0.5 },
    },
    verify: (dcOp) => {
      const vOut = dcOp.probeVoltages['V_OUT'] ?? 0;
      return buildResult(
        [
          {
            label: 'V_OUT',
            actual: `${vOut.toFixed(3)} V`,
            target: '3.25 – 3.35 V',
            ok: vOut >= 3.25 && vOut <= 3.35,
          },
        ],
        `Harika! Op-Amp tamponu 1 kΩ yük altında bile tam ${vOut.toFixed(3)} V verdi.`,
        'V_OUT hedef aralıkta değil; V_IN değerini 3.3 V yapın.'
      );
    },
  },

  {
    id: 42,
    chapter: 9,
    chapterTitle: 'Op-Amp Analog Devre Tasarımı',
    title: 'Eviren (Inverting) Op-Amp Yükselteç',
    difficulty: 'Orta',
    concept:
      'Eviren op-amp yükselteçte (+) giriş şaseye bağlıdır ve negatif geri besleme (-) girişi 0 V sanal toprak (virtual ground) seviyesinde tutar. Kapalı çevrim gerilim kazancı yalnızca iki direncin oranıyla belirlenir: A_v = -R_FB / R_IN.',
    steps: [
      'Geri besleme direnci R_FB üzerine tıklayın (başlangıçta 10 kΩ -> 0 dB kazanç).',
      '4.7× (13.44 dB) kazanç elde etmek için R_FB değerini 47k (47 kΩ) yapın.',
      'AC analizde 1 kHz frekansındaki V_OUT kazancının 13.0–13.9 dB aralığında olduğunu doğrulayın.',
    ],
    goalText:
      'R_FB direncini ayarlayarak 1 kHz’de AC kazancı 13.0–13.9 dB aralığına getirin.',
    hint: 'R_IN = 10 kΩ iken A_v = -47k / 10k = -4.7 V/V olur; desibel cinsinden 20·log10(4.7) ≈ 13.44 dB elde edilir.',
    realWorldNote:
      'Eviren topoloji en lineer op-amp yükselteç yapılarından biridir çünkü ortak mod gerilimi her zaman 0 V sanal toprakta sabit kalır.',
    starterSchematic: cloneSchematic(INV_OPAMP_BASE, {
      id: 'l42-inv-starter',
      name: 'Eviren Op-Amp (Başlangıç)',
      description: 'R_FB = 10 kΩ ile 0 dB kazançlı eviren op-amp.',
      compParams: { R_FB: { resistance: 10000 } },
    }),
    solutionSchematic: cloneSchematic(INV_OPAMP_BASE, {
      id: 'l42-inv-solution',
      name: 'Eviren Op-Amp (Çözüm)',
      description: 'R_FB = 47 kΩ ile 13.44 dB kazançlı eviren op-amp.',
      compParams: { R_FB: { resistance: 47000 } },
    }),
    verificationAnalysis: {
      type: 'ac',
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V1' },
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      dcSweep: { sourceName: 'V1', startValue: -4, stopValue: 4, stepValue: 0.2 },
    },
    verify: (_dcOp, simResult) => {
      if (simResult.type !== 'ac') {
        return buildResult(
          [{ label: 'Analiz', actual: simResult.type, target: 'ac', ok: false }],
          '',
          'AC (Frekans) analizi çalıştırın.'
        );
      }
      const idx = findClosestFreqIndex(simResult.frequencies, 1000);
      const gainDb = simResult.magnitudeDb['V_OUT']?.[idx] ?? -99;
      return buildResult(
        [
          {
            label: '1 kHz Kazanç',
            actual: `${gainDb.toFixed(2)} dB`,
            target: '13.00 – 13.90 dB',
            ok: gainDb >= 13.0 && gainDb <= 13.9,
          },
        ],
        `Doğru! 1 kHz kazancı ${gainDb.toFixed(2)} dB (-4.7 V/V) olarak doğrulandı.`,
        'Kazanç hedef aralıkta değil; R_FB direncini 47 kΩ yapın.'
      );
    },
  },

  {
    id: 43,
    chapter: 9,
    chapterTitle: 'Op-Amp Analog Devre Tasarımı',
    title: 'Evirmeyen (Non-Inverting) Op-Amp (Gain = 11×)',
    difficulty: 'Orta',
    concept:
      'Evirmeyen yükselteçte giriş doğrudan yüksek empedanslı (+) ucuna uygulanır; çıkış sinyalini faz değiştirmeden (0° kayma) yükseltir. Kazanç formülü A_v = 1 + R_FB / R1 şeklindedir, bu nedenle kazanç her zaman ≥ 1 olur.',
    steps: [
      'Geri besleme direnci R_FB üzerine tıklayın (başlangıçta 1 kΩ -> kazanç = 1 + 1k/1k = 2×).',
      'V_IN = 1 V girişte 11 V çıkış (A_v = 11×) elde etmek için R_FB değerini 10k (10 kΩ) yapın.',
      'DC Çalışma Noktasında V_OUT değerinin 10.8–11.2 V aralığında olduğunu doğrulayın.',
    ],
    goalText:
      'R_FB direncini ayarlayarak 1 V girişten 10.8–11.2 V çıkış (11× kazanç) elde edin.',
    hint: 'R1 = 1 kΩ iken A_v = 1 + R_FB / 1k = 11 olması için R_FB = 10 kΩ olmalıdır.',
    realWorldNote:
      'Evirmeyen op-amp hem çok yüksek giriş empedansı sunar hem de sinyal polaritesini korur.',
    starterSchematic: cloneSchematic(NONINV_OPAMP_BASE, {
      id: 'l43-noninv-starter',
      name: 'Evirmeyen Op-Amp (Başlangıç)',
      description: '2× kazançlı evirmeyen yükselteç.',
      compParams: { R_FB: { resistance: 1000 } },
    }),
    solutionSchematic: cloneSchematic(NONINV_OPAMP_BASE, {
      id: 'l43-noninv-solution',
      name: 'Evirmeyen Op-Amp (Çözüm)',
      description: '11× kazançlı evirmeyen yükselteç.',
      compParams: { R_FB: { resistance: 10000 } },
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
      dcSweep: { sourceName: 'V_IN', startValue: -2, stopValue: 2, stepValue: 0.1 },
    },
    verify: (dcOp) => {
      const vOut = dcOp.probeVoltages['V_OUT'] ?? 0;
      return buildResult(
        [
          {
            label: 'V_OUT',
            actual: `${vOut.toFixed(2)} V`,
            target: '10.80 – 11.20 V',
            ok: vOut >= 10.8 && vOut <= 11.2,
          },
        ],
        `Harika! A_v = 1 + 10k/1k = 11× kazanç ile V_OUT = ${vOut.toFixed(2)} V elde edildi.`,
        'Kazanç henüz 11× değil; R_FB direncini 10 kΩ yapın.'
      );
    },
  },

  {
    id: 44,
    chapter: 9,
    chapterTitle: 'Op-Amp Analog Devre Tasarımı',
    title: 'Op-Amp Ray Doyumu (Clipping) Sınırını Bul',
    difficulty: 'Orta',
    concept:
      'Hiçbir op-amp kendi besleme raylarının (±15 V) ötesinde çıkış üretemez. Eviren kazancı A_v = -4.7 olan bu devrede ideal çıkış |V_OUT| > 15 V gerektirirse op-amp ray doyumuna (saturation / clipping) girer.',
    steps: [
      'Giriş DC kaynağı V1 bileşenine tıklayın (başlangıçta 1 V -> çıkış -4.7 V lineer bölgede).',
      'Çıkışı pozitif +15 V besleme rayında doyuma sokmak için V1 değerini -4 V yapın.',
      'DC Çalışma Noktasında V_OUT değerinin > 14.8 V sınırına dayandığını gözlemleyin.',
    ],
    goalText:
      'V1 girişini ayarlayarak op-amp çıkışını pozitif ray doyumuna (V_OUT > 14.8 V) sokun.',
    hint: 'Kazanç -4.7 olduğundan, pozitif ray (+15 V) için negatif giriş gerekir: (-4 V) × (-4.7) = +18.8 V teorik çıkış → +15 V rayına kırpılır.',
    realWorldNote:
      'Ses veya ölçüm devrelerinde op-amp doyuma girdiğinde harmonik bozulma oluşur; tasarım sırasında maksimum giriş × kazanç < V_sat olduğundan emin olunmalıdır.',
    starterSchematic: cloneSchematic(INV_OPAMP_BASE, {
      id: 'l44-sat-starter',
      name: 'Op-Amp Ray Doyumu (Başlangıç)',
      description: 'V1 = 1 V DC ile lineer bölgede eviren op-amp.',
      compTypes: { V1: 'vdc' },
      compParams: { V1: { voltage: 1, acMag: 0 } },
      recommendedAnalysis: {
        type: 'dc_op',
        transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
        ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V1' },
        dcSweep: { sourceName: 'V1', startValue: -5, stopValue: 5, stepValue: 0.2 },
      },
    }),
    solutionSchematic: cloneSchematic(INV_OPAMP_BASE, {
      id: 'l44-sat-solution',
      name: 'Op-Amp Ray Doyumu (Çözüm)',
      description: 'V1 = -4 V DC ile +15 V pozitif ray doyumuna giren op-amp.',
      compTypes: { V1: 'vdc' },
      compParams: { V1: { voltage: -4, acMag: 0 } },
      recommendedAnalysis: {
        type: 'dc_op',
        transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
        ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V1' },
        dcSweep: { sourceName: 'V1', startValue: -5, stopValue: 5, stepValue: 0.2 },
      },
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V1' },
      dcSweep: { sourceName: 'V1', startValue: -5, stopValue: 5, stepValue: 0.2 },
    },
    verify: (dcOp) => {
      const vOut = dcOp.probeVoltages['V_OUT'] ?? 0;
      return buildResult(
        [
          {
            label: 'V_OUT (Pozitif Ray)',
            actual: `${vOut.toFixed(2)} V`,
            target: '> 14.80 V',
            ok: vOut > 14.8,
          },
        ],
        `Doğru! Çıkış +15 V besleme rayında (${vOut.toFixed(2)} V) doyuma ulaştı.`,
        'Op-amp henüz pozitif ray doyumunda değil; V1 değerini -4 V yapın.'
      );
    },
  },

  {
    id: 45,
    chapter: 9,
    chapterTitle: 'Op-Amp Analog Devre Tasarımı',
    title: 'Hassas 20 dB (10×) Eviren Ses Yükselteci',
    difficulty: 'Orta',
    concept:
      'Ses mühendisliğinde gerilim kazancı genellikle desibel (dB) cinsinden ifade edilir: Gain(dB) = 20·log10(|A_v|). Tam 20 dB kazanç, 10 kat gerilim yükseltmesine karşılık gelir.',
    steps: [
      'Geri besleme direnci R_FB üzerine tıklayın (başlangıçta 10 kΩ -> 0 dB).',
      'R_IN = 10 kΩ iken 10× (20 dB) kazanç elde etmek için R_FB değerini 100k (100 kΩ) yapın.',
      'AC analizde 1 kHz kazancının 19.7–20.3 dB aralığında olduğunu doğrulayın.',
    ],
    goalText:
      'R_FB direncini ayarlayarak 1 kHz ses bandında tam 20 dB (19.7–20.3 dB) kazanç elde edin.',
    hint: '20·log10(10) = 20 dB için |A_v| = R_FB / R_IN = 10 olmalıdır; R_IN = 10 kΩ olduğundan R_FB = 100 kΩ seçilir.',
    realWorldNote:
      'Mikrofon ve hat seviyesi (line-level) ses ön yükselteçlerinde gürültüyü düşük tutmak için metal film dirençler tercih edilir.',
    starterSchematic: cloneSchematic(INV_OPAMP_BASE, {
      id: 'l45-20db-starter',
      name: '20 dB Ses Yükselteci (Başlangıç)',
      description: '0 dB kazançlı eviren ön yükselteç.',
      compParams: { R_FB: { resistance: 10000 } },
    }),
    solutionSchematic: cloneSchematic(INV_OPAMP_BASE, {
      id: 'l45-20db-solution',
      name: '20 dB Ses Yükselteci (Çözüm)',
      description: 'R_FB = 100 kΩ ile 20 dB (10×) eviren ses yükselteci.',
      compParams: { R_FB: { resistance: 100000 } },
    }),
    verificationAnalysis: {
      type: 'ac',
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V1' },
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      dcSweep: { sourceName: 'V1', startValue: -4, stopValue: 4, stepValue: 0.2 },
    },
    verify: (_dcOp, simResult) => {
      if (simResult.type !== 'ac') {
        return buildResult(
          [{ label: 'Analiz', actual: simResult.type, target: 'ac', ok: false }],
          '',
          'AC analizi çalıştırın.'
        );
      }
      const idx = findClosestFreqIndex(simResult.frequencies, 1000);
      const gainDb = simResult.magnitudeDb['V_OUT']?.[idx] ?? -99;
      return buildResult(
        [
          {
            label: '1 kHz Kazanç',
            actual: `${gainDb.toFixed(2)} dB`,
            target: '19.70 – 20.30 dB',
            ok: gainDb >= 19.7 && gainDb <= 20.3,
          },
        ],
        `Mükemmel! Yükselteç tam ${gainDb.toFixed(2)} dB (10×) kazanç sağlıyor.`,
        'Kazanç 20 dB değil; R_FB direncini 100 kΩ yapın.'
      );
    },
  },

  // =========================================================================
  // BÖLÜM 10: Orta Seviye (Intermediate) Bitirme Projeleri (L46 - L50)
  // =========================================================================
  {
    id: 46,
    chapter: 10,
    chapterTitle: 'Orta Seviye Bitirme Projeleri',
    title: 'Aktif 1. Derece Op-Amp Alçak Geçiren Filtre',
    difficulty: 'Orta',
    concept:
      'Eviren op-amp geri besleme direnci R_FB (100 kΩ) ile paralel bağlanan bir kondansatör (C_FB), hem DC/düşük frekanslarda 20 dB kazanç sağlar hem de f_c = 1 / (2π · R_FB · C_FB) kesim frekansının üzerinde sinyali -20 dB/dekad hızla zayıflatır.',
    steps: [
      'Geri besleme kondansatörü C_FB bileşenine tıklayın (başlangıçta 100 pF -> f_c ≈ 15.9 kHz).',
      'Kesim frekansını 1 kHz seviyesine çekmek için C_FB değerini 1.59n (1.59 nF) yapın.',
      'AC analizde geçirme bandı kazancının ~20 dB ve -3 dB kesim frekansının 850–1150 Hz olduğunu doğrulayın.',
    ],
    goalText:
      'C_FB kapasitansını ayarlayarak geçirme bandı kazancını ~20 dB (19.5–20.5 dB) ve -3 dB kesim frekansını 850–1150 Hz yapın.',
    hint: 'f_c = 1 / (2π · 100k · C_FB) = 1000 Hz denklemi çözülürse C_FB = 1.59 nF bulunur.',
    realWorldNote:
      'Aktif RC filtreler, pasif RC filtrelerin aksine aynı anda hem kazanç sağlar hem de sonraki katlar tarafından yüklenmez.',
    starterSchematic: cloneSchematic(INV_OPAMP_BASE, {
      id: 'l46-active-lpf-starter',
      name: 'Aktif 1. Derece LPF (Başlangıç)',
      description: 'C_FB = 100 pF ile ~15.9 kHz kesimli aktif LPF.',
      compParams: { R_FB: { resistance: 100000 } },
      extraComponents: [
        {
          id: 'l46-cfb',
          name: 'C_FB',
          type: 'capacitor',
          x: 18,
          y: 14,
          rotation: 0,
          params: { capacitance: 100e-12, ic: 0 },
        },
      ],
      extraWires: [
        { id: 'l46-w1', x1: 15, y1: 11, x2: 15, y2: 14 },
        { id: 'l46-w2', x1: 15, y1: 14, x2: 16, y2: 14 },
        { id: 'l46-w3', x1: 20, y1: 14, x2: 21, y2: 14 },
        { id: 'l46-w4', x1: 21, y1: 14, x2: 21, y2: 11 },
      ],
      recommendedAnalysis: {
        type: 'ac',
        ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 40, inputSourceName: 'V1' },
        transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
        dcSweep: { sourceName: 'V1', startValue: -4, stopValue: 4, stepValue: 0.2 },
      },
    }),
    solutionSchematic: cloneSchematic(INV_OPAMP_BASE, {
      id: 'l46-active-lpf-solution',
      name: 'Aktif 1. Derece LPF (Çözüm)',
      description: 'C_FB = 1.59 nF ile fc ≈ 1 kHz, 20 dB aktif LPF.',
      compParams: { R_FB: { resistance: 100000 } },
      extraComponents: [
        {
          id: 'l46-cfb',
          name: 'C_FB',
          type: 'capacitor',
          x: 18,
          y: 14,
          rotation: 0,
          params: { capacitance: 1.59e-9, ic: 0 },
        },
      ],
      extraWires: [
        { id: 'l46-w1', x1: 15, y1: 11, x2: 15, y2: 14 },
        { id: 'l46-w2', x1: 15, y1: 14, x2: 16, y2: 14 },
        { id: 'l46-w3', x1: 20, y1: 14, x2: 21, y2: 14 },
        { id: 'l46-w4', x1: 21, y1: 14, x2: 21, y2: 11 },
      ],
      recommendedAnalysis: {
        type: 'ac',
        ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 40, inputSourceName: 'V1' },
        transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
        dcSweep: { sourceName: 'V1', startValue: -4, stopValue: 4, stepValue: 0.2 },
      },
    }),
    verificationAnalysis: {
      type: 'ac',
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 40, inputSourceName: 'V1' },
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      dcSweep: { sourceName: 'V1', startValue: -4, stopValue: 4, stepValue: 0.2 },
    },
    verify: (_dcOp, simResult) => {
      if (simResult.type !== 'ac') {
        return buildResult(
          [{ label: 'Analiz', actual: simResult.type, target: 'ac', ok: false }],
          '',
          'AC analizi çalıştırın.'
        );
      }
      const freqs = simResult.frequencies;
      const magDb = simResult.magnitudeDb['V_OUT'] ?? [];
      const passband = magDb[0] ?? -99;
      const fc = findCutoffFreqHz(freqs, magDb);
      return buildResult(
        [
          {
            label: 'Geçirme Bandı',
            actual: `${passband.toFixed(2)} dB`,
            target: '19.50 – 20.50 dB',
            ok: passband >= 19.5 && passband <= 20.5,
          },
          {
            label: '-3 dB Kesim (f_c)',
            actual: fc !== null ? `${fc.toFixed(0)} Hz` : '> 100 kHz',
            target: '850 – 1150 Hz',
            ok: fc !== null && fc >= 850 && fc <= 1150,
          },
        ],
        `Harika! Aktif LPF 20 dB geçirme bandı ve f_c ≈ ${fc?.toFixed(0)} Hz kesim frekansı ile çalışıyor.`,
        'Kesim frekansı hedeften farklı; C_FB değerini 1.59 nF (1.59n) yapın.'
      );
    },
  },

  {
    id: 47,
    chapter: 10,
    chapterTitle: 'Orta Seviye Bitirme Projeleri',
    title: 'Sallen-Key 2. Derece Butterworth Filtre',
    difficulty: 'Orta',
    concept:
      'Sallen-Key 2. derece aktif alçak geçiren filtre, birim kazançlı op-amp ile C1 üzerinden pozitif geri besleme (bootstrap) kullanarak yüksek Q değeri üretir. C1 = 2·C2 ve R1 = R2 = 10 kΩ seçildiğinde Q = 0.7071 (maksimum düz Butterworth) ve -40 dB/dekad zayıflama elde edilir.',
    steps: [
      'Giriş direnci R1 üzerine tıklayın (başlangıçta 100 kΩ -> kesim frekansı kaymış ve Q bozulmuş).',
      'R1 = R2 = 10 kΩ simetrisini kurmak için R1 değerini 10k (10 kΩ) yapın.',
      'AC analizde -3 dB kesiminin 930–1070 Hz arasında ve 10 kHz → 100 kHz eğiminin ≤ -37 dB/dekad olduğunu doğrulayın.',
    ],
    goalText:
      'R1 direncini ayarlayarak 1 kHz Butterworth kesimi (930–1070 Hz) ve -40 dB/dekad (≤ -37 dB/dec) süzme eğimi elde edin.',
    hint: 'f_c = 1 / (2π · √(R1·R2·C1·C2)) = 1000 Hz için R1 = 10 kΩ olmalıdır.',
    realWorldNote:
      'Butterworth filtreler geçirme bandında dalgalanma (ripple) içermediği için veri toplama (DAQ) ve ADC anti-aliasing katlarında standart tercihtir.',
    starterSchematic: cloneSchematic(SALLEN_KEY_BASE, {
      id: 'l47-sk-starter',
      name: 'Sallen-Key Butterworth LPF (Başlangıç)',
      description: 'Yanlış R1 = 100 kΩ değerli Sallen-Key LPF.',
      compParams: { R1: { resistance: 100000 } },
    }),
    solutionSchematic: cloneSchematic(SALLEN_KEY_BASE, {
      id: 'l47-sk-solution',
      name: 'Sallen-Key Butterworth LPF (Çözüm)',
      description: '1 kHz kesimli 2. derece Sallen-Key Butterworth LPF.',
      compParams: { R1: { resistance: 10000 } },
    }),
    verificationAnalysis: {
      type: 'ac',
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 40, inputSourceName: 'V1' },
      transient: { stopTime: 5e-3, timeStep: 20e-6, method: 'trapezoidal' },
      dcSweep: { sourceName: 'V1', startValue: -5, stopValue: 5, stepValue: 0.5 },
    },
    verify: (_dcOp, simResult) => {
      if (simResult.type !== 'ac') {
        return buildResult(
          [{ label: 'Analiz', actual: simResult.type, target: 'ac', ok: false }],
          '',
          'AC analizi çalıştırın.'
        );
      }
      const freqs = simResult.frequencies;
      const magDb = simResult.magnitudeDb['V_OUT'] ?? [];
      const fc = findCutoffFreqHz(freqs, magDb);
      const idx10k = findClosestFreqIndex(freqs, 10000);
      const idx100k = findClosestFreqIndex(freqs, 100000);
      const slope = (magDb[idx100k] ?? 0) - (magDb[idx10k] ?? 0);
      return buildResult(
        [
          {
            label: '-3 dB Kesim (f_c)',
            actual: fc !== null ? `${fc.toFixed(0)} Hz` : 'Bulunamadı',
            target: '930 – 1070 Hz',
            ok: fc !== null && fc >= 930 && fc <= 1070,
          },
          {
            label: '10k→100k Eğim',
            actual: `${slope.toFixed(1)} dB/dec`,
            target: '<= -37.0 dB/dec',
            ok: slope <= -37.0,
          },
        ],
        `Mükemmel! Butterworth yanıtı f_c ≈ ${fc?.toFixed(0)} Hz ve ${slope.toFixed(1)} dB/dekad zayıflama ile doğrulandı.`,
        'Kesim frekansı veya eğim hatalı; R1 direncini 10 kΩ yapın.'
      );
    },
  },

  {
    id: 48,
    chapter: 10,
    chapterTitle: 'Orta Seviye Bitirme Projeleri',
    title: 'Ortak Emiterli BJT Ses Ön Yükselteci',
    difficulty: 'Orta',
    concept:
      'Ortak emiterli yükselteçte emiter direnci R_E (470 Ω) DC çalışma noktasını kararlı tutar, ancak AC sinyallerde de devrede kalırsa negatif geri besleme yaparak kazancı ~R_C/R_E ≈ 4× (~12 dB) seviyesine düşürür. R_E’ye paralel büyük bir baypas kondansatörü (C_E = 100 µF) AC’de emiteri şaseleyerek kazancı > 38 dB seviyesine fırlatır.',
    steps: [
      'Emiter baypas kondansatörü CE üzerine tıklayın (başlangıçta 100 nF — 1 kHz’de empedansı ~1.6 kΩ olduğu için baypas yapamıyor!).',
      '1 kHz ses frekansında emiteri şaseye bağlamak için CE kapasitansını 100u (100 µF) yapın.',
      'AC analizde 1 kHz kazancının > 38 dB seviyesine yükseldiğini doğrulayın.',
    ],
    goalText:
      'CE baypas kapasitansını büyüterek 1 kHz orta-bant AC kazancını > 38 dB seviyesine çıkarın.',
    hint: '1 kHz’de 100 µF kondansatörün reaktansı yalnızca 1.59 Ω olur ve R_E = 470 Ω’u tamamen kısa devre eder.',
    realWorldNote:
      'Elektrolitik baypas kondansatörü kullanıldığında hem yüksek kazanç hem de kararlı DC kutuplama aynı anda elde edilir.',
    starterSchematic: cloneSchematic(BJT_CE_BASE, {
      id: 'l48-bjt-ac-starter',
      name: 'BJT Ses Ön Yükselteci (Başlangıç)',
      description: 'Yetersiz 100 nF baypas kondansatörlü CE yükselteç.',
      compParams: { CE: { capacitance: 100e-9 } },
      recommendedAnalysis: {
        type: 'ac',
        ac: { startFreq: 10, stopFreq: 1000000, pointsPerDecade: 30, inputSourceName: 'V_IN' },
        transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
        dcSweep: { sourceName: 'VCC', startValue: 0, stopValue: 15, stepValue: 0.5 },
      },
    }),
    solutionSchematic: cloneSchematic(BJT_CE_BASE, {
      id: 'l48-bjt-ac-solution',
      name: 'BJT Ses Ön Yükselteci (Çözüm)',
      description: '100 µF baypas kondansatörlü yüksek kazançlı CE yükselteç.',
      compParams: { CE: { capacitance: 100e-6 } },
      recommendedAnalysis: {
        type: 'ac',
        ac: { startFreq: 10, stopFreq: 1000000, pointsPerDecade: 30, inputSourceName: 'V_IN' },
        transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
        dcSweep: { sourceName: 'VCC', startValue: 0, stopValue: 15, stepValue: 0.5 },
      },
    }),
    verificationAnalysis: {
      type: 'ac',
      ac: { startFreq: 10, stopFreq: 1000000, pointsPerDecade: 30, inputSourceName: 'V_IN' },
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      dcSweep: { sourceName: 'VCC', startValue: 0, stopValue: 15, stepValue: 0.5 },
    },
    verify: (_dcOp, simResult) => {
      if (simResult.type !== 'ac') {
        return buildResult(
          [{ label: 'Analiz', actual: simResult.type, target: 'ac', ok: false }],
          '',
          'AC analizi çalıştırın.'
        );
      }
      const idx = findClosestFreqIndex(simResult.frequencies, 1000);
      const gainDb = simResult.magnitudeDb['V_OUT']?.[idx] ?? -99;
      return buildResult(
        [
          {
            label: '1 kHz AC Kazancı',
            actual: `${gainDb.toFixed(2)} dB`,
            target: '> 38.00 dB',
            ok: gainDb > 38.0,
          },
        ],
        `Süper! 100 µF baypas kondansatörü ile kazanç ${gainDb.toFixed(2)} dB seviyesine çıktı.`,
        'Kazanç çok düşük; CE emiter baypas kondansatörünü 100 µF (100u) yapın.'
      );
    },
  },

  {
    id: 49,
    chapter: 10,
    chapterTitle: 'Orta Seviye Bitirme Projeleri',
    title: 'Kontrollü Kaynaklar (VCVS & VCCS Transkondüktans)',
    difficulty: 'Orta',
    concept:
      'Gerilim Kontrollü Akım Kaynağı (VCCS), girişindeki gerilim farkını bir transkondüktans katsayısıyla (g_m, birimi Siemens = A/V) çarparak çıkış akımına dönüştürür: I_out = g_m · V_in. Çıkıştaki 1 kΩ yük üzerinde V_OUT = g_m · V_in · R_LOAD oluşur.',
    steps: [
      'G1 VCCS bileşenine tıklayın (başlangıçta gm = 1 mS -> V_OUT = 2.0 V).',
      'V_IN = 2 V ve R_LOAD = 1 kΩ iken V_OUT = 10 V elde etmek için gm parametresini 5m (0.005 S) yapın.',
      'DC Çalışma Noktasında V_OUT geriliminin 9.8–10.2 V aralığında olduğunu doğrulayın.',
    ],
    goalText:
      'G1 transkondüktansını (gm) ayarlayarak 1 kΩ yük üzerinde V_OUT değerini 9.8–10.2 V aralığına getirin.',
    hint: 'V_OUT = gm · V_IN · R_LOAD = gm · 2 V · 1000 Ω = 10 V olması için gm = 0.005 S (5 mS) gerekir.',
    realWorldNote:
      'VCCS modelleri transistörlerin (g_m·v_be veya g_m·v_gs) ve OTA (Operational Transconductance Amplifier) entegrelerinin eşdeğer davranışını modellemede temel araçtır.',
    starterSchematic: cloneSchematic(VCCS_BASE, {
      id: 'l49-vccs-starter',
      name: 'VCCS Transkondüktans (Başlangıç)',
      description: 'gm = 1 mS değerli VCCS devresi.',
      compParams: { G1: { gm: 1e-3 } },
    }),
    solutionSchematic: cloneSchematic(VCCS_BASE, {
      id: 'l49-vccs-solution',
      name: 'VCCS Transkondüktans (Çözüm)',
      description: 'gm = 5 mS ile 10 V çıkış üreten VCCS devresi.',
      compParams: { G1: { gm: 5e-3 } },
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 3e-3, timeStep: 10e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
      dcSweep: { sourceName: 'V_IN', startValue: 0, stopValue: 5, stepValue: 0.2 },
    },
    verify: (dcOp) => {
      const vOut = dcOp.probeVoltages['V_OUT'] ?? 0;
      return buildResult(
        [
          {
            label: 'V_OUT',
            actual: `${vOut.toFixed(2)} V`,
            target: '9.80 – 10.20 V',
            ok: vOut >= 9.8 && vOut <= 10.2,
          },
        ],
        `Doğru! I_out = 5 mS × 2 V = 10 mA akım, 1 kΩ yükte ${vOut.toFixed(2)} V üretti.`,
        'V_OUT hedef aralıkta değil; G1 gm değerini 5 mS (0.005) yapın.'
      );
    },
  },

  {
    id: 50,
    chapter: 10,
    chapterTitle: 'Orta Seviye Bitirme Projeleri',
    title: 'MEZUNİYET PROJESİ: Tamponlu 5.1V Hassas Güç Referansı',
    difficulty: 'Orta',
    concept:
      'Basit bir Zener regülatörüne doğrudan 100 Ω (~51 mA) ağır yük bağlarsanız voltaj çöker. Çözüm: Zener diyotu R_S = 220 Ω ile doğru diz akımında (I_Z ≈ 31 mA) kutuplayın ve referans gerilimini yüksek giriş empedanslı bir Op-Amp gerilim izleyiciyle tamponlayarak ağır yüke aktarın!',
    steps: [
      'Seri öngerilim direnci R_S bileşenine tıklayın (başlangıçta 10 kΩ — Zener akımı < 1 mA olduğu için yeterli diz akımına ulaşamıyor!).',
      'Zener diyotunu kararlı çığ kırılma bölgesinde (~31 mA) sürmek için R_S değerini 220 Ω yapın.',
      'DC Çalışma Noktasında 100 Ω ağır yük üzerinde V_OUT = 5.05–5.30 V (~51 mA yük akımı) ve sağlam Zener akımı (|I_Z| ≥ 5 mA) oluştuğunu doğrulayın.',
    ],
    goalText:
      'R_S direncini boyutlandırarak ağır 100 Ω yükte V_OUT ∈ 5.05–5.30 V ve Zener kutup akımı |I(DZ1)| ≥ 5 mA sağlayın.',
    hint: '12 V giriş ve 5.1 V Zener için R_S = 220 Ω seçildiğinde I_Z ≈ (12 - 5.18) / 220 ≈ 31 mA olur; U1 tamponu Zenerden hiç akım çekmeden yüke ~52 mA sağlar.',
    realWorldNote:
      'Bu "Referans + Op-Amp Tampon" mimarisi hassas laboratuvar güç kaynaklarının, DAC referanslarının ve batarya test cihazlarının kalbidir. Tebrikler, NeonSPICE Akademi’yi başarıyla tamamladınız!',
    starterSchematic: cloneSchematic(BUFFERED_ZENER_BASE, {
      id: 'l50-grad-starter',
      name: 'Mezuniyet Projesi (Başlangıç)',
      description: 'Yetersiz R_S = 10 kΩ nedeniyle Zeneri yeterince kutuplayamayan referans.',
      compParams: { R_S: { resistance: 10000 } },
    }),
    solutionSchematic: cloneSchematic(BUFFERED_ZENER_BASE, {
      id: 'l50-grad-solution',
      name: 'Mezuniyet Projesi (Çözüm)',
      description: '220 Ω kutuplu, op-amp tamponlu 5.1 V hassas güç referansı.',
      compParams: { R_S: { resistance: 220 } },
    }),
    verificationAnalysis: {
      type: 'dc_op',
      transient: { stopTime: 5e-3, timeStep: 20e-6, method: 'trapezoidal' },
      ac: { startFreq: 10, stopFreq: 100000, pointsPerDecade: 20, inputSourceName: 'V_IN' },
      dcSweep: { sourceName: 'V_IN', startValue: 0, stopValue: 15, stepValue: 0.25 },
    },
    verify: (dcOp) => {
      const vOut = dcOp.probeVoltages['V_OUT'] ?? 0;
      const iZenerMa = Math.abs(dcOp.branchCurrents['DZ1'] ?? 0) * 1000;
      const iLoadMa = Math.abs(dcOp.branchCurrents['R_LOAD'] ?? 0) * 1000;
      return buildResult(
        [
          {
            label: 'V_OUT (100Ω Yük)',
            actual: `${vOut.toFixed(3)} V`,
            target: '5.05 – 5.30 V',
            ok: vOut >= 5.05 && vOut <= 5.3,
          },
          {
            label: 'Zener Kutup Akımı',
            actual: `${iZenerMa.toFixed(1)} mA`,
            target: '>= 5.0 mA',
            ok: iZenerMa >= 5.0,
          },
          {
            label: 'Yük Akımı I_LOAD',
            actual: `${iLoadMa.toFixed(1)} mA`,
            target: '>= 45.0 mA',
            ok: iLoadMa >= 45.0,
          },
        ],
        `MEZUNİYET TAMAM! 100 Ω ağır yükte (${iLoadMa.toFixed(1)} mA) çıkış ${vOut.toFixed(3)} V ve Zener akımı ${iZenerMa.toFixed(1)} mA ile kaya gibi sabit!`,
        'Zener diz akımı çok düşük (< 5 mA); R_S direncini 220 Ω yaparak Zeneri kararlı bölgede çalıştırın.'
      );
    },
  },
];
