import React from 'react';
import { CircuitComponent, COMPONENT_PINS, ComponentType, Rotation } from '../types/circuit';
import { getComponentPrimaryLabel } from '../utils/format';

export const GRID_SIZE = 20;

export interface ComponentSymbolProps {
  component: Pick<CircuitComponent, 'name' | 'type' | 'x' | 'y' | 'rotation' | 'params'>;
  selected?: boolean;
  ghost?: boolean;
  showPins?: boolean;
  liveCurrent?: number;
  livePower?: number;
  onMouseDown?: (e: React.MouseEvent<SVGGElement>) => void;
  onClick?: (e: React.MouseEvent<SVGGElement>) => void;
}

const LED_COLOR_MAP: Record<string, { core: string; glow: string }> = {
  red: { core: '#ff4d4d', glow: '#ef4444' },
  green: { core: '#4ade80', glow: '#22c55e' },
  blue: { core: '#60a5fa', glow: '#3b82f6' },
  amber: { core: '#fcd34d', glow: '#f59e0b' },
  white: { core: '#ffffff', glow: '#e0f2fe' },
};

function getLabelPosition(
  type: ComponentType,
  rotation: Rotation
): { x: number; y: number; anchor: 'middle' | 'start' | 'end' } {
  const isVertical = rotation === 90 || rotation === 270;

  if (type === 'vdc' || type === 'vac' || type === 'vpulse' || type === 'idc' || type === 'iac') {
    if (!isVertical) {
      return { x: 26, y: -4, anchor: 'start' };
    }
    return { x: 0, y: -28, anchor: 'middle' };
  }

  if (type === 'bjt_npn' || type === 'bjt_pnp' || type === 'nmos' || type === 'pmos') {
    return { x: 28, y: -4, anchor: 'start' };
  }

  if (type === 'opamp' || type === 'transformer' || type === 'vcvs' || type === 'vccs' || type === 'vswitch') {
    return { x: 0, y: -34, anchor: 'middle' };
  }

  if (type === 'potentiometer') {
    if (isVertical) {
      return { x: 22, y: -4, anchor: 'start' };
    }
    return { x: 0, y: 22, anchor: 'middle' };
  }

  // Horizontal 2-pin components (resistor, capacitor, inductor, fuse, lamp, diodes)
  if (isVertical) {
    return { x: 20, y: -4, anchor: 'start' };
  }
  return { x: 0, y: -24, anchor: 'middle' };
}

function getSymbolStroke(
  type: ComponentType,
  selected: boolean,
  params: CircuitComponent['params']
): string {
  if (selected) return '#22d3ee';
  switch (type) {
    case 'vdc':
    case 'vac':
    case 'vpulse':
    case 'idc':
    case 'iac':
    case 'vcvs':
    case 'vccs':
      return '#fbbf24';
    case 'diode':
    case 'zener':
    case 'schottky':
    case 'bjt_npn':
    case 'bjt_pnp':
      return '#fb7185';
    case 'led':
      return LED_COLOR_MAP[params.ledColor ?? 'red']?.core ?? '#fb7185';
    case 'nmos':
    case 'pmos':
      return '#c084fc';
    case 'opamp':
    case 'vswitch':
      return '#a78bfa';
    case 'ground':
      return '#64748b';
    case 'capacitor':
      return '#38bdf8';
    case 'inductor':
    case 'transformer':
      return '#34d399';
    case 'lamp':
      return '#fde047';
    case 'fuse':
      return '#fdba74';
    default:
      return '#e2e8f0';
  }
}

export const ComponentSymbol: React.FC<ComponentSymbolProps> = ({
  component,
  selected = false,
  ghost = false,
  showPins = true,
  liveCurrent,
  livePower,
  onMouseDown,
  onClick,
}) => {
  const { name, type, x, y, rotation, params } = component;
  const cx = x * GRID_SIZE;
  const cy = y * GRID_SIZE;
  const stroke = getSymbolStroke(type, selected, params);
  const strokeWidth = selected ? 2.2 : 1.8;
  const pins = COMPONENT_PINS[type];
  const primaryLabel = getComponentPrimaryLabel(type, params);
  const labelPos = getLabelPosition(type, rotation);

  // Live optical feedback calculations for LED & Lamp
  const ledGlowIntensity =
    !ghost && type === 'led' && liveCurrent !== undefined && liveCurrent > 0.5e-3
      ? Math.min(1, Math.log10(1 + (liveCurrent * 1000) / 1.5) / 1.15)
      : 0;
  const ledPalette = LED_COLOR_MAP[params.ledColor ?? 'red'] ?? LED_COLOR_MAP.red;

  const lampGlowIntensity =
    !ghost && type === 'lamp' && livePower !== undefined && livePower > 1e-4
      ? Math.min(1, Math.sqrt(livePower / Math.max(0.05, params.ratedPower ?? 1.0)))
      : 0;

  const renderShape = () => {
    switch (type) {
      case 'resistor':
        return (
          <>
            <line x1={-40} y1={0} x2={-24} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <polyline
              points="-24,0 -20,-8 -12,8 -4,-8 4,8 12,-8 20,8 24,0"
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <line x1={24} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );

      case 'potentiometer': {
        const wFrac = Math.max(0.05, Math.min(0.95, params.wiperPos ?? 0.5));
        const wx = -20 + wFrac * 40;
        return (
          <>
            <line x1={-40} y1={0} x2={-24} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <polyline
              points="-24,0 -20,-8 -12,8 -4,-8 4,8 12,-8 20,8 24,0"
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <line x1={24} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            {/* Wiper lead from (0, -40) bending smoothly to wiper position */}
            <polyline
              points={`0,-40 0,-22 ${wx.toFixed(1)},-22 ${wx.toFixed(1)},-12`}
              fill="none"
              stroke="#22d3ee"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polygon
              points={`${wx.toFixed(1)},-8 ${(wx - 4.5).toFixed(1)},-15 ${(wx + 4.5).toFixed(1)},-15`}
              fill="#22d3ee"
            />
          </>
        );
      }

      case 'capacitor':
        return (
          <>
            <line x1={-40} y1={0} x2={-5} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={-5} y1={-14} x2={-5} y2={14} stroke={stroke} strokeWidth={strokeWidth + 0.6} strokeLinecap="round" />
            <line x1={5} y1={-14} x2={5} y2={14} stroke={stroke} strokeWidth={strokeWidth + 0.6} strokeLinecap="round" />
            <line x1={5} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );

      case 'inductor':
        return (
          <>
            <line x1={-40} y1={0} x2={-24} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <path
              d="M -24 0 A 6 7 0 0 1 -12 0 A 6 7 0 0 1 0 0 A 6 7 0 0 1 12 0 A 6 7 0 0 1 24 0"
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            <line x1={24} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );

      case 'transformer':
        return (
          <>
            {/* Primary leads */}
            <line x1={-40} y1={-20} x2={-14} y2={-20} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={-40} y1={20} x2={-14} y2={20} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            {/* Primary coils */}
            <path
              d="M -14 -20 A 6 5 0 0 1 -14 -10 A 6 5 0 0 1 -14 0 A 6 5 0 0 1 -14 10 A 6 5 0 0 1 -14 20"
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            {/* Magnetic Core Bars */}
            <line x1={-2.5} y1={-22} x2={-2.5} y2={22} stroke="#94a3b8" strokeWidth={1.6} strokeLinecap="round" />
            <line x1={2.5} y1={-22} x2={2.5} y2={22} stroke="#94a3b8" strokeWidth={1.6} strokeLinecap="round" />
            {/* Secondary coils */}
            <path
              d="M 14 -20 A 6 5 0 0 0 14 -10 A 6 5 0 0 0 14 0 A 6 5 0 0 0 14 10 A 6 5 0 0 0 14 20"
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            {/* Secondary leads */}
            <line x1={14} y1={-20} x2={40} y2={-20} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={14} y1={20} x2={40} y2={20} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            {/* Polarity dots */}
            <circle cx={-21} cy={-14} r={2.2} fill={stroke} />
            <circle cx={21} cy={-14} r={2.2} fill={stroke} />
          </>
        );

      case 'fuse':
        return (
          <>
            <line x1={-40} y1={0} x2={-22} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={22} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <rect
              x={-22}
              y={-9}
              width={44}
              height={18}
              rx={3}
              fill="rgba(253, 186, 116, 0.08)"
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
            <path
              d="M -22 0 C -13 -10, -5 -10, 0 0 C 5 10, 13 10, 22 0"
              fill="none"
              stroke={stroke}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </>
        );

      case 'lamp':
        return (
          <>
            {lampGlowIntensity > 0 && (
              <>
                <circle
                  cx={0}
                  cy={0}
                  r={22 + lampGlowIntensity * 14}
                  fill="#f59e0b"
                  fillOpacity={0.14 + lampGlowIntensity * 0.24}
                  style={{ filter: 'blur(4px)' }}
                />
                <circle
                  cx={0}
                  cy={0}
                  r={16}
                  fill="#fde047"
                  fillOpacity={0.22 + lampGlowIntensity * 0.55}
                />
              </>
            )}
            <line x1={-40} y1={0} x2={-16} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={16} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <circle
              cx={0}
              cy={0}
              r={16}
              fill={lampGlowIntensity > 0 ? 'rgba(253, 224, 71, 0.25)' : '#0b0f17'}
              stroke={lampGlowIntensity > 0.3 ? '#fef08a' : stroke}
              strokeWidth={strokeWidth}
            />
            <line x1={-11} y1={-11} x2={11} y2={11} stroke={lampGlowIntensity > 0.3 ? '#fef9c3' : stroke} strokeWidth={1.7} strokeLinecap="round" />
            <line x1={-11} y1={11} x2={11} y2={-11} stroke={lampGlowIntensity > 0.3 ? '#fef9c3' : stroke} strokeWidth={1.7} strokeLinecap="round" />
          </>
        );

      case 'vdc':
        return (
          <>
            <line x1={0} y1={-40} x2={0} y2={-20} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={0} y1={20} x2={0} y2={40} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <circle cx={0} cy={0} r={20} fill="#0b0f17" stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={-4.5} y1={-8} x2={4.5} y2={-8} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
            <line x1={0} y1={-12.5} x2={0} y2={-3.5} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
            <line x1={-4.5} y1={9} x2={4.5} y2={9} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
          </>
        );

      case 'vac':
        return (
          <>
            <line x1={0} y1={-40} x2={0} y2={-20} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={0} y1={20} x2={0} y2={40} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <circle cx={0} cy={0} r={20} fill="#0b0f17" stroke={stroke} strokeWidth={strokeWidth} />
            <path
              d="M -11 0 C -7 -11, -3 -11, 0 0 C 3 11, 7 11, 11 0"
              fill="none"
              stroke={stroke}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            <text x={8} y={-23} fill={stroke} fontSize={9} fontFamily="var(--font-mono)" textAnchor="middle">
              +
            </text>
          </>
        );

      case 'vpulse':
        return (
          <>
            <line x1={0} y1={-40} x2={0} y2={-20} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={0} y1={20} x2={0} y2={40} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <circle cx={0} cy={0} r={20} fill="#0b0f17" stroke={stroke} strokeWidth={strokeWidth} />
            <polyline
              points="-12,6 -6,6 -6,-6 5,-6 5,6 12,6"
              fill="none"
              stroke={stroke}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <text x={8} y={-23} fill={stroke} fontSize={9} fontFamily="var(--font-mono)" textAnchor="middle">
              +
            </text>
          </>
        );

      case 'idc':
        return (
          <>
            <line x1={0} y1={-40} x2={0} y2={-20} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={0} y1={20} x2={0} y2={40} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <circle cx={0} cy={0} r={20} fill="#0b0f17" stroke={stroke} strokeWidth={strokeWidth} />
            <line x1={0} y1={11} x2={0} y2={-9} stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
            <polygon points="0,-13 -4.5,-5 4.5,-5" fill={stroke} />
          </>
        );

      case 'iac':
        return (
          <>
            <line x1={0} y1={-40} x2={0} y2={-20} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={0} y1={20} x2={0} y2={40} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <circle cx={0} cy={0} r={20} fill="#0b0f17" stroke={stroke} strokeWidth={strokeWidth} />
            {/* Upward arrow on left half */}
            <line x1={-6} y1={10} x2={-6} y2={-8} stroke={stroke} strokeWidth={1.7} strokeLinecap="round" />
            <polygon points="-6,-12 -9.5,-5 -2.5,-5" fill={stroke} />
            {/* Small sine wave on right half */}
            <path
              d="M 1 0 C 3 -8, 5 -8, 7 0 C 9 8, 11 8, 13 0"
              fill="none"
              stroke={stroke}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </>
        );

      case 'vcvs':
        return (
          <>
            {/* Control leads */}
            <polyline points="-40,-20 -16,-20 -12,-12" fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="-40,20 -16,20 -12,12" fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            {/* Output leads */}
            <polyline points="40,-20 16,-20 12,-12" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="40,20 16,20 12,12" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            {/* Diamond body */}
            <polygon points="0,-22 22,0 0,22 -22,0" fill="#0b0f17" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
            {/* + / - inside diamond */}
            <line x1={-4} y1={-7} x2={4} y2={-7} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
            <line x1={0} y1={-11} x2={0} y2={-3} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
            <line x1={-4} y1={8} x2={4} y2={8} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
            <text x={-29} y={-11} fill="#94a3b8" fontSize={8} fontFamily="var(--font-mono)">+</text>
            <text x={-29} y={17} fill="#94a3b8" fontSize={8} fontFamily="var(--font-mono)">-</text>
          </>
        );

      case 'vccs':
        return (
          <>
            <polyline points="-40,-20 -16,-20 -12,-12" fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="-40,20 -16,20 -12,12" fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="40,-20 16,-20 12,-12" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="40,20 16,20 12,12" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <polygon points="0,-22 22,0 0,22 -22,0" fill="#0b0f17" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
            {/* Arrow inside diamond */}
            <line x1={0} y1={10} x2={0} y2={-7} stroke={stroke} strokeWidth={1.7} strokeLinecap="round" />
            <polygon points="0,-12 -4,-4.5 4,-4.5" fill={stroke} />
            <text x={-29} y={-11} fill="#94a3b8" fontSize={8} fontFamily="var(--font-mono)">+</text>
            <text x={-29} y={17} fill="#94a3b8" fontSize={8} fontFamily="var(--font-mono)">-</text>
          </>
        );

      case 'diode':
        return (
          <>
            <line x1={-40} y1={0} x2={-11} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <polygon
              points="-11,-11 -11,11 11,0"
              fill="rgba(251, 113, 133, 0.14)"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
            <line x1={11} y1={-12} x2={11} y2={12} stroke={stroke} strokeWidth={strokeWidth + 0.5} strokeLinecap="round" />
            <line x1={11} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );

      case 'zener':
        return (
          <>
            <line x1={-40} y1={0} x2={-11} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <polygon
              points="-11,-11 -11,11 11,0"
              fill="rgba(251, 113, 133, 0.14)"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
            {/* Bent Z-shaped cathode bar */}
            <polyline
              points="6,-14 11,-11 11,11 16,14"
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth + 0.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line x1={11} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );

      case 'schottky':
        return (
          <>
            <line x1={-40} y1={0} x2={-11} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <polygon
              points="-11,-11 -11,11 11,0"
              fill="rgba(251, 113, 133, 0.14)"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
            {/* S-hooked cathode bar */}
            <polyline
              points="6,-8 6,-12 11,-12 11,12 16,12 16,8"
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth + 0.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line x1={11} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );

      case 'led':
        return (
          <>
            {ledGlowIntensity > 0 && (
              <>
                <circle
                  cx={0}
                  cy={0}
                  r={18 + ledGlowIntensity * 16}
                  fill={ledPalette.glow}
                  fillOpacity={0.16 + ledGlowIntensity * 0.28}
                  style={{ filter: 'blur(5px)' }}
                />
                <circle
                  cx={0}
                  cy={0}
                  r={10 + ledGlowIntensity * 5}
                  fill={ledPalette.core}
                  fillOpacity={0.25 + ledGlowIntensity * 0.45}
                  style={{ filter: 'blur(2px)' }}
                />
              </>
            )}
            <line x1={-40} y1={0} x2={-11} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <polygon
              points="-11,-11 -11,11 11,0"
              fill={ledGlowIntensity > 0 ? ledPalette.core : `${ledPalette.glow}26`}
              fillOpacity={ledGlowIntensity > 0 ? 0.35 + ledGlowIntensity * 0.55 : 1}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
            <line x1={11} y1={-12} x2={11} y2={12} stroke={stroke} strokeWidth={strokeWidth + 0.5} strokeLinecap="round" />
            <line x1={11} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            {/* Light emission arrows */}
            <line x1={-2} y1={-14} x2={6} y2={-22} stroke={ledPalette.core} strokeWidth={1.4} strokeLinecap="round" />
            <polygon points="8,-24 2.5,-22 5.5,-18.5" fill={ledPalette.core} />
            <line x1={6} y1={-12} x2={14} y2={-20} stroke={ledPalette.core} strokeWidth={1.4} strokeLinecap="round" />
            <polygon points="16,-22 10.5,-20 13.5,-16.5" fill={ledPalette.core} />
          </>
        );

      case 'bjt_npn':
        return (
          <>
            <circle cx={2} cy={0} r={22} fill="rgba(251, 113, 133, 0.06)" stroke={stroke} strokeWidth={1.3} strokeOpacity={0.75} />
            <line x1={-40} y1={0} x2={-10} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={-10} y1={-15} x2={-10} y2={15} stroke={stroke} strokeWidth={2.8} strokeLinecap="round" />
            <polyline points="-10,-7 20,-24 20,-40" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
            <polyline points="-10,7 20,24 20,40" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
            {/* Outward NPN emitter arrow */}
            <polygon points="16,21.7 5.5,20.5 9.8,13.5" fill={stroke} />
          </>
        );

      case 'bjt_pnp':
        return (
          <>
            <circle cx={2} cy={0} r={22} fill="rgba(251, 113, 133, 0.06)" stroke={stroke} strokeWidth={1.3} strokeOpacity={0.75} />
            <line x1={-40} y1={0} x2={-10} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={-10} y1={-15} x2={-10} y2={15} stroke={stroke} strokeWidth={2.8} strokeLinecap="round" />
            {/* Emitter at top (20, -40) */}
            <polyline points="-10,-7 20,-24 20,-40" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
            {/* Collector at bottom (20, 40) */}
            <polyline points="-10,7 20,24 20,40" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
            {/* Inward PNP emitter arrow pointing toward base */}
            <polygon points="-5,-9.8 5.5,-11.2 1.2,-18" fill={stroke} />
          </>
        );

      case 'nmos':
        return (
          <>
            <circle cx={2} cy={0} r={23} fill="rgba(192, 132, 252, 0.05)" stroke={stroke} strokeWidth={1.2} strokeOpacity={0.55} />
            {/* Gate lead & insulated gate bar */}
            <line x1={-40} y1={0} x2={-14} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={-14} y1={-15} x2={-14} y2={15} stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
            {/* Broken enhancement channel bar */}
            <line x1={-6} y1={-16} x2={-6} y2={-8} stroke={stroke} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={-6} y1={-4} x2={-6} y2={4} stroke={stroke} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={-6} y1={8} x2={-6} y2={16} stroke={stroke} strokeWidth={2.4} strokeLinecap="round" />
            {/* Drain (20, -40) */}
            <polyline points="-6,-12 20,-12 20,-40" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
            {/* Source (20, 40) */}
            <polyline points="-6,12 20,12 20,40" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
            {/* Substrate tie to source with inward arrow */}
            <polyline points="-6,0 20,0 20,12" fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
            <polygon points="-4,0 5,-4 5,4" fill={stroke} />
          </>
        );

      case 'pmos':
        return (
          <>
            <circle cx={2} cy={0} r={23} fill="rgba(192, 132, 252, 0.05)" stroke={stroke} strokeWidth={1.2} strokeOpacity={0.55} />
            {/* Gate lead with inversion bubble */}
            <line x1={-40} y1={0} x2={-21} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <circle cx={-17.5} cy={0} r={3.3} fill="#0b0f17" stroke={stroke} strokeWidth={1.6} />
            <line x1={-14} y1={-15} x2={-14} y2={15} stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
            {/* Broken enhancement channel bar */}
            <line x1={-6} y1={-16} x2={-6} y2={-8} stroke={stroke} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={-6} y1={-4} x2={-6} y2={4} stroke={stroke} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={-6} y1={8} x2={-6} y2={16} stroke={stroke} strokeWidth={2.4} strokeLinecap="round" />
            {/* Source at top (20, -40) */}
            <polyline points="-6,-12 20,-12 20,-40" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
            {/* Drain at bottom (20, 40) */}
            <polyline points="-6,12 20,12 20,40" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
            {/* Substrate tie to source with outward arrow */}
            <polyline points="-6,0 20,0 20,-12" fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
            <polygon points="10,0 1,-4 1,4" fill={stroke} />
          </>
        );

      case 'opamp':
        return (
          <>
            <line x1={-40} y1={-20} x2={-22} y2={-20} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={-40} y1={20} x2={-22} y2={20} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={24} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <polygon
              points="-22,-30 -22,30 24,0"
              fill="rgba(167, 139, 250, 0.08)"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
            <line x1={-17} y1={-17} x2={-11} y2={-17} stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />
            <line x1={-14} y1={-20} x2={-14} y2={-14} stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />
            <line x1={-17} y1={17} x2={-11} y2={17} stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />
          </>
        );

      case 'vswitch':
        return (
          <>
            {/* Control leads & coil box on left */}
            <polyline points="-40,-20 -20,-20 -20,-12" fill="none" stroke="#94a3b8" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="-40,20 -20,20 -20,12" fill="none" stroke="#94a3b8" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            <rect x={-29} y={-12} width={18} height={24} rx={3} fill="rgba(167, 139, 250, 0.1)" stroke={stroke} strokeWidth={1.6} />
            <text x={-20} y={-3} textAnchor="middle" fill={stroke} fontSize={8} fontFamily="var(--font-mono)">+</text>
            <text x={-20} y={9} textAnchor="middle" fill={stroke} fontSize={8} fontFamily="var(--font-mono)">-</text>
            {/* Dashed mechanical link */}
            <line x1={-11} y1={0} x2={14} y2={0} stroke="#64748b" strokeWidth={1.3} strokeDasharray="3 2.5" />
            {/* SPST Switch contacts on right */}
            <polyline points="40,-20 20,-20 20,-10" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="40,20 20,20 20,10" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={20} cy={-10} r={2.5} fill="#0b0f17" stroke={stroke} strokeWidth={1.6} />
            <circle cx={20} cy={10} r={2.5} fill="#0b0f17" stroke={stroke} strokeWidth={1.6} />
            {/* Switch blade */}
            <line x1={20} y1={10} x2={11} y2={-9} stroke={stroke} strokeWidth={2.0} strokeLinecap="round" />
          </>
        );

      case 'ground':
        return (
          <>
            <line x1={0} y1={-20} x2={0} y2={0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={-13} y1={0} x2={13} y2={0} stroke={stroke} strokeWidth={strokeWidth + 0.3} strokeLinecap="round" />
            <line x1={-8.5} y1={5.5} x2={8.5} y2={5.5} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1={-4} y1={11} x2={4} y2={11} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );
    }
  };

  return (
    <g
      transform={`translate(${cx}, ${cy})`}
      opacity={ghost ? 0.55 : 1}
      style={{ cursor: ghost ? 'crosshair' : 'pointer', userSelect: 'none' }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {/* Invisible hit target for easy selection */}
      <rect x={-36} y={-36} width={72} height={72} fill="transparent" stroke="none" />

      {/* Selection halo */}
      {selected && !ghost && (
        <rect
          x={-44}
          y={-44}
          width={88}
          height={88}
          rx={8}
          fill="rgba(34, 211, 238, 0.07)"
          stroke="rgba(34, 211, 238, 0.55)"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}

      {/* Rotated symbol geometry */}
      <g
        transform={`rotate(${rotation})`}
        style={selected ? { filter: 'drop-shadow(0 0 6px rgba(34, 211, 238, 0.65))' } : undefined}
      >
        {renderShape()}

        {/* Pin terminal dots */}
        {showPins &&
          pins.map((pin) => (
            <circle
              key={pin.id}
              cx={pin.dx * GRID_SIZE}
              cy={pin.dy * GRID_SIZE}
              r={selected ? 3.2 : 2.3}
              fill={selected ? '#22d3ee' : '#0b0f17'}
              stroke={selected ? '#22d3ee' : '#64748b'}
              strokeWidth={1.3}
            />
          ))}
      </g>

      {/* Upright component reference designator & primary value */}
      {type !== 'ground' && (
        <g pointerEvents="none">
          <text
            x={labelPos.x}
            y={labelPos.y}
            textAnchor={labelPos.anchor}
            fill={selected ? '#22d3ee' : '#e2e8f0'}
            fontSize={11}
            fontWeight={600}
            fontFamily="var(--font-mono)"
            style={{ paintOrder: 'stroke', stroke: '#0b0f17', strokeWidth: 3.5 }}
          >
            {name}
          </text>
          {primaryLabel && (
            <text
              x={labelPos.x}
              y={labelPos.y + 12}
              textAnchor={labelPos.anchor}
              fill="#94a3b8"
              fontSize={9.5}
              fontFamily="var(--font-mono)"
              style={{ paintOrder: 'stroke', stroke: '#0b0f17', strokeWidth: 3 }}
            >
              {primaryLabel}
            </text>
          )}
        </g>
      )}
    </g>
  );
};
