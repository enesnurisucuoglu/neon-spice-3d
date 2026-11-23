/**
 * Core SPICE Numerical Simulation Engine for NeonSPICE.
 *
 * Implements Modified Nodal Analysis (MNA) for all 25 supported components across:
 *  - DC Operating Point (Newton-Raphson with pnjlim, Gmin stepping, Source stepping)
 *  - DC Sweep (warm-started parametric sweep)
 *  - AC Small-Signal Frequency Sweep (complex MNA around DC OP)
 *  - Transient Time-Domain Analysis (Backward Euler step 1 + Trapezoidal / BE)
 */

import {
  ACConfig,
  ACResult,
  AnalysisConfig,
  CircuitComponent,
  CircuitSchematic,
  CompiledNetlist,
  DCOPResult,
  DCSweepConfig,
  DCSweepResult,
  SimulationResult,
  TransientConfig,
  TransientResult,
} from '../types/circuit';
import {
  Complex,
  cAbs,
  cArgDeg,
  solveComplexLinearSystem,
  solveLinearSystem,
} from './matrix';
import {
  GMIN,
  VT,
  ZENER_IBV,
  diodeVCrit,
  evalDiode,
  evalNMOS,
  evalNPN,
  evalOpAmp,
  evalPMOS,
  evalPNP,
  evalSourceCurrent,
  evalSourceVoltage,
  evalVSwitch,
  evalZener,
  getLedShockleyParams,
  pnjlim,
} from './models';
import { compileNetlist } from './netlist';

const INDUCTOR_R_SERIES = 1e-9;
const TRANSFORMER_R_STAB = 1e-9;
const MAX_NR_ITERS = 100;
const MAX_TRANSIENT_STEPS = 10000;
const MAX_SWEEP_POINTS = 5000;

interface MNALayout {
  numNodes: number; // Number of non-ground nodes (1..numNodes)
  numBranches: number; // Extra branch current variables
  size: number; // Total matrix dimension = numNodes + numBranches
  branchIndex: Map<string, number>; // comp.id -> matrix row/col index
  hasNonlinear: boolean;
}

interface ReactiveState {
  capV: Map<string, number>; // Previous capacitor voltage (V_p1 - V_p2)
  capI: Map<string, number>; // Previous capacitor current (p1 -> p2)
  indV: Map<string, number>; // Previous inductor voltage (V_p1 - V_p2)
  indI: Map<string, number>; // Previous inductor current (p1 -> p2)
}

interface TransientStepInfo {
  dt: number;
  method: 'backward_euler' | 'trapezoidal';
  state: ReactiveState;
}

interface SolveStepOptions {
  gmin: number;
  sourceScale: number;
  mode: 'dc' | 'transient';
  time: number;
  overrides?: Record<string, number>;
  transient?: TransientStepInfo;
  maxIter?: number;
}

interface NRResult {
  converged: boolean;
  iterations: number;
  x: number[];
}

function buildMNALayout(
  schematic: CircuitSchematic,
  compiled: CompiledNetlist
): MNALayout {
  const numNodes = Math.max(0, compiled.nodes.length - 1);
  const branchIndex = new Map<string, number>();
  let nextBranch = numNodes;
  let hasNonlinear = false;

  for (const comp of schematic.components) {
    if (
      comp.type === 'vdc' ||
      comp.type === 'vac' ||
      comp.type === 'vpulse' ||
      comp.type === 'inductor' ||
      comp.type === 'opamp' ||
      comp.type === 'vcvs' ||
      comp.type === 'transformer'
    ) {
      branchIndex.set(comp.id, nextBranch++);
    }
    if (
      comp.type === 'diode' ||
      comp.type === 'zener' ||
      comp.type === 'schottky' ||
      comp.type === 'led' ||
      comp.type === 'bjt_npn' ||
      comp.type === 'bjt_pnp' ||
      comp.type === 'nmos' ||
      comp.type === 'pmos' ||
      comp.type === 'opamp' ||
      comp.type === 'vswitch'
    ) {
      hasNonlinear = true;
    }
  }

  const numBranches = nextBranch - numNodes;
  return {
    numNodes,
    numBranches,
    size: numNodes + numBranches,
    branchIndex,
    hasNonlinear,
  };
}

function getNodeV(x: number[], nodeId: number): number {
  return nodeId > 0 ? x[nodeId - 1] ?? 0 : 0;
}

function stampConductance(
  A: number[][],
  n1: number,
  n2: number,
  g: number
): void {
  if (n1 > 0) A[n1 - 1][n1 - 1] += g;
  if (n2 > 0) A[n2 - 1][n2 - 1] += g;
  if (n1 > 0 && n2 > 0) {
    A[n1 - 1][n2 - 1] -= g;
    A[n2 - 1][n1 - 1] -= g;
  }
}

function stampVCCS(
  A: number[][],
  outPos: number,
  outNeg: number,
  ctrlPos: number,
  ctrlNeg: number,
  gm: number
): void {
  // Current gm * (V_ctrlPos - V_ctrlNeg) leaving outPos and entering outNeg
  if (outPos > 0 && ctrlPos > 0) A[outPos - 1][ctrlPos - 1] += gm;
  if (outPos > 0 && ctrlNeg > 0) A[outPos - 1][ctrlNeg - 1] -= gm;
  if (outNeg > 0 && ctrlPos > 0) A[outNeg - 1][ctrlPos - 1] -= gm;
  if (outNeg > 0 && ctrlNeg > 0) A[outNeg - 1][ctrlNeg - 1] += gm;
}

function stampCurrentRHS(
  b: number[],
  fromNode: number,
  toNode: number,
  current: number
): void {
  // Current leaving fromNode and entering toNode:
  // KCL at fromNode: ... + current = 0 => RHS[fromNode] -= current
  // KCL at toNode:   ... - current = 0 => RHS[toNode]   += current
  if (fromNode > 0) b[fromNode - 1] -= current;
  if (toNode > 0) b[toNode - 1] += current;
}

function getSourceValue(
  comp: CircuitComponent,
  mode: 'dc' | 'transient',
  time: number,
  overrides?: Record<string, number>
): number {
  if (overrides) {
    if (overrides[comp.name] !== undefined) return overrides[comp.name];
    if (overrides[comp.id] !== undefined) return overrides[comp.id];
  }
  if (mode === 'dc') {
    if (comp.type === 'vdc') return comp.params.voltage ?? 5;
    if (comp.type === 'vac') return comp.params.voltage ?? 0;
    if (comp.type === 'vpulse') return evalSourceVoltage(comp, 0);
    if (comp.type === 'idc') return comp.params.current ?? 1e-3;
    if (comp.type === 'iac') return comp.params.current ?? 0;
    return 0;
  }
  if (comp.type === 'idc' || comp.type === 'iac') {
    return evalSourceCurrent(comp, time);
  }
  return evalSourceVoltage(comp, time);
}

function isDiodeLike(type: CircuitComponent['type']): boolean {
  return (
    type === 'diode' ||
    type === 'zener' ||
    type === 'schottky' ||
    type === 'led'
  );
}

/**
 * Assemble and solve a single DC or Transient operating point via Newton-Raphson
 * with SPICE pnjlim voltage limiting on diodes, zeners, LEDs, Schottkys, and BJTs.
 */
function solveNewtonRaphson(
  schematic: CircuitSchematic,
  compiled: CompiledNetlist,
  layout: MNALayout,
  xInit: number[],
  opts: SolveStepOptions
): NRResult {
  const n = layout.size;
  if (n === 0) {
    return { converged: true, iterations: 0, x: [] };
  }

  const maxIter = opts.maxIter ?? MAX_NR_ITERS;
  let x = xInit.length === n ? xInit.slice() : new Array<number>(n).fill(0);

  // Maintain junction voltages across NR iterations for pnjlim
  const diodeVd = new Map<string, number>();
  const bjtVbe = new Map<string, number>();
  const bjtVbc = new Map<string, number>();

  for (const comp of schematic.components) {
    const pins = compiled.componentNodes[comp.id] ?? {};
    if (isDiodeLike(comp.type)) {
      const vd = getNodeV(x, pins.anode ?? 0) - getNodeV(x, pins.cathode ?? 0);
      diodeVd.set(comp.id, vd);
    } else if (comp.type === 'bjt_npn' || comp.type === 'bjt_pnp') {
      const vb = getNodeV(x, pins.base ?? 0);
      const vc = getNodeV(x, pins.collector ?? 0);
      const ve = getNodeV(x, pins.emitter ?? 0);
      bjtVbe.set(comp.id, vb - ve);
      bjtVbc.set(comp.id, vb - vc);
    }
  }

  const maxLinearIters = layout.hasNonlinear ? maxIter : 1;

  for (let iter = 0; iter < maxLinearIters; iter++) {
    const A: number[][] = new Array(n);
    const b: number[] = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      A[i] = new Array<number>(n).fill(0);
    }

    // Shunt GMIN from every non-ground node to ground for numerical stability
    for (let i = 0; i < layout.numNodes; i++) {
      A[i][i] += opts.gmin;
    }

    for (const comp of schematic.components) {
      const pins = compiled.componentNodes[comp.id] ?? {};
      const p = comp.params;

      switch (comp.type) {
        case 'ground':
          break;

        case 'resistor': {
          const r = Math.max(p.resistance ?? 1000, 1e-12);
          stampConductance(A, pins.p1 ?? 0, pins.p2 ?? 0, 1 / r);
          break;
        }

        case 'potentiometer': {
          const r = Math.max(p.resistance ?? 10000, 1e-12);
          const pos = Math.min(Math.max(p.wiperPos ?? 0.5, 0.001), 0.999);
          const n1 = pins.p1 ?? 0;
          const n2 = pins.p2 ?? 0;
          const nw = pins.wiper ?? 0;
          stampConductance(A, n1, nw, 1 / (r * pos));
          stampConductance(A, nw, n2, 1 / (r * (1 - pos)));
          break;
        }

        case 'fuse': {
          const r = Math.max(p.rOn ?? 0.05, 1e-12);
          stampConductance(A, pins.p1 ?? 0, pins.p2 ?? 0, 1 / r);
          break;
        }

        case 'lamp': {
          const r = Math.max(p.resistance ?? 100, 1e-12);
          stampConductance(A, pins.p1 ?? 0, pins.p2 ?? 0, 1 / r);
          break;
        }

        case 'capacitor': {
          const n1 = pins.p1 ?? 0;
          const n2 = pins.p2 ?? 0;
          if (opts.transient) {
            const C = Math.max(p.capacitance ?? 1e-6, 0);
            const dt = opts.transient.dt;
            const vPrev = opts.transient.state.capV.get(comp.id) ?? 0;
            const iPrev = opts.transient.state.capI.get(comp.id) ?? 0;

            if (opts.transient.method === 'trapezoidal') {
              const gEq = (2 * C) / dt;
              const iEq = -gEq * vPrev - iPrev;
              stampConductance(A, n1, n2, gEq);
              stampCurrentRHS(b, n1, n2, iEq);
            } else {
              const gEq = C / dt;
              const iEq = -gEq * vPrev;
              stampConductance(A, n1, n2, gEq);
              stampCurrentRHS(b, n1, n2, iEq);
            }
          } else {
            stampConductance(A, n1, n2, opts.gmin);
          }
          break;
        }

        case 'inductor': {
          const n1 = pins.p1 ?? 0;
          const n2 = pins.p2 ?? 0;
          const br = layout.branchIndex.get(comp.id)!;

          if (n1 > 0) {
            A[n1 - 1][br] += 1;
            A[br][n1 - 1] += 1;
          }
          if (n2 > 0) {
            A[n2 - 1][br] -= 1;
            A[br][n2 - 1] -= 1;
          }

          if (opts.transient) {
            const L = Math.max(p.inductance ?? 10e-3, 0);
            const dt = opts.transient.dt;
            const iPrev = opts.transient.state.indI.get(comp.id) ?? 0;
            const vPrev = opts.transient.state.indV.get(comp.id) ?? 0;

            if (opts.transient.method === 'trapezoidal') {
              const rEq = (2 * L) / dt;
              A[br][br] -= rEq + INDUCTOR_R_SERIES;
              b[br] -= rEq * iPrev + vPrev;
            } else {
              const rEq = L / dt;
              A[br][br] -= rEq + INDUCTOR_R_SERIES;
              b[br] -= rEq * iPrev;
            }
          } else {
            A[br][br] -= INDUCTOR_R_SERIES;
          }
          break;
        }

        case 'transformer': {
          const np1 = pins.p1 ?? 0;
          const np2 = pins.p2 ?? 0;
          const ns1 = pins.s1 ?? 0;
          const ns2 = pins.s2 ?? 0;
          const br = layout.branchIndex.get(comp.id)!;
          const ratio = p.turnsRatio ?? 0.1; // n = Ns / Np

          // Power-conserving symmetric MNA stamp for ideal transformer:
          // KCL at s1: +I_sec, s2: -I_sec, p1: -n*I_sec, p2: +n*I_sec
          // Branch eqn: (V_s1 - V_s2) - n*(V_p1 - V_p2) - R_stab*I_sec = 0
          if (ns1 > 0) {
            A[ns1 - 1][br] += 1;
            A[br][ns1 - 1] += 1;
          }
          if (ns2 > 0) {
            A[ns2 - 1][br] -= 1;
            A[br][ns2 - 1] -= 1;
          }
          if (np1 > 0) {
            A[np1 - 1][br] -= ratio;
            A[br][np1 - 1] -= ratio;
          }
          if (np2 > 0) {
            A[np2 - 1][br] += ratio;
            A[br][np2 - 1] += ratio;
          }
          A[br][br] -= TRANSFORMER_R_STAB;
          break;
        }

        case 'vdc':
        case 'vac':
        case 'vpulse': {
          const nPos = pins.pos ?? 0;
          const nNeg = pins.neg ?? 0;
          const br = layout.branchIndex.get(comp.id)!;
          const vVal =
            getSourceValue(comp, opts.mode, opts.time, opts.overrides) *
            opts.sourceScale;

          if (nPos > 0) {
            A[nPos - 1][br] += 1;
            A[br][nPos - 1] += 1;
          }
          if (nNeg > 0) {
            A[nNeg - 1][br] -= 1;
            A[br][nNeg - 1] -= 1;
          }
          b[br] += vVal;
          break;
        }

        case 'idc':
        case 'iac': {
          const nPos = pins.pos ?? 0;
          const nNeg = pins.neg ?? 0;
          const iVal =
            getSourceValue(comp, opts.mode, opts.time, opts.overrides) *
            opts.sourceScale;
          if (nPos > 0) b[nPos - 1] += iVal;
          if (nNeg > 0) b[nNeg - 1] -= iVal;
          break;
        }

        case 'vcvs': {
          const nOutPos = pins.out_pos ?? 0;
          const nOutNeg = pins.out_neg ?? 0;
          const nCtrlPos = pins.ctrl_pos ?? 0;
          const nCtrlNeg = pins.ctrl_neg ?? 0;
          const br = layout.branchIndex.get(comp.id)!;
          const gain = p.gain ?? 2;

          if (nOutPos > 0) {
            A[nOutPos - 1][br] += 1;
            A[br][nOutPos - 1] += 1;
          }
          if (nOutNeg > 0) {
            A[nOutNeg - 1][br] -= 1;
            A[br][nOutNeg - 1] -= 1;
          }
          if (nCtrlPos > 0) A[br][nCtrlPos - 1] -= gain;
          if (nCtrlNeg > 0) A[br][nCtrlNeg - 1] += gain;
          break;
        }

        case 'vccs': {
          const gm = p.gm ?? 1e-3;
          stampVCCS(
            A,
            pins.out_pos ?? 0,
            pins.out_neg ?? 0,
            pins.ctrl_pos ?? 0,
            pins.ctrl_neg ?? 0,
            gm
          );
          break;
        }

        case 'diode': {
          const na = pins.anode ?? 0;
          const nk = pins.cathode ?? 0;
          const vd = diodeVd.get(comp.id) ?? 0;
          const { gd, ieq } = evalDiode(
            vd,
            p.is ?? 1e-12,
            p.n ?? 1.0,
            opts.gmin
          );
          stampConductance(A, na, nk, gd);
          stampCurrentRHS(b, na, nk, ieq);
          break;
        }

        case 'schottky': {
          const na = pins.anode ?? 0;
          const nk = pins.cathode ?? 0;
          const vd = diodeVd.get(comp.id) ?? 0;
          const { gd, ieq } = evalDiode(
            vd,
            p.is ?? 1e-6,
            p.n ?? 1.05,
            opts.gmin
          );
          stampConductance(A, na, nk, gd);
          stampCurrentRHS(b, na, nk, ieq);
          break;
        }

        case 'led': {
          const na = pins.anode ?? 0;
          const nk = pins.cathode ?? 0;
          const vd = diodeVd.get(comp.id) ?? 0;
          const { is, n: nLed } = getLedShockleyParams(p);
          const { gd, ieq } = evalDiode(vd, is, nLed, opts.gmin);
          stampConductance(A, na, nk, gd);
          stampCurrentRHS(b, na, nk, ieq);
          break;
        }

        case 'zener': {
          const na = pins.anode ?? 0;
          const nk = pins.cathode ?? 0;
          const vd = diodeVd.get(comp.id) ?? 0;
          const { gd, ieq } = evalZener(
            vd,
            p.is ?? 1e-12,
            p.n ?? 1.0,
            p.bv ?? 5.1,
            opts.gmin
          );
          stampConductance(A, na, nk, gd);
          stampCurrentRHS(b, na, nk, ieq);
          break;
        }

        case 'bjt_npn':
        case 'bjt_pnp': {
          const nc = pins.collector ?? 0;
          const nb = pins.base ?? 0;
          const ne = pins.emitter ?? 0;
          const vbe = bjtVbe.get(comp.id) ?? 0;
          const vbc = bjtVbc.get(comp.id) ?? 0;
          const bjt =
            comp.type === 'bjt_npn'
              ? evalNPN(
                  vbe,
                  vbc,
                  p.is ?? 1e-14,
                  p.bf ?? 150,
                  p.br ?? 1,
                  opts.gmin
                )
              : evalPNP(
                  vbe,
                  vbc,
                  p.is ?? 1e-14,
                  p.bf ?? 120,
                  p.br ?? 1,
                  opts.gmin
                );

          const addA = (r: number, c: number, val: number) => {
            if (r > 0 && c > 0) A[r - 1][c - 1] += val;
          };

          // 3x3 Jacobian stamp for [C, B, E] (identical positive conductances for NPN & PNP)
          addA(nc, nc, bjt.gmr + bjt.gbc);
          addA(nc, nb, bjt.gmf - bjt.gmr - bjt.gbc);
          addA(nc, ne, -bjt.gmf);

          addA(nb, nc, -bjt.gbc);
          addA(nb, nb, bjt.gbe + bjt.gbc);
          addA(nb, ne, -bjt.gbe);

          addA(ne, nc, -bjt.gmr);
          addA(ne, nb, bjt.gmr - bjt.gmf - bjt.gbe);
          addA(ne, ne, bjt.gmf + bjt.gbe);

          if (nc > 0) b[nc - 1] -= bjt.icEq;
          if (nb > 0) b[nb - 1] -= bjt.ibEq;
          if (ne > 0) b[ne - 1] -= bjt.ieEq;
          break;
        }

        case 'nmos': {
          const ng = pins.gate ?? 0;
          const nd = pins.drain ?? 0;
          const ns = pins.source ?? 0;
          const vg = getNodeV(x, ng);
          const vd = getNodeV(x, nd);
          const vs = getNodeV(x, ns);

          const mos = evalNMOS(
            vg - vs,
            vd - vs,
            p.vth ?? 1.5,
            p.kp ?? 0.02,
            p.lambda ?? 0.02,
            opts.gmin
          );
          const dEff = mos.reversed ? ns : nd;
          const sEff = mos.reversed ? nd : ns;

          stampVCCS(A, dEff, sEff, ng, sEff, mos.gm);
          stampConductance(A, dEff, sEff, mos.gds);
          stampCurrentRHS(b, dEff, sEff, mos.iEq);
          break;
        }

        case 'pmos': {
          const ng = pins.gate ?? 0;
          const nd = pins.drain ?? 0;
          const ns = pins.source ?? 0;
          const vg = getNodeV(x, ng);
          const vd = getNodeV(x, nd);
          const vs = getNodeV(x, ns);

          const mos = evalPMOS(
            vs - vg,
            vs - vd,
            p.vth ?? -1.5,
            p.kp ?? 0.02,
            p.lambda ?? 0.02,
            opts.gmin
          );
          const sEff = mos.reversed ? nd : ns;
          const dEff = mos.reversed ? ns : nd;

          // Isd flows from sEff to dEff, controlled by V_sEff - V_g
          stampVCCS(A, sEff, dEff, sEff, ng, mos.gm);
          stampConductance(A, sEff, dEff, mos.gds);
          stampCurrentRHS(b, sEff, dEff, mos.iEq);
          break;
        }

        case 'opamp': {
          const nPos = pins.in_pos ?? 0;
          const nNeg = pins.in_neg ?? 0;
          const nOut = pins.out ?? 0;
          const br = layout.branchIndex.get(comp.id)!;

          const vDiff = getNodeV(x, nPos) - getNodeV(x, nNeg);
          const { aEff, vEq } = evalOpAmp(
            vDiff,
            p.gain ?? 1e5,
            p.vSatPos ?? 15,
            p.vSatNeg ?? -15
          );

          if (nOut > 0) {
            A[nOut - 1][br] += 1;
            A[br][nOut - 1] += 1;
          }
          if (nPos > 0) A[br][nPos - 1] -= aEff;
          if (nNeg > 0) A[br][nNeg - 1] += aEff;
          b[br] += vEq;
          break;
        }

        case 'vswitch': {
          const nCtrlPos = pins.ctrl_pos ?? 0;
          const nCtrlNeg = pins.ctrl_neg ?? 0;
          const n1 = pins.p1 ?? 0;
          const n2 = pins.p2 ?? 0;
          const vCtrl = getNodeV(x, nCtrlPos) - getNodeV(x, nCtrlNeg);
          const vSw = getNodeV(x, n1) - getNodeV(x, n2);

          const sw = evalVSwitch(
            vCtrl,
            vSw,
            p.vThreshold ?? 2.5,
            p.rOn ?? 0.1,
            p.rOff ?? 1e7
          );
          stampConductance(A, n1, n2, sw.g);
          stampVCCS(A, n1, n2, nCtrlPos, nCtrlNeg, sw.gmCtrl);
          stampCurrentRHS(b, n1, n2, sw.iEq);
          break;
        }
      }
    }

    const xNext = solveLinearSystem(A, b);
    if (!xNext) {
      return { converged: false, iterations: iter + 1, x };
    }

    if (!layout.hasNonlinear) {
      return { converged: true, iterations: 1, x: xNext };
    }

    const damp = iter > 40 ? 0.5 : 1.0;
    if (damp < 1.0) {
      for (let i = 0; i < n; i++) {
        xNext[i] = x[i] + damp * (xNext[i] - x[i]);
      }
    }

    // Apply SPICE pnjlim on all diode, zener, schottky, LED, and BJT junctions
    let junctionLimited = false;
    for (const comp of schematic.components) {
      const pins = compiled.componentNodes[comp.id] ?? {};
      const p = comp.params;

      if (comp.type === 'diode' || comp.type === 'schottky' || comp.type === 'led') {
        const vdOld = diodeVd.get(comp.id) ?? 0;
        const vdRaw =
          getNodeV(xNext, pins.anode ?? 0) - getNodeV(xNext, pins.cathode ?? 0);
        let is = p.is ?? 1e-12;
        let nf = p.n ?? 1.0;
        if (comp.type === 'schottky') {
          is = p.is ?? 1e-6;
          nf = p.n ?? 1.05;
        } else if (comp.type === 'led') {
          const ledP = getLedShockleyParams(p);
          is = ledP.is;
          nf = ledP.n;
        }
        const nVt = Math.max(nf, 0.1) * VT;
        const vCrit = diodeVCrit(is, nf, VT);
        const vdLim = pnjlim(vdRaw, vdOld, nVt, vCrit);
        if (Math.abs(vdLim - vdRaw) > 1e-7) junctionLimited = true;
        diodeVd.set(comp.id, vdLim);
      } else if (comp.type === 'zener') {
        const vdOld = diodeVd.get(comp.id) ?? 0;
        const vdRaw =
          getNodeV(xNext, pins.anode ?? 0) - getNodeV(xNext, pins.cathode ?? 0);
        const is = p.is ?? 1e-12;
        const nf = p.n ?? 1.0;
        const bv = Math.max(Math.abs(p.bv ?? 5.1), 0.1);
        const nVt = Math.max(nf, 0.1) * VT;

        let vdLim = vdRaw;
        if (vdRaw > 0) {
          const vCritFwd = diodeVCrit(is, nf, VT);
          vdLim = pnjlim(vdRaw, vdOld, nVt, vCritFwd);
        } else if (vdRaw < -bv) {
          const vrRaw = -(vdRaw + bv);
          const vrOld = -(vdOld + bv);
          const vCritRev = diodeVCrit(ZENER_IBV, 1.0, VT);
          const vrLim = pnjlim(vrRaw, vrOld, VT, vCritRev);
          vdLim = -(vrLim + bv);
        }
        if (Math.abs(vdLim - vdRaw) > 1e-7) junctionLimited = true;
        diodeVd.set(comp.id, vdLim);
      } else if (comp.type === 'bjt_npn') {
        const vbeOld = bjtVbe.get(comp.id) ?? 0;
        const vbcOld = bjtVbc.get(comp.id) ?? 0;
        const vb = getNodeV(xNext, pins.base ?? 0);
        const vc = getNodeV(xNext, pins.collector ?? 0);
        const ve = getNodeV(xNext, pins.emitter ?? 0);
        const vCrit = diodeVCrit(p.is ?? 1e-14, 1.0, VT);

        const vbeRaw = vb - ve;
        const vbcRaw = vb - vc;
        const vbeLim = pnjlim(vbeRaw, vbeOld, VT, vCrit);
        const vbcLim = pnjlim(vbcRaw, vbcOld, VT, vCrit);
        if (
          Math.abs(vbeLim - vbeRaw) > 1e-7 ||
          Math.abs(vbcLim - vbcRaw) > 1e-7
        ) {
          junctionLimited = true;
        }
        bjtVbe.set(comp.id, vbeLim);
        bjtVbc.set(comp.id, vbcLim);
      } else if (comp.type === 'bjt_pnp') {
        const vebOld = -(bjtVbe.get(comp.id) ?? 0);
        const vcbOld = -(bjtVbc.get(comp.id) ?? 0);
        const vb = getNodeV(xNext, pins.base ?? 0);
        const vc = getNodeV(xNext, pins.collector ?? 0);
        const ve = getNodeV(xNext, pins.emitter ?? 0);
        const vCrit = diodeVCrit(p.is ?? 1e-14, 1.0, VT);

        const vebRaw = ve - vb;
        const vcbRaw = vc - vb;
        const vebLim = pnjlim(vebRaw, vebOld, VT, vCrit);
        const vcbLim = pnjlim(vcbRaw, vcbOld, VT, vCrit);
        if (
          Math.abs(vebLim - vebRaw) > 1e-7 ||
          Math.abs(vcbLim - vcbRaw) > 1e-7
        ) {
          junctionLimited = true;
        }
        bjtVbe.set(comp.id, -vebLim);
        bjtVbc.set(comp.id, -vcbLim);
      }
    }

    // Check convergence (abstol + reltol)
    let converged = !junctionLimited;
    if (converged) {
      for (let i = 0; i < n; i++) {
        const abstol = i < layout.numNodes ? 1e-6 : 1e-9;
        const reltol = 1e-4;
        const tol = abstol + reltol * Math.max(Math.abs(x[i]), Math.abs(xNext[i]));
        if (Math.abs(xNext[i] - x[i]) > tol) {
          converged = false;
          break;
        }
      }
    }

    x = xNext;
    if (converged) {
      return { converged: true, iterations: iter + 1, x };
    }
  }

  return { converged: false, iterations: maxLinearIters, x };
}

/**
 * Robust nonlinear DC/Transient solver with automatic fallback to
 * Gmin stepping and Source stepping if direct Newton-Raphson fails.
 */
function solveWithContinuation(
  schematic: CircuitSchematic,
  compiled: CompiledNetlist,
  layout: MNALayout,
  xInit: number[],
  baseOpts: Omit<SolveStepOptions, 'gmin' | 'sourceScale'>
): NRResult {
  const direct = solveNewtonRaphson(schematic, compiled, layout, xInit, {
    ...baseOpts,
    gmin: GMIN,
    sourceScale: 1.0,
  });
  if (direct.converged) return direct;

  let totalIters = direct.iterations;

  // Gmin stepping: 1e-4 -> 1e-6 -> 1e-8 -> 1e-10 -> 1e-12
  const gminSchedule = [1e-4, 1e-6, 1e-8, 1e-10, 1e-12];
  let xCurr = xInit.slice();
  let gminOk = true;
  for (const gmin of gminSchedule) {
    const res = solveNewtonRaphson(schematic, compiled, layout, xCurr, {
      ...baseOpts,
      gmin,
      sourceScale: 1.0,
    });
    totalIters += res.iterations;
    if (!res.converged) {
      gminOk = false;
      break;
    }
    xCurr = res.x;
  }
  if (gminOk) {
    return { converged: true, iterations: totalIters, x: xCurr };
  }

  // Source stepping: 0.05 -> 1.0
  const sourceSchedule = [0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 1.0];
  xCurr = new Array<number>(layout.size).fill(0);
  let srcOk = true;
  for (const scale of sourceSchedule) {
    const res = solveNewtonRaphson(schematic, compiled, layout, xCurr, {
      ...baseOpts,
      gmin: 1e-10,
      sourceScale: scale,
    });
    totalIters += res.iterations;
    if (!res.converged) {
      srcOk = false;
      break;
    }
    xCurr = res.x;
  }
  if (srcOk) {
    const polish = solveNewtonRaphson(schematic, compiled, layout, xCurr, {
      ...baseOpts,
      gmin: GMIN,
      sourceScale: 1.0,
    });
    totalIters += polish.iterations;
    if (polish.converged) {
      return { converged: true, iterations: totalIters, x: polish.x };
    }
  }

  // Combined Gmin + Source stepping
  xCurr = new Array<number>(layout.size).fill(0);
  let combinedOk = true;
  for (const scale of sourceSchedule) {
    const res = solveNewtonRaphson(schematic, compiled, layout, xCurr, {
      ...baseOpts,
      gmin: 1e-5,
      sourceScale: scale,
    });
    totalIters += res.iterations;
    if (!res.converged) {
      combinedOk = false;
      break;
    }
    xCurr = res.x;
  }
  if (combinedOk) {
    for (const gmin of [1e-7, 1e-9, 1e-11, GMIN]) {
      const res = solveNewtonRaphson(schematic, compiled, layout, xCurr, {
        ...baseOpts,
        gmin,
        sourceScale: 1.0,
      });
      totalIters += res.iterations;
      if (!res.converged) {
        return { converged: false, iterations: totalIters, x: res.x };
      }
      xCurr = res.x;
    }
    return { converged: true, iterations: totalIters, x: xCurr };
  }

  return { converged: false, iterations: totalIters, x: direct.x };
}

/**
 * Compute branch currents, power dissipation, and fuse overload warnings for all components.
 */
function extractBranchCurrentsAndPower(
  schematic: CircuitSchematic,
  compiled: CompiledNetlist,
  layout: MNALayout,
  x: number[],
  mode: 'dc' | 'transient',
  time: number,
  overrides?: Record<string, number>,
  capCurrents?: Map<string, number>
): {
  branchCurrents: Record<string, number>;
  componentPower: Record<string, number>;
  fuseWarnings: string[];
} {
  const branchCurrents: Record<string, number> = {};
  const componentPower: Record<string, number> = {};
  const fuseWarnings: string[] = [];

  for (const comp of schematic.components) {
    const pins = compiled.componentNodes[comp.id] ?? {};
    const p = comp.params;

    switch (comp.type) {
      case 'ground':
        break;

      case 'resistor': {
        const v = getNodeV(x, pins.p1 ?? 0) - getNodeV(x, pins.p2 ?? 0);
        const r = Math.max(p.resistance ?? 1000, 1e-12);
        const i = v / r;
        branchCurrents[comp.name] = i;
        componentPower[comp.name] = v * i;
        break;
      }

      case 'potentiometer': {
        const r = Math.max(p.resistance ?? 10000, 1e-12);
        const pos = Math.min(Math.max(p.wiperPos ?? 0.5, 0.001), 0.999);
        const v1 = getNodeV(x, pins.p1 ?? 0) - getNodeV(x, pins.wiper ?? 0);
        const v2 = getNodeV(x, pins.wiper ?? 0) - getNodeV(x, pins.p2 ?? 0);
        const i1 = v1 / (r * pos);
        const i2 = v2 / (r * (1 - pos));
        branchCurrents[comp.name] = i1;
        componentPower[comp.name] = v1 * i1 + v2 * i2;
        break;
      }

      case 'fuse': {
        const v = getNodeV(x, pins.p1 ?? 0) - getNodeV(x, pins.p2 ?? 0);
        const r = Math.max(p.rOn ?? 0.05, 1e-12);
        const i = v / r;
        branchCurrents[comp.name] = i;
        componentPower[comp.name] = v * i;
        const rating = p.fuseRating ?? 1.0;
        if (Math.abs(i) > rating) {
          fuseWarnings.push(`Fuse ${comp.name} exceeded rating (${rating}A)!`);
        }
        break;
      }

      case 'lamp': {
        const v = getNodeV(x, pins.p1 ?? 0) - getNodeV(x, pins.p2 ?? 0);
        const r = Math.max(p.resistance ?? 100, 1e-12);
        const i = v / r;
        branchCurrents[comp.name] = i;
        componentPower[comp.name] = v * i;
        break;
      }

      case 'capacitor': {
        const v = getNodeV(x, pins.p1 ?? 0) - getNodeV(x, pins.p2 ?? 0);
        const i = capCurrents?.get(comp.id) ?? 0;
        branchCurrents[comp.name] = i;
        componentPower[comp.name] = v * i;
        break;
      }

      case 'inductor': {
        const v = getNodeV(x, pins.p1 ?? 0) - getNodeV(x, pins.p2 ?? 0);
        const br = layout.branchIndex.get(comp.id)!;
        const i = x[br] ?? 0;
        branchCurrents[comp.name] = i;
        componentPower[comp.name] = v * i;
        break;
      }

      case 'transformer': {
        const br = layout.branchIndex.get(comp.id)!;
        const iSec = -(x[br] ?? 0); // Current sourced out of s1
        branchCurrents[comp.name] = iSec;
        componentPower[comp.name] = TRANSFORMER_R_STAB * iSec * iSec;
        break;
      }

      case 'vdc':
      case 'vac':
      case 'vpulse': {
        const v = getNodeV(x, pins.pos ?? 0) - getNodeV(x, pins.neg ?? 0);
        const br = layout.branchIndex.get(comp.id)!;
        const i = x[br] ?? 0;
        branchCurrents[comp.name] = i;
        componentPower[comp.name] = v * i;
        break;
      }

      case 'idc':
      case 'iac': {
        const v = getNodeV(x, pins.pos ?? 0) - getNodeV(x, pins.neg ?? 0);
        const i = getSourceValue(comp, mode, time, overrides);
        branchCurrents[comp.name] = i;
        componentPower[comp.name] = -v * i;
        break;
      }

      case 'vcvs': {
        const vOut = getNodeV(x, pins.out_pos ?? 0) - getNodeV(x, pins.out_neg ?? 0);
        const br = layout.branchIndex.get(comp.id)!;
        const iOut = -(x[br] ?? 0);
        branchCurrents[comp.name] = iOut;
        componentPower[comp.name] = Math.abs(vOut * iOut);
        break;
      }

      case 'vccs': {
        const vCtrl = getNodeV(x, pins.ctrl_pos ?? 0) - getNodeV(x, pins.ctrl_neg ?? 0);
        const vOut = getNodeV(x, pins.out_pos ?? 0) - getNodeV(x, pins.out_neg ?? 0);
        const i = (p.gm ?? 1e-3) * vCtrl;
        branchCurrents[comp.name] = i;
        componentPower[comp.name] = vOut * i;
        break;
      }

      case 'diode': {
        const vd = getNodeV(x, pins.anode ?? 0) - getNodeV(x, pins.cathode ?? 0);
        const { id } = evalDiode(vd, p.is ?? 1e-12, p.n ?? 1.0, GMIN);
        branchCurrents[comp.name] = id;
        componentPower[comp.name] = vd * id;
        break;
      }

      case 'schottky': {
        const vd = getNodeV(x, pins.anode ?? 0) - getNodeV(x, pins.cathode ?? 0);
        const { id } = evalDiode(vd, p.is ?? 1e-6, p.n ?? 1.05, GMIN);
        branchCurrents[comp.name] = id;
        componentPower[comp.name] = vd * id;
        break;
      }

      case 'led': {
        const vd = getNodeV(x, pins.anode ?? 0) - getNodeV(x, pins.cathode ?? 0);
        const { is, n: nLed } = getLedShockleyParams(p);
        const { id } = evalDiode(vd, is, nLed, GMIN);
        branchCurrents[comp.name] = id;
        componentPower[comp.name] = vd * id;
        break;
      }

      case 'zener': {
        const vd = getNodeV(x, pins.anode ?? 0) - getNodeV(x, pins.cathode ?? 0);
        const { id } = evalZener(
          vd,
          p.is ?? 1e-12,
          p.n ?? 1.0,
          p.bv ?? 5.1,
          GMIN
        );
        branchCurrents[comp.name] = id;
        componentPower[comp.name] = vd * id;
        break;
      }

      case 'bjt_npn': {
        const vb = getNodeV(x, pins.base ?? 0);
        const vc = getNodeV(x, pins.collector ?? 0);
        const ve = getNodeV(x, pins.emitter ?? 0);
        const npn = evalNPN(
          vb - ve,
          vb - vc,
          p.is ?? 1e-14,
          p.bf ?? 150,
          p.br ?? 1,
          GMIN
        );
        branchCurrents[comp.name] = npn.ic;
        componentPower[comp.name] = (vc - ve) * npn.ic + (vb - ve) * npn.ib;
        break;
      }

      case 'bjt_pnp': {
        const vb = getNodeV(x, pins.base ?? 0);
        const vc = getNodeV(x, pins.collector ?? 0);
        const ve = getNodeV(x, pins.emitter ?? 0);
        const pnp = evalPNP(
          vb - ve,
          vb - vc,
          p.is ?? 1e-14,
          p.bf ?? 120,
          p.br ?? 1,
          GMIN
        );
        branchCurrents[comp.name] = pnp.ic;
        componentPower[comp.name] = (vc - ve) * pnp.ic + (vb - ve) * pnp.ib;
        break;
      }

      case 'nmos': {
        const vg = getNodeV(x, pins.gate ?? 0);
        const vd = getNodeV(x, pins.drain ?? 0);
        const vs = getNodeV(x, pins.source ?? 0);
        const mos = evalNMOS(
          vg - vs,
          vd - vs,
          p.vth ?? 1.5,
          p.kp ?? 0.02,
          p.lambda ?? 0.02,
          GMIN
        );
        const id = mos.reversed ? -mos.id : mos.id;
        branchCurrents[comp.name] = id;
        componentPower[comp.name] = (vd - vs) * id;
        break;
      }

      case 'pmos': {
        const vg = getNodeV(x, pins.gate ?? 0);
        const vd = getNodeV(x, pins.drain ?? 0);
        const vs = getNodeV(x, pins.source ?? 0);
        const mos = evalPMOS(
          vs - vg,
          vs - vd,
          p.vth ?? -1.5,
          p.kp ?? 0.02,
          p.lambda ?? 0.02,
          GMIN
        );
        const isd = mos.reversed ? -mos.id : mos.id;
        branchCurrents[comp.name] = isd;
        componentPower[comp.name] = (vs - vd) * isd;
        break;
      }

      case 'opamp': {
        const vOut = getNodeV(x, pins.out ?? 0);
        const br = layout.branchIndex.get(comp.id)!;
        const iOut = -(x[br] ?? 0);
        branchCurrents[comp.name] = iOut;
        componentPower[comp.name] = Math.abs(vOut * iOut);
        break;
      }

      case 'vswitch': {
        const vCtrl = getNodeV(x, pins.ctrl_pos ?? 0) - getNodeV(x, pins.ctrl_neg ?? 0);
        const vSw = getNodeV(x, pins.p1 ?? 0) - getNodeV(x, pins.p2 ?? 0);
        const sw = evalVSwitch(
          vCtrl,
          vSw,
          p.vThreshold ?? 2.5,
          p.rOn ?? 0.1,
          p.rOff ?? 1e7
        );
        branchCurrents[comp.name] = sw.iSw;
        componentPower[comp.name] = vSw * sw.iSw;
        break;
      }
    }
  }

  return { branchCurrents, componentPower, fuseWarnings };
}

interface InternalDCOP {
  result: DCOPResult;
  x: number[];
  layout: MNALayout;
  compiled: CompiledNetlist;
}

function solveDCOPInternal(
  schematic: CircuitSchematic,
  compiled?: CompiledNetlist,
  overrides?: Record<string, number>,
  xInit?: number[],
  mode: 'dc' | 'transient' = 'dc',
  time = 0
): InternalDCOP {
  const net = compiled ?? compileNetlist(schematic);
  const layout = buildMNALayout(schematic, net);
  const warnings = [...net.warnings];

  const init =
    xInit && xInit.length === layout.size
      ? xInit
      : new Array<number>(layout.size).fill(0);

  const nr = solveWithContinuation(schematic, net, layout, init, {
    mode,
    time,
    overrides,
  });

  if (!nr.converged) {
    warnings.push(
      `DC operating point did not fully converge after ${nr.iterations} iterations.`
    );
  }

  const nodeVoltages: Record<number, number> = { 0: 0 };
  const nodeNames: Record<number, string> = {};
  for (const node of net.nodes) {
    nodeNames[node.id] = node.name;
    nodeVoltages[node.id] = node.id === 0 ? 0 : nr.x[node.id - 1] ?? 0;
  }

  const probeVoltages: Record<string, number> = {};
  for (const [label, nodeId] of Object.entries(net.probeNodes)) {
    probeVoltages[label] = nodeVoltages[nodeId] ?? 0;
  }

  const { branchCurrents, componentPower, fuseWarnings } =
    extractBranchCurrentsAndPower(
      schematic,
      net,
      layout,
      nr.x,
      mode,
      time,
      overrides
    );
  warnings.push(...fuseWarnings);

  return {
    result: {
      type: 'dc_op',
      converged: nr.converged,
      iterations: nr.iterations,
      nodeVoltages,
      nodeNames,
      branchCurrents,
      componentPower,
      probeVoltages,
      warnings,
    },
    x: nr.x,
    layout,
    compiled: net,
  };
}

/**
 * Solve the DC Operating Point of a schematic.
 */
export function solveDCOP(
  schematic: CircuitSchematic,
  compiled?: CompiledNetlist,
  overrides?: Record<string, number>
): DCOPResult {
  return solveDCOPInternal(schematic, compiled, overrides).result;
}

/**
 * Perform a DC parametric sweep over a named independent voltage or current source,
 * warm-starting each sweep point from the previous solution.
 */
export function solveDCSweep(
  schematic: CircuitSchematic,
  config: DCSweepConfig
): DCSweepResult {
  const compiled = compileNetlist(schematic);
  const warnings = [...compiled.warnings];

  const isSweepable = (c: CircuitComponent) =>
    c.type === 'vdc' ||
    c.type === 'vac' ||
    c.type === 'vpulse' ||
    c.type === 'idc' ||
    c.type === 'iac';

  const targetSource = schematic.components.find(
    (c) => c.name === config.sourceName && isSweepable(c)
  );

  const sourceName =
    targetSource?.name ??
    schematic.components.find(isSweepable)?.name ??
    config.sourceName;

  if (!targetSource && sourceName !== config.sourceName) {
    warnings.push(
      `DC sweep source "${config.sourceName}" not found; sweeping "${sourceName}" instead.`
    );
  }

  const start = config.startValue;
  const stop = config.stopValue;
  let step = Math.abs(config.stepValue);
  if (!Number.isFinite(step) || step <= 0) {
    step = Math.max(Math.abs(stop - start) / 100, 1e-3);
    warnings.push('Invalid DC sweep step size; auto-selected 100 points.');
  }

  const dir = stop >= start ? 1 : -1;
  const span = Math.abs(stop - start);
  let numSteps = Math.floor(span / step + 1e-9);
  if (numSteps > MAX_SWEEP_POINTS) {
    numSteps = MAX_SWEEP_POINTS;
    step = span / numSteps;
    warnings.push(`DC sweep capped at ${MAX_SWEEP_POINTS} points.`);
  }

  const sweepValues: number[] = [];
  for (let i = 0; i <= numSteps; i++) {
    const val = i === numSteps ? stop : start + dir * i * step;
    sweepValues.push(val);
  }
  if (sweepValues.length === 0) {
    sweepValues.push(start);
  }

  const probeVoltages: Record<string, number[]> = {};
  for (const label of Object.keys(compiled.probeNodes)) {
    probeVoltages[label] = [];
  }
  const branchCurrents: Record<string, number[]> = {};
  for (const comp of schematic.components) {
    if (comp.type !== 'ground') {
      branchCurrents[comp.name] = [];
    }
  }

  let xPrev: number[] | undefined;
  let failedPoints = 0;

  for (const val of sweepValues) {
    const overrides: Record<string, number> = { [sourceName]: val };
    const solved = solveDCOPInternal(schematic, compiled, overrides, xPrev);
    if (solved.result.converged) {
      xPrev = solved.x;
    } else {
      failedPoints++;
    }

    for (const label of Object.keys(probeVoltages)) {
      probeVoltages[label].push(solved.result.probeVoltages[label] ?? 0);
    }
    for (const compName of Object.keys(branchCurrents)) {
      branchCurrents[compName].push(solved.result.branchCurrents[compName] ?? 0);
    }
  }

  if (failedPoints > 0) {
    warnings.push(
      `${failedPoints} of ${sweepValues.length} DC sweep points had convergence warnings.`
    );
  }

  return {
    type: 'dc_sweep',
    sourceName,
    sweepValues,
    probeVoltages,
    branchCurrents,
    warnings,
  };
}

/**
 * Perform AC Small-Signal Frequency Sweep by linearizing all nonlinear devices
 * around the DC Operating Point and solving complex MNA across log-spaced frequencies.
 */
export function solveAC(
  schematic: CircuitSchematic,
  config: ACConfig
): ACResult {
  const dcOp = solveDCOPInternal(schematic);
  const { compiled, layout, x: xDC } = dcOp;
  const warnings = [...dcOp.result.warnings];

  // Determine AC excitation magnitudes/phases (voltage or current sources)
  const acExcitation = new Map<string, Complex>();
  const acSources = schematic.components.filter(
    (c) =>
      c.type === 'vac' ||
      c.type === 'vpulse' ||
      c.type === 'vdc' ||
      c.type === 'iac'
  );

  if (config.inputSourceName) {
    const chosen = acSources.find((c) => c.name === config.inputSourceName);
    if (chosen) {
      const defaultMag = chosen.type === 'iac' ? 1e-3 : 1;
      const mag =
        chosen.params.acMag && chosen.params.acMag > 0
          ? chosen.params.acMag
          : defaultMag;
      const phaseRad = ((chosen.params.phase ?? 0) * Math.PI) / 180;
      acExcitation.set(chosen.id, {
        re: mag * Math.cos(phaseRad),
        im: mag * Math.sin(phaseRad),
      });
    }
  }

  if (acExcitation.size === 0) {
    for (const src of acSources) {
      if (src.params.acMag && src.params.acMag > 0) {
        const mag = src.params.acMag;
        const phaseRad = ((src.params.phase ?? 0) * Math.PI) / 180;
        acExcitation.set(src.id, {
          re: mag * Math.cos(phaseRad),
          im: mag * Math.sin(phaseRad),
        });
      }
    }
  }

  // Fallback: assign acMag = 1 to first vac, else iac, else vpulse, else vdc
  if (acExcitation.size === 0) {
    const fallback =
      acSources.find((c) => c.type === 'vac') ??
      acSources.find((c) => c.type === 'iac') ??
      acSources.find((c) => c.type === 'vpulse') ??
      acSources.find((c) => c.type === 'vdc');
    if (fallback) {
      const mag = fallback.type === 'iac' ? 1e-3 : 1;
      acExcitation.set(fallback.id, { re: mag, im: 0 });
    } else {
      warnings.push('No AC/DC source found for AC small-signal excitation.');
    }
  }

  // Precompute linearized small-signal parameters at DC OP
  const diodeGd = new Map<string, number>();
  const bjtLin = new Map<
    string,
    { gbe: number; gbc: number; gmf: number; gmr: number }
  >();
  const mosLin = new Map<
    string,
    { gm: number; gds: number; reversed: boolean }
  >();
  const opampAEff = new Map<string, number>();
  const switchLin = new Map<string, { g: number; gmCtrl: number }>();

  for (const comp of schematic.components) {
    const pins = compiled.componentNodes[comp.id] ?? {};
    const p = comp.params;

    if (comp.type === 'diode') {
      const vd = getNodeV(xDC, pins.anode ?? 0) - getNodeV(xDC, pins.cathode ?? 0);
      diodeGd.set(comp.id, evalDiode(vd, p.is ?? 1e-12, p.n ?? 1.0, GMIN).gd);
    } else if (comp.type === 'schottky') {
      const vd = getNodeV(xDC, pins.anode ?? 0) - getNodeV(xDC, pins.cathode ?? 0);
      diodeGd.set(comp.id, evalDiode(vd, p.is ?? 1e-6, p.n ?? 1.05, GMIN).gd);
    } else if (comp.type === 'led') {
      const vd = getNodeV(xDC, pins.anode ?? 0) - getNodeV(xDC, pins.cathode ?? 0);
      const { is, n: nLed } = getLedShockleyParams(p);
      diodeGd.set(comp.id, evalDiode(vd, is, nLed, GMIN).gd);
    } else if (comp.type === 'zener') {
      const vd = getNodeV(xDC, pins.anode ?? 0) - getNodeV(xDC, pins.cathode ?? 0);
      diodeGd.set(
        comp.id,
        evalZener(vd, p.is ?? 1e-12, p.n ?? 1.0, p.bv ?? 5.1, GMIN).gd
      );
    } else if (comp.type === 'bjt_npn' || comp.type === 'bjt_pnp') {
      const vb = getNodeV(xDC, pins.base ?? 0);
      const vc = getNodeV(xDC, pins.collector ?? 0);
      const ve = getNodeV(xDC, pins.emitter ?? 0);
      const bjt =
        comp.type === 'bjt_npn'
          ? evalNPN(vb - ve, vb - vc, p.is ?? 1e-14, p.bf ?? 150, p.br ?? 1, GMIN)
          : evalPNP(vb - ve, vb - vc, p.is ?? 1e-14, p.bf ?? 120, p.br ?? 1, GMIN);
      bjtLin.set(comp.id, {
        gbe: bjt.gbe,
        gbc: bjt.gbc,
        gmf: bjt.gmf,
        gmr: bjt.gmr,
      });
    } else if (comp.type === 'nmos') {
      const vg = getNodeV(xDC, pins.gate ?? 0);
      const vd = getNodeV(xDC, pins.drain ?? 0);
      const vs = getNodeV(xDC, pins.source ?? 0);
      const mos = evalNMOS(
        vg - vs,
        vd - vs,
        p.vth ?? 1.5,
        p.kp ?? 0.02,
        p.lambda ?? 0.02,
        GMIN
      );
      mosLin.set(comp.id, { gm: mos.gm, gds: mos.gds, reversed: mos.reversed });
    } else if (comp.type === 'pmos') {
      const vg = getNodeV(xDC, pins.gate ?? 0);
      const vd = getNodeV(xDC, pins.drain ?? 0);
      const vs = getNodeV(xDC, pins.source ?? 0);
      const mos = evalPMOS(
        vs - vg,
        vs - vd,
        p.vth ?? -1.5,
        p.kp ?? 0.02,
        p.lambda ?? 0.02,
        GMIN
      );
      mosLin.set(comp.id, { gm: mos.gm, gds: mos.gds, reversed: mos.reversed });
    } else if (comp.type === 'opamp') {
      const vDiff =
        getNodeV(xDC, pins.in_pos ?? 0) - getNodeV(xDC, pins.in_neg ?? 0);
      const { aEff } = evalOpAmp(
        vDiff,
        p.gain ?? 1e5,
        p.vSatPos ?? 15,
        p.vSatNeg ?? -15
      );
      opampAEff.set(comp.id, aEff);
    } else if (comp.type === 'vswitch') {
      const vCtrl =
        getNodeV(xDC, pins.ctrl_pos ?? 0) - getNodeV(xDC, pins.ctrl_neg ?? 0);
      const vSw = getNodeV(xDC, pins.p1 ?? 0) - getNodeV(xDC, pins.p2 ?? 0);
      const sw = evalVSwitch(
        vCtrl,
        vSw,
        p.vThreshold ?? 2.5,
        p.rOn ?? 0.1,
        p.rOff ?? 1e7
      );
      switchLin.set(comp.id, { g: sw.g, gmCtrl: sw.gmCtrl });
    }
  }

  // Generate logarithmically spaced frequencies
  const startFreq = Math.max(config.startFreq, 1e-3);
  const stopFreq = Math.max(config.stopFreq, startFreq * 1.01);
  const ppd = Math.max(config.pointsPerDecade, 2);
  const decades = Math.log10(stopFreq / startFreq);
  const numPoints = Math.min(Math.max(2, Math.round(decades * ppd) + 1), 2000);

  const frequencies: number[] = new Array(numPoints);
  const ratio = stopFreq / startFreq;
  for (let i = 0; i < numPoints; i++) {
    frequencies[i] = startFreq * Math.pow(ratio, i / (numPoints - 1));
  }

  const magnitudeDb: Record<string, number[]> = {};
  const magnitudeLinear: Record<string, number[]> = {};
  const phaseDeg: Record<string, number[]> = {};
  for (const label of Object.keys(compiled.probeNodes)) {
    magnitudeDb[label] = [];
    magnitudeLinear[label] = [];
    phaseDeg[label] = [];
  }

  const nodeMagnitudeDb: Record<number, number[]> = {};
  const nodePhaseDeg: Record<number, number[]> = {};
  for (const node of compiled.nodes) {
    nodeMagnitudeDb[node.id] = [];
    nodePhaseDeg[node.id] = [];
  }

  const n = layout.size;

  for (const freq of frequencies) {
    const omega = 2 * Math.PI * freq;

    const A: Complex[][] = new Array(n);
    const b: Complex[] = new Array(n);
    for (let i = 0; i < n; i++) {
      A[i] = new Array<Complex>(n);
      for (let j = 0; j < n; j++) {
        A[i][j] = { re: 0, im: 0 };
      }
      b[i] = { re: 0, im: 0 };
    }

    const addRe = (r: number, c: number, val: number) => {
      if (r > 0 && c > 0) A[r - 1][c - 1].re += val;
    };
    const stampReG = (n1: number, n2: number, g: number) => {
      if (n1 > 0) A[n1 - 1][n1 - 1].re += g;
      if (n2 > 0) A[n2 - 1][n2 - 1].re += g;
      if (n1 > 0 && n2 > 0) {
        A[n1 - 1][n2 - 1].re -= g;
        A[n2 - 1][n1 - 1].re -= g;
      }
    };
    const stampReVCCS = (
      outPos: number,
      outNeg: number,
      ctrlPos: number,
      ctrlNeg: number,
      gm: number
    ) => {
      addRe(outPos, ctrlPos, gm);
      addRe(outPos, ctrlNeg, -gm);
      addRe(outNeg, ctrlPos, -gm);
      addRe(outNeg, ctrlNeg, gm);
    };
    const stampImB = (n1: number, n2: number, sus: number) => {
      if (n1 > 0) A[n1 - 1][n1 - 1].im += sus;
      if (n2 > 0) A[n2 - 1][n2 - 1].im += sus;
      if (n1 > 0 && n2 > 0) {
        A[n1 - 1][n2 - 1].im -= sus;
        A[n2 - 1][n1 - 1].im -= sus;
      }
    };

    for (let i = 0; i < layout.numNodes; i++) {
      A[i][i].re += GMIN;
    }

    for (const comp of schematic.components) {
      const pins = compiled.componentNodes[comp.id] ?? {};
      const p = comp.params;

      switch (comp.type) {
        case 'ground':
        case 'idc':
          break;

        case 'resistor': {
          const r = Math.max(p.resistance ?? 1000, 1e-12);
          stampReG(pins.p1 ?? 0, pins.p2 ?? 0, 1 / r);
          break;
        }

        case 'potentiometer': {
          const r = Math.max(p.resistance ?? 10000, 1e-12);
          const pos = Math.min(Math.max(p.wiperPos ?? 0.5, 0.001), 0.999);
          stampReG(pins.p1 ?? 0, pins.wiper ?? 0, 1 / (r * pos));
          stampReG(pins.wiper ?? 0, pins.p2 ?? 0, 1 / (r * (1 - pos)));
          break;
        }

        case 'fuse': {
          const r = Math.max(p.rOn ?? 0.05, 1e-12);
          stampReG(pins.p1 ?? 0, pins.p2 ?? 0, 1 / r);
          break;
        }

        case 'lamp': {
          const r = Math.max(p.resistance ?? 100, 1e-12);
          stampReG(pins.p1 ?? 0, pins.p2 ?? 0, 1 / r);
          break;
        }

        case 'capacitor': {
          const C = Math.max(p.capacitance ?? 1e-6, 0);
          stampImB(pins.p1 ?? 0, pins.p2 ?? 0, omega * C);
          break;
        }

        case 'inductor': {
          const n1 = pins.p1 ?? 0;
          const n2 = pins.p2 ?? 0;
          const br = layout.branchIndex.get(comp.id)!;
          const L = Math.max(p.inductance ?? 10e-3, 0);

          if (n1 > 0) {
            A[n1 - 1][br].re += 1;
            A[br][n1 - 1].re += 1;
          }
          if (n2 > 0) {
            A[n2 - 1][br].re -= 1;
            A[br][n2 - 1].re -= 1;
          }
          A[br][br].re -= INDUCTOR_R_SERIES;
          A[br][br].im -= omega * L;
          break;
        }

        case 'transformer': {
          const np1 = pins.p1 ?? 0;
          const np2 = pins.p2 ?? 0;
          const ns1 = pins.s1 ?? 0;
          const ns2 = pins.s2 ?? 0;
          const br = layout.branchIndex.get(comp.id)!;
          const trRatio = p.turnsRatio ?? 0.1;

          if (ns1 > 0) {
            A[ns1 - 1][br].re += 1;
            A[br][ns1 - 1].re += 1;
          }
          if (ns2 > 0) {
            A[ns2 - 1][br].re -= 1;
            A[br][ns2 - 1].re -= 1;
          }
          if (np1 > 0) {
            A[np1 - 1][br].re -= trRatio;
            A[br][np1 - 1].re -= trRatio;
          }
          if (np2 > 0) {
            A[np2 - 1][br].re += trRatio;
            A[br][np2 - 1].re += trRatio;
          }
          A[br][br].re -= TRANSFORMER_R_STAB;
          break;
        }

        case 'vdc':
        case 'vac':
        case 'vpulse': {
          const nPos = pins.pos ?? 0;
          const nNeg = pins.neg ?? 0;
          const br = layout.branchIndex.get(comp.id)!;

          if (nPos > 0) {
            A[nPos - 1][br].re += 1;
            A[br][nPos - 1].re += 1;
          }
          if (nNeg > 0) {
            A[nNeg - 1][br].re -= 1;
            A[br][nNeg - 1].re -= 1;
          }
          const exc = acExcitation.get(comp.id);
          if (exc) {
            b[br].re += exc.re;
            b[br].im += exc.im;
          }
          break;
        }

        case 'iac': {
          const exc = acExcitation.get(comp.id);
          if (exc) {
            const nPos = pins.pos ?? 0;
            const nNeg = pins.neg ?? 0;
            if (nPos > 0) {
              b[nPos - 1].re += exc.re;
              b[nPos - 1].im += exc.im;
            }
            if (nNeg > 0) {
              b[nNeg - 1].re -= exc.re;
              b[nNeg - 1].im -= exc.im;
            }
          }
          break;
        }

        case 'vcvs': {
          const nOutPos = pins.out_pos ?? 0;
          const nOutNeg = pins.out_neg ?? 0;
          const nCtrlPos = pins.ctrl_pos ?? 0;
          const nCtrlNeg = pins.ctrl_neg ?? 0;
          const br = layout.branchIndex.get(comp.id)!;
          const gain = p.gain ?? 2;

          if (nOutPos > 0) {
            A[nOutPos - 1][br].re += 1;
            A[br][nOutPos - 1].re += 1;
          }
          if (nOutNeg > 0) {
            A[nOutNeg - 1][br].re -= 1;
            A[br][nOutNeg - 1].re -= 1;
          }
          if (nCtrlPos > 0) A[br][nCtrlPos - 1].re -= gain;
          if (nCtrlNeg > 0) A[br][nCtrlNeg - 1].re += gain;
          break;
        }

        case 'vccs': {
          stampReVCCS(
            pins.out_pos ?? 0,
            pins.out_neg ?? 0,
            pins.ctrl_pos ?? 0,
            pins.ctrl_neg ?? 0,
            p.gm ?? 1e-3
          );
          break;
        }

        case 'diode':
        case 'schottky':
        case 'led':
        case 'zener': {
          const gd = diodeGd.get(comp.id) ?? GMIN;
          stampReG(pins.anode ?? 0, pins.cathode ?? 0, gd);
          break;
        }

        case 'bjt_npn':
        case 'bjt_pnp': {
          const nc = pins.collector ?? 0;
          const nb = pins.base ?? 0;
          const ne = pins.emitter ?? 0;
          const lin = bjtLin.get(comp.id);
          if (lin) {
            addRe(nc, nc, lin.gmr + lin.gbc);
            addRe(nc, nb, lin.gmf - lin.gmr - lin.gbc);
            addRe(nc, ne, -lin.gmf);

            addRe(nb, nc, -lin.gbc);
            addRe(nb, nb, lin.gbe + lin.gbc);
            addRe(nb, ne, -lin.gbe);

            addRe(ne, nc, -lin.gmr);
            addRe(ne, nb, lin.gmr - lin.gmf - lin.gbe);
            addRe(ne, ne, lin.gmf + lin.gbe);
          }
          break;
        }

        case 'nmos': {
          const ng = pins.gate ?? 0;
          const nd = pins.drain ?? 0;
          const ns = pins.source ?? 0;
          const lin = mosLin.get(comp.id);
          if (lin) {
            const dEff = lin.reversed ? ns : nd;
            const sEff = lin.reversed ? nd : ns;
            stampReVCCS(dEff, sEff, ng, sEff, lin.gm);
            stampReG(dEff, sEff, lin.gds);
          }
          break;
        }

        case 'pmos': {
          const ng = pins.gate ?? 0;
          const nd = pins.drain ?? 0;
          const ns = pins.source ?? 0;
          const lin = mosLin.get(comp.id);
          if (lin) {
            const sEff = lin.reversed ? nd : ns;
            const dEff = lin.reversed ? ns : nd;
            stampReVCCS(sEff, dEff, sEff, ng, lin.gm);
            stampReG(sEff, dEff, lin.gds);
          }
          break;
        }

        case 'opamp': {
          const nPos = pins.in_pos ?? 0;
          const nNeg = pins.in_neg ?? 0;
          const nOut = pins.out ?? 0;
          const br = layout.branchIndex.get(comp.id)!;
          const aEff = opampAEff.get(comp.id) ?? 0;

          if (nOut > 0) {
            A[nOut - 1][br].re += 1;
            A[br][nOut - 1].re += 1;
          }
          if (nPos > 0) A[br][nPos - 1].re -= aEff;
          if (nNeg > 0) A[br][nNeg - 1].re += aEff;
          break;
        }

        case 'vswitch': {
          const lin = switchLin.get(comp.id);
          if (lin) {
            stampReG(pins.p1 ?? 0, pins.p2 ?? 0, lin.g);
            stampReVCCS(
              pins.p1 ?? 0,
              pins.p2 ?? 0,
              pins.ctrl_pos ?? 0,
              pins.ctrl_neg ?? 0,
              lin.gmCtrl
            );
          }
          break;
        }
      }
    }

    const sol = solveComplexLinearSystem(A, b);
    const getComplexV = (nodeId: number): Complex => {
      if (nodeId <= 0 || !sol) return { re: 0, im: 0 };
      return sol[nodeId - 1] ?? { re: 0, im: 0 };
    };

    for (const node of compiled.nodes) {
      const v = getComplexV(node.id);
      const mag = cAbs(v);
      nodeMagnitudeDb[node.id].push(20 * Math.log10(Math.max(mag, 1e-15)));
      nodePhaseDeg[node.id].push(cArgDeg(v));
    }

    for (const [label, nodeId] of Object.entries(compiled.probeNodes)) {
      const v = getComplexV(nodeId);
      const mag = cAbs(v);
      magnitudeLinear[label].push(mag);
      magnitudeDb[label].push(20 * Math.log10(Math.max(mag, 1e-15)));
      phaseDeg[label].push(cArgDeg(v));
    }
  }

  return {
    type: 'ac',
    frequencies,
    magnitudeDb,
    magnitudeLinear,
    phaseDeg,
    nodeMagnitudeDb,
    nodePhaseDeg,
    warnings,
  };
}

/**
 * Perform Transient Time-Domain Simulation.
 * Initializes from DC OP at t = 0, then integrates forward using Backward Euler
 * on step 1 (to prevent trapezoidal ringing) and Trapezoidal (or Backward Euler)
 * on subsequent steps with Newton-Raphson per step.
 */
export function solveTransient(
  schematic: CircuitSchematic,
  config: TransientConfig
): TransientResult {
  const stopTime = Math.max(config.stopTime, 1e-12);
  let dt = Math.max(config.timeStep, 1e-12);
  const method = config.method ?? 'trapezoidal';

  let numSteps = Math.ceil(stopTime / dt);
  const extraWarnings: string[] = [];
  if (numSteps > MAX_TRANSIENT_STEPS) {
    numSteps = MAX_TRANSIENT_STEPS;
    dt = stopTime / numSteps;
    extraWarnings.push(
      `Time step adjusted to ${dt.toExponential(2)}s to stay within ${MAX_TRANSIENT_STEPS} simulation points.`
    );
  }

  const dcInit = solveDCOPInternal(
    schematic,
    undefined,
    undefined,
    undefined,
    'transient',
    0
  );
  const { compiled, layout } = dcInit;
  const warnings = [...dcInit.result.warnings, ...extraWarnings];

  let xCurr = dcInit.x.slice();
  let allConverged = dcInit.result.converged;

  const reactiveState: ReactiveState = {
    capV: new Map(),
    capI: new Map(),
    indV: new Map(),
    indI: new Map(),
  };

  for (const comp of schematic.components) {
    const pins = compiled.componentNodes[comp.id] ?? {};
    if (comp.type === 'capacitor') {
      const vDC = getNodeV(xCurr, pins.p1 ?? 0) - getNodeV(xCurr, pins.p2 ?? 0);
      const ic = comp.params.ic;
      const v0 = ic !== undefined && Number.isFinite(ic) && ic !== 0 ? ic : vDC;
      reactiveState.capV.set(comp.id, v0);
      reactiveState.capI.set(comp.id, 0);
    } else if (comp.type === 'inductor') {
      const br = layout.branchIndex.get(comp.id)!;
      const iDC = xCurr[br] ?? 0;
      const ic = comp.params.ic;
      const i0 = ic !== undefined && Number.isFinite(ic) && ic !== 0 ? ic : iDC;
      reactiveState.indI.set(comp.id, i0);
      reactiveState.indV.set(comp.id, 0);
    }
  }

  const times: number[] = [0];
  const nodeVoltages: Record<number, number[]> = {};
  for (const node of compiled.nodes) {
    nodeVoltages[node.id] = [node.id === 0 ? 0 : xCurr[node.id - 1] ?? 0];
  }
  const probeVoltages: Record<string, number[]> = {};
  for (const [label, nodeId] of Object.entries(compiled.probeNodes)) {
    probeVoltages[label] = [nodeId === 0 ? 0 : xCurr[nodeId - 1] ?? 0];
  }
  const branchCurrents: Record<string, number[]> = {};
  const initBranches = extractBranchCurrentsAndPower(
    schematic,
    compiled,
    layout,
    xCurr,
    'transient',
    0,
    undefined,
    reactiveState.capI
  ).branchCurrents;
  for (const comp of schematic.components) {
    if (comp.type !== 'ground') {
      branchCurrents[comp.name] = [initBranches[comp.name] ?? 0];
    }
  }

  let failedSteps = 0;

  for (let step = 1; step <= numSteps; step++) {
    const t = step === numSteps ? stopTime : step * dt;
    const stepMethod: 'backward_euler' | 'trapezoidal' =
      step === 1 || method === 'backward_euler'
        ? 'backward_euler'
        : 'trapezoidal';

    const nr = solveWithContinuation(schematic, compiled, layout, xCurr, {
      mode: 'transient',
      time: t,
      transient: {
        dt,
        method: stepMethod,
        state: reactiveState,
      },
    });

    if (!nr.converged) {
      allConverged = false;
      failedSteps++;
    }
    xCurr = nr.x;

    for (const comp of schematic.components) {
      const pins = compiled.componentNodes[comp.id] ?? {};
      if (comp.type === 'capacitor') {
        const C = Math.max(comp.params.capacitance ?? 1e-6, 0);
        const vNew =
          getNodeV(xCurr, pins.p1 ?? 0) - getNodeV(xCurr, pins.p2 ?? 0);
        const vPrev = reactiveState.capV.get(comp.id) ?? 0;
        const iPrev = reactiveState.capI.get(comp.id) ?? 0;
        const iNew =
          stepMethod === 'trapezoidal'
            ? ((2 * C) / dt) * (vNew - vPrev) - iPrev
            : (C / dt) * (vNew - vPrev);
        reactiveState.capV.set(comp.id, vNew);
        reactiveState.capI.set(comp.id, iNew);
      } else if (comp.type === 'inductor') {
        const br = layout.branchIndex.get(comp.id)!;
        const vNew =
          getNodeV(xCurr, pins.p1 ?? 0) - getNodeV(xCurr, pins.p2 ?? 0);
        const iNew = xCurr[br] ?? 0;
        reactiveState.indV.set(comp.id, vNew);
        reactiveState.indI.set(comp.id, iNew);
      }
    }

    times.push(t);
    for (const node of compiled.nodes) {
      nodeVoltages[node.id].push(node.id === 0 ? 0 : xCurr[node.id - 1] ?? 0);
    }
    for (const [label, nodeId] of Object.entries(compiled.probeNodes)) {
      probeVoltages[label].push(nodeId === 0 ? 0 : xCurr[nodeId - 1] ?? 0);
    }

    const stepBranches = extractBranchCurrentsAndPower(
      schematic,
      compiled,
      layout,
      xCurr,
      'transient',
      t,
      undefined,
      reactiveState.capI
    ).branchCurrents;
    for (const compName of Object.keys(branchCurrents)) {
      branchCurrents[compName].push(stepBranches[compName] ?? 0);
    }
  }

  if (failedSteps > 0) {
    warnings.push(
      `${failedSteps} of ${numSteps} transient time steps did not strictly meet Newton-Raphson tolerance.`
    );
  }

  return {
    type: 'transient',
    converged: allConverged,
    times,
    nodeVoltages,
    probeVoltages,
    branchCurrents,
    warnings,
  };
}

/**
 * Top-level simulation dispatcher.
 */
export function runSimulation(
  schematic: CircuitSchematic,
  config: AnalysisConfig
): SimulationResult {
  switch (config.type) {
    case 'dc_op':
      return solveDCOP(schematic);
    case 'dc_sweep':
      return solveDCSweep(schematic, config.dcSweep);
    case 'ac':
      return solveAC(schematic, config.ac);
    case 'transient':
      return solveTransient(schematic, config.transient);
  }
}
