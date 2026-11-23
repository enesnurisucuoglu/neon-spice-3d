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
  { id: '3d', label: '3D PCB', icon: 'box' },
  { id: 'split', label: '2D+3D', icon: 'split' },
  { id: '2d', label: '2D', icon: 'layers' },
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
        height: 56,
        flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(10,15,28,0.94))',
        borderBottom: '1px solid var(--border-subtle)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        userSelect: 'none',
        overflowX: 'auto',
      }}
    >
      {/* Left: Modern Brand Lockup + Preset Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(34, 211, 238, 0.35)',
            }}
          >
            <Zap size={15} color="#04111b" fill="#04111b" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: 15.5,
                  fontWeight: 800,
                  letterSpacing: '-0.01em',
                  background: 'linear-gradient(90deg, #f8fafc 0%, #67e8f9 55%, #34d399 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                NeonSPICE 3D
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  padding: '1.5px 6px',
                  borderRadius: 999,
                  background: 'rgba(34, 211, 238, 0.14)',
                  border: '1px solid rgba(34, 211, 238, 0.38)',
                  color: '#67e8f9',
                }}
              >
                v2.2
              </span>
            </div>
            <span
              style={{
                fontSize: 9.5,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                letterSpacing: '0.07em',
              }}
            >
              HARDWARE LAB · MNA SPICE
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
            minWidth: 182,
            maxWidth: 230,
            background: 'rgba(7, 11, 20, 0.78)',
            border: '1px solid var(--border-strong)',
            borderRadius: 9,
            padding: '6px 10px',
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

      {/* Center: Pill Segmented Controls for View Mode + Analysis Mode */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {/* 3D PCB | 2D+3D | 2D View Switcher */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(7, 11, 20, 0.75)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 10,
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
                className={active ? undefined : 'ns-btn'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 10px',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  color: active ? '#04111b' : 'var(--text-secondary)',
                  background: active
                    ? 'linear-gradient(135deg, #34d399, #22d3ee)'
                    : 'transparent',
                  boxShadow: active ? '0 2px 10px rgba(52, 211, 153, 0.35)' : 'none',
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
            background: 'rgba(7, 11, 20, 0.75)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 10,
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
                className={active ? undefined : 'ns-btn'}
                style={{
                  padding: '5px 10px',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  color: active ? '#04111b' : 'var(--text-secondary)',
                  background: active
                    ? 'linear-gradient(135deg, #22d3ee, #60a5fa)'
                    : 'transparent',
                  boxShadow: active ? '0 2px 10px rgba(34, 211, 238, 0.35)' : 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Akademi + Rehber + Timing + Çalıştır + Reset */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Sleek Akademi Button */}
        <button
          onClick={onToggleAcademy}
          title="50 Seviyelik Uygulamalı Elektronik Akademisi"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 11px',
            borderRadius: 9,
            fontSize: 12.5,
            fontWeight: 700,
            background: academyOpen
              ? 'linear-gradient(135deg, rgba(139,92,246,0.32), rgba(34,211,238,0.22))'
              : 'rgba(18, 28, 48, 0.85)',
            border: `1px solid ${academyOpen ? '#a78bfa' : 'rgba(167, 139, 250, 0.42)'}`,
            color: '#f3e8ff',
            boxShadow: academyOpen
              ? '0 0 16px rgba(167, 139, 250, 0.4)'
              : 'inset 0 1px 0 rgba(255,255,255,0.06)',
            whiteSpace: 'nowrap',
          }}
        >
          <GraduationCap size={15} color="#c4b5fd" />
          <span>Akademi</span>
          <span
            className="ns-pill"
            style={{
              padding: '1px 7px',
              fontSize: 10.5,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              background: 'linear-gradient(135deg, rgba(52,211,153,0.22), rgba(34,211,238,0.22))',
              border: '1px solid rgba(52, 211, 153, 0.45)',
              color: '#6ee7b7',
            }}
          >
            {academyCompletedCount}/{academyTotalCount}
          </span>
        </button>

        {/* Quick Start Guide Button */}
        <button
          onClick={onOpenTutorial}
          className="ns-btn"
          title="Hızlı Başlangıç Rehberi (5 Adım)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 10px',
            borderRadius: 9,
            fontSize: 12,
            fontWeight: 600,
            background: 'rgba(18, 28, 48, 0.8)',
            border: '1px solid var(--border-strong)',
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
              padding: '5px 9px',
              borderRadius: 8,
              background: hasError ? 'rgba(251, 113, 133, 0.14)' : 'rgba(7, 11, 20, 0.72)',
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

        {/* Modern Gradient Çalıştır CTA */}
        <button
          onClick={onRunSimulation}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 14px',
            borderRadius: 9,
            fontSize: 12.5,
            fontWeight: 800,
            background: 'linear-gradient(135deg, #10b981, #06b6d4)',
            color: '#04111b',
            boxShadow: '0 2px 14px rgba(16, 185, 129, 0.38)',
            whiteSpace: 'nowrap',
          }}
          title="Simülasyonu Yeniden Çalıştır"
        >
          <Play size={12} fill="currentColor" />
          Çalıştır
        </button>

        <button
          onClick={onResetPreset}
          className="ns-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 9px',
            borderRadius: 9,
            fontSize: 12,
            fontWeight: 600,
            background: 'rgba(18, 28, 48, 0.8)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
          title="Devreyi Başlangıç Haline Sıfırla"
        >
          <RotateCcw size={12} />
          Sıfırla
        </button>
      </div>
    </header>
  );
};

/* ---------------- Left Categorized 25-Component Palette ---------------- */

export interface ComponentPaletteProps {
  toolMode: ToolMode;
  placingType: ComponentType;
  highlightedComponentType?: ComponentType | null;
  highlightedTool?: ToolMode | null;
  onSelectTool: (mode: ToolMode) => void;
  onSelectPlacingType: (type: ComponentType) => void;
}

interface PaletteItem {
  type: ComponentType;
  short: string;
  name: string;
  accent: string;
}

const PALETTE_GROUPS: { title: string; dotColor: string; items: PaletteItem[] }[] = [
  {
    title: 'Sources',
    dotColor: '#fbbf24',
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
    dotColor: '#22d3ee',
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
    dotColor: '#fb7185',
    items: [
      { type: 'diode', short: 'D', name: 'PN Junction Diode (1N4148)', accent: '#fb7185' },
      { type: 'zener', short: 'ZNR', name: 'Zener Voltage Reference Diode', accent: '#fb7185' },
      { type: 'schottky', short: 'SCH', name: 'Schottky Barrier Diode (1N5819)', accent: '#fb7185' },
      { type: 'led', short: 'LED', name: 'Light-Emitting Diode (Live Glow)', accent: '#f87171' },
    ],
  },
  {
    title: 'Transistors',
    dotColor: '#a78bfa',
    items: [
      { type: 'bjt_npn', short: 'NPN', name: 'NPN Bipolar Junction Transistor', accent: '#fb7185' },
      { type: 'bjt_pnp', short: 'PNP', name: 'PNP Bipolar Junction Transistor', accent: '#fb7185' },
      { type: 'nmos', short: 'NMOS', name: 'N-Channel Enhancement MOSFET', accent: '#c084fc' },
      { type: 'pmos', short: 'PMOS', name: 'P-Channel Enhancement MOSFET', accent: '#c084fc' },
    ],
  },
  {
    title: 'Active',
    dotColor: '#34d399',
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
  highlightedComponentType = null,
  highlightedTool = null,
  onSelectTool,
  onSelectPlacingType,
}) => {
  const [filter, setFilter] = useState('');
  const [hoveredType, setHoveredType] = useState<ComponentType | null>(null);

  React.useEffect(() => {
    if (highlightedComponentType) {
      setFilter('');
    }
  }, [highlightedComponentType]);

  const q = filter.trim().toLowerCase();

  const activeGuideType: ComponentType | null =
    hoveredType ?? highlightedComponentType ?? (toolMode === 'place' ? placingType : null);
  const guideEntry = activeGuideType ? COMPONENT_GUIDE[activeGuideType] : null;

  return (
    <aside
      style={{
        width: 156,
        flexShrink: 0,
        background: 'linear-gradient(180deg, #0d1424 0%, #090e1a 100%)',
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
          padding: '10px 9px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Tools Section (2x2 Grid) */}
        <div>
          <SectionLabel dotColor="#60a5fa">Araçlar</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            <ToolButton
              active={toolMode === 'select'}
              highlighted={highlightedTool === 'select' && toolMode !== 'select'}
              title="Seç & Taşı (Esc)"
              label="SEL"
              onClick={() => onSelectTool('select')}
            >
              <MousePointer2 size={14} />
            </ToolButton>

            <ToolButton
              active={toolMode === 'wire'}
              highlighted={highlightedTool === 'wire' && toolMode !== 'wire'}
              title="Kablo Çek (2D: W veya Shift+W)"
              label="WIRE"
              accent="#34d399"
              onClick={() => onSelectTool('wire')}
            >
              <GitCommitHorizontal size={14} />
            </ToolButton>

            <ToolButton
              active={toolMode === 'probe'}
              highlighted={highlightedTool === 'probe' && toolMode !== 'probe'}
              title="Voltaj Probu Yerleştir"
              label="PRB"
              accent="#fbbf24"
              onClick={() => onSelectTool('probe')}
            >
              <Crosshair size={14} />
            </ToolButton>

            <ToolButton
              active={toolMode === 'delete'}
              highlighted={highlightedTool === 'delete' && toolMode !== 'delete'}
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
              left: 9,
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
              padding: '5px 8px 5px 27px',
              fontSize: 11.5,
              borderRadius: 8,
              background: 'rgba(7, 11, 20, 0.85)',
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
              <SectionLabel dotColor={group.dotColor}>{group.title}</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                {items.map((item) => {
                  const active = toolMode === 'place' && placingType === item.type;
                  const isHighlighted = highlightedComponentType === item.type && !active;
                  return (
                    <button
                      key={item.type}
                      className={active || isHighlighted ? undefined : 'ns-tile'}
                      title={`${COMPONENT_GUIDE[item.type].title} — Yerleştirmek için tıklayın (R ile döndür)`}
                      onClick={() => onSelectPlacingType(item.type)}
                      onMouseEnter={() => setHoveredType(item.type)}
                      onMouseLeave={() => setHoveredType(null)}
                      style={{
                        position: 'relative',
                        height: 32,
                        borderRadius: 9,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: active
                          ? 'linear-gradient(135deg, rgba(34, 211, 238, 0.24), rgba(59, 130, 246, 0.16))'
                          : isHighlighted
                          ? 'rgba(52, 211, 153, 0.24)'
                          : 'linear-gradient(180deg, rgba(22, 33, 56, 0.85), rgba(15, 23, 42, 0.9))',
                        border: `1.5px solid ${
                          active
                            ? 'var(--accent-cyan)'
                            : isHighlighted
                            ? '#34d399'
                            : 'var(--border-subtle)'
                        }`,
                        color: active ? '#67e8f9' : isHighlighted ? '#fef08a' : item.accent,
                        fontSize: 11.5,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '-0.01em',
                        boxShadow: active
                          ? '0 0 12px rgba(34, 211, 238, 0.25)'
                          : 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
                        animation: isHighlighted ? 'neonPulse 1.3s ease-in-out infinite' : undefined,
                      }}
                    >
                      {item.short}
                      {isHighlighted && (
                        <span
                          style={{
                            position: 'absolute',
                            top: -7,
                            right: -4,
                            padding: '0 5px',
                            borderRadius: 5,
                            fontSize: 8,
                            fontWeight: 800,
                            background: 'linear-gradient(135deg, #34d399, #22d3ee)',
                            color: '#04111b',
                            letterSpacing: '0.03em',
                            lineHeight: '14px',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                          }}
                        >
                          SEÇ
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Glassmorphic Bottom "Bileşen Rehberi" Preview Card */}
      <div style={{ flexShrink: 0, padding: '8px 8px 9px' }}>
        <div
          className="ns-card"
          style={{
            borderRadius: 10,
            border: '1px solid rgba(34, 211, 238, 0.24)',
            background: 'linear-gradient(180deg, rgba(18, 28, 48, 0.92), rgba(7, 11, 20, 0.96))',
            padding: '9px 10px',
            minHeight: 106,
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
      </div>
    </aside>
  );
};

const SectionLabel: React.FC<{ dotColor: string; children: React.ReactNode }> = ({
  dotColor,
  children,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
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
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: dotColor,
        boxShadow: `0 0 6px ${dotColor}88`,
        flexShrink: 0,
      }}
    />
    {children}
  </div>
);

const ToolButton: React.FC<{
  active: boolean;
  highlighted?: boolean;
  title: string;
  label: string;
  accent?: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, highlighted = false, title, label, accent = '#22d3ee', onClick, children }) => (
  <button
    title={title}
    onClick={onClick}
    className={active || highlighted ? undefined : 'ns-tile'}
    style={{
      position: 'relative',
      height: 34,
      borderRadius: 9,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      background: active
        ? `${accent}26`
        : highlighted
        ? 'rgba(52, 211, 153, 0.24)'
        : 'linear-gradient(180deg, rgba(22, 33, 56, 0.85), rgba(15, 23, 42, 0.9))',
      border: `1.5px solid ${
        active ? accent : highlighted ? '#34d399' : 'var(--border-subtle)'
      }`,
      color: active ? accent : highlighted ? '#fef08a' : 'var(--text-secondary)',
      boxShadow: active ? `0 0 10px ${accent}33` : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      animation: highlighted ? 'neonPulse 1.3s ease-in-out infinite' : undefined,
    }}
  >
    {children}
    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{label}</span>
    {highlighted && (
      <span
        style={{
          position: 'absolute',
          top: -7,
          right: -4,
          padding: '0 5px',
          borderRadius: 5,
          fontSize: 8,
          fontWeight: 800,
          background: 'linear-gradient(135deg, #34d399, #22d3ee)',
          color: '#04111b',
          letterSpacing: '0.03em',
          lineHeight: '14px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
        }}
      >
        SEÇ
      </span>
    )}
  </button>
);
