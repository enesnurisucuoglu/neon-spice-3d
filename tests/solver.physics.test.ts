import { describe, expect, it } from 'vitest';
import {
  Complex,
  c,
  cAbs,
  cAdd,
  cMul,
  compileNetlist,
  solveAC,
  solveComplexLinearSystem,
  solveDCOP,
  solveDCSweep,
  solveLinearSystem,
  solveTransient,
  VT,
} from '../src/engine';
import { getPresetById, PRESET_CIRCUITS } from '../src/circuits/presets';
import { CircuitSchematic } from '../src/types/circuit';

function requirePreset(id: string): CircuitSchematic {
  const preset = getPresetById(id);
  if (!preset) {
    throw new Error(`Preset "${id}" not found`);
  }
  return preset;
}

function findClosestIndex(values: number[], target: number): number {
  let bestIdx = 0;
  let bestDiff = Math.abs(values[0] - target);
  for (let i = 1; i < values.length; i++) {
    const diff = Math.abs(values[i] - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function linearInterpolate(xs: number[], ys: number[], xTarget: number): number {
  if (xTarget <= xs[0]) return ys[0];
  if (xTarget >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    if (xTarget >= xs[i] && xTarget <= xs[i + 1]) {
      const t = (xTarget - xs[i]) / (xs[i + 1] - xs[i]);
      return ys[i] + t * (ys[i + 1] - ys[i]);
    }
  }
  return ys[ys.length - 1];
}

function assertAllFinite(arr: number[], label: string): void {
  expect(arr.length, `${label} should be non-empty`).toBeGreaterThan(0);
  for (let i = 0; i < arr.length; i++) {
    expect(Number.isFinite(arr[i]), `${label}[${i}] = ${arr[i]} is not finite`).toBe(
      true
    );
  }
}

describe('NeonSPICE Physics & Numerical Verification Suite', () => {
  // =========================================================================
  // Test Group 1: Linear Algebra & Kirchhoff Conservation
  // =========================================================================
  describe('Group 1: Linear Algebra & Kirchhoff Conservation', () => {
    it('solves real linear systems via partial-pivoting LU to < 1e-10 accuracy', () => {
      // System requiring row swaps (zero on diagonal) and non-trivial coupling
      const A = [
        [0, 2, 1, -1],
        [3, -1, 2, 0],
        [1, 4, -2, 3],
        [-2, 1, 5, 2],
      ];
      const xTrue = [1.5, -2.25, 0.75, 3.125];
      const b = A.map((row) =>
        row.reduce((acc, val, j) => acc + val * xTrue[j], 0)
      );

      const xSol = solveLinearSystem(A, b);
      expect(xSol).not.toBeNull();
      for (let i = 0; i < xTrue.length; i++) {
        expect(Math.abs(xSol![i] - xTrue[i])).toBeLessThan(1e-10);
      }

      // Verify residual ||A*x - b||_inf < 1e-10
      for (let i = 0; i < A.length; i++) {
        const ax = A[i].reduce((acc, val, j) => acc + val * xSol![j], 0);
        expect(Math.abs(ax - b[i])).toBeLessThan(1e-10);
      }
    });

    it('solves complex linear systems via partial-pivoting LU to < 1e-10 accuracy', () => {
      const A: Complex[][] = [
        [c(0, 1), c(2, -1), c(-1, 3)],
        [c(3, 2), c(-1, 4), c(0, -2)],
        [c(1, -3), c(2, 1), c(4, -1)],
      ];
      const xTrue: Complex[] = [c(1.2, -0.8), c(-2.5, 1.4), c(0.6, 2.1)];
      const b: Complex[] = A.map((row) =>
        row.reduce((acc, val, j) => cAdd(acc, cMul(val, xTrue[j])), c(0, 0))
      );

      const xSol = solveComplexLinearSystem(A, b);
      expect(xSol).not.toBeNull();
      for (let i = 0; i < xTrue.length; i++) {
        const err = cAbs({
          re: xSol![i].re - xTrue[i].re,
          im: xSol![i].im - xTrue[i].im,
        });
        expect(err).toBeLessThan(1e-10);
      }
    });

    it('satisfies exact node voltages, KCL (< 1e-9 A), and power conservation on a multi-loop resistive network', () => {
      // Multi-loop resistive ladder:
      // V1 = 12V -> N1 --[R1=1k]-- N2 --[R3=2k]-- N3
      //                             |             |
      //                           [R2=2k]       [R4=2k]
      //                             |             |
      //                            GND           GND
      // Analytical solution:
      // R_right = R3 + R4 = 4k; R_par = R2 || R_right = 2k || 4k = 4/3 kOhm
      // R_eq = R1 + R_par = 1k + 4/3 k = 7/3 kOhm
      // I_total = 12 / (7/3 k) = 36/7 mA = 5.142857142857 mA
      // V(N1) = 12 V
      // V(N2) = 12 * (4/3) / (7/3) = 48/7 V = 6.857142857143 V
      // V(N3) = V(N2) * (R4 / (R3 + R4)) = 24/7 V = 3.428571428571 V
      const schematic: CircuitSchematic = {
        id: 'test-ladder',
        name: 'Multi-loop Resistive Ladder',
        description: 'Verification network for KCL and Tellegen power conservation',
        category: 'Passive',
        components: [
          { id: 'v1', name: 'V1', type: 'vdc', x: 2, y: 6, rotation: 0, params: { voltage: 12 } },
          { id: 'g1', name: 'GND1', type: 'ground', x: 2, y: 9, rotation: 0, params: {} },
          { id: 'r1', name: 'R1', type: 'resistor', x: 6, y: 4, rotation: 0, params: { resistance: 1000 } },
          { id: 'r2', name: 'R2', type: 'resistor', x: 10, y: 6, rotation: 90, params: { resistance: 2000 } },
          { id: 'g2', name: 'GND2', type: 'ground', x: 10, y: 9, rotation: 0, params: {} },
          { id: 'r3', name: 'R3', type: 'resistor', x: 14, y: 4, rotation: 0, params: { resistance: 2000 } },
          { id: 'r4', name: 'R4', type: 'resistor', x: 18, y: 6, rotation: 90, params: { resistance: 2000 } },
          { id: 'g3', name: 'GND3', type: 'ground', x: 18, y: 9, rotation: 0, params: {} },
        ],
        wires: [
          { id: 'w1', x1: 2, y1: 4, x2: 4, y2: 4 },
          { id: 'w2', x1: 8, y1: 4, x2: 10, y2: 4 },
          { id: 'w3', x1: 10, y1: 4, x2: 12, y2: 4 },
          { id: 'w4', x1: 16, y1: 4, x2: 18, y2: 4 },
        ],
        probes: [
          { id: 'p1', label: 'V1_NODE', x: 2, y: 4, color: '#22d3ee' },
          { id: 'p2', label: 'V2_NODE', x: 10, y: 4, color: '#fbbf24' },
          { id: 'p3', label: 'V3_NODE', x: 18, y: 4, color: '#34d399' },
        ],
        recommendedAnalysis: {
          type: 'dc_op',
          transient: { stopTime: 1e-3, timeStep: 10e-6 },
          ac: { startFreq: 10, stopFreq: 1e5, pointsPerDecade: 10 },
          dcSweep: { sourceName: 'V1', startValue: 0, stopValue: 12, stepValue: 1 },
        },
      };

      const compiled = compileNetlist(schematic);
      expect(compiled.warnings).toHaveLength(0);

      const dc = solveDCOP(schematic, compiled);
      expect(dc.converged).toBe(true);

      const v1Expected = 12;
      const v2Expected = 48 / 7;
      const v3Expected = 24 / 7;

      expect(dc.probeVoltages.V1_NODE).toBeCloseTo(v1Expected, 8);
      expect(dc.probeVoltages.V2_NODE).toBeCloseTo(v2Expected, 7);
      expect(dc.probeVoltages.V3_NODE).toBeCloseTo(v3Expected, 7);

      // KCL at every non-ground node: |sum I_leaving| < 1e-9 A
      const iV1 = dc.branchCurrents.V1; // current entering V1.pos (so negative when supplying)
      const iR1 = dc.branchCurrents.R1; // N1 -> N2
      const iR2 = dc.branchCurrents.R2; // N2 -> GND
      const iR3 = dc.branchCurrents.R3; // N2 -> N3
      const iR4 = dc.branchCurrents.R4; // N3 -> GND

      // Node N1: I_V1 + I_R1 = 0
      expect(Math.abs(iV1 + iR1)).toBeLessThan(1e-9);
      // Node N2: -I_R1 + I_R2 + I_R3 = 0
      expect(Math.abs(-iR1 + iR2 + iR3)).toBeLessThan(1e-9);
      // Node N3: -I_R3 + I_R4 = 0
      expect(Math.abs(-iR3 + iR4)).toBeLessThan(1e-9);

      // Power conservation (Tellegen's Theorem): P_supplied == P_dissipated
      const pSupplied = -dc.componentPower.V1; // V1 supplies power (negative passive sign)
      const pDissipated =
        dc.componentPower.R1 +
        dc.componentPower.R2 +
        dc.componentPower.R3 +
        dc.componentPower.R4;
      const pAnalytical = (12 * 12) / (7000 / 3);
      expect(pSupplied).toBeCloseTo(pAnalytical, 8);
      expect(Math.abs(pSupplied - pDissipated)).toBeLessThan(1e-9);
    });
  });

  // =========================================================================
  // Test Group 2: RC Step Response (`rc-step` preset)
  // =========================================================================
  describe('Group 2: RC Step Response (rc-step preset)', () => {
    it('matches analytical v_C(t) = 5*(1 - exp(-t/tau)) at t = tau, 2*tau, 5*tau within 1.5%', () => {
      const preset = requirePreset('rc-step');
      const tr = solveTransient(preset, preset.recommendedAnalysis.transient);
      expect(tr.converged).toBe(true);

      const tau = 1000 * 100e-9; // 0.1 ms
      const vHigh = 5.0;
      const vCap = tr.probeVoltages.V_CAP;

      const checkpoints = [
        { label: '1*tau', t: 1 * tau },
        { label: '2*tau', t: 2 * tau },
        { label: '5*tau', t: 5 * tau },
      ];

      for (const cp of checkpoints) {
        const simV = linearInterpolate(tr.times, vCap, cp.t);
        const exactV = vHigh * (1 - Math.exp(-cp.t / tau));
        const relErr = Math.abs(simV - exactV) / exactV;
        expect(
          relErr,
          `RC step at ${cp.label}: sim=${simV.toFixed(4)}V, exact=${exactV.toFixed(4)}V, relErr=${(relErr * 100).toFixed(3)}%`
        ).toBeLessThan(0.015);
      }
    });
  });

  // =========================================================================
  // Test Group 3: Series RLC Resonance (`rlc-resonance` preset)
  // =========================================================================
  describe('Group 3: Series RLC Resonance (rlc-resonance preset)', () => {
    it('peaks near f0 = 1/(2*pi*sqrt(LC)) ≈ 1000 Hz with ~0 dB magnitude and ~0° phase', () => {
      const preset = requirePreset('rlc-resonance');
      const ac = solveAC(preset, {
        ...preset.recommendedAnalysis.ac,
        pointsPerDecade: 80, // fine resolution for accurate peak detection
      });

      const L = 10e-3;
      const C = 2.533e-6;
      const f0Exact = 1 / (2 * Math.PI * Math.sqrt(L * C)); // ~1000.005 Hz

      const magsDb = ac.magnitudeDb.VOUT;
      const phases = ac.phaseDeg.VOUT;

      let peakIdx = 0;
      for (let i = 1; i < magsDb.length; i++) {
        if (magsDb[i] > magsDb[peakIdx]) peakIdx = i;
      }

      const fPeak = ac.frequencies[peakIdx];
      const peakDb = magsDb[peakIdx];
      const peakPhase = phases[peakIdx];

      const freqRelErr = Math.abs(fPeak - f0Exact) / f0Exact;
      expect(freqRelErr).toBeLessThan(0.02); // within 2%
      expect(Math.abs(peakDb - 0)).toBeLessThan(0.2); // ±0.2 dB
      expect(Math.abs(peakPhase - 0)).toBeLessThan(5); // ±5 deg
    });
  });

  // =========================================================================
  // Test Group 4: Shockley Diode & Biased Clipper (`diode-clipper` preset)
  // =========================================================================
  describe('Group 4: Shockley Diode & Biased Clipper (diode-clipper preset)', () => {
    it('passes negative voltages and clamps positive voltages to V_bias + V_f in DC sweep and transient', () => {
      const preset = requirePreset('diode-clipper');

      // DC Sweep check
      const sweep = solveDCSweep(preset, preset.recommendedAnalysis.dcSweep);
      expect(sweep.warnings).toHaveLength(0);

      const idxNeg4 = findClosestIndex(sweep.sweepValues, -4.0);
      const idxPos5 = findClosestIndex(sweep.sweepValues, 5.0);

      const vClipNeg4 = sweep.probeVoltages.V_CLIP[idxNeg4];
      const vClipPos5 = sweep.probeVoltages.V_CLIP[idxPos5];

      // Reverse-biased at Vin = -4V: V_clip ≈ -4V
      expect(vClipNeg4).toBeCloseTo(-4.0, 2);

      // Forward-biased at Vin = +5V: V_clip ≈ V_bias + V_f ∈ [2.55, 2.80] V
      expect(vClipPos5).toBeGreaterThanOrEqual(2.55);
      expect(vClipPos5).toBeLessThanOrEqual(2.8);

      // Transient check
      const tr = solveTransient(preset, preset.recommendedAnalysis.transient);
      expect(tr.converged).toBe(true);
      const vClipTr = tr.probeVoltages.V_CLIP;
      const vClipMax = Math.max(...vClipTr);
      const vClipMin = Math.min(...vClipTr);

      expect(vClipMin).toBeCloseTo(-5.0, 1);
      expect(vClipMax).toBeGreaterThanOrEqual(2.55);
      expect(vClipMax).toBeLessThanOrEqual(2.8);
    });
  });

  // =========================================================================
  // Test Group 5: Full-Wave Bridge Rectifier + RC Filter (`bridge-rectifier` preset)
  // =========================================================================
  describe('Group 5: Full-Wave Bridge Rectifier + RC Filter (bridge-rectifier preset)', () => {
    it('converges cleanly and rectifies 60 Hz 10 Vpk AC into smoothed 7.5-9.0 V DC with < 1.2 V ripple', () => {
      const preset = requirePreset('bridge-rectifier');
      const tr = solveTransient(preset, preset.recommendedAnalysis.transient);
      expect(tr.converged).toBe(true);

      const vOut = tr.probeVoltages.V_DC_OUT;
      const steadySamples: number[] = [];
      for (let i = 0; i < tr.times.length; i++) {
        if (tr.times[i] > 20e-3) {
          steadySamples.push(vOut[i]);
        }
      }
      expect(steadySamples.length).toBeGreaterThan(50);

      const vMin = Math.min(...steadySamples);
      const vMax = Math.max(...steadySamples);
      const ripple = vMax - vMin;

      expect(vMin).toBeGreaterThanOrEqual(7.5);
      expect(vMax).toBeLessThanOrEqual(9.0);
      expect(ripple).toBeLessThan(1.2);
      expect(ripple).toBeGreaterThan(0.05); // realistic RC ripple is non-zero
    });
  });

  // =========================================================================
  // Test Group 6: Common-Emitter NPN BJT Amplifier (`bjt-ce-amp` preset)
  // =========================================================================
  describe('Group 6: Common-Emitter NPN BJT Amplifier (bjt-ce-amp preset)', () => {
    it('biases Q1 in forward-active mode and produces high inverted mid-band gain', () => {
      const preset = requirePreset('bjt-ce-amp');
      const compiled = compileNetlist(preset);
      const dc = solveDCOP(preset, compiled);
      expect(dc.converged).toBe(true);

      const q1Pins = compiled.componentNodes['bjt-q1'];
      const vB = dc.nodeVoltages[q1Pins.base];
      const vE = dc.nodeVoltages[q1Pins.emitter];
      const vC = dc.nodeVoltages[q1Pins.collector];
      const iC = dc.branchCurrents.Q1;

      // Forward-active mode: V_C > V_B > V_E > 0
      expect(vE).toBeGreaterThan(0);
      expect(vB).toBeGreaterThan(vE);
      expect(vC).toBeGreaterThan(vB);

      // Bias point ranges
      expect(vB).toBeGreaterThanOrEqual(1.8);
      expect(vB).toBeLessThanOrEqual(2.3);
      expect(vE).toBeGreaterThanOrEqual(1.1);
      expect(vE).toBeLessThanOrEqual(1.6);
      expect(vC).toBeGreaterThanOrEqual(4.0);
      expect(vC).toBeLessThanOrEqual(7.5);

      // AC Sweep at 1 kHz
      const ac = solveAC(preset, preset.recommendedAnalysis.ac);
      const idx1k = findClosestIndex(ac.frequencies, 1000);
      const gainDb = ac.magnitudeDb.V_OUT[idx1k];
      const gainLin = ac.magnitudeLinear.V_OUT[idx1k];
      const phase = ac.phaseDeg.V_OUT[idx1k];

      // Theoretical mid-band gain: |A_v| ≈ g_m * (R_C || R_L)
      const gm = iC / VT;
      const rParallel = (2200 * 10000) / (2200 + 10000);
      const avTheoretical = gm * rParallel;

      expect(gainDb).toBeGreaterThan(30);
      // Should be within 15% of small-signal gm*(RC||RL) (finite CE & coupling caps slightly reduce gain)
      expect(Math.abs(gainLin - avTheoretical) / avTheoretical).toBeLessThan(0.15);
      // Inverting phase (~ ±180°)
      expect(Math.abs(Math.abs(phase) - 180)).toBeLessThan(15);

      // Transient amplification check
      const tr = solveTransient(preset, preset.recommendedAnalysis.transient);
      expect(tr.converged).toBe(true);

      // Measure peak-to-peak on second half of transient window (after initial coupling settle)
      const halfIdx = Math.floor(tr.times.length / 2);
      const vinSlice = tr.probeVoltages.V_IN.slice(halfIdx);
      const voutSlice = tr.probeVoltages.V_OUT.slice(halfIdx);
      const vinPP = Math.max(...vinSlice) - Math.min(...vinSlice);
      const voutPP = Math.max(...voutSlice) - Math.min(...voutSlice);

      expect(vinPP).toBeCloseTo(0.04, 2); // 20 mV amplitude -> 40 mVpp
      expect(voutPP).toBeGreaterThan(vinPP * 50); // strong amplification
    });
  });

  // =========================================================================
  // Test Group 7: Sallen-Key 2nd-Order Butterworth LPF (`sallen-key-lpf` preset)
  // =========================================================================
  describe('Group 7: Sallen-Key 2nd-Order Butterworth LPF (sallen-key-lpf preset)', () => {
    it('exhibits 0 dB passband, -3 dB cutoff at 1000 Hz (±3%), and -40 dB/decade stopband roll-off', () => {
      const preset = requirePreset('sallen-key-lpf');
      const ac = solveAC(preset, {
        ...preset.recommendedAnalysis.ac,
        pointsPerDecade: 60,
      });

      const freqs = ac.frequencies;
      const magsDb = ac.magnitudeDb.V_OUT;

      // Low-frequency passband gain (at 10 Hz) ≈ 0 dB (±0.1 dB)
      expect(Math.abs(magsDb[0] - 0)).toBeLessThan(0.1);

      // Find -3.0103 dB cutoff frequency by log-frequency linear interpolation
      const targetDb = magsDb[0] - 3.0103;
      let fcMeasured = freqs[0];
      for (let i = 0; i < freqs.length - 1; i++) {
        if (magsDb[i] >= targetDb && magsDb[i + 1] <= targetDb) {
          const frac = (targetDb - magsDb[i]) / (magsDb[i + 1] - magsDb[i]);
          const logF =
            Math.log10(freqs[i]) +
            frac * (Math.log10(freqs[i + 1]) - Math.log10(freqs[i]));
          fcMeasured = Math.pow(10, logF);
          break;
        }
      }

      const fcRelErr = Math.abs(fcMeasured - 1000) / 1000;
      expect(fcRelErr).toBeLessThan(0.03); // within ±3% of 1000 Hz

      // Stopband roll-off between 10 kHz and 100 kHz: [-42, -38] dB/decade
      const idx10k = findClosestIndex(freqs, 10000);
      const idx100k = findClosestIndex(freqs, 100000);
      const rollOffPerDecade =
        (magsDb[idx100k] - magsDb[idx10k]) /
        Math.log10(freqs[idx100k] / freqs[idx10k]);

      expect(rollOffPerDecade).toBeGreaterThanOrEqual(-42);
      expect(rollOffPerDecade).toBeLessThanOrEqual(-38);
    });
  });

  // =========================================================================
  // Test Group 8: Inverting Op-Amp Gain Stage (`inverting-opamp` preset)
  // =========================================================================
  describe('Group 8: Inverting Op-Amp Gain Stage (inverting-opamp preset)', () => {
    it('achieves -4.70 linear DC slope, smooth ±15 V rail saturation, and 13.44 dB / 180° AC response', () => {
      const preset = requirePreset('inverting-opamp');

      // DC Sweep
      const sweep = solveDCSweep(preset, preset.recommendedAnalysis.dcSweep);
      expect(sweep.warnings).toHaveLength(0);

      const idxNeg1 = findClosestIndex(sweep.sweepValues, -1.0);
      const idxPos1 = findClosestIndex(sweep.sweepValues, 1.0);
      const slope =
        (sweep.probeVoltages.V_OUT[idxPos1] -
          sweep.probeVoltages.V_OUT[idxNeg1]) /
        (sweep.sweepValues[idxPos1] - sweep.sweepValues[idxNeg1]);

      expect(Math.abs(slope - -4.7)).toBeLessThan(0.05);

      // Rail saturation at Vin = ±4V
      const idxNeg4 = findClosestIndex(sweep.sweepValues, -4.0);
      const idxPos4 = findClosestIndex(sweep.sweepValues, 4.0);
      expect(sweep.probeVoltages.V_OUT[idxNeg4]).toBeGreaterThan(14.5);
      expect(sweep.probeVoltages.V_OUT[idxNeg4]).toBeLessThanOrEqual(15.01);
      expect(sweep.probeVoltages.V_OUT[idxPos4]).toBeLessThan(-14.5);
      expect(sweep.probeVoltages.V_OUT[idxPos4]).toBeGreaterThanOrEqual(-15.01);

      // AC Sweep
      const ac = solveAC(preset, preset.recommendedAnalysis.ac);
      const idx1k = findClosestIndex(ac.frequencies, 1000);
      const expectedGainDb = 20 * Math.log10(4.7); // 13.441957... dB
      expect(Math.abs(ac.magnitudeDb.V_OUT[idx1k] - expectedGainDb)).toBeLessThan(
        0.1
      );
      expect(Math.abs(Math.abs(ac.phaseDeg.V_OUT[idx1k]) - 180)).toBeLessThan(1);
    });
  });

  // =========================================================================
  // Test Group 9: Universal Convergence & Finite-Output Check
  // =========================================================================
  describe('Group 9: Universal Convergence & Finite-Output Check across all 11 presets', () => {
    it('contains all 11 preset circuits', () => {
      expect(PRESET_CIRCUITS).toHaveLength(11);
    });

    for (const preset of PRESET_CIRCUITS) {
      it(`compiles with 0 warnings and produces finite converged DC OP, AC, and Transient results for "${preset.id}"`, () => {
        const compiled = compileNetlist(preset);
        expect(compiled.warnings).toHaveLength(0);
        expect(compiled.nodes.length).toBeGreaterThan(1);

        // DC OP
        const dc = solveDCOP(preset, compiled);
        expect(dc.converged).toBe(true);
        assertAllFinite(Object.values(dc.nodeVoltages), `${preset.id} DC nodeVoltages`);
        assertAllFinite(Object.values(dc.probeVoltages), `${preset.id} DC probeVoltages`);
        assertAllFinite(Object.values(dc.branchCurrents), `${preset.id} DC branchCurrents`);

        // AC
        const ac = solveAC(preset, preset.recommendedAnalysis.ac);
        assertAllFinite(ac.frequencies, `${preset.id} AC frequencies`);
        for (const [label, arr] of Object.entries(ac.magnitudeDb)) {
          assertAllFinite(arr, `${preset.id} AC magDb[${label}]`);
        }
        for (const [label, arr] of Object.entries(ac.phaseDeg)) {
          assertAllFinite(arr, `${preset.id} AC phaseDeg[${label}]`);
        }

        // Transient
        const tr = solveTransient(preset, preset.recommendedAnalysis.transient);
        expect(tr.converged).toBe(true);
        assertAllFinite(tr.times, `${preset.id} Transient times`);
        for (const [label, arr] of Object.entries(tr.probeVoltages)) {
          assertAllFinite(arr, `${preset.id} Transient probe[${label}]`);
        }
      });
    }
  });

  // =========================================================================
  // Test Group 10: 5.1V Zener Diode Voltage Regulator (`zener-regulator` preset)
  // =========================================================================
  describe('Group 10: 5.1V Zener Diode Voltage Regulator (zener-regulator preset)', () => {
    it('tracks resistive divider below knee and clamps tightly near 5.1 V above knee', () => {
      const preset = requirePreset('zener-regulator');
      const sweep = solveDCSweep(preset, preset.recommendedAnalysis.dcSweep);
      expect(sweep.warnings).toHaveLength(0);

      const idx3V = findClosestIndex(sweep.sweepValues, 3.0);
      const idx12V = findClosestIndex(sweep.sweepValues, 12.0);
      const idx15V = findClosestIndex(sweep.sweepValues, 15.0);

      const vReg3V = sweep.probeVoltages.V_REG[idx3V];
      const vReg12V = sweep.probeVoltages.V_REG[idx12V];
      const vReg15V = sweep.probeVoltages.V_REG[idx15V];

      // Below knee: V_reg = V1 * R_L / (R_S + R_L) = 3 * 1000 / 1220 = 2.459016 V
      const expected3V = (3.0 * 1000) / 1220;
      expect(vReg3V).toBeCloseTo(expected3V, 2);

      // Above knee: Zener breakdown clamps V_REG in [5.05, 5.25] V
      expect(vReg12V).toBeGreaterThanOrEqual(5.05);
      expect(vReg12V).toBeLessThanOrEqual(5.25);
      expect(vReg15V).toBeGreaterThanOrEqual(5.05);
      expect(vReg15V).toBeLessThanOrEqual(5.25);
    });
  });

  // =========================================================================
  // Test Group 11: CMOS Logic Inverter (`cmos-inverter` preset)
  // =========================================================================
  describe('Group 11: CMOS Logic Inverter (cmos-inverter preset)', () => {
    it('exhibits rail-to-rail VTC swing (5V -> 0V) with switching threshold VM within ±0.15 V of 2.50 V', () => {
      const preset = requirePreset('cmos-inverter');
      const sweep = solveDCSweep(preset, preset.recommendedAnalysis.dcSweep);
      expect(sweep.warnings).toHaveLength(0);

      const vIn = sweep.sweepValues;
      const vOut = sweep.probeVoltages.V_OUT;

      const idx0V = findClosestIndex(vIn, 0.0);
      const idx5V = findClosestIndex(vIn, 5.0);

      expect(vOut[idx0V]).toBeCloseTo(5.0, 2);
      expect(vOut[idx5V]).toBeCloseTo(0.0, 2);

      // Find switching threshold V_M where V_OUT crosses 2.5 V
      let vmMeasured = -1;
      for (let i = 0; i < vIn.length - 1; i++) {
        if (vOut[i] >= 2.5 && vOut[i + 1] <= 2.5) {
          const frac = (2.5 - vOut[i]) / (vOut[i + 1] - vOut[i]);
          vmMeasured = vIn[i] + frac * (vIn[i + 1] - vIn[i]);
          break;
        }
      }
      expect(vmMeasured).toBeGreaterThan(0);
      expect(Math.abs(vmMeasured - 2.5)).toBeLessThanOrEqual(0.15);
    });
  });

  // =========================================================================
  // Test Group 12: NMOS Low-Side PWM Power Switch + LED (`nmos-pwm-led` preset)
  // =========================================================================
  describe('Group 12: NMOS Low-Side PWM Power Switch + LED (nmos-pwm-led preset)', () => {
    it('pulls V_DRAIN < 1.0 V with ~20 mA LED current when V_GATE = 5V and rises > 9.5 V when V_GATE = 0V', () => {
      const preset = requirePreset('nmos-pwm-led');
      const tr = solveTransient(preset, preset.recommendedAnalysis.transient);
      expect(tr.converged).toBe(true);

      // Mid-ON pulse (t = 1.25 ms, V_GATE = 5 V)
      const idxOn = findClosestIndex(tr.times, 1.25e-3);
      const vGateOn = tr.probeVoltages.V_GATE[idxOn];
      const vDrainOn = tr.probeVoltages.V_DRAIN[idxOn];
      const iLedOn = tr.branchCurrents.LED1[idxOn];

      expect(vGateOn).toBeCloseTo(5.0, 1);
      expect(vDrainOn).toBeLessThan(1.0);
      expect(iLedOn).toBeGreaterThan(0.015);
      expect(iLedOn).toBeLessThan(0.025);

      // Mid-OFF pulse (t = 1.75 ms, V_GATE = 0 V)
      const idxOff = findClosestIndex(tr.times, 1.75e-3);
      const vGateOff = tr.probeVoltages.V_GATE[idxOff];
      const vDrainOff = tr.probeVoltages.V_DRAIN[idxOff];
      const iLedOff = tr.branchCurrents.LED1[idxOff];

      expect(vGateOff).toBeCloseTo(0.0, 1);
      expect(vDrainOff).toBeGreaterThan(9.5);
      expect(Math.abs(iLedOff)).toBeLessThan(1e-4);
    });
  });

  // =========================================================================
  // Test Group 13: 10:1 Step-Down Transformer + Schottky Bridge PSU (`transformer-psu` preset)
  // =========================================================================
  describe('Group 13: 10:1 Step-Down Transformer + Schottky Bridge PSU (transformer-psu preset)', () => {
    it('steps 170 Vpk mains down to ~17 Vpk secondary and rectifies to 15.0-16.8 V low-ripple DC', () => {
      const preset = requirePreset('transformer-psu');
      const tr = solveTransient(preset, preset.recommendedAnalysis.transient);
      expect(tr.converged).toBe(true);

      const vSecP = tr.probeVoltages.V_SEC_P;
      const vDcOut = tr.probeVoltages.V_DC_OUT;

      // Secondary positive peak should be near 17 V (170 V * 0.1 minus Schottky return drop)
      const vSecPeak = Math.max(...vSecP);
      expect(vSecPeak).toBeGreaterThan(16.0);
      expect(vSecPeak).toBeLessThan(17.5);

      // Steady-state V_DC_OUT (t > 20 ms)
      const steady: number[] = [];
      for (let i = 0; i < tr.times.length; i++) {
        if (tr.times[i] > 20e-3) {
          steady.push(vDcOut[i]);
        }
      }
      expect(steady.length).toBeGreaterThan(50);

      const vMin = Math.min(...steady);
      const vMax = Math.max(...steady);
      const ripple = vMax - vMin;

      expect(vMin).toBeGreaterThanOrEqual(15.0);
      expect(vMax).toBeLessThanOrEqual(16.8);
      expect(ripple).toBeLessThan(1.0);
    });
  });

  // =========================================================================
  // Test Group 14: Additional Industry Components Unit Physics
  // =========================================================================
  describe('Group 14: Additional Industry Components Unit Physics', () => {
    const baseAnalysis = {
      type: 'dc_op' as const,
      transient: { stopTime: 1e-3, timeStep: 10e-6 },
      ac: { startFreq: 10, stopFreq: 1e5, pointsPerDecade: 10 },
      dcSweep: { sourceName: 'V1', startValue: 0, stopValue: 10, stepValue: 1 },
    };

    it('potentiometer: 10 V across 10 kΩ at wiperPos = 0.25 produces exact 7.500 V at wiper', () => {
      const schematic: CircuitSchematic = {
        id: 'unit-pot',
        name: 'Potentiometer Unit Test',
        description: 'Voltage divider test for potentiometer',
        category: 'Passive',
        components: [
          { id: 'v1', name: 'V1', type: 'vdc', x: 2, y: 6, rotation: 0, params: { voltage: 10 } },
          { id: 'g1', name: 'GND1', type: 'ground', x: 2, y: 9, rotation: 0, params: {} },
          {
            id: 'pot1',
            name: 'POT1',
            type: 'potentiometer',
            x: 8,
            y: 4,
            rotation: 0,
            params: { resistance: 10000, wiperPos: 0.25 },
          },
          { id: 'g2', name: 'GND2', type: 'ground', x: 10, y: 5, rotation: 0, params: {} },
        ],
        wires: [{ id: 'w1', x1: 2, y1: 4, x2: 6, y2: 4 }],
        probes: [{ id: 'p1', label: 'V_WIPER', x: 8, y: 2, color: '#34d399' }],
        recommendedAnalysis: baseAnalysis,
      };

      const dc = solveDCOP(schematic);
      expect(dc.converged).toBe(true);
      expect(Math.abs(dc.probeVoltages.V_WIPER - 7.5)).toBeLessThan(1e-6);
    });

    it('vcvs & vccs: verify exact voltage gain (Vout = gain * Vin) and transconductance (Iout = gm * Vin)', () => {
      // VCVS: Vin = 2.0 V, gain = 3.5 -> Vout = 7.000 V
      const vcvsSchematic: CircuitSchematic = {
        id: 'unit-vcvs',
        name: 'VCVS Unit Test',
        description: 'Voltage-controlled voltage source gain check',
        category: 'Analog',
        components: [
          { id: 'v1', name: 'V1', type: 'vdc', x: 2, y: 6, rotation: 0, params: { voltage: 2.0 } },
          { id: 'g1', name: 'GND1', type: 'ground', x: 2, y: 9, rotation: 0, params: {} },
          { id: 'e1', name: 'E1', type: 'vcvs', x: 8, y: 5, rotation: 0, params: { gain: 3.5 } },
          { id: 'g2', name: 'GND2', type: 'ground', x: 6, y: 7, rotation: 0, params: {} },
          { id: 'g3', name: 'GND3', type: 'ground', x: 10, y: 7, rotation: 0, params: {} },
          { id: 'rl', name: 'R_L', type: 'resistor', x: 14, y: 6, rotation: 90, params: { resistance: 1000 } },
          { id: 'g4', name: 'GND4', type: 'ground', x: 14, y: 9, rotation: 0, params: {} },
        ],
        wires: [
          { id: 'w1', x1: 2, y1: 4, x2: 6, y2: 4 },
          { id: 'w2', x1: 10, y1: 4, x2: 14, y2: 4 },
        ],
        probes: [{ id: 'p1', label: 'V_OUT', x: 14, y: 4, color: '#34d399' }],
        recommendedAnalysis: baseAnalysis,
      };

      const dcE = solveDCOP(vcvsSchematic);
      expect(dcE.converged).toBe(true);
      expect(Math.abs(dcE.probeVoltages.V_OUT - 7.0)).toBeLessThan(1e-6);

      // VCCS: Vin = 2.0 V, gm = 5 mS -> Iout = 10 mA from out_pos to out_neg.
      // With out_pos at GND and out_neg driving R_L = 1 kΩ to GND: V(out_neg) = +10.000 V, I(R_L) = 10 mA
      const vccsSchematic: CircuitSchematic = {
        id: 'unit-vccs',
        name: 'VCCS Unit Test',
        description: 'Voltage-controlled current source transconductance check',
        category: 'Analog',
        components: [
          { id: 'v1', name: 'V1', type: 'vdc', x: 2, y: 6, rotation: 0, params: { voltage: 2.0 } },
          { id: 'g1', name: 'GND1', type: 'ground', x: 2, y: 9, rotation: 0, params: {} },
          { id: 'gsrc', name: 'G1', type: 'vccs', x: 8, y: 5, rotation: 0, params: { gm: 5e-3 } },
          { id: 'g2', name: 'GND2', type: 'ground', x: 6, y: 7, rotation: 0, params: {} },
          { id: 'g3', name: 'GND3', type: 'ground', x: 10, y: 5, rotation: 0, params: {} },
          { id: 'rl', name: 'R_L', type: 'resistor', x: 14, y: 8, rotation: 90, params: { resistance: 1000 } },
          { id: 'g4', name: 'GND4', type: 'ground', x: 14, y: 11, rotation: 0, params: {} },
        ],
        wires: [
          { id: 'w1', x1: 2, y1: 4, x2: 6, y2: 4 },
          { id: 'w2', x1: 10, y1: 6, x2: 14, y2: 6 },
        ],
        probes: [{ id: 'p1', label: 'V_OUT', x: 14, y: 6, color: '#34d399' }],
        recommendedAnalysis: baseAnalysis,
      };

      const dcG = solveDCOP(vccsSchematic);
      expect(dcG.converged).toBe(true);
      expect(Math.abs(dcG.probeVoltages.V_OUT - 10.0)).toBeLessThan(1e-6);
      expect(Math.abs(dcG.branchCurrents.R_L - 0.01)).toBeLessThan(1e-6);
    });

    it('vswitch: blocks current (rOff) when V_ctrl < V_th and conducts (rOn) when V_ctrl > V_th', () => {
      const makeSwitchCircuit = (vCtrl: number): CircuitSchematic => ({
        id: 'unit-vswitch',
        name: 'VSwitch Unit Test',
        description: 'Voltage-controlled switch ON/OFF verification',
        category: 'Analog',
        components: [
          { id: 'vc', name: 'V_CTRL', type: 'vdc', x: 2, y: 6, rotation: 0, params: { voltage: vCtrl } },
          { id: 'g1', name: 'GND1', type: 'ground', x: 2, y: 9, rotation: 0, params: {} },
          {
            id: 'sw1',
            name: 'S1',
            type: 'vswitch',
            x: 8,
            y: 5,
            rotation: 0,
            params: { vThreshold: 2.5, rOn: 0.1, rOff: 1e7 },
          },
          { id: 'g2', name: 'GND2', type: 'ground', x: 6, y: 7, rotation: 0, params: {} },
          { id: 'vs', name: 'V_SUP', type: 'vdc', x: 14, y: 6, rotation: 0, params: { voltage: 10 } },
          { id: 'g3', name: 'GND3', type: 'ground', x: 14, y: 9, rotation: 0, params: {} },
          { id: 'rl', name: 'R_L', type: 'resistor', x: 10, y: 8, rotation: 90, params: { resistance: 1000 } },
          { id: 'g4', name: 'GND4', type: 'ground', x: 10, y: 11, rotation: 0, params: {} },
        ],
        wires: [
          { id: 'w1', x1: 2, y1: 4, x2: 6, y2: 4 },
          { id: 'w2', x1: 10, y1: 4, x2: 14, y2: 4 },
        ],
        probes: [{ id: 'p1', label: 'V_LOAD', x: 10, y: 6, color: '#34d399' }],
        recommendedAnalysis: baseAnalysis,
      });

      const dcOff = solveDCOP(makeSwitchCircuit(0.0));
      expect(dcOff.converged).toBe(true);
      expect(dcOff.probeVoltages.V_LOAD).toBeLessThan(0.01);

      const dcOn = solveDCOP(makeSwitchCircuit(5.0));
      expect(dcOn.converged).toBe(true);
      const expectedOn = (10 * 1000) / (1000 + 0.1);
      expect(dcOn.probeVoltages.V_LOAD).toBeCloseTo(expectedOn, 3);
    });

    it('bjt_pnp: conducts in forward-active mode with V_E > V_B > V_C', () => {
      // PNP common-emitter / emitter-degenerated stage:
      // V_CC = 12 V -> R_E = 1k -> Q1.emitter; V_B = 9 V -> R_B = 10k -> Q1.base; Q1.collector -> R_C = 1k -> GND
      // V_E ≈ 9.7 V, I_E ≈ (12 - 9.7)/1k ≈ 2.3 mA, V_C ≈ 2.3 V -> V_E > V_B > V_C > 0
      const pnpSchematic: CircuitSchematic = {
        id: 'unit-pnp',
        name: 'PNP BJT Unit Test',
        description: 'PNP forward-active bias verification',
        category: 'Semiconductors',
        components: [
          { id: 'vcc', name: 'VCC', type: 'vdc', x: 2, y: 6, rotation: 0, params: { voltage: 12 } },
          { id: 'g1', name: 'GND1', type: 'ground', x: 2, y: 9, rotation: 0, params: {} },
          { id: 'vb', name: 'V_B', type: 'vdc', x: 6, y: 10, rotation: 0, params: { voltage: 9 } },
          { id: 'g2', name: 'GND2', type: 'ground', x: 6, y: 13, rotation: 0, params: {} },
          { id: 'rb', name: 'R_B', type: 'resistor', x: 10, y: 8, rotation: 0, params: { resistance: 10000 } },
          { id: 'q1', name: 'Q1', type: 'bjt_pnp', x: 14, y: 8, rotation: 0, params: { bf: 120, br: 1, is: 1e-14 } },
          { id: 're', name: 'R_E', type: 'resistor', x: 15, y: 4, rotation: 90, params: { resistance: 1000 } },
          { id: 'rc', name: 'R_C', type: 'resistor', x: 15, y: 12, rotation: 90, params: { resistance: 1000 } },
          { id: 'g3', name: 'GND3', type: 'ground', x: 15, y: 15, rotation: 0, params: {} },
        ],
        wires: [
          { id: 'w1', x1: 2, y1: 4, x2: 2, y2: 2 },
          { id: 'w2', x1: 2, y1: 2, x2: 15, y2: 2 },
          { id: 'w3', x1: 6, y1: 8, x2: 8, y2: 8 },
        ],
        probes: [
          { id: 'p1', label: 'V_E', x: 15, y: 6, color: '#22d3ee' },
          { id: 'p2', label: 'V_B', x: 12, y: 8, color: '#fbbf24' },
          { id: 'p3', label: 'V_C', x: 15, y: 10, color: '#34d399' },
        ],
        recommendedAnalysis: baseAnalysis,
      };

      const dc = solveDCOP(pnpSchematic);
      expect(dc.converged).toBe(true);
      const { V_E, V_B, V_C } = dc.probeVoltages;
      expect(V_E).toBeGreaterThan(V_B);
      expect(V_B).toBeGreaterThan(V_C);
      expect(V_C).toBeGreaterThan(1.0);
      // V_EB ≈ 0.65 - 0.75 V
      expect(V_E - V_B).toBeGreaterThan(0.55);
      expect(V_E - V_B).toBeLessThan(0.8);
      // Collector current magnitude > 1.5 mA
      expect(Math.abs(dc.branchCurrents.Q1)).toBeGreaterThan(1.5e-3);
    });

    it('fuse: emits overload warning in DC OP when current exceeds fuseRating', () => {
      // 10 V across Fuse (2 A rating, 0.05 Ω) + 1 Ω load -> I ≈ 9.52 A > 2 A
      const fuseSchematic: CircuitSchematic = {
        id: 'unit-fuse',
        name: 'Fuse Overload Unit Test',
        description: 'Fuse overcurrent warning verification',
        category: 'Passive',
        components: [
          { id: 'v1', name: 'V1', type: 'vdc', x: 2, y: 6, rotation: 0, params: { voltage: 10 } },
          { id: 'g1', name: 'GND1', type: 'ground', x: 2, y: 9, rotation: 0, params: {} },
          { id: 'f1', name: 'F1', type: 'fuse', x: 6, y: 4, rotation: 0, params: { fuseRating: 2, rOn: 0.05 } },
          { id: 'rl', name: 'R_L', type: 'resistor', x: 10, y: 6, rotation: 90, params: { resistance: 1 } },
          { id: 'g2', name: 'GND2', type: 'ground', x: 10, y: 9, rotation: 0, params: {} },
        ],
        wires: [
          { id: 'w1', x1: 2, y1: 4, x2: 4, y2: 4 },
          { id: 'w2', x1: 8, y1: 4, x2: 10, y2: 4 },
        ],
        probes: [{ id: 'p1', label: 'V_LOAD', x: 10, y: 4, color: '#34d399' }],
        recommendedAnalysis: baseAnalysis,
      };

      const dc = solveDCOP(fuseSchematic);
      expect(dc.converged).toBe(true);
      expect(dc.branchCurrents.F1).toBeCloseTo(10 / 1.05, 3);
      expect(dc.warnings.length).toBeGreaterThan(0);
      expect(dc.warnings.some((w) => /F1|fuse|rating|overload|exceed/i.test(w))).toBe(
        true
      );
    });
  });
});
