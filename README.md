# NeonSPICE 3D — Interactive 3D PCB & SPICE Circuit Simulation Studio

**NeonSPICE 3D** is a browser-based, zero-math-dependency **Electrical & Electronics Engineering SPICE simulator, Cities: Skylines-style 3D PCB builder, and 50-level interactive Electronics Academy** built from scratch in TypeScript, React, and Three.js.

## Highlights

- **Custom MNA / Newton-Raphson SPICE Engine**
  - Real & complex partial-pivoting LU decomposition written from scratch
  - Modified Nodal Analysis (MNA) with Gmin & Source Stepping continuation
  - Nonlinear models: Shockley Diode (`pnjlim`), Zener breakdown, Schottky, color-calibrated LEDs, Ebers-Moll NPN & PNP BJTs (3×3 Jacobian), Level-1 Shichman-Hodges NMOS & PMOS MOSFETs, soft-saturating Op-Amp, smooth `tanh` Voltage-Controlled Switch, ideal coupled Transformer, VCVS, VCCS
  - **4 Analysis Modes:** DC Operating Point (`dc_op`), DC Sweep (`dc_sweep`), AC Small-Signal Bode (`ac`), and Transient (`transient` — Backward Euler startup + Trapezoidal integration)
- **Cities: Skylines-Style Interactive 3D PCB Lab (Three.js WebGL PBR)**
  - Top-down bird's-eye 3D default view with smooth **`WASD` + Arrow Keys** camera navigation (`Q`/`E` elevation)
  - Place components with live 3D holographic ghosts (`R` / Right-Click to rotate 90°), drag to move on the PCB grid, route live 3D orthogonal copper traces, drop 3D voltage probes
  - All **25 industry components** procedurally modeled in 3D PBR: dynamic EIA 4-band color-coded resistors, live rotating potentiometer shaft, electrolytic/ceramic capacitors, copper-wound inductors, E-I transformers, TO-92 BJTs, TO-220 MOSFETs with aluminum heatsinks, 8-pin DIP Op-Amps, glowing LEDs & lamps with real Three.js `PointLight`s
  - 4 FR-4 PCB soldermask themes (`Emerald`, `Matte Black`, `Royal Blue`, `White Lab`), live current-flow particle animation, and **FLIR Thermal Camera** power dissipation heat overlay
- **50-Level Verified Interactive Electronics Academy**
  - 10 chapters × 5 real-world circuits — from Level 1 (5V battery + Ohm's Law + first LED) to Level 50 (buffered 5.1V Zener precision power reference)
  - Every level starts from an **empty PCB board** with two modes:
    - **Tutorial (Step-by-Step):** Pulsing palette highlights + 3D holographic target beacons guide every component, value, wire, and probe
    - **Kendin Dene (Challenge Mode):** Zero hand-holding, order-independent real-SPICE electrical verification
  - Completion summary + **50 tailored Turkish Mini-Quizzes** + persistent `localStorage` progress
- **110 / 110 Automated SPICE Verification Tests** (`Vitest`)
  - 31 analytical-vs-simulated EE physics tests (`tests/solver.physics.test.ts`)
  - 79 Academy curriculum, 25-component guide, and 50/50 real-SPICE level verification tests (`tests/academy.50levels.test.ts`)

## Quick Start

```bash
# Install & launch locally (http://localhost:5174)
npm install
npm run dev

# Or one-click launch (starts server & opens browser)
./start-3d.sh

# Run all 110 SPICE physics & academy tests
npm test

# Production build (Vercel-ready)
npm run build
```

## Deploy to Vercel

Includes `vercel.json` for zero-config SPA deployment:
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
