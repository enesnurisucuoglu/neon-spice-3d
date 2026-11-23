import React, { useMemo, useState } from 'react';
import {
  Play,
  RotateCcw,
  MousePointer2,
  GitCommitHorizontal,
  Crosshair,
  Trash2,
  Zap,
  Clock,
  Search,
  Box,
  Columns2,
  Layers,
} from 'lucide-react';
import { AnalysisType, CircuitSchematic, ComponentType } from '../types/circuit';
import { ToolMode } from './SchematicCanvas';

export type ViewMode = '2d' | 'split' | '3d';

export interface TopToolbarProps {
  presets: CircuitSchematic[];
  activePresetId: string;
  analysisType: AnalysisType;
  viewMode: ViewMode;
  solveTimeMs: number | null;
  hasError: boolean;
  onSelectPreset: (id: string) => void;
  onSelectAnalysisType: (type: AnalysisType) => void;
  onSelectViewMode: (mode: ViewMode) => void;
  onRunSimulation: () => void;
  onResetPreset: () => void;
}

const ANALYSIS_MODES: { id: AnalysisType; label: string }[] = [
  { id: 'transient', label: 'Transient' },
  { id: 'ac', label: 'AC Bode' },
  { id: 'dc_sweep', label: 'DC Sweep' },
  { id: 'dc_op', label: 'DC OP' },
];

const VIEW_MODES: { id: ViewMode; label: string; icon: 'layers' | 'split' | 'box' }[] = [
  { id: '2d', label: '2D Schematic', icon: 'layers' },
  { id: 'split', label: 'Split 2D + 3D', icon: 'split' },
  { id: '3d', label: '3D PCB Lab', icon: 'box' },
];

const CATEGORY_ORDER: CircuitSchematic['category'][] = [
  'Passive',
  'Filters',
  'Power',
  'Semiconductors',
  'Analog',
  'Digital / CMOS',
];

export const Toolbar: React.FC<TopToolbarProps> = ({
  presets,
  activePresetId,
  analysisType,
  viewMode,
  solveTimeMs,
  hasError,
  onSelectPreset,
  onSelectAnalysisType,
  onSelectViewMode,
  onRunSimulation,
  onResetPreset,
}) => {
  const groupedPresets = useMemo(() => {
    const groups = new Map<string, CircuitSchematic[]>();
    for (const cat of CATEGORY_ORDER) {
      groups.set(cat, []);
    }
    for (const p of presets) {
      const list = groups.get(p.category) ?? [];
      list.push(p);
      groups.set(p.category, list);
    }
    return Array.from(groups.entries()).filter(([, items]) => items.length > 0);
  }, [presets]);

  return (
    <header
      style={{
        height: 46,
        flexShrink: 0,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        userSelect: 'none',
        overflowX: 'auto',
      }}
    >
      {/* Left: Brand + Preset Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: 'linear-gradient(135deg, rgba(34,211,238,0.22), rgba(52,211,153,0.14))',
              border: '1px solid rgba(34, 211, 238, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px rgba(34, 211, 238, 0.25)',
            }}
          >
            <Zap size={14} color="#22d3ee" fill="rgba(34, 211, 238, 0.35)" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 800,
                  letterSpacing: '0.03em',
                  color: '#f8fafc',
                }}
              >
                Neon
                <span style={{ color: 'var(--accent-cyan)', textShadow: '0 0 10px rgba(34,211,238,0.45)' }}>
                  SPICE
                </span>{' '}
                <span style={{ color: 'var(--accent-emerald)' }}>3D</span>
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 4px',
                  borderRadius: 4,
                  background: 'rgba(34, 211, 238, 0.16)',
                  border: '1px solid rgba(34, 211, 238, 0.45)',
                  color: 'var(--accent-cyan)',
                }}
              >
                v2.0
              </span>
            </div>
            <span
              style={{
                fontSize: 8.5,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                letterSpacing: '0.07em',
              }}
            >
              PCB & MNA SOLVER LAB
            </span>
          </div>
        </div>

        <div style={{ width: 1, height: 22, background: 'var(--border-subtle)', flexShrink: 0 }} />

        {/* Preset Circuit Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <select
            value={activePresetId}
            onChange={(e) => onSelectPreset(e.target.value)}
            title="Select Preset Circuit"
            style={{
              minWidth: 185,
              maxWidth: 235,
              background: 'var(--bg-app)',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              padding: '5px 8px',
              fontSize: 11.5,
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            {groupedPresets.map(([category, items]) => (
              <optgroup key={category} label={category}>
                {items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* Center: View Mode Switcher + Analysis Mode Segmented Control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* 2D / Split / 3D View Switcher */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-app)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 7,
            padding: 3,
            gap: 2,
          }}
        >
          {VIEW_MODES.map((vm) => {
            const active = viewMode === vm.id;
            return (
              <button
                key={vm.id}
                onClick={() => onSelectViewMode(vm.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 9px',
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  color: active ? '#071018' : 'var(--text-secondary)',
                  background: active ? 'var(--accent-emerald)' : 'transparent',
                  boxShadow: active ? '0 0 10px rgba(52, 211, 153, 0.35)' : 'none',
                  transition: 'all 0.12s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {vm.icon === 'layers' && <Layers size={11} />}
                {vm.icon === 'split' && <Columns2 size={11} />}
                {vm.icon === 'box' && <Box size={11} />}
                {vm.label}
              </button>
            );
          })}
        </div>

        {/* Analysis Mode Segmented Control */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-app)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 7,
            padding: 3,
            gap: 2,
          }}
        >
          {ANALYSIS_MODES.map((m) => {
            const active = analysisType === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onSelectAnalysisType(m.id)}
                style={{
                  padding: '4px 9px',
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: active ? 600 : 500,
                  color: active ? '#0b0f17' : 'var(--text-secondary)',
                  background: active ? 'var(--accent-cyan)' : 'transparent',
                  boxShadow: active ? '0 0 10px rgba(34, 211, 238, 0.35)' : 'none',
                  transition: 'all 0.12s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Solve Timing + Run + Reset */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        {solveTimeMs !== null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 8px',
              borderRadius: 6,
              background: hasError ? 'rgba(251, 113, 133, 0.12)' : 'var(--bg-app)',
              border: `1px solid ${hasError ? 'rgba(251, 113, 133, 0.4)' : 'var(--border-subtle)'}`,
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: hasError ? 'var(--accent-rose)' : 'var(--accent-emerald)',
            }}
            title="Wall-clock MNA solve duration"
          >
            <Clock size={11} />
            <span>{solveTimeMs < 1 ? `${solveTimeMs.toFixed(2)} ms` : `${solveTimeMs.toFixed(1)} ms`}</span>
          </div>
        )}

        <button
          onClick={onRunSimulation}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 11px',
            borderRadius: 6,
            fontSize: 11.5,
            fontWeight: 600,
            background: 'rgba(52, 211, 153, 0.16)',
            border: '1px solid rgba(52, 211, 153, 0.5)',
            color: 'var(--accent-emerald)',
            transition: 'all 0.12s ease',
          }}
          title="Re-run Simulation"
        >
          <Play size={11} fill="currentColor" />
          Run
        </button>

        <button
          onClick={onResetPreset}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 500,
            background: 'var(--bg-panel-alt)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)',
          }}
          title="Reset current schematic to preset defaults"
        >
          <RotateCcw size={11} />
          Reset
        </button>
      </div>
    </header>
  );
};

/* ---------------- Left Categorized 25-Component Palette ---------------- */

export interface ComponentPaletteProps {
  toolMode: ToolMode;
  placingType: ComponentType;
  onSelectTool: (mode: ToolMode) => void;
  onSelectPlacingType: (type: ComponentType) => void;
}

interface PaletteItem {
  type: ComponentType;
  short: string;
  name: string;
  accent: string;
}

const PALETTE_GROUPS: { title: string; items: PaletteItem[] }[] = [
  {
    title: 'Sources',
    items: [
      { type: 'vdc', short: 'VDC', name: 'DC Voltage Source', accent: '#fbbf24' },
      { type: 'vac', short: 'VAC', name: 'AC Sine Source', accent: '#fbbf24' },
      { type: 'vpulse', short: 'PLS', name: 'Pulse Voltage Source', accent: '#fbbf24' },
      { type: 'idc', short: 'IDC', name: 'DC Current Source', accent: '#fbbf24' },
      { type: 'iac', short: 'IAC', name: 'AC Current Source', accent: '#fbbf24' },
      { type: 'vcvs', short: 'VCVS', name: 'Voltage-Controlled Voltage Source (E)', accent: '#f59e0b' },
      { type: 'vccs', short: 'VCCS', name: 'Voltage-Controlled Current Source (G)', accent: '#f59e0b' },
    ],
  },
  {
    title: 'Passive',
    items: [
      { type: 'resistor', short: 'R', name: 'Resistor (Ω)', accent: '#e2e8f0' },
      { type: 'potentiometer', short: 'POT', name: 'Potentiometer (Variable R)', accent: '#22d3ee' },
      { type: 'capacitor', short: 'C', name: 'Capacitor (F)', accent: '#38bdf8' },
      { type: 'inductor', short: 'L', name: 'Inductor (H)', accent: '#34d399' },
      { type: 'transformer', short: 'XFMR', name: 'Ideal Transformer', accent: '#34d399' },
      { type: 'fuse', short: 'FUSE', name: 'Protective Fuse', accent: '#fdba74' },
      { type: 'lamp', short: 'LAMP', name: 'Incandescent Lamp', accent: '#fde047' },
    ],
  },
  {
    title: 'Diodes',
    items: [
      { type: 'diode', short: 'D', name: 'PN Junction Diode (1N4148)', accent: '#fb7185' },
      { type: 'zener', short: 'ZNR', name: 'Zener Voltage Reference Diode', accent: '#fb7185' },
      { type: 'schottky', short: 'SCH', name: 'Schottky Barrier Diode (1N5819)', accent: '#fb7185' },
      { type: 'led', short: 'LED', name: 'Light-Emitting Diode (Live Glow)', accent: '#f87171' },
    ],
  },
  {
    title: 'Transistors',
    items: [
      { type: 'bjt_npn', short: 'NPN', name: 'NPN Bipolar Junction Transistor', accent: '#fb7185' },
      { type: 'bjt_pnp', short: 'PNP', name: 'PNP Bipolar Junction Transistor', accent: '#fb7185' },
      { type: 'nmos', short: 'NMOS', name: 'N-Channel Enhancement MOSFET', accent: '#c084fc' },
      { type: 'pmos', short: 'PMOS', name: 'P-Channel Enhancement MOSFET', accent: '#c084fc' },
    ],
  },
  {
    title: 'Active & Power',
    items: [
      { type: 'opamp', short: 'OPA', name: 'Operational Amplifier', accent: '#a78bfa' },
      { type: 'vswitch', short: 'SW', name: 'Voltage-Controlled Switch', accent: '#a78bfa' },
      { type: 'ground', short: 'GND', name: 'Ground Reference (Node 0)', accent: '#94a3b8' },
    ],
  },
];

export const ComponentPalette: React.FC<ComponentPaletteProps> = ({
  toolMode,
  placingType,
  onSelectTool,
  onSelectPlacingType,
}) => {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();

  return (
    <aside
      style={{
        width: 126,
        flexShrink: 0,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 7px',
        gap: 8,
        overflowY: 'auto',
        userSelect: 'none',
      }}
    >
      {/* Tools Section (2x2 Grid) */}
      <div>
        <SectionLabel>Tools</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <ToolButton
            active={toolMode === 'select'}
            title="Select & Move (Esc)"
            label="SEL"
            onClick={() => onSelectTool('select')}
          >
            <MousePointer2 size={13} />
          </ToolButton>

          <ToolButton
            active={toolMode === 'wire'}
            title="Draw Orthogonal Wire (W)"
            label="WIRE"
            accent="#34d399"
            onClick={() => onSelectTool('wire')}
          >
            <GitCommitHorizontal size={13} />
          </ToolButton>

          <ToolButton
            active={toolMode === 'probe'}
            title="Place Voltage Probe"
            label="PRB"
            accent="#fbbf24"
            onClick={() => onSelectTool('probe')}
          >
            <Crosshair size={13} />
          </ToolButton>

          <ToolButton
            active={toolMode === 'delete'}
            title="Delete Tool"
            label="DEL"
            accent="#fb7185"
            onClick={() => onSelectTool('delete')}
          >
            <Trash2 size={13} />
          </ToolButton>
        </div>
      </div>

      {/* Quick Filter */}
      <div style={{ position: 'relative' }}>
        <Search
          size={11}
          style={{
            position: 'absolute',
            left: 7,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter..."
          style={{
            width: '100%',
            padding: '3px 6px 3px 22px',
            fontSize: 10.5,
            borderRadius: 5,
            background: 'var(--bg-app)',
            border: '1px solid var(--border-subtle)',
          }}
        />
      </div>

      {/* Categorized 25 Components */}
      {PALETTE_GROUPS.map((group) => {
        const items = q
          ? group.items.filter(
              (item) =>
                item.short.toLowerCase().includes(q) ||
                item.name.toLowerCase().includes(q) ||
                item.type.toLowerCase().includes(q)
            )
          : group.items;
        if (items.length === 0) return null;

        return (
          <div key={group.title}>
            <SectionLabel>{group.title}</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {items.map((item) => {
                const active = toolMode === 'place' && placingType === item.type;
                return (
                  <button
                    key={item.type}
                    title={`${item.name} (Press R to rotate)`}
                    onClick={() => onSelectPlacingType(item.type)}
                    style={{
                      height: 28,
                      borderRadius: 5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: active ? 'rgba(34, 211, 238, 0.18)' : 'var(--bg-panel-alt)',
                      border: `1px solid ${active ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                      color: active ? 'var(--accent-cyan)' : item.accent,
                      fontSize: 10.5,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '-0.02em',
                      transition: 'all 0.1s ease',
                    }}
                  >
                    {item.short}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </aside>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 9.5,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: 'var(--text-muted)',
      marginBottom: 4,
      paddingLeft: 2,
      fontFamily: 'var(--font-mono)',
    }}
  >
    {children}
  </div>
);

const ToolButton: React.FC<{
  active: boolean;
  title: string;
  label: string;
  accent?: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, title, label, accent = '#22d3ee', onClick, children }) => (
  <button
    title={title}
    onClick={onClick}
    style={{
      height: 30,
      borderRadius: 5,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      background: active ? `${accent}22` : 'var(--bg-panel-alt)',
      border: `1px solid ${active ? accent : 'var(--border-subtle)'}`,
      color: active ? accent : 'var(--text-secondary)',
      transition: 'all 0.1s ease',
    }}
  >
    {children}
    <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{label}</span>
  </button>
);
