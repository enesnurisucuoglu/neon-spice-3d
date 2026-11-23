# NeonSPICE — Interactive SPICE Circuit Modeling & Simulation Studio

**NeonSPICE** is a browser-based, zero-math-dependency **Electrical & Electronics Engineering SPICE simulator and interactive schematic workbench** written from scratch in TypeScript & React.

## Key Capabilities

- **Custom MNA / Newton-Raphson SPICE Engine**
  - Real & complex partial-pivoting LU decomposition
  - Modified Nodal Analysis (MNA) with Gmin & Source Stepping continuation
  - Nonlinear semiconductor & active models: Shockley Diode (`pnjlim`), Zener breakdown, Schottky, color-calibrated LEDs, Ebers-Moll NPN & PNP BJTs (3×3 Jacobian), Level-1 Shichman-Hodges NMOS & PMOS MOSFETs, soft-saturating Op-Amp, smooth `tanh` Voltage-Controlled Switch, ideal coupled Transformer, VCVS, VCCS
  - **4 Analysis Modes:** DC Operating Point (`dc_op`), DC Sweep (`dc_sweep`), AC Small-Signal Bode (`ac`), and Transient (`transient` — Backward Euler startup + Trapezoidal integration)
- **25 Industry-Standard Circuit Components**
  - **Sources:** `VDC`, `VAC`, `VPULSE`, `IDC`, `IAC`, `VCVS`, `VCCS`
  - **Passive:** `Resistor`, `Potentiometer` (live slider), `Capacitor`, `Inductor`, `Transformer`, `Fuse` (overload detection), `Lamp` (live power glow)
  - **Diodes:** `1N4148 Silicon`, `Zener`, `Schottky`, `LED` (live current-driven optical glow)
  - **Transistors:** `NPN BJT`, `PNP BJT`, `NMOS`, `PMOS`
  - **Active & Ref:** `Op-Amp`, `Voltage-Controlled Switch`, `Ground`
- **11 Pre-Built EE Benchmark Circuits**
  1. Series RLC Bandpass & Resonance
  2. Full-Wave Bridge Rectifier + RC Filter
  3. Common-Emitter NPN BJT Amplifier
  4. Sallen-Key 2nd-Order Butterworth LPF
  5. RC Square-Wave Step Response
  6. Biased Diode Voltage Clipper
  7. Inverting Op-Amp Gain Stage
  8. 5.1V Zener Diode Voltage Regulator
  9. CMOS Logic Inverter (PMOS + NMOS)
  10. NMOS Low-Side PWM Switch & LED Driver
  11. 10:1 Step-Down Transformer + Schottky Bridge PSU
- **31/31 Analytical Physics Verification Tests** (`Vitest`) comparing simulated voltages, currents, resonance frequencies, $-3\text{ dB}$ cutoffs, $-40\text{ dB/dec}$ slopes, CMOS switching thresholds, and Zener clamping against closed-form EE textbook equations.

## One-Click Launch & Commands

```bash
# One-click launch (starts server & opens browser automatically)
./start.sh

# Or via npm:
npm install
npm run dev      # Start studio at http://localhost:5173
npm test         # Run 31 analytical EE physics verification tests
npm run build    # TypeScript check + production bundle
```
