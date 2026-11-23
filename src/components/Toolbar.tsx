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
  GraduationCap,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';
import { AnalysisType, CircuitSchematic, ComponentType } from '../types/circuit';
import { COMPONENT_GUIDE } from '../data/componentGuide';
import { ToolMode } from './SchematicCanvas';

export type ViewMode = '2d' | 'split' | '3d';

export interface TopToolbarProps {
  presets: CircuitSchematic[];
  activePresetId: string;
  analysisType: AnalysisType;
  viewMode: ViewMode;
  solveTimeMs: number | null;
  hasError: boolean;
  academyOpen: boolean;
  academyCompletedCount: number;
  academyTotalCount: number;
  onSelectPreset: (id: string) => void;
  onSelectAnalysisType: (type: AnalysisType) => void;
  onSelectViewMode: (mode: ViewMode) => void;
  onRunSimulation: () => void;
  onResetPreset: () => void;
  onToggleAcademy: () => void;
  onOpenTutorial: () => void;
}

const ANALYSIS_MODES: { id: AnalysisType; label: string }[] = [
  { id: 'transient', label: 'Transient' },
  { id: 'ac', label: 'AC Bode' },
  { id: 'dc_sweep', label: 'DC Sweep' },
  { id: 'dc_op', label: 'DC OP' },
];

const VIEW_MODES: { id: ViewMode; label: string; icon: 'layers' | 'split' | 'box' }[] = [
  { id: '2d', label: '2D', icon: 'layers' },
  { id: 'split', label: 'Split 2D+3D', icon: 'split' },
  { id: '3d', label: '3D PCB', icon: 'box' },
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
  academyOpen,
  academyCompletedCount,
  academyTotalCount,
  onSelectPreset,
  onSelectAnalysisType,
  onSelectViewMode,
  onRunSimulation,
  onResetPreset,
  onToggleAcademy,
  onOpenTutorial,
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

  const isPresetInList = presets.some((p) => p.id === activePresetId);

  return (
    <header
      style={{
        height: 52,
        flexShrink: 0,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0 14px',
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
              width: 30,
              height: 30,
              borderRadius: 7,
              background: 'linear-gradient(135deg, rgba(34,211,238,0.24), rgba(52,211,153,0.16))',
              border: '1px solid rgba(34, 211, 238, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px rgba(34, 211, 238, 0.25)',
            }}
          >
            <Zap size={16} color="#22d3ee" fill="rgba(34, 211, 238, 0.35)" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
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
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: 'rgba(34, 211, 238, 0.16)',
                  border: '1px solid rgba(34, 211, 238, 0.45)',
                  color: 'var(--accent-cyan)',
                }}
              >
                v2
              </span>
            </div>
            <span
              style={{
                fontSize: 9.5,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                letterSpacing: '0.06em',
              }}
            >
              PCB &amp; MNA SOLVER
            </span>
          </div>
        </div>

        <div style={{ width: 1, height: 26, background: 'var(--border-subtle)', flexShrink: 0 }} />

        {/* Preset Circuit Dropdown */}
        <select
          value={isPresetInList ? activePresetId : '__academy__'}
          onChange={(e) => {
            if (e.target.value !== '__academy__') {
              onSelectPreset(e.target.value);
            }
          }}
          title="Hazır Devre Seç"
          style={{
            minWidth: 180,
            maxWidth: 230,
            background: 'var(--bg-app)',
            border: '1px solid var(--border-strong)',
            borderRadius: 7,
            padding: '6px 9px',
            fontSize: 12.5,
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}
        >
          {!isPresetInList && (
            <option value="__academy__">🎓 Akademi Görev Devresi</option>
          )}
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

      {/* Center: View Mode Switcher + Analysis Mode Segmented Control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* 2D / Split / 3D View Switcher */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-app)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
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
                  gap: 5,
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  color: active ? '#071018' : 'var(--text-secondary)',
                  background: active ? 'var(--accent-emerald)' : 'transparent',
                  boxShadow: active ? '0 0 10px rgba(52, 211, 153, 0.35)' : 'none',
                  transition: 'all 0.12s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {vm.icon === 'layers' && <Layers size={13} />}
                {vm.icon === 'split' && <Columns2 size={13} />}
                {vm.icon === 'box' && <Box size={13} />}
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
            borderRadius: 8,
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
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
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

      {/* Right: Academy + Guide + Timing + Run + Reset */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        {/* 50-Level Academy Button */}
        <button
          onClick={onToggleAcademy}
          title="50 Seviyelik Uygulamalı Elektronik Akademisi"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 11px',
            borderRadius: 7,
            fontSize: 12,
            fontWeight: 700,
            background: academyOpen
              ? 'linear-gradient(135deg, rgba(167,139,250,0.32), rgba(34,211,238,0.24))'
              : 'linear-gradient(135deg, rgba(167,139,250,0.16), rgba(34,211,238,0.12))',
            border: `1px solid ${academyOpen ? '#a78bfa' : 'rgba(167, 139, 250, 0.55)'}`,
            color: '#e9d5ff',
            boxShadow: academyOpen
              ? '0 0 14px rgba(167, 139, 250, 0.4)'
              : '0 0 10px rgba(167, 139, 250, 0.18)',
            whiteSpace: 'nowrap',
            transition: 'all 0.14s ease',
          }}
        >
          <GraduationCap size={15} color="#c4b5fd" />
          <span>50 Level Akademi</span>
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 999,
              fontSize: 10.5,
              fontFamily: 'var(--font-mono)',
              background: 'rgba(11, 15, 23, 0.7)',
              color: academyCompletedCount > 0 ? '#34d399' : '#22d3ee',
            }}
          >
            {academyCompletedCount}/{academyTotalCount}
          </span>
        </button>

        {/* Quick Start Guide Button */}
        <button
          onClick={onOpenTutorial}
          title="Hızlı Başlangıç Rehberi (5 Adım)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 10px',
            borderRadius: 7,
            fontSize: 12,
            fontWeight: 600,
            background: 'rgba(34, 211, 238, 0.12)',
            border: '1px solid rgba(34, 211, 238, 0.4)',
            color: 'var(--accent-cyan)',
            whiteSpace: 'nowrap',
          }}
        >
          <HelpCircle size={14} />
          Rehber
        </button>

        {solveTimeMs !== null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 8px',
              borderRadius: 6,
              background: hasError ? 'rgba(251, 113, 133, 0.14)' : 'var(--bg-app)',
              border: `1px solid ${hasError ? 'rgba(251, 113, 133, 0.45)' : 'var(--border-subtle)'}`,
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
              color: hasError ? 'var(--accent-rose)' : 'var(--accent-emerald)',
              whiteSpace: 'nowrap',
            }}
            title="SPICE MNA çözüm süresi"
          >
            <Clock size={12} />
            <span>{solveTimeMs < 1 ? `${solveTimeMs.toFixed(2)}ms` : `${solveTimeMs.toFixed(1)}ms`}</span>
          </div>
        )}

        <button
          onClick={onRunSimulation}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 12px',
            borderRadius: 7,
            fontSize: 12.5,
            fontWeight: 700,
            background: 'rgba(52, 211, 153, 0.18)',
            border: '1px solid rgba(52, 211, 153, 0.55)',
            color: 'var(--accent-emerald)',
            whiteSpace: 'nowrap',
          }}
          title="Simülasyonu Yeniden Çalıştır"
        >
          <Play size={12} fill="currentColor" />
          Run
        </button>

        <button
          onClick={onResetPreset}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 9px',
            borderRadius: 7,
            fontSize: 12,
            fontWeight: 600,
            background: 'var(--bg-panel-alt)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
          title="Devreyi Başlangıç Haline Sıfırla"
        >
          <RotateCcw size={12} />
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
      { type: 'resistor', short: 'R', name: 'Resistor (Ω)', accent: '#f1f5f9' },
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
      { type: 'ground', short: 'GND', name: 'Ground Reference (Node 0)', accent: '#cbd5e1' },
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
  const [hoveredType, setHoveredType] = useState<ComponentType | null>(null);
  const q = filter.trim().toLowerCase();

  const activeGuideType: ComponentType | null =
    hoveredType ?? (toolMode === 'place' ? placingType : null);
  const guideEntry = activeGuideType ? COMPONENT_GUIDE[activeGuideType] : null;

  return (
    <aside
      style={{
        width: 148,
        flexShrink: 0,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* Scrollable Tool & Component Grid */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
        }}
      >
        {/* Tools Section (2x2 Grid) */}
        <div>
          <SectionLabel>Araçlar</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            <ToolButton
              active={toolMode === 'select'}
              title="Seç & Taşı (Esc)"
              label="SEL"
              onClick={() => onSelectTool('select')}
            >
              <MousePointer2 size={14} />
            </ToolButton>

            <ToolButton
              active={toolMode === 'wire'}
              title="Kablo Çek (2D: W veya Shift+W)"
              label="WIRE"
              accent="#34d399"
              onClick={() => onSelectTool('wire')}
            >
              <GitCommitHorizontal size={14} />
            </ToolButton>

            <ToolButton
              active={toolMode === 'probe'}
              title="Voltaj Probu Yerleştir"
              label="PRB"
              accent="#fbbf24"
              onClick={() => onSelectTool('probe')}
            >
              <Crosshair size={14} />
            </ToolButton>

            <ToolButton
              active={toolMode === 'delete'}
              title="Silme Aracı (Delete)"
              label="DEL"
              accent="#fb7185"
              onClick={() => onSelectTool('delete')}
            >
              <Trash2 size={14} />
            </ToolButton>
          </div>
        </div>

        {/* Quick Filter */}
        <div style={{ position: 'relative' }}>
          <Search
            size={12}
            style={{
              position: 'absolute',
              left: 8,
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
            placeholder="Eleman ara..."
            style={{
              width: '100%',
              padding: '5px 7px 5px 25px',
              fontSize: 11.5,
              borderRadius: 6,
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
                  item.type.toLowerCase().includes(q) ||
                  COMPONENT_GUIDE[item.type].title.toLowerCase().includes(q)
              )
            : group.items;
          if (items.length === 0) return null;

          return (
            <div key={group.title}>
              <SectionLabel>{group.title}</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                {items.map((item) => {
                  const active = toolMode === 'place' && placingType === item.type;
                  return (
                    <button
                      key={item.type}
                      title={`${COMPONENT_GUIDE[item.type].title} — Yerleştirmek için tıklayın (R ile döndür)`}
                      onClick={() => onSelectPlacingType(item.type)}
                      onMouseEnter={() => setHoveredType(item.type)}
                      onMouseLeave={() => setHoveredType(null)}
                      style={{
                        height: 31,
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: active ? 'rgba(34, 211, 238, 0.2)' : 'var(--bg-panel-alt)',
                        border: `1px solid ${active ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                        color: active ? 'var(--accent-cyan)' : item.accent,
                        fontSize: 11.5,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '-0.01em',
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
      </div>

      {/* Beginner Hover / Active Component Info Card */}
      <div
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--border-strong)',
          background: 'rgba(11, 15, 23, 0.96)',
          padding: '9px 9px 10px',
          minHeight: 112,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}
      >
        {guideEntry ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11.5,
                fontWeight: 700,
                color: 'var(--accent-cyan)',
                lineHeight: 1.25,
              }}
            >
              <Lightbulb size={13} style={{ flexShrink: 0 }} />
              <span>{guideEntry.title}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.4 }}>
              {guideEntry.shortDesc}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                lineHeight: 1.38,
                fontStyle: 'italic',
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: 4,
              }}
            >
              {guideEntry.analogy}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3 }}>
              Bileşen Rehberi
            </div>
            Herhangi bir elemanın üzerine gelin — ne işe yaradığını anında görün.
          </div>
        )}
      </div>
    </aside>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 10.5,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: 'var(--text-muted)',
      marginBottom: 5,
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
      height: 33,
      borderRadius: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      background: active ? `${accent}24` : 'var(--bg-panel-alt)',
      border: `1px solid ${active ? accent : 'var(--border-subtle)'}`,
      color: active ? accent : 'var(--text-secondary)',
      transition: 'all 0.1s ease',
    }}
  >
    {children}
    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{label}</span>
  </button>
);
