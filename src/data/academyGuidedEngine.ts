import {
  ACResult,
  CircuitComponent,
  CircuitSchematic,
  ComponentParams,
  ComponentType,
  DCOPResult,
  DCSweepResult,
  SimulationResult,
  TransientResult,
} from '../types/circuit';
import {
  AcademyLevel,
  GuidedStep,
  LevelCheckResult,
} from '../types/academy';
import { compileNetlist } from '../engine/netlist';
import { COMPONENT_GUIDE } from './componentGuide';

// ============================================================================
// Formatting & Turkish Label Helpers
// ============================================================================

const SOURCE_TYPES = new Set<ComponentType>([
  'vdc',
  'vac',
  'vpulse',
  'idc',
  'iac',
]);

const COMPONENT_PRIORITY = (type: ComponentType): number => {
  if (SOURCE_TYPES.has(type)) return 0;
  if (type === 'ground') return 1;
  return 2;
};

const LED_COLOR_TR: Record<string, string> = {
  red: 'Kırmızı',
  green: 'Yeşil',
  blue: 'Mavi',
  amber: 'Sarı/Amber',
  white: 'Beyaz',
};

function fmtEng(val: number, unit: string): string {
  const abs = Math.abs(val);
  if (abs === 0) return `0 ${unit}`;
  if (abs >= 1e6) return `${+(val / 1e6).toPrecision(4)} M${unit}`;
  if (abs >= 1e3) return `${+(val / 1e3).toPrecision(4)} k${unit}`;
  if (abs >= 1) return `${+val.toPrecision(4)} ${unit}`;
  if (abs >= 1e-3) return `${+(val * 1e3).toPrecision(4)} m${unit}`;
  if (abs >= 1e-6) return `${+(val * 1e6).toPrecision(4)} µ${unit}`;
  if (abs >= 1e-9) return `${+(val * 1e9).toPrecision(4)} n${unit}`;
  return `${+(val * 1e12).toPrecision(4)} p${unit}`;
}

interface ParamMeta {
  key: keyof ComponentParams;
  labelTr: string;
  format: (v: number | string) => string;
}

const KEY_PARAMS_BY_TYPE: Partial<Record<ComponentType, ParamMeta[]>> = {
  resistor: [
    { key: 'resistance', labelTr: 'Direnç', format: (v) => fmtEng(Number(v), 'Ω') },
  ],
  potentiometer: [
    { key: 'resistance', labelTr: 'Toplam Direnç', format: (v) => fmtEng(Number(v), 'Ω') },
    { key: 'wiperPos', labelTr: 'Sürgü Konumu (wiperPos)', format: (v) => `${Number(v)}` },
  ],
  capacitor: [
    { key: 'capacitance', labelTr: 'Kapasitans', format: (v) => fmtEng(Number(v), 'F') },
  ],
  inductor: [
    { key: 'inductance', labelTr: 'Endüktans', format: (v) => fmtEng(Number(v), 'H') },
  ],
  transformer: [
    { key: 'turnsRatio', labelTr: 'Sarım Oranı (turnsRatio)', format: (v) => `${Number(v)}` },
  ],
  fuse: [
    { key: 'fuseRating', labelTr: 'Sigorta Akımı', format: (v) => fmtEng(Number(v), 'A') },
  ],
  lamp: [
    { key: 'resistance', labelTr: 'Lamba Direnci', format: (v) => fmtEng(Number(v), 'Ω') },
  ],
  vdc: [
    { key: 'voltage', labelTr: 'DC Gerilim', format: (v) => fmtEng(Number(v), 'V') },
  ],
  vac: [
    { key: 'amplitude', labelTr: 'AC Genlik (amplitude)', format: (v) => fmtEng(Number(v), 'V') },
    { key: 'frequency', labelTr: 'Frekans', format: (v) => fmtEng(Number(v), 'Hz') },
  ],
  vpulse: [
    { key: 'vHigh', labelTr: 'Yüksek Seviye (vHigh)', format: (v) => fmtEng(Number(v), 'V') },
    { key: 'pulseWidth', labelTr: 'Darbe Genişliği', format: (v) => fmtEng(Number(v), 's') },
    { key: 'period', labelTr: 'Periyot', format: (v) => fmtEng(Number(v), 's') },
  ],
  idc: [
    { key: 'current', labelTr: 'DC Akım', format: (v) => fmtEng(Number(v), 'A') },
  ],
  iac: [
    { key: 'amplitude', labelTr: 'AC Akım Genliği', format: (v) => fmtEng(Number(v), 'A') },
  ],
  zener: [
    { key: 'bv', labelTr: 'Zener Gerilimi (bv)', format: (v) => `${Number(v)} V` },
  ],
  led: [
    {
      key: 'ledColor',
      labelTr: 'LED Rengi',
      format: (v) => LED_COLOR_TR[String(v)] ?? String(v),
    },
  ],
  vcvs: [
    { key: 'gain', labelTr: 'Gerilim Kazancı (gain)', format: (v) => `${Number(v)}` },
  ],
  vccs: [
    { key: 'gm', labelTr: 'Transkondüktans (gm)', format: (v) => fmtEng(Number(v), 'S') },
  ],
  vswitch: [
    { key: 'vThreshold', labelTr: 'Eşik Gerilimi (vThreshold)', format: (v) => `${Number(v)} V` },
  ],
};

function paramsDiffer(
  actual: number | string | undefined,
  target: number | string | undefined
): boolean {
  if (target === undefined) return false;
  if (actual === undefined) return true;
  if (typeof target === 'string' || typeof actual === 'string') {
    return String(actual) !== String(target);
  }
  if (Math.abs(target) < 1e-12) {
    return Math.abs(actual - target) > 1e-6;
  }
  return Math.abs(actual - target) / Math.abs(target) > 0.05;
}

function getPlaceInstruction(comp: CircuitComponent): string {
  const guide = COMPONENT_GUIDE[comp.type];
  const shortTitle = guide ? guide.title : comp.type.toUpperCase();

  if (SOURCE_TYPES.has(comp.type)) {
    return `Önce devremize enerji verecek kaynağa ihtiyacımız var! Sol palette parlayan "${shortTitle}" butonuna tıkla ve 3D devre kartına (${comp.name}) yerleştir.`;
  }
  if (comp.type === 'ground') {
    return `Her devrenin 0V referans noktasına (Toprak / GND) ihtiyacı vardır. Sol palette parlayan "Toprak (GND)" butonuna tıkla ve devre kartına yerleştir.`;
  }
  return `Sol palette parlayan "${shortTitle}" bileşenine tıkla ve 3D devre kartındaki parlayan hayalet konuma (${comp.name}) yerleştir. (İstersen farklı bir yere de koyabilirsin!)`;
}

// ============================================================================
// 1. Empty PCB Board Generator
// ============================================================================

export function createEmptyLevelSchematic(level: AcademyLevel): CircuitSchematic {
  const sol = level.solutionSchematic;
  return {
    id: `${sol.id}-empty`,
    name: sol.name,
    description: sol.description,
    category: sol.category,
    components: [],
    wires: [],
    probes: [],
    recommendedAnalysis: {
      type: sol.recommendedAnalysis.type,
      transient: { ...sol.recommendedAnalysis.transient },
      ac: { ...sol.recommendedAnalysis.ac },
      dcSweep: { ...sol.recommendedAnalysis.dcSweep },
    },
    theoryNotes: sol.theoryNotes,
  };
}

// ============================================================================
// 2. Guided Empty-Board Step Engine (Works Automatically Across All 50 Levels)
// ============================================================================

export function computeGuidedSteps(
  level: AcademyLevel,
  current: CircuitSchematic
): {
  steps: GuidedStep[];
  activeStep: GuidedStep | null;
  completedCount: number;
  totalCount: number;
  allBuilt: boolean;
} {
  const sol = level.solutionSchematic;
  const steps: GuidedStep[] = [];

  // Order solution components: Sources -> Grounds -> Passive/Active (left-to-right)
  const orderedSolComps = [...sol.components].sort((a, b) => {
    const pDiff = COMPONENT_PRIORITY(a.type) - COMPONENT_PRIORITY(b.type);
    if (pDiff !== 0) return pDiff;
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  // Smart matching: pair each solution component with an unmatched current component of same type
  const usedCurrentIds = new Set<string>();
  const matchedMap = new Map<string, CircuitComponent>(); // solComp.id -> curComp

  // Pass 1: exact name + type match
  for (const sc of orderedSolComps) {
    const exact = current.components.find(
      (cc) => !usedCurrentIds.has(cc.id) && cc.type === sc.type && cc.name === sc.name
    );
    if (exact) {
      usedCurrentIds.add(exact.id);
      matchedMap.set(sc.id, exact);
    }
  }

  // Pass 2: type match (closest position)
  for (const sc of orderedSolComps) {
    if (matchedMap.has(sc.id)) continue;
    const candidates = current.components.filter(
      (cc) => !usedCurrentIds.has(cc.id) && cc.type === sc.type
    );
    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const da = Math.hypot(a.x - sc.x, a.y - sc.y);
        const db = Math.hypot(b.x - sc.x, b.y - sc.y);
        return da - db;
      });
      usedCurrentIds.add(candidates[0].id);
      matchedMap.set(sc.id, candidates[0]);
    }
  }

  // Check if user has a fully wired valid circuit using fewer GND symbols (shared ground rail)
  const currentNetlist = compileNetlist(current);
  const hasAtLeastOneGround = current.components.some((c) => c.type === 'ground');
  const allNonGroundPlaced = orderedSolComps
    .filter((c) => c.type !== 'ground')
    .every((c) => matchedMap.has(c.id));

  // Count how many pins / probes attach to each compiled node
  const nodeAttachmentCount = new Map<number, number>();
  for (const compPins of Object.values(currentNetlist.componentNodes)) {
    for (const nodeId of Object.values(compPins)) {
      nodeAttachmentCount.set(nodeId, (nodeAttachmentCount.get(nodeId) ?? 0) + 1);
    }
  }
  for (const nodeId of Object.values(currentNetlist.probeNodes)) {
    nodeAttachmentCount.set(nodeId, (nodeAttachmentCount.get(nodeId) ?? 0) + 1);
  }

  let hasFloatingPin = false;
  for (const comp of current.components) {
    const pins = currentNetlist.componentNodes[comp.id];
    if (!pins) {
      hasFloatingPin = true;
      break;
    }
    for (const nodeId of Object.values(pins)) {
      if ((nodeAttachmentCount.get(nodeId) ?? 0) < 2) {
        hasFloatingPin = true;
        break;
      }
    }
    if (hasFloatingPin) break;
  }

  const circuitElectricallyConnected =
    allNonGroundPlaced &&
    hasAtLeastOneGround &&
    current.components.length >= 2 &&
    !hasFloatingPin &&
    currentNetlist.warnings.length === 0 &&
    (sol.wires.length === 0 || current.wires.length > 0);

  let stepNum = 1;

  // Step Group 1: Place Components
  for (const sc of orderedSolComps) {
    const matched = matchedMap.get(sc.id);
    // If user already wired the whole circuit using a single shared GND, mark extra GND steps complete
    const completed =
      Boolean(matched) || (sc.type === 'ground' && circuitElectricallyConnected);
    const guide = COMPONENT_GUIDE[sc.type];
    const titleName = guide ? guide.title.split(' (')[0] : sc.type.toUpperCase();

    steps.push({
      id: `place-${sc.id}`,
      kind: 'place_component',
      title: `${stepNum}. ${titleName} Ekle (${sc.name})`,
      instruction: getPlaceInstruction(sc),
      completed,
      highlightedTool: 'place',
      highlightedComponentType: sc.type,
      targetComponentName: sc.name,
      targetGhost: {
        kind: 'component',
        componentType: sc.type,
        x: sc.x,
        y: sc.y,
        rotation: sc.rotation,
        label: sc.name,
      },
      solutionComponent: sc,
    });
    stepNum++;
  }

  // Step Group 2: Parameter Tuning for any placed component whose key parameter differs > 5%
  for (const sc of orderedSolComps) {
    const matched = matchedMap.get(sc.id);
    if (!matched) continue;
    const paramList = KEY_PARAMS_BY_TYPE[sc.type];
    if (!paramList) continue;

    for (const pm of paramList) {
      const targetVal = sc.params[pm.key];
      if (targetVal === undefined) continue;
      const actualVal = matched.params[pm.key];
      if (paramsDiffer(actualVal as number | string | undefined, targetVal as number | string)) {
        const formattedTarget = pm.format(targetVal as number | string);
        steps.push({
          id: `param-${sc.id}-${String(pm.key)}`,
          kind: 'set_param',
          title: `${stepNum}. ${matched.name} Değerini Ayarla (${formattedTarget})`,
          instruction: `Devre kartında ${matched.name} bileşenine tıkla ve sağdaki Özellikler panelinden "${pm.labelTr}" değerini ${formattedTarget} olarak ayarla.`,
          completed: false,
          highlightedTool: 'select',
          targetComponentName: matched.name,
          solutionComponent: sc,
        });
        stepNum++;
      }
    }
  }

  // Step Group 3: Wiring
  if (sol.wires.length > 0) {
    steps.push({
      id: `wires-${sol.id}`,
      kind: 'add_wires',
      title: `${stepNum}. Bileşenleri Kablolarla Bağla`,
      instruction:
        'Üst araç çubuğundan parlayan "Kablo (W)" aracını seç ve parlayan bakır yolları takip ederek bileşen uçlarını birbirine bağla.',
      completed: circuitElectricallyConnected,
      highlightedTool: 'wire',
      targetGhost: {
        kind: 'wire',
        wires: sol.wires,
      },
    });
    stepNum++;
  }

  // Step Group 4: Probes
  if (sol.probes.length > 0) {
    const probesDone = current.probes.length >= sol.probes.length;
    const nextProbe = sol.probes[Math.min(current.probes.length, sol.probes.length - 1)];
    const probeNames = sol.probes.map((p) => p.label).join(', ');
    steps.push({
      id: `probe-${sol.id}`,
      kind: 'add_probe',
      title: `${stepNum}. Voltaj Probu Yerleştir (${probeNames})`,
      instruction: `Üst araç çubuğundan "Prob (P)" aracını seç ve ölçüm almak için parlayan düğüm noktasına (${nextProbe.label}) tıkla.`,
      completed: probesDone,
      highlightedTool: 'probe',
      targetGhost: {
        kind: 'probe',
        x: nextProbe.x,
        y: nextProbe.y,
        label: nextProbe.label,
      },
    });
    stepNum++;
  }

  // Step Group 5: Verify / Simulate
  const allBuilt = steps.every((s) => s.completed);
  steps.push({
    id: `verify-${sol.id}`,
    kind: 'verify',
    title: `${stepNum}. Devreni Simüle Et ve Doğrula!`,
    instruction:
      'Harika iş çıkardın! Devren hazır. Şimdi "Doğrula & Test Et" butonuna basarak gerçek SPICE simülasyonuyla devreni test et.',
    completed: false,
    highlightedTool: 'select',
  });

  const activeStep = steps.find((s) => !s.completed) ?? null;
  const completedCount = steps.filter((s) => s.completed).length;

  return {
    steps,
    activeStep,
    completedCount,
    totalCount: steps.length,
    allBuilt,
  };
}

// ============================================================================
// 3. Order-Independent "Kendin Dene" Challenge Verification
// ============================================================================

function buildComponentNameMap(
  solution: CircuitSchematic,
  current: CircuitSchematic
): Map<string, string> {
  // Maps solution component name -> matched current component name
  const nameMap = new Map<string, string>();
  const usedIds = new Set<string>();

  // Pass 1: exact name + type match
  for (const sc of solution.components) {
    if (sc.type === 'ground') continue;
    const exact = current.components.find(
      (cc) => !usedIds.has(cc.id) && cc.type === sc.type && cc.name === sc.name
    );
    if (exact) {
      usedIds.add(exact.id);
      nameMap.set(sc.name, exact.name);
    }
  }

  // Pass 2: same type, closest key parameter value (e.g. distinguish R_S=220 vs R_LOAD=100)
  for (const sc of solution.components) {
    if (sc.type === 'ground' || nameMap.has(sc.name)) continue;
    const candidates = current.components.filter(
      (cc) => !usedIds.has(cc.id) && cc.type === sc.type
    );
    if (candidates.length === 0) continue;

    const paramList = KEY_PARAMS_BY_TYPE[sc.type];
    const primaryKey = paramList?.[0]?.key;
    candidates.sort((a, b) => {
      if (primaryKey) {
        const target = Number(sc.params[primaryKey]);
        const va = Number(a.params[primaryKey]);
        const vb = Number(b.params[primaryKey]);
        if (Number.isFinite(target) && Number.isFinite(va) && Number.isFinite(vb)) {
          const da = Math.abs(va - target);
          const db = Math.abs(vb - target);
          if (Math.abs(da - db) > 1e-12) return da - db;
        }
      }
      return Math.hypot(a.x - sc.x, a.y - sc.y) - Math.hypot(b.x - sc.x, b.y - sc.y);
    });

    usedIds.add(candidates[0].id);
    nameMap.set(sc.name, candidates[0].name);
  }

  return nameMap;
}

function aliasRecordByNameMap<T>(
  source: Record<string, T>,
  nameMap: Map<string, string>
): Record<string, T> {
  const aliased: Record<string, T> = { ...source };
  for (const [solName, curName] of nameMap.entries()) {
    if (aliased[solName] === undefined && source[curName] !== undefined) {
      aliased[solName] = source[curName];
    }
  }
  return aliased;
}

function getSourcePosNodes(schematic: CircuitSchematic): Set<number> {
  const netlist = compileNetlist(schematic);
  const srcNodes = new Set<number>();
  for (const comp of schematic.components) {
    if (SOURCE_TYPES.has(comp.type)) {
      const posNode = netlist.componentNodes[comp.id]?.pos;
      if (posNode !== undefined && posNode !== 0) {
        srcNodes.add(posNode);
      }
    }
  }
  return srcNodes;
}

export function verifyChallengeCircuit(
  level: AcademyLevel,
  dcOp: DCOPResult,
  simResult: SimulationResult,
  schematic: CircuitSchematic
): LevelCheckResult {
  // 1. Empty board check
  if (schematic.components.length === 0) {
    return {
      passed: false,
      summary: 'Devre kartı şu an boş! Önce gerekli bileşenleri yerleştirip bağla.',
      details: [
        {
          label: 'Bileşen Sayısı',
          actual: '0',
          target: `En az ${level.solutionSchematic.components.filter((c) => c.type !== 'ground').length} bileşen + GND`,
          ok: false,
        },
      ],
    };
  }

  // 2. Check required core component types (order-independent, name-independent)
  const requiredCounts = new Map<ComponentType, number>();
  for (const c of level.solutionSchematic.components) {
    if (c.type === 'ground') {
      requiredCounts.set('ground', 1); // At least 1 GND is enough
    } else {
      requiredCounts.set(c.type, (requiredCounts.get(c.type) ?? 0) + 1);
    }
  }

  const actualCounts = new Map<ComponentType, number>();
  for (const c of schematic.components) {
    actualCounts.set(c.type, (actualCounts.get(c.type) ?? 0) + 1);
  }

  const missingDetails: LevelCheckResult['details'] = [];
  for (const [type, reqCount] of requiredCounts.entries()) {
    const have = actualCounts.get(type) ?? 0;
    if (have < reqCount) {
      const guide = COMPONENT_GUIDE[type];
      const nameTr = guide ? guide.title.split(' (')[0] : type;
      missingDetails.push({
        label: `Eksik Bileşen: ${nameTr}`,
        actual: `${have} adet`,
        target: `En az ${reqCount} adet`,
        ok: false,
      });
    }
  }

  if (missingDetails.length > 0) {
    return {
      passed: false,
      summary: `Devre eksik: ${missingDetails.map((d) => d.label.replace('Eksik Bileşen: ', '')).join(', ')} eklemelisin.`,
      details: missingDetails,
    };
  }

  // 3. Convergence check
  if (!dcOp.converged) {
    return {
      passed: false,
      summary:
        'Devre simülasyonu yakınsayamadı. Tüm kabloların ve Toprak (GND) bağlantısının eksiksiz olduğundan emin ol.',
      details: [
        {
          label: 'SPICE Çözücü',
          actual: 'Yakınsamadı',
          target: 'Kararlı Çözüm',
          ok: false,
        },
      ],
    };
  }

  // 4. Direct verification first
  const directResult = level.verify(dcOp, simResult, schematic);
  if (directResult.passed) {
    return directResult;
  }

  // 5. Flexible aliasing for component names & probe labels (for equivalent circuits)
  const expectedProbes = level.solutionSchematic.probes.map((p) => p.label);
  const compNameMap = buildComponentNameMap(level.solutionSchematic, schematic);

  const aliasedDCBase: DCOPResult = {
    ...dcOp,
    branchCurrents: aliasRecordByNameMap(dcOp.branchCurrents, compNameMap),
    componentPower: aliasRecordByNameMap(dcOp.componentPower, compNameMap),
    probeVoltages: { ...dcOp.probeVoltages },
  };

  const makeAliasedSim = (
    probeMapFn: (label: string, idx: number) => {
      dcVal?: number;
      trArr?: number[];
      acDbArr?: number[];
      acLinArr?: number[];
      acPhArr?: number[];
      sweepArr?: number[];
    }
  ): { dc: DCOPResult; sim: SimulationResult } => {
    const dcClone: DCOPResult = {
      ...aliasedDCBase,
      probeVoltages: { ...aliasedDCBase.probeVoltages },
    };

    expectedProbes.forEach((label, idx) => {
      if (dcClone.probeVoltages[label] === undefined) {
        const mapped = probeMapFn(label, idx);
        if (mapped.dcVal !== undefined) dcClone.probeVoltages[label] = mapped.dcVal;
      }
    });

    if (simResult.type === 'dc_op') {
      return { dc: dcClone, sim: dcClone };
    }

    if (simResult.type === 'transient') {
      const tr: TransientResult = {
        ...simResult,
        branchCurrents: aliasRecordByNameMap(simResult.branchCurrents, compNameMap),
        probeVoltages: { ...simResult.probeVoltages },
      };
      expectedProbes.forEach((label, idx) => {
        if (tr.probeVoltages[label] === undefined) {
          const mapped = probeMapFn(label, idx);
          if (mapped.trArr) tr.probeVoltages[label] = mapped.trArr;
        }
      });
      return { dc: dcClone, sim: tr };
    }

    if (simResult.type === 'ac') {
      const ac: ACResult = {
        ...simResult,
        magnitudeDb: { ...simResult.magnitudeDb },
        magnitudeLinear: { ...simResult.magnitudeLinear },
        phaseDeg: { ...simResult.phaseDeg },
      };
      expectedProbes.forEach((label, idx) => {
        if (ac.magnitudeDb[label] === undefined) {
          const mapped = probeMapFn(label, idx);
          if (mapped.acDbArr) ac.magnitudeDb[label] = mapped.acDbArr;
          if (mapped.acLinArr) ac.magnitudeLinear[label] = mapped.acLinArr;
          if (mapped.acPhArr) ac.phaseDeg[label] = mapped.acPhArr;
        }
      });
      return { dc: dcClone, sim: ac };
    }

    const sweep: DCSweepResult = {
      ...simResult,
      branchCurrents: aliasRecordByNameMap(simResult.branchCurrents, compNameMap),
      probeVoltages: { ...simResult.probeVoltages },
    };
    expectedProbes.forEach((label, idx) => {
      if (sweep.probeVoltages[label] === undefined) {
        const mapped = probeMapFn(label, idx);
        if (mapped.sweepArr) sweep.probeVoltages[label] = mapped.sweepArr;
      }
    });
    return { dc: dcClone, sim: sweep };
  };

  // Try aliasing component names alone first
  const compAliased = makeAliasedSim(() => ({}));
  const compOnlyCheck = level.verify(compAliased.dc, compAliased.sim, schematic);
  if (compOnlyCheck.passed) {
    return compOnlyCheck;
  }

  // Try 1-to-1 ordered probe mapping when user placed multiple probes with custom labels
  const userProbeLabels = Object.keys(dcOp.probeVoltages);
  if (userProbeLabels.length >= expectedProbes.length && expectedProbes.length > 0) {
    const orderedAttempt = makeAliasedSim((_label, idx) => {
      const uLabel = userProbeLabels[idx];
      return {
        dcVal: dcOp.probeVoltages[uLabel],
        trArr: simResult.type === 'transient' ? simResult.probeVoltages[uLabel] : undefined,
        acDbArr: simResult.type === 'ac' ? simResult.magnitudeDb[uLabel] : undefined,
        acLinArr: simResult.type === 'ac' ? simResult.magnitudeLinear[uLabel] : undefined,
        acPhArr: simResult.type === 'ac' ? simResult.phaseDeg[uLabel] : undefined,
        sweepArr: simResult.type === 'dc_sweep' ? simResult.probeVoltages[uLabel] : undefined,
      };
    });
    const orderedRes = level.verify(orderedAttempt.dc, orderedAttempt.sim, schematic);
    if (orderedRes.passed) return orderedRes;
  }

  // Try mapping each single user probe to expected output probe labels
  for (const userLabel of userProbeLabels) {
    const attempt = makeAliasedSim(() => ({
      dcVal: dcOp.probeVoltages[userLabel],
      trArr: simResult.type === 'transient' ? simResult.probeVoltages[userLabel] : undefined,
      acDbArr: simResult.type === 'ac' ? simResult.magnitudeDb[userLabel] : undefined,
      acLinArr: simResult.type === 'ac' ? simResult.magnitudeLinear[userLabel] : undefined,
      acPhArr: simResult.type === 'ac' ? simResult.phaseDeg[userLabel] : undefined,
      sweepArr: simResult.type === 'dc_sweep' ? simResult.probeVoltages[userLabel] : undefined,
    }));
    const res = level.verify(attempt.dc, attempt.sim, schematic);
    if (res.passed) return res;
  }

  // Try mapping non-source circuit nodes (in case user built a valid circuit without placing a probe)
  const sourcePosNodes = getSourcePosNodes(schematic);
  const allNodeIds = Object.keys(dcOp.nodeVoltages)
    .map(Number)
    .filter((id) => id > 0);
  const orderedNodes = [
    ...allNodeIds.filter((id) => !sourcePosNodes.has(id)),
    ...allNodeIds.filter((id) => sourcePosNodes.has(id)),
  ];

  for (const nodeId of orderedNodes) {
    const attempt = makeAliasedSim(() => ({
      dcVal: dcOp.nodeVoltages[nodeId],
      trArr: simResult.type === 'transient' ? simResult.nodeVoltages[nodeId] : undefined,
      acDbArr: simResult.type === 'ac' ? simResult.nodeMagnitudeDb[nodeId] : undefined,
      acPhArr: simResult.type === 'ac' ? simResult.nodePhaseDeg[nodeId] : undefined,
    }));
    const res = level.verify(attempt.dc, attempt.sim, schematic);
    if (res.passed) return res;
  }

  // If still failing, return the most informative feedback (component-aliased if available)
  return compOnlyCheck;
}
