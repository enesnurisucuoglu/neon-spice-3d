import { ComponentParams, ComponentType } from '../types/circuit';

const SI_PREFIXES: { factor: number; symbol: string }[] = [
  { factor: 1e12, symbol: 'T' },
  { factor: 1e9, symbol: 'G' },
  { factor: 1e6, symbol: 'M' },
  { factor: 1e3, symbol: 'k' },
  { factor: 1, symbol: '' },
  { factor: 1e-3, symbol: 'm' },
  { factor: 1e-6, symbol: 'µ' },
  { factor: 1e-9, symbol: 'n' },
  { factor: 1e-12, symbol: 'p' },
  { factor: 1e-15, symbol: 'f' },
];

export function formatSI(value: number, unit = '', decimals = 2): string {
  if (!Number.isFinite(value)) return `— ${unit}`.trim();
  if (Math.abs(value) < 1e-18) return `0${unit ? ' ' + unit : ''}`;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  for (const p of SI_PREFIXES) {
    if (abs >= p.factor * 0.9995) {
      const scaled = abs / p.factor;
      const str =
        scaled >= 100
          ? scaled.toFixed(Math.max(0, decimals - 1))
          : scaled.toFixed(decimals);
      const cleaned = str.includes('.') ? str.replace(/\.?0+$/, '') : str;
      return `${sign}${cleaned}${p.symbol ? ' ' + p.symbol : unit ? ' ' : ''}${unit}`
        .replace(/\s+/g, ' ')
        .replace(/ ([TGMkmµnpf]) /, ' $1');
    }
  }
  return `${value.toExponential(2)} ${unit}`.trim();
}

export function formatSICompact(value: number, unit = ''): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 1e-18) return `0${unit}`;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  for (const p of SI_PREFIXES) {
    if (abs >= p.factor * 0.9995) {
      const scaled = abs / p.factor;
      const str = scaled.toPrecision(3);
      const num = parseFloat(str).toString();
      return `${sign}${num}${p.symbol}${unit}`;
    }
  }
  return `${value.toExponential(1)}${unit}`;
}

export function parseSI(input: string): number | null {
  const s = input.trim().replace(/Ω|Ohm|V|A|F|H|Hz|W|S|s$/i, '').trim();
  if (!s) return null;
  const match = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([TGMkmµunpf])?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return null;
  const suffix = match[2];
  const map: Record<string, number> = {
    T: 1e12,
    G: 1e9,
    M: 1e6,
    k: 1e3,
    m: 1e-3,
    µ: 1e-6,
    u: 1e-6,
    n: 1e-9,
    p: 1e-12,
    f: 1e-15,
  };
  return suffix ? num * (map[suffix] ?? 1) : num;
}

export function getDefaultParams(type: ComponentType): ComponentParams {
  switch (type) {
    case 'resistor':
      return { resistance: 1000 };
    case 'potentiometer':
      return { resistance: 10000, wiperPos: 0.5 };
    case 'capacitor':
      return { capacitance: 1e-6, ic: 0 };
    case 'inductor':
      return { inductance: 10e-3, ic: 0 };
    case 'transformer':
      return { turnsRatio: 0.1 };
    case 'fuse':
      return { rOn: 0.05, fuseRating: 1.0 };
    case 'lamp':
      return { resistance: 100, ratedPower: 1.0 };
    case 'vdc':
      return { voltage: 5, acMag: 0 };
    case 'vac':
      return { voltage: 0, amplitude: 5, frequency: 1000, phase: 0, acMag: 1 };
    case 'vpulse':
      return {
        vLow: 0,
        vHigh: 5,
        delay: 0,
        riseTime: 1e-6,
        fallTime: 1e-6,
        pulseWidth: 0.5e-3,
        period: 1e-3,
      };
    case 'idc':
      return { current: 1e-3 };
    case 'iac':
      return { current: 0, amplitude: 1e-3, frequency: 1000, phase: 0, acMag: 1e-3 };
    case 'vcvs':
      return { gain: 2 };
    case 'vccs':
      return { gm: 1e-3 };
    case 'diode':
      return { is: 1e-12, n: 1.0 };
    case 'zener':
      return { is: 1e-12, n: 1.0, bv: 5.1 };
    case 'schottky':
      return { is: 1e-6, n: 1.05 };
    case 'led':
      return { is: 1e-20, n: 1.8, ledColor: 'red' };
    case 'bjt_npn':
      return { is: 1e-14, bf: 150, br: 1 };
    case 'bjt_pnp':
      return { is: 1e-14, bf: 120, br: 1 };
    case 'nmos':
      return { vth: 1.5, kp: 0.02, lambda: 0.02 };
    case 'pmos':
      return { vth: -1.5, kp: 0.02, lambda: 0.02 };
    case 'opamp':
      return { gain: 1e5, vSatPos: 15, vSatNeg: -15 };
    case 'vswitch':
      return { vThreshold: 2.5, rOn: 0.1, rOff: 1e7 };
    case 'ground':
      return {};
  }
}

export function getComponentPrefix(type: ComponentType): string {
  switch (type) {
    case 'resistor':
      return 'R';
    case 'potentiometer':
      return 'RV';
    case 'capacitor':
      return 'C';
    case 'inductor':
      return 'L';
    case 'transformer':
      return 'T';
    case 'fuse':
      return 'F';
    case 'lamp':
      return 'LP';
    case 'vdc':
    case 'vac':
    case 'vpulse':
      return 'V';
    case 'idc':
    case 'iac':
      return 'I';
    case 'vcvs':
      return 'E';
    case 'vccs':
      return 'G';
    case 'diode':
      return 'D';
    case 'zener':
      return 'DZ';
    case 'schottky':
      return 'DS';
    case 'led':
      return 'LED';
    case 'bjt_npn':
    case 'bjt_pnp':
      return 'Q';
    case 'nmos':
    case 'pmos':
      return 'M';
    case 'opamp':
      return 'U';
    case 'vswitch':
      return 'S';
    case 'ground':
      return 'GND';
  }
}

export function getComponentPrimaryLabel(
  type: ComponentType,
  params: ComponentParams
): string {
  switch (type) {
    case 'resistor':
      return formatSICompact(params.resistance ?? 1000, 'Ω');
    case 'potentiometer':
      return `${formatSICompact(params.resistance ?? 10000, 'Ω')} (${Math.round(
        (params.wiperPos ?? 0.5) * 100
      )}%)`;
    case 'capacitor':
      return formatSICompact(params.capacitance ?? 1e-6, 'F');
    case 'inductor':
      return formatSICompact(params.inductance ?? 10e-3, 'H');
    case 'transformer': {
      const n = params.turnsRatio ?? 0.1;
      return n < 1 ? `${(1 / n).toFixed(1).replace(/\.0$/, '')}:1` : `1:${n.toFixed(1).replace(/\.0$/, '')}`;
    }
    case 'fuse':
      return `${formatSICompact(params.fuseRating ?? 1, 'A')}`;
    case 'lamp':
      return `${formatSICompact(params.resistance ?? 100, 'Ω')}`;
    case 'vdc':
      return formatSICompact(params.voltage ?? 5, 'V');
    case 'vac':
      return `${formatSICompact(params.amplitude ?? 5, 'V')} @ ${formatSICompact(
        params.frequency ?? 1000,
        'Hz'
      )}`;
    case 'vpulse':
      return `${params.vLow ?? 0}–${params.vHigh ?? 5}V`;
    case 'idc':
      return formatSICompact(params.current ?? 1e-3, 'A');
    case 'iac':
      return `${formatSICompact(params.amplitude ?? 1e-3, 'A')} @ ${formatSICompact(
        params.frequency ?? 1000,
        'Hz'
      )}`;
    case 'vcvs':
      return `×${params.gain ?? 2}`;
    case 'vccs':
      return `${formatSICompact(params.gm ?? 1e-3, 'S')}`;
    case 'diode':
      return '1N4148';
    case 'zener':
      return `${params.bv ?? 5.1}V`;
    case 'schottky':
      return '1N5819';
    case 'led':
      return (params.ledColor ?? 'red').toUpperCase();
    case 'bjt_npn':
      return `NPN β=${params.bf ?? 150}`;
    case 'bjt_pnp':
      return `PNP β=${params.bf ?? 120}`;
    case 'nmos':
      return `Vt=${params.vth ?? 1.5}V`;
    case 'pmos':
      return `Vt=${params.vth ?? -1.5}V`;
    case 'opamp':
      return 'OPA';
    case 'vswitch':
      return `Vth=${params.vThreshold ?? 2.5}V`;
    case 'ground':
      return '';
  }
}
