/**
 * Core type definitions for NeonSPICE Circuit Modeling & Simulation Studio.
 * Shared contract between the MNA/Newton-Raphson solver engine, preset library,
 * interactive schematic editor, and oscilloscope/Bode visualization layers.
 */

export type ComponentType =
  // Passive
  | 'resistor'
  | 'potentiometer'
  | 'capacitor'
  | 'inductor'
  | 'transformer'
  | 'fuse'
  | 'lamp'
  // Sources
  | 'vdc'
  | 'vac'
  | 'vpulse'
  | 'idc'
  | 'iac'
  | 'vcvs'
  | 'vccs'
  // Diodes
  | 'diode'
  | 'zener'
  | 'schottky'
  | 'led'
  // Transistors
  | 'bjt_npn'
  | 'bjt_pnp'
  | 'nmos'
  | 'pmos'
  // Active & Switching
  | 'opamp'
  | 'vswitch'
  // Reference
  | 'ground';

export type Rotation = 0 | 90 | 180 | 270;

export interface Point {
  x: number;
  y: number;
}

export interface PinDefinition {
  id: string;
  label: string;
  /** Offset from component center in schematic grid units (1 unit = 20px) at rotation = 0 */
  dx: number;
  dy: number;
}

export interface ComponentParams {
  /** Resistor / Potentiometer total resistance (Ohms) */
  resistance?: number;
  /** Potentiometer wiper position (0.01 .. 0.99, fraction from p1 to p2) */
  wiperPos?: number;
  /** Capacitor (Farads) */
  capacitance?: number;
  /** Inductor (Henrys) */
  inductance?: number;
  /** Initial voltage for capacitor / initial current for inductor */
  ic?: number;
  /** Transformer secondary-to-primary turns ratio (Ns / Np) */
  turnsRatio?: number;
  /** DC Voltage (Volts) or DC offset for AC/Pulse */
  voltage?: number;
  /** DC Current (Amps) or DC offset for IAC */
  current?: number;
  /** AC / Sine amplitude (Volts or Amps peak) */
  amplitude?: number;
  /** Frequency (Hz) */
  frequency?: number;
  /** Phase (degrees) */
  phase?: number;
  /** AC small-signal magnitude for AC sweep */
  acMag?: number;
  /** Pulse parameters */
  vLow?: number;
  vHigh?: number;
  delay?: number;
  riseTime?: number;
  fallTime?: number;
  pulseWidth?: number;
  period?: number;
  /** Diode / Zener / LED / Schottky Shockley model parameters */
  is?: number;   // Saturation current (A)
  n?: number;    // Ideality factor
  bv?: number;   // Zener reverse breakdown voltage (V, positive magnitude, e.g. 5.1)
  ledColor?: 'red' | 'green' | 'blue' | 'amber' | 'white';
  /** BJT Ebers-Moll parameters */
  bf?: number;   // Forward beta, default 150
  br?: number;   // Reverse beta, default 1
  /** MOSFET Level-1 Shichman-Hodges parameters */
  vth?: number;    // Threshold voltage (V): >0 for NMOS (e.g. 1.5), <0 for PMOS (e.g. -1.5)
  kp?: number;     // Transconductance parameter k'*(W/L) (A/V^2), default 0.02
  lambda?: number; // Channel-length modulation (1/V), default 0.02
  /** Op-Amp / VCVS gain & rail limits */
  gain?: number; // Open-loop gain Aol or VCVS gain E
  vSatPos?: number;
  vSatNeg?: number;
  /** VCCS transconductance (S = A/V) */
  gm?: number;
  /** Voltage-controlled switch parameters */
  vThreshold?: number; // Control threshold voltage (V)
  rOn?: number;        // On-state resistance (Ohms)
  rOff?: number;       // Off-state resistance (Ohms)
  /** Fuse current rating (Amps) */
  fuseRating?: number;
  /** Lamp rated power (Watts) & nominal resistance */
  ratedPower?: number;
}

export interface CircuitComponent {
  id: string;
  name: string; // e.g., R1, C1, D1, Q1, M1, U1, V1
  type: ComponentType;
  /** Position in grid units (integer coordinates, 1 grid = 20px) */
  x: number;
  y: number;
  rotation: Rotation;
  params: ComponentParams;
}

export interface Wire {
  id: string;
  /** Grid coordinates */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ProbeMarker {
  id: string;
  label: string;
  /** Grid coordinates where probe attaches */
  x: number;
  y: number;
  color: string;
}

export interface CircuitSchematic {
  id: string;
  name: string;
  description: string;
  category: 'Analog' | 'Power' | 'Filters' | 'Semiconductors' | 'Passive' | 'Digital / CMOS';
  components: CircuitComponent[];
  wires: Wire[];
  probes: ProbeMarker[];
  recommendedAnalysis: AnalysisConfig;
  /** Educational / engineering notes and closed-form reference equations */
  theoryNotes?: string;
}

export type AnalysisType = 'dc_op' | 'transient' | 'ac' | 'dc_sweep';

export interface TransientConfig {
  stopTime: number;  // seconds
  timeStep: number;  // seconds
  method?: 'trapezoidal' | 'backward_euler';
}

export interface ACConfig {
  startFreq: number; // Hz
  stopFreq: number;  // Hz
  pointsPerDecade: number;
  inputSourceName?: string; // Name of VAC/VDC source with acMag
}

export interface DCSweepConfig {
  sourceName: string;
  startValue: number;
  stopValue: number;
  stepValue: number;
}

export interface AnalysisConfig {
  type: AnalysisType;
  transient: TransientConfig;
  ac: ACConfig;
  dcSweep: DCSweepConfig;
}

export interface CompiledNode {
  id: number; // 0 is always GND
  name: string;
  points: Point[]; // All grid points belonging to this electrical net
}

export interface CompiledNetlist {
  nodes: CompiledNode[];
  /** Map from "x,y" grid key to node id */
  pointToNode: Record<string, number>;
  /** Map from componentId -> pinId -> node id */
  componentNodes: Record<string, Record<string, number>>;
  /** Map from probe label -> node id */
  probeNodes: Record<string, number>;
  spiceText: string;
  warnings: string[];
}

export interface DCOPResult {
  type: 'dc_op';
  converged: boolean;
  iterations: number;
  nodeVoltages: Record<number, number>;
  nodeNames: Record<number, string>;
  /** Branch currents for voltage sources, inductors, and calculated currents for 2-pin elements */
  branchCurrents: Record<string, number>;
  /** Power dissipation per component in Watts */
  componentPower: Record<string, number>;
  probeVoltages: Record<string, number>;
  warnings: string[];
}

export interface TransientResult {
  type: 'transient';
  converged: boolean;
  times: number[];
  /** Node voltages indexed by nodeId */
  nodeVoltages: Record<number, number[]>;
  /** Named probe voltages indexed by probe label */
  probeVoltages: Record<string, number[]>;
  /** Branch currents indexed by component name */
  branchCurrents: Record<string, number[]>;
  warnings: string[];
}

export interface ACResult {
  type: 'ac';
  frequencies: number[];
  /** Complex magnitude in dB (20*log10(|V|)) indexed by probe label */
  magnitudeDb: Record<string, number[]>;
  /** Linear magnitude |V| indexed by probe label */
  magnitudeLinear: Record<string, number[]>;
  /** Phase in degrees indexed by probe label */
  phaseDeg: Record<string, number[]>;
  /** Node-indexed magnitude in dB */
  nodeMagnitudeDb: Record<number, number[]>;
  /** Node-indexed phase in degrees */
  nodePhaseDeg: Record<number, number[]>;
  warnings: string[];
}

export interface DCSweepResult {
  type: 'dc_sweep';
  sourceName: string;
  sweepValues: number[];
  probeVoltages: Record<string, number[]>;
  branchCurrents: Record<string, number[]>;
  warnings: string[];
}

export type SimulationResult =
  | DCOPResult
  | TransientResult
  | ACResult
  | DCSweepResult;

/**
 * Standard pin layouts in grid units (relative to component center at rotation = 0).
 * Every pin lies on an integer grid coordinate so wires snap cleanly.
 */
export const COMPONENT_PINS: Record<ComponentType, PinDefinition[]> = {
  resistor: [
    { id: 'p1', label: '1', dx: -2, dy: 0 },
    { id: 'p2', label: '2', dx: 2, dy: 0 },
  ],
  potentiometer: [
    { id: 'p1', label: '1', dx: -2, dy: 0 },
    { id: 'p2', label: '2', dx: 2, dy: 0 },
    { id: 'wiper', label: 'W', dx: 0, dy: -2 },
  ],
  capacitor: [
    { id: 'p1', label: '+', dx: -2, dy: 0 },
    { id: 'p2', label: '-', dx: 2, dy: 0 },
  ],
  inductor: [
    { id: 'p1', label: '1', dx: -2, dy: 0 },
    { id: 'p2', label: '2', dx: 2, dy: 0 },
  ],
  transformer: [
    { id: 'p1', label: 'P+', dx: -2, dy: -1 },
    { id: 'p2', label: 'P-', dx: -2, dy: 1 },
    { id: 's1', label: 'S+', dx: 2, dy: -1 },
    { id: 's2', label: 'S-', dx: 2, dy: 1 },
  ],
  fuse: [
    { id: 'p1', label: '1', dx: -2, dy: 0 },
    { id: 'p2', label: '2', dx: 2, dy: 0 },
  ],
  lamp: [
    { id: 'p1', label: '1', dx: -2, dy: 0 },
    { id: 'p2', label: '2', dx: 2, dy: 0 },
  ],
  vdc: [
    { id: 'pos', label: '+', dx: 0, dy: -2 },
    { id: 'neg', label: '-', dx: 0, dy: 2 },
  ],
  vac: [
    { id: 'pos', label: '+', dx: 0, dy: -2 },
    { id: 'neg', label: '-', dx: 0, dy: 2 },
  ],
  vpulse: [
    { id: 'pos', label: '+', dx: 0, dy: -2 },
    { id: 'neg', label: '-', dx: 0, dy: 2 },
  ],
  idc: [
    { id: 'pos', label: '+', dx: 0, dy: -2 },
    { id: 'neg', label: '-', dx: 0, dy: 2 },
  ],
  iac: [
    { id: 'pos', label: '+', dx: 0, dy: -2 },
    { id: 'neg', label: '-', dx: 0, dy: 2 },
  ],
  vcvs: [
    { id: 'ctrl_pos', label: 'C+', dx: -2, dy: -1 },
    { id: 'ctrl_neg', label: 'C-', dx: -2, dy: 1 },
    { id: 'out_pos', label: 'O+', dx: 2, dy: -1 },
    { id: 'out_neg', label: 'O-', dx: 2, dy: 1 },
  ],
  vccs: [
    { id: 'ctrl_pos', label: 'C+', dx: -2, dy: -1 },
    { id: 'ctrl_neg', label: 'C-', dx: -2, dy: 1 },
    { id: 'out_pos', label: 'O+', dx: 2, dy: -1 },
    { id: 'out_neg', label: 'O-', dx: 2, dy: 1 },
  ],
  diode: [
    { id: 'anode', label: 'A', dx: -2, dy: 0 },
    { id: 'cathode', label: 'K', dx: 2, dy: 0 },
  ],
  zener: [
    { id: 'anode', label: 'A', dx: -2, dy: 0 },
    { id: 'cathode', label: 'K', dx: 2, dy: 0 },
  ],
  schottky: [
    { id: 'anode', label: 'A', dx: -2, dy: 0 },
    { id: 'cathode', label: 'K', dx: 2, dy: 0 },
  ],
  led: [
    { id: 'anode', label: 'A', dx: -2, dy: 0 },
    { id: 'cathode', label: 'K', dx: 2, dy: 0 },
  ],
  bjt_npn: [
    { id: 'base', label: 'B', dx: -2, dy: 0 },
    { id: 'collector', label: 'C', dx: 1, dy: -2 },
    { id: 'emitter', label: 'E', dx: 1, dy: 2 },
  ],
  bjt_pnp: [
    { id: 'base', label: 'B', dx: -2, dy: 0 },
    { id: 'collector', label: 'C', dx: 1, dy: 2 },
    { id: 'emitter', label: 'E', dx: 1, dy: -2 },
  ],
  nmos: [
    { id: 'gate', label: 'G', dx: -2, dy: 0 },
    { id: 'drain', label: 'D', dx: 1, dy: -2 },
    { id: 'source', label: 'S', dx: 1, dy: 2 },
  ],
  pmos: [
    { id: 'gate', label: 'G', dx: -2, dy: 0 },
    { id: 'drain', label: 'D', dx: 1, dy: 2 },
    { id: 'source', label: 'S', dx: 1, dy: -2 },
  ],
  opamp: [
    { id: 'in_pos', label: '+', dx: -2, dy: -1 },
    { id: 'in_neg', label: '-', dx: -2, dy: 1 },
    { id: 'out', label: 'OUT', dx: 2, dy: 0 },
  ],
  vswitch: [
    { id: 'ctrl_pos', label: 'C+', dx: -2, dy: -1 },
    { id: 'ctrl_neg', label: 'C-', dx: -2, dy: 1 },
    { id: 'p1', label: '1', dx: 2, dy: -1 },
    { id: 'p2', label: '2', dx: 2, dy: 1 },
  ],
  ground: [{ id: 'gnd', label: '0', dx: 0, dy: -1 }],
};

/**
 * Compute world grid position of a pin given component position and rotation.
 */
export function getPinWorldPos(
  comp: Pick<CircuitComponent, 'x' | 'y' | 'rotation'>,
  pin: PinDefinition
): Point {
  let rx = pin.dx;
  let ry = pin.dy;
  switch (comp.rotation) {
    case 90:
      rx = -pin.dy;
      ry = pin.dx;
      break;
    case 180:
      rx = -pin.dx;
      ry = -pin.dy;
      break;
    case 270:
      rx = pin.dy;
      ry = -pin.dx;
      break;
    default:
      break;
  }
  return { x: comp.x + rx, y: comp.y + ry };
}

export function pointKey(x: number, y: number): string {
  return `${Math.round(x)},${Math.round(y)}`;
}
