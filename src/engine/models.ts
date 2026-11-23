/**
 * Semiconductor, Op-Amp, Switch, and Time-Domain Source Device Models for NeonSPICE.
 * Implements Shockley Diode, Zener Diode, Schottky Diode, Color-Adjusted LED,
 * Ebers-Moll NPN & PNP BJTs, Level-1 Shichman-Hodges NMOS & PMOS MOSFETs,
 * smooth tanh-saturating Op-Amp, smooth log-conductance VSwitch,
 * SPICE pnjlim junction voltage limiting, and DC/AC/Pulse waveform evaluation.
 */

import { CircuitComponent, ComponentParams } from '../types/circuit';

/** Thermal voltage kT/q at ~300 K (Volts) */
export const VT = 0.02585;

/** Default minimum shunt conductance for numerical regularization (Siemens) */
export const GMIN = 1e-12;

/** Standard SPICE Zener breakdown test current IBV (Amps) */
export const ZENER_IBV = 1e-3;

export interface DiodeEval {
  id: number;
  gd: number;
  ieq: number;
}

export interface NPNEval {
  ic: number;
  ib: number;
  ie: number;
  gbe: number;
  gbc: number;
  gmf: number;
  gmr: number;
  icEq: number;
  ibEq: number;
  ieEq: number;
}

export interface MosfetEval {
  id: number; // Drain-to-source current (NMOS) or Source-to-drain current (PMOS)
  gm: number;
  gds: number;
  iEq: number;
  reversed: boolean;
}

export interface OpAmpEval {
  vOut: number;
  aEff: number;
  vEq: number;
}

export interface VSwitchEval {
  iSw: number;
  g: number;
  gmCtrl: number;
  iEq: number;
}

/**
 * Evaluate the instantaneous voltage of an independent voltage source at time t (seconds).
 * Supports vdc, vac (sine wave with DC offset), and vpulse (periodic trapezoidal pulse).
 */
export function evalSourceVoltage(comp: CircuitComponent, t: number): number {
  const p = comp.params;
  switch (comp.type) {
    case 'vdc':
      return p.voltage ?? 5;

    case 'vac': {
      const vdc = p.voltage ?? 0;
      const amp = p.amplitude ?? 5;
      const freq = p.frequency ?? 1000;
      const phaseRad = ((p.phase ?? 0) * Math.PI) / 180;
      return vdc + amp * Math.sin(2 * Math.PI * freq * t + phaseRad);
    }

    case 'vpulse': {
      const vLow = p.vLow ?? 0;
      const vHigh = p.vHigh ?? 5;
      const delay = p.delay ?? 0;
      const tr = Math.max(p.riseTime ?? 1e-6, 1e-12);
      const tf = Math.max(p.fallTime ?? 1e-6, 1e-12);
      const pw = Math.max(p.pulseWidth ?? 0.5e-3, 0);
      const period = p.period ?? 1e-3;

      if (t <= delay) return vLow;

      let dt = t - delay;
      if (period > 0) {
        dt = dt % period;
        if (dt < 0) dt += period;
      }

      if (dt < tr) {
        return vLow + ((vHigh - vLow) * dt) / tr;
      }
      if (dt < tr + pw) {
        return vHigh;
      }
      if (dt < tr + pw + tf) {
        return vHigh - ((vHigh - vLow) * (dt - tr - pw)) / tf;
      }
      return vLow;
    }

    default:
      return 0;
  }
}

/**
 * Evaluate the instantaneous current of an independent current source at time t (seconds).
 * Supports idc and iac (sine wave with DC offset).
 */
export function evalSourceCurrent(comp: CircuitComponent, t: number): number {
  const p = comp.params;
  switch (comp.type) {
    case 'idc':
      return p.current ?? 1e-3;

    case 'iac': {
      const idc = p.current ?? 0;
      const amp = p.amplitude ?? 1e-3;
      const freq = p.frequency ?? 1000;
      const phaseRad = ((p.phase ?? 0) * Math.PI) / 180;
      return idc + amp * Math.sin(2 * Math.PI * freq * t + phaseRad);
    }

    default:
      return 0;
  }
}

/**
 * Resolve realistic (is, n) Shockley parameters for LED colors so forward drops
 * match industry specs at 10–20 mA:
 *   Red ~1.85V, Amber ~2.0V, Green ~2.2V, Blue/White ~3.0V.
 */
export function getLedShockleyParams(params: ComponentParams): {
  is: number;
  n: number;
} {
  const is = params.is ?? 1e-20;
  const color = params.ledColor ?? 'red';
  // If user kept the default n=1.8 (or omitted n), map ideality factor by LED color
  if (params.n === undefined || Math.abs(params.n - 1.8) < 1e-6) {
    switch (color) {
      case 'red':
        return { is, n: 1.72 };
      case 'amber':
        return { is, n: 1.85 };
      case 'green':
        return { is, n: 2.03 };
      case 'blue':
      case 'white':
        return { is, n: 2.77 };
    }
  }
  return { is, n: params.n };
}

/**
 * Critical voltage for SPICE pnjlim junction voltage limiting:
 * V_crit = n*V_T * ln(n*V_T / (sqrt(2) * I_s))
 */
export function diodeVCrit(is = 1e-12, n = 1.0, vt = VT): number {
  const nVt = Math.max(n, 0.1) * vt;
  const safeIs = Math.max(is, 1e-30);
  const ratio = nVt / (Math.SQRT2 * safeIs);
  return ratio > 1 ? nVt * Math.log(ratio) : 0.6;
}

/**
 * Classic SPICE3 DEVpnjlim algorithm to prevent exponential overflow and
 * Newton-Raphson divergence across forward-biased PN junctions.
 */
export function pnjlim(
  vNew: number,
  vOld: number,
  vt: number,
  vCrit: number
): number {
  if (!Number.isFinite(vNew)) return vOld;
  if (vNew > vCrit && Math.abs(vNew - vOld) > 2 * vt) {
    if (vOld > 0) {
      const arg = 1 + (vNew - vOld) / vt;
      if (arg > 0) {
        return vOld + vt * Math.log(arg);
      }
      return vCrit;
    } else {
      return vt * Math.log(Math.max(vNew / vt, 1));
    }
  }
  return vNew;
}

/**
 * Internal helper for evaluating a single exponential PN junction I = Is * (exp(v / nVt) - 1)
 * with C1-continuous linear extension above vMax to prevent floating-point overflow.
 */
function evalExponentialJunction(
  v: number,
  is: number,
  nVt: number,
  vMax: number
): { current: number; conductance: number } {
  if (v > vMax) {
    const expMax = Math.exp(vMax / nVt);
    const gMax = (is / nVt) * expMax;
    const iMax = is * (expMax - 1);
    return {
      current: iMax + gMax * (v - vMax),
      conductance: gMax,
    };
  }
  const arg = Math.max(v / nVt, -80);
  const expVal = Math.exp(arg);
  return {
    current: is * (expVal - 1),
    conductance: (is / nVt) * expVal,
  };
}

/**
 * Compute a safe, unified linear-extension threshold vMax so Is*exp(vMax/nVt) <= 100 A
 * and vMax/nVt <= 80. Works accurately across Schottky (Is=1uA), Silicon (1pA), and LEDs (1e-20A).
 */
function computeJunctionVMax(is: number, nVt: number): number {
  const safeIs = Math.max(is, 1e-30);
  const maxArg = Math.min(Math.max(Math.log(100 / safeIs), 5), 80);
  return maxArg * nVt;
}

/**
 * Shockley Diode model with C1 linear extension and GMIN shunt regularization.
 * Used for standard silicon diodes, Schottky diodes, and LEDs.
 */
export function evalDiode(
  vd: number,
  is = 1e-12,
  n = 1.0,
  gmin = GMIN
): DiodeEval {
  const safeIs = Math.max(is, 1e-30);
  const safeN = Math.max(n, 0.1);
  const nVt = safeN * VT;
  const vMax = computeJunctionVMax(safeIs, nVt);

  const { current, conductance } = evalExponentialJunction(vd, safeIs, nVt, vMax);
  const id = current + gmin * vd;
  const gd = conductance + gmin;
  const ieq = id - gd * vd;

  return { id, gd, ieq };
}

/**
 * Zener Diode model combining forward Shockley conduction with steep reverse breakdown
 * at -bv (calibrated with ZENER_IBV = 1mA at V_ka = bv) and C1 linear extensions in both directions.
 */
export function evalZener(
  vd: number,
  is = 1e-12,
  n = 1.0,
  bv = 5.1,
  gmin = GMIN
): DiodeEval {
  const safeIs = Math.max(is, 1e-30);
  const safeN = Math.max(n, 0.1);
  const safeBv = Math.max(Math.abs(bv), 0.1);
  const nVt = safeN * VT;

  const vMaxFwd = computeJunctionVMax(safeIs, nVt);
  const fwd = evalExponentialJunction(vd, safeIs, nVt, vMaxFwd);

  // Reverse breakdown: vr = -(vd + bv). At vd = -bv, vr = 0 and I_rev = ZENER_IBV.
  const vr = -(vd + safeBv);
  const vMaxRev = computeJunctionVMax(ZENER_IBV, VT);
  let revI = 0;
  let revG = 0;
  if (vr > vMaxRev) {
    const expMax = Math.exp(vMaxRev / VT);
    const gMax = (ZENER_IBV / VT) * expMax;
    revI = ZENER_IBV * expMax + gMax * (vr - vMaxRev);
    revG = gMax;
  } else {
    const arg = Math.max(vr / VT, -80);
    const expVal = Math.exp(arg);
    revI = ZENER_IBV * expVal;
    revG = (ZENER_IBV / VT) * expVal;
  }

  const id = fwd.current - revI + gmin * vd;
  const gd = fwd.conductance + revG + gmin;
  const ieq = id - gd * vd;

  return { id, gd, ieq };
}

/**
 * Ebers-Moll NPN BJT model (transport formulation) with safe exponential clamping.
 * Terminal currents (ic, ib, ie) follow the convention of current entering each terminal,
 * strictly satisfying KCL: ic + ib + ie = 0.
 */
export function evalNPN(
  vbe: number,
  vbc: number,
  is = 1e-14,
  bf = 150,
  br = 1,
  gmin = GMIN
): NPNEval {
  const safeIs = Math.max(is, 1e-30);
  const safeBf = Math.max(bf, 0.1);
  const safeBr = Math.max(br, 0.05);
  const vMax = computeJunctionVMax(safeIs, VT);

  const fwd = evalExponentialJunction(vbe, safeIs, VT, vMax);
  const rev = evalExponentialJunction(vbc, safeIs, VT, vMax);

  const ifwd = fwd.current;
  const irev = rev.current;
  const gmf = fwd.conductance;
  const gmr = rev.conductance;

  const ibBe = ifwd / safeBf + gmin * vbe;
  const ibBc = irev / safeBr + gmin * vbc;

  const gbe = gmf / safeBf + gmin;
  const gbc = gmr / safeBr + gmin;

  const ib = ibBe + ibBc;
  const ic = ifwd - irev - ibBc;
  const ie = -(ib + ic);

  // Linearized Norton equivalents: I_t(v) ≈ dI_t/dvbe * vbe + dI_t/dvbc * vbc + I_t_eq
  const icEq = ic - gmf * vbe + (gmr + gbc) * vbc;
  const ibEq = ib - gbe * vbe - gbc * vbc;
  const ieEq = ie + (gmf + gbe) * vbe - gmr * vbc;

  return {
    ic,
    ib,
    ie,
    gbe,
    gbc,
    gmf,
    gmr,
    icEq,
    ibEq,
    ieEq,
  };
}

/**
 * Complementary Ebers-Moll PNP BJT model.
 * Evaluates evalNPN on (veb = -vbe, vcb = -vbc) and negates terminal currents & Norton equivalents,
 * while keeping the 3x3 Jacobian conductances (gbe, gbc, gmf, gmr) positive and identical in form.
 */
export function evalPNP(
  vbe: number,
  vbc: number,
  is = 1e-14,
  bf = 120,
  br = 1,
  gmin = GMIN
): NPNEval {
  const comp = evalNPN(-vbe, -vbc, is, bf, br, gmin);
  return {
    ic: -comp.ic,
    ib: -comp.ib,
    ie: -comp.ie,
    gbe: comp.gbe,
    gbc: comp.gbc,
    gmf: comp.gmf,
    gmr: comp.gmr,
    icEq: -comp.icEq,
    ibEq: -comp.ibEq,
    ieEq: -comp.ieEq,
  };
}

/**
 * Level-1 Shichman-Hodges MOSFET core (handles both normal and reversed D/S polarity).
 * Given (vgs, vds) for NMOS or (vsg, vsd) for PMOS with positive vthMag.
 */
function evalShichmanHodges(
  vGateSrc: number,
  vDrainSrc: number,
  vthMag: number,
  kp: number,
  lambda: number,
  gmin: number
): MosfetEval {
  const safeKp = Math.max(kp, 1e-12);
  const safeLambda = Math.max(lambda, 0);

  const reversed = vDrainSrc < 0;
  const vgsEff = reversed ? vGateSrc - vDrainSrc : vGateSrc;
  const vdsEff = reversed ? -vDrainSrc : vDrainSrc;

  const vov = vgsEff - vthMag;
  let idEff = 0;
  let gm = 0;
  let gds = 0;

  if (vov > 0) {
    if (vdsEff < vov) {
      // Linear (triode) region
      const idBase = safeKp * (vov * vdsEff - 0.5 * vdsEff * vdsEff);
      const clm = 1 + safeLambda * vdsEff;
      idEff = idBase * clm;
      gm = safeKp * vdsEff * clm;
      gds = safeKp * (vov - vdsEff) * clm + idBase * safeLambda;
    } else {
      // Saturation region
      const idBase = 0.5 * safeKp * vov * vov;
      const clm = 1 + safeLambda * vdsEff;
      idEff = idBase * clm;
      gm = safeKp * vov * clm;
      gds = idBase * safeLambda;
    }
  }

  idEff += gmin * vdsEff;
  gds += gmin;

  const iEq = idEff - gm * vgsEff - gds * vdsEff;
  return {
    id: idEff,
    gm,
    gds,
    iEq,
    reversed,
  };
}

/**
 * Level-1 Shichman-Hodges NMOS model.
 */
export function evalNMOS(
  vgs: number,
  vds: number,
  vth = 1.5,
  kp = 0.02,
  lambda = 0.02,
  gmin = GMIN
): MosfetEval {
  return evalShichmanHodges(vgs, vds, vth, kp, lambda, gmin);
}

/**
 * Level-1 Shichman-Hodges PMOS model.
 * Takes vsg = Vs - Vg and vsd = Vs - Vd, with vth typically negative (e.g. -1.5V).
 */
export function evalPMOS(
  vsg: number,
  vsd: number,
  vth = -1.5,
  kp = 0.02,
  lambda = 0.02,
  gmin = GMIN
): MosfetEval {
  return evalShichmanHodges(vsg, vsd, Math.abs(vth), kp, lambda, gmin);
}

/**
 * Smooth rail-saturating Op-Amp model:
 *   vOut(vDiff) = vMid + vSwing * tanh(gain * vDiff / vSwing)
 *   aEff = dvOut / dvDiff = gain * sech^2(gain * vDiff / vSwing)
 *   vEq  = vOut - aEff * vDiff
 */
export function evalOpAmp(
  vDiff: number,
  gain = 1e5,
  vSatPos = 15,
  vSatNeg = -15
): OpAmpEval {
  const safeGain = Math.max(gain, 1);
  const vHigh = Math.max(vSatPos, vSatNeg + 1e-3);
  const vLow = Math.min(vSatNeg, vSatPos - 1e-3);
  const vMid = 0.5 * (vHigh + vLow);
  const vSwing = 0.5 * (vHigh - vLow);

  const x = (safeGain * vDiff) / vSwing;
  const tanhX = Math.tanh(x);
  const vOut = vMid + vSwing * tanhX;

  // sech^2(x) = 1 - tanh^2(x), cleanly 0 for |x| > 20
  const sech2 = Math.abs(x) > 20 ? 0 : Math.max(0, 1 - tanhX * tanhX);
  const aEff = safeGain * sech2;
  const vEq = vOut - aEff * vDiff;

  return { vOut, aEff, vEq };
}

/**
 * Smooth voltage-controlled switch using tanh log-conductance interpolation
 * between gOff = 1/rOff and gOn = 1/rOn around vThreshold (transition width 0.1V).
 */
export function evalVSwitch(
  vCtrl: number,
  vSw: number,
  vThreshold = 2.5,
  rOn = 0.1,
  rOff = 1e7
): VSwitchEval {
  const gOn = 1 / Math.max(rOn, 1e-6);
  const gOff = 1 / Math.max(rOff, 1e-6);
  const lnGOn = Math.log(gOn);
  const lnGOff = Math.log(gOff);
  const vWidth = 0.1;

  const u = (vCtrl - vThreshold) / vWidth;
  const tanhU = Math.tanh(u);
  const t = 0.5 * (1 + tanhU);
  const lnG = lnGOff + t * (lnGOn - lnGOff);
  const g = Math.exp(lnG);

  const sech2 = Math.abs(u) > 20 ? 0 : Math.max(0, 1 - tanhU * tanhU);
  const dgDvCtrl = (g * (lnGOn - lnGOff) * 0.5 * sech2) / vWidth;

  const iSw = g * vSw;
  const gmCtrl = dgDvCtrl * vSw;
  const iEq = iSw - g * vSw - gmCtrl * vCtrl; // = -gmCtrl * vCtrl

  return { iSw, g, gmCtrl, iEq };
}
