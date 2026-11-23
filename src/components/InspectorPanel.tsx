import React, { useEffect, useState } from 'react';
import {
  Sliders,
  FileCode2,
  BookOpen,
  RotateCw,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Cpu,
  Radio,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AnalysisConfig,
  CircuitComponent,
  CircuitSchematic,
  CompiledNetlist,
  ComponentParams,
  ProbeMarker,
} from '../types/circuit';
import { formatSICompact, parseSI } from '../utils/format';
import { COMPONENT_GUIDE } from '../data/componentGuide';
import { SelectionTarget } from './SchematicCanvas';

export interface InspectorPanelProps {
  schematic: CircuitSchematic;
  selection: SelectionTarget;
  analysisConfig: AnalysisConfig;
  netlist: CompiledNetlist | null;
  solverWarnings: string[];
  onUpdateComponent: (id: string, patch: Partial<CircuitComponent>) => void;
  onUpdateComponentParams: (id: string, paramsPatch: Partial<ComponentParams>) => void;
  onRotateComponent: (id: string) => void;
  onDeleteTarget: (target: NonNullable<SelectionTarget>) => void;
  onUpdateProbe: (id: string, patch: Partial<ProbeMarker>) => void;
  onUpdateAnalysisConfig: (config: AnalysisConfig) => void;
}

type SidebarTab = 'inspector' | 'netlist' | 'theory';

type NumericParamKey = Exclude<keyof ComponentParams, 'ledColor'>;

interface ParamFieldDef {
  key: NumericParamKey;
  label: string;
  unit: string;
  defaultVal: number;
}

function getParamFields(type: CircuitComponent['type']): ParamFieldDef[] {
  switch (type) {
    case 'resistor':
      return [{ key: 'resistance', label: 'Resistance (R)', unit: 'Ω', defaultVal: 1000 }];
    case 'potentiometer':
      return [{ key: 'resistance', label: 'Total Resistance (R)', unit: 'Ω', defaultVal: 10000 }];
    case 'capacitor':
      return [
        { key: 'capacitance', label: 'Capacitance (C)', unit: 'F', defaultVal: 1e-6 },
        { key: 'ic', label: 'Initial Voltage (IC)', unit: 'V', defaultVal: 0 },
      ];
    case 'inductor':
      return [
        { key: 'inductance', label: 'Inductance (L)', unit: 'H', defaultVal: 10e-3 },
        { key: 'ic', label: 'Initial Current (IC)', unit: 'A', defaultVal: 0 },
      ];
    case 'transformer':
      return [{ key: 'turnsRatio', label: 'Turns Ratio (Ns / Np)', unit: '', defaultVal: 0.1 }];
    case 'fuse':
      return [
        { key: 'fuseRating', label: 'Rated Current (I_max)', unit: 'A', defaultVal: 1.0 },
        { key: 'rOn', label: 'On Resistance (R_on)', unit: 'Ω', defaultVal: 0.05 },
      ];
    case 'lamp':
      return [
        { key: 'resistance', label: 'Filament Resistance (R)', unit: 'Ω', defaultVal: 100 },
        { key: 'ratedPower', label: 'Rated Power (P_nom)', unit: 'W', defaultVal: 1.0 },
      ];
    case 'vdc':
      return [
        { key: 'voltage', label: 'DC Voltage', unit: 'V', defaultVal: 5 },
        { key: 'acMag', label: 'AC Small-Signal Mag', unit: 'V', defaultVal: 0 },
      ];
    case 'vac':
      return [
        { key: 'amplitude', label: 'Amplitude (Peak)', unit: 'V', defaultVal: 5 },
        { key: 'frequency', label: 'Frequency', unit: 'Hz', defaultVal: 1000 },
        { key: 'voltage', label: 'DC Offset', unit: 'V', defaultVal: 0 },
        { key: 'phase', label: 'Phase', unit: '°', defaultVal: 0 },
        { key: 'acMag', label: 'AC Sweep Mag', unit: 'V', defaultVal: 1 },
      ];
    case 'vpulse':
      return [
        { key: 'vLow', label: 'V Low', unit: 'V', defaultVal: 0 },
        { key: 'vHigh', label: 'V High', unit: 'V', defaultVal: 5 },
        { key: 'delay', label: 'Delay (Td)', unit: 's', defaultVal: 0 },
        { key: 'riseTime', label: 'Rise Time (Tr)', unit: 's', defaultVal: 1e-6 },
        { key: 'fallTime', label: 'Fall Time (Tf)', unit: 's', defaultVal: 1e-6 },
        { key: 'pulseWidth', label: 'Pulse Width (Pw)', unit: 's', defaultVal: 0.5e-3 },
        { key: 'period', label: 'Period (Per)', unit: 's', defaultVal: 1e-3 },
      ];
    case 'idc':
      return [{ key: 'current', label: 'DC Current', unit: 'A', defaultVal: 1e-3 }];
    case 'iac':
      return [
        { key: 'current', label: 'DC Offset', unit: 'A', defaultVal: 0 },
        { key: 'amplitude', label: 'Amplitude (Peak)', unit: 'A', defaultVal: 1e-3 },
        { key: 'frequency', label: 'Frequency', unit: 'Hz', defaultVal: 1000 },
        { key: 'phase', label: 'Phase', unit: '°', defaultVal: 0 },
        { key: 'acMag', label: 'AC Sweep Mag', unit: 'A', defaultVal: 1e-3 },
      ];
    case 'vcvs':
      return [{ key: 'gain', label: 'Voltage Gain (E = Vout/Vin)', unit: '', defaultVal: 2 }];
    case 'vccs':
      return [{ key: 'gm', label: 'Transconductance (gm)', unit: 'S', defaultVal: 1e-3 }];
    case 'diode':
      return [
        { key: 'is', label: 'Saturation Current (Is)', unit: 'A', defaultVal: 1e-12 },
        { key: 'n', label: 'Ideality Factor (n)', unit: '', defaultVal: 1.0 },
      ];
    case 'zener':
      return [
        { key: 'bv', label: 'Breakdown Voltage (Vz)', unit: 'V', defaultVal: 5.1 },
        { key: 'is', label: 'Saturation Current (Is)', unit: 'A', defaultVal: 1e-12 },
        { key: 'n', label: 'Ideality Factor (n)', unit: '', defaultVal: 1.0 },
      ];
    case 'schottky':
      return [
        { key: 'is', label: 'Saturation Current (Is)', unit: 'A', defaultVal: 1e-6 },
        { key: 'n', label: 'Ideality Factor (n)', unit: '', defaultVal: 1.05 },
      ];
    case 'led':
      return [
        { key: 'is', label: 'Saturation Current (Is)', unit: 'A', defaultVal: 1e-20 },
        { key: 'n', label: 'Ideality Factor (n)', unit: '', defaultVal: 1.8 },
      ];
    case 'bjt_npn':
      return [
        { key: 'bf', label: 'Forward Beta (βF)', unit: '', defaultVal: 150 },
        { key: 'br', label: 'Reverse Beta (βR)', unit: '', defaultVal: 1 },
        { key: 'is', label: 'Saturation Current (Is)', unit: 'A', defaultVal: 1e-14 },
      ];
    case 'bjt_pnp':
      return [
        { key: 'bf', label: 'Forward Beta (βF)', unit: '', defaultVal: 120 },
        { key: 'br', label: 'Reverse Beta (βR)', unit: '', defaultVal: 1 },
        { key: 'is', label: 'Saturation Current (Is)', unit: 'A', defaultVal: 1e-14 },
      ];
    case 'nmos':
      return [
        { key: 'vth', label: 'Threshold Voltage (Vth)', unit: 'V', defaultVal: 1.5 },
        { key: 'kp', label: 'Transconductance (Kp)', unit: 'A/V²', defaultVal: 0.02 },
        { key: 'lambda', label: 'Channel-Length Mod (λ)', unit: '1/V', defaultVal: 0.02 },
      ];
    case 'pmos':
      return [
        { key: 'vth', label: 'Threshold Voltage (Vth)', unit: 'V', defaultVal: -1.5 },
        { key: 'kp', label: 'Transconductance (Kp)', unit: 'A/V²', defaultVal: 0.02 },
        { key: 'lambda', label: 'Channel-Length Mod (λ)', unit: '1/V', defaultVal: 0.02 },
      ];
    case 'opamp':
      return [
        { key: 'gain', label: 'Open-Loop Gain (Aol)', unit: '', defaultVal: 1e5 },
        { key: 'vSatPos', label: 'Positive Rail (+Vsat)', unit: 'V', defaultVal: 15 },
        { key: 'vSatNeg', label: 'Negative Rail (-Vsat)', unit: 'V', defaultVal: -15 },
      ];
    case 'vswitch':
      return [
        { key: 'vThreshold', label: 'Control Threshold (Vth)', unit: 'V', defaultVal: 2.5 },
        { key: 'rOn', label: 'On Resistance (R_on)', unit: 'Ω', defaultVal: 0.1 },
        { key: 'rOff', label: 'Off Resistance (R_off)', unit: 'Ω', defaultVal: 1e7 },
      ];
    case 'ground':
      return [];
  }
}

const SIInput: React.FC<{
  value: number;
  unit?: string;
  onCommit: (val: number) => void;
}> = ({ value, unit = '', onCommit }) => {
  const [text, setText] = useState(() => formatSICompact(value, unit));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(formatSICompact(value, unit));
    }
  }, [value, unit, focused]);

  const commit = () => {
    const parsed = parseSI(text);
    if (parsed !== null && Number.isFinite(parsed)) {
      onCommit(parsed);
      setText(formatSICompact(parsed, unit));
    } else {
      setText(formatSICompact(value, unit));
    }
  };

  return (
    <input
      type="text"
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setText(formatSICompact(value, unit));
          e.currentTarget.blur();
        }
      }}
      style={{ width: '100%' }}
    />
  );
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  schematic,
  selection,
  analysisConfig,
  netlist,
  solverWarnings,
  onUpdateComponent,
  onUpdateComponentParams,
  onRotateComponent,
  onDeleteTarget,
  onUpdateProbe,
  onUpdateAnalysisConfig,
}) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('inspector');
  const [copied, setCopied] = useState(false);
  const [guideExpanded, setGuideExpanded] = useState(true);

  const selectedComp =
    selection?.kind === 'component'
      ? schematic.components.find((c) => c.id === selection.id) ?? null
      : null;
  const selectedProbe =
    selection?.kind === 'probe'
      ? schematic.probes.find((p) => p.id === selection.id) ?? null
      : null;

  const voltageSources = schematic.components.filter(
    (c) =>
      c.type === 'vdc' ||
      c.type === 'vac' ||
      c.type === 'vpulse' ||
      c.type === 'idc' ||
      c.type === 'iac'
  );

  const allWarnings = Array.from(
    new Set([...(netlist?.warnings ?? []), ...solverWarnings])
  );

  const handleCopyNetlist = () => {
    if (!netlist?.spiceText) return;
    navigator.clipboard?.writeText(netlist.spiceText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <aside
      style={{
        width: 344,
        flexShrink: 0,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Tab Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-panel-alt)',
        }}
      >
        {(
          [
            { id: 'inspector', label: 'Inspector', icon: Sliders },
            { id: 'netlist', label: 'Netlist', icon: FileCode2 },
            { id: 'theory', label: 'Theory', icon: BookOpen },
          ] as const
        ).map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px 6px',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                borderBottom: active ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                background: active ? 'rgba(34, 211, 238, 0.08)' : 'transparent',
                transition: 'all 0.12s ease',
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {activeTab === 'inspector' && (
          <>
            {/* Selected Component Inspector */}
            {selectedComp ? (
              <>
              <SectionCard
                title={`COMPONENT · ${selectedComp.type.toUpperCase()}`}
                accent="var(--accent-cyan)"
                actions={
                  <div style={{ display: 'flex', gap: 4 }}>
                    <IconActionButton
                      title="Rotate 90° (R)"
                      onClick={() => onRotateComponent(selectedComp.id)}
                    >
                      <RotateCw size={13} />
                    </IconActionButton>
                    <IconActionButton
                      title="Delete Component (Del)"
                      danger
                      onClick={() => onDeleteTarget({ kind: 'component', id: selectedComp.id })}
                    >
                      <Trash2 size={13} />
                    </IconActionButton>
                  </div>
                }
              >
                <FieldRow label="Designator">
                  <input
                    type="text"
                    value={selectedComp.name}
                    onChange={(e) => onUpdateComponent(selectedComp.id, { name: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </FieldRow>

                {getParamFields(selectedComp.type).map((f) => (
                  <FieldRow key={f.key} label={f.label}>
                    <SIInput
                      value={selectedComp.params[f.key] ?? f.defaultVal}
                      unit={f.unit}
                      onCommit={(val) =>
                        onUpdateComponentParams(selectedComp.id, { [f.key]: val })
                      }
                    />
                  </FieldRow>
                ))}

                {selectedComp.type === 'potentiometer' && (
                  <FieldRow
                    label={`Wiper Position (${Math.round((selectedComp.params.wiperPos ?? 0.5) * 100)}%)`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="range"
                        min={1}
                        max={99}
                        step={1}
                        value={Math.round((selectedComp.params.wiperPos ?? 0.5) * 100)}
                        onChange={(e) =>
                          onUpdateComponentParams(selectedComp.id, {
                            wiperPos: Number(e.target.value) / 100,
                          })
                        }
                        style={{
                          flex: 1,
                          padding: 0,
                          border: 'none',
                          background: 'transparent',
                          accentColor: '#22d3ee',
                          cursor: 'pointer',
                        }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--accent-cyan)',
                          minWidth: 34,
                          textAlign: 'right',
                        }}
                      >
                        {Math.round((selectedComp.params.wiperPos ?? 0.5) * 100)}%
                      </span>
                    </div>
                  </FieldRow>
                )}

                {selectedComp.type === 'led' && (
                  <FieldRow label="Emission Color">
                    <select
                      value={selectedComp.params.ledColor ?? 'red'}
                      onChange={(e) =>
                        onUpdateComponentParams(selectedComp.id, {
                          ledColor: e.target.value as ComponentParams['ledColor'],
                        })
                      }
                      style={{ width: '100%' }}
                    >
                      <option value="red">Red (~1.8–2.0 V)</option>
                      <option value="amber">Amber (~2.0 V)</option>
                      <option value="green">Green (~2.2 V)</option>
                      <option value="blue">Blue (~3.0 V)</option>
                      <option value="white">White (~3.2 V)</option>
                    </select>
                  </FieldRow>
                )}

                {selectedComp.type === 'ground' && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    Reference node (Node 0 · 0 V). All nodal voltages are measured relative to GND.
                  </div>
                )}

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 11.5,
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Grid: ({selectedComp.x}, {selectedComp.y}) · Rot: {selectedComp.rotation}°
                </div>
              </SectionCard>
              <BeginnerComponentGuideCard
                guide={COMPONENT_GUIDE[selectedComp.type]}
                expanded={guideExpanded}
                onToggle={() => setGuideExpanded((v) => !v)}
              />
              </>
            ) : selectedProbe ? (
              <SectionCard
                title="VOLTAGE PROBE"
                accent={selectedProbe.color}
                actions={
                  <IconActionButton
                    title="Delete Probe"
                    danger
                    onClick={() => onDeleteTarget({ kind: 'probe', id: selectedProbe.id })}
                  >
                    <Trash2 size={13} />
                  </IconActionButton>
                }
              >
                <FieldRow label="Probe Label">
                  <input
                    type="text"
                    value={selectedProbe.label}
                    onChange={(e) => onUpdateProbe(selectedProbe.id, { label: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </FieldRow>
                <FieldRow label="Trace Color">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#60a5fa'].map((c) => (
                      <button
                        key={c}
                        onClick={() => onUpdateProbe(selectedProbe.id, { color: c })}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: c,
                          border:
                            selectedProbe.color === c
                              ? '2px solid #ffffff'
                              : '1px solid rgba(255,255,255,0.2)',
                        }}
                      />
                    ))}
                  </div>
                </FieldRow>
              </SectionCard>
            ) : selection?.kind === 'wire' ? (
              <SectionCard
                title="WIRE SEGMENT"
                accent="var(--accent-emerald)"
                actions={
                  <IconActionButton
                    title="Delete Wire"
                    danger
                    onClick={() => onDeleteTarget(selection)}
                  >
                    <Trash2 size={13} />
                  </IconActionButton>
                }
              >
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  Ideal zero-resistance electrical connection. Press Delete to remove.
                </div>
              </SectionCard>
            ) : (
              <div
                style={{
                  padding: '12px 10px',
                  borderRadius: 7,
                  border: '1px dashed var(--border-strong)',
                  background: 'rgba(11, 15, 23, 0.5)',
                  color: 'var(--text-muted)',
                  fontSize: 11.5,
                  lineHeight: 1.5,
                }}
              >
                Click any component, wire, or probe on the schematic to inspect or edit its parameters.
                Supports SI suffixes (<code style={{ color: 'var(--text-secondary)' }}>10k</code>,{' '}
                <code style={{ color: 'var(--text-secondary)' }}>2.53u</code>,{' '}
                <code style={{ color: 'var(--text-secondary)' }}>10m</code>).
              </div>
            )}

            {/* Simulation Settings Section */}
            <SectionCard
              title={`SIMULATION · ${analysisConfig.type.replace('_', ' ').toUpperCase()}`}
              accent="var(--accent-amber)"
            >
              {analysisConfig.type === 'transient' && (
                <>
                  <FieldRow label="Stop Time">
                    <SIInput
                      value={analysisConfig.transient.stopTime}
                      unit="s"
                      onCommit={(v) =>
                        onUpdateAnalysisConfig({
                          ...analysisConfig,
                          transient: { ...analysisConfig.transient, stopTime: Math.max(1e-9, v) },
                        })
                      }
                    />
                  </FieldRow>
                  <FieldRow label="Time Step (Δt)">
                    <SIInput
                      value={analysisConfig.transient.timeStep}
                      unit="s"
                      onCommit={(v) =>
                        onUpdateAnalysisConfig({
                          ...analysisConfig,
                          transient: { ...analysisConfig.transient, timeStep: Math.max(1e-12, v) },
                        })
                      }
                    />
                  </FieldRow>
                  <FieldRow label="Integration Method">
                    <select
                      value={analysisConfig.transient.method ?? 'trapezoidal'}
                      onChange={(e) =>
                        onUpdateAnalysisConfig({
                          ...analysisConfig,
                          transient: {
                            ...analysisConfig.transient,
                            method: e.target.value as 'trapezoidal' | 'backward_euler',
                          },
                        })
                      }
                      style={{ width: '100%' }}
                    >
                      <option value="trapezoidal">Trapezoidal (2nd Order)</option>
                      <option value="backward_euler">Backward Euler (Stiff)</option>
                    </select>
                  </FieldRow>
                </>
              )}

              {analysisConfig.type === 'ac' && (
                <>
                  <FieldRow label="Start Frequency">
                    <SIInput
                      value={analysisConfig.ac.startFreq}
                      unit="Hz"
                      onCommit={(v) =>
                        onUpdateAnalysisConfig({
                          ...analysisConfig,
                          ac: { ...analysisConfig.ac, startFreq: Math.max(1e-3, v) },
                        })
                      }
                    />
                  </FieldRow>
                  <FieldRow label="Stop Frequency">
                    <SIInput
                      value={analysisConfig.ac.stopFreq}
                      unit="Hz"
                      onCommit={(v) =>
                        onUpdateAnalysisConfig({
                          ...analysisConfig,
                          ac: { ...analysisConfig.ac, stopFreq: Math.max(1, v) },
                        })
                      }
                    />
                  </FieldRow>
                  <FieldRow label="Points / Decade">
                    <input
                      type="number"
                      min={5}
                      max={200}
                      value={analysisConfig.ac.pointsPerDecade}
                      onChange={(e) =>
                        onUpdateAnalysisConfig({
                          ...analysisConfig,
                          ac: {
                            ...analysisConfig.ac,
                            pointsPerDecade: Math.max(5, Math.min(200, Number(e.target.value) || 25)),
                          },
                        })
                      }
                      style={{ width: '100%' }}
                    />
                  </FieldRow>
                </>
              )}

              {analysisConfig.type === 'dc_sweep' && (
                <>
                  <FieldRow label="Sweep Source">
                    {voltageSources.length > 0 ? (
                      <select
                        value={analysisConfig.dcSweep.sourceName}
                        onChange={(e) =>
                          onUpdateAnalysisConfig({
                            ...analysisConfig,
                            dcSweep: { ...analysisConfig.dcSweep, sourceName: e.target.value },
                          })
                        }
                        style={{ width: '100%' }}
                      >
                        {voltageSources.map((src) => (
                          <option key={src.id} value={src.name}>
                            {src.name} ({src.type.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={analysisConfig.dcSweep.sourceName}
                        onChange={(e) =>
                          onUpdateAnalysisConfig({
                            ...analysisConfig,
                            dcSweep: { ...analysisConfig.dcSweep, sourceName: e.target.value },
                          })
                        }
                        style={{ width: '100%' }}
                      />
                    )}
                  </FieldRow>
                  <FieldRow label="Start Value">
                    <SIInput
                      value={analysisConfig.dcSweep.startValue}
                      unit="V"
                      onCommit={(v) =>
                        onUpdateAnalysisConfig({
                          ...analysisConfig,
                          dcSweep: { ...analysisConfig.dcSweep, startValue: v },
                        })
                      }
                    />
                  </FieldRow>
                  <FieldRow label="Stop Value">
                    <SIInput
                      value={analysisConfig.dcSweep.stopValue}
                      unit="V"
                      onCommit={(v) =>
                        onUpdateAnalysisConfig({
                          ...analysisConfig,
                          dcSweep: { ...analysisConfig.dcSweep, stopValue: v },
                        })
                      }
                    />
                  </FieldRow>
                  <FieldRow label="Step Value">
                    <SIInput
                      value={analysisConfig.dcSweep.stepValue}
                      unit="V"
                      onCommit={(v) =>
                        onUpdateAnalysisConfig({
                          ...analysisConfig,
                          dcSweep: { ...analysisConfig.dcSweep, stepValue: Math.max(1e-6, Math.abs(v)) },
                        })
                      }
                    />
                  </FieldRow>
                </>
              )}

              {analysisConfig.type === 'dc_op' && (
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Computes the nonlinear DC steady-state operating point using damped Newton-Raphson
                  iteration (capacitors open, inductors shorted).
                </div>
              )}
            </SectionCard>
          </>
        )}

        {activeTab === 'netlist' && (
          <>
            {/* Netlist Summary Badges */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <StatBadge
                icon={<Cpu size={12} />}
                label="Components"
                value={String(schematic.components.length)}
              />
              <StatBadge
                icon={<Radio size={12} />}
                label="Nodes"
                value={String(netlist?.nodes.length ?? 0)}
              />
              <button
                onClick={handleCopyNetlist}
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 9px',
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  background: copied ? 'rgba(52, 211, 153, 0.16)' : 'var(--bg-panel-alt)',
                  border: `1px solid ${copied ? 'var(--accent-emerald)' : 'var(--border-strong)'}`,
                  color: copied ? 'var(--accent-emerald)' : 'var(--text-primary)',
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            {/* Monospace SPICE Netlist */}
            <pre
              style={{
                background: 'var(--bg-app)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 7,
                padding: 10,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                lineHeight: 1.55,
                color: '#cbd5e1',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {netlist?.spiceText || '* No compiled netlist'}
            </pre>

            {/* Warnings */}
            {allWarnings.length > 0 && (
              <div
                style={{
                  background: 'rgba(251, 191, 36, 0.08)',
                  border: '1px solid rgba(251, 191, 36, 0.35)',
                  borderRadius: 7,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--accent-amber)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <AlertTriangle size={13} />
                  DIAGNOSTICS ({allWarnings.length})
                </div>
                {allWarnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: '#fde68a', lineHeight: 1.45 }}>
                    • {w}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'theory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {schematic.name}
              </h3>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 10.5,
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  background: 'rgba(34, 211, 238, 0.14)',
                  border: '1px solid rgba(34, 211, 238, 0.4)',
                  color: 'var(--accent-cyan)',
                }}
              >
                {schematic.category}
              </span>
            </div>

            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              {schematic.description}
            </p>

            {schematic.theoryNotes ? (
              <div
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  padding: 13,
                  fontSize: 13,
                  lineHeight: 1.65,
                  color: '#e2e8f0',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {schematic.theoryNotes}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Bu devre için ek teori notu bulunmuyor.
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

const BeginnerComponentGuideCard: React.FC<{
  guide: (typeof COMPONENT_GUIDE)[keyof typeof COMPONENT_GUIDE];
  expanded: boolean;
  onToggle: () => void;
}> = ({ guide, expanded, onToggle }) => (
  <div
    style={{
      background: 'linear-gradient(180deg, rgba(14, 116, 144, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
      border: '1px solid rgba(34, 211, 238, 0.4)',
      borderRadius: 9,
      overflow: 'hidden',
    }}
  >
    <button
      onClick={onToggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '9px 11px',
        background: 'rgba(34, 211, 238, 0.1)',
        borderBottom: expanded ? '1px solid rgba(34, 211, 238, 0.25)' : 'none',
        color: '#67e8f9',
        fontSize: 12,
        fontWeight: 700,
        textAlign: 'left',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Lightbulb size={14} color="#22d3ee" />
        Bu Eleman Ne İşe Yarar?
      </span>
      {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
    </button>

    {expanded && (
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f8fafc' }}>{guide.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>
          {guide.shortDesc}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: '#bae6fd',
            background: 'rgba(11, 15, 23, 0.55)',
            borderLeft: '2px solid var(--accent-cyan)',
            padding: '7px 9px',
            borderRadius: '0 6px 6px 0',
            lineHeight: 1.48,
          }}
        >
          <strong>Benzetme:</strong> {guide.analogy}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Pinler:</strong> {guide.pins}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          <strong style={{ color: 'var(--accent-emerald)' }}>Pratik İpucu:</strong> {guide.practicalTip}
        </div>
        <div
          style={{
            fontSize: 11.5,
            fontFamily: 'var(--font-mono)',
            color: 'var(--accent-amber)',
            background: 'rgba(11, 15, 23, 0.5)',
            padding: '5px 8px',
            borderRadius: 5,
          }}
        >
          Tipik Değerler: {guide.typicalValues}
        </div>
      </div>
    )}
  </div>
);

const SectionCard: React.FC<{
  title: string;
  accent: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, accent, actions, children }) => (
  <div
    style={{
      background: 'var(--bg-panel-alt)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 11px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(11, 15, 23, 0.45)',
      }}
    >
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: '0.05em',
          color: accent,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {title}
      </span>
      {actions}
    </div>
    <div style={{ padding: 11, display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
  </div>
);

const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
    <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
    {children}
  </label>
);

const IconActionButton: React.FC<{
  title: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ title, danger, onClick, children }) => (
  <button
    title={title}
    onClick={onClick}
    style={{
      padding: 5,
      borderRadius: 5,
      color: danger ? 'var(--accent-rose)' : 'var(--text-secondary)',
      background: danger ? 'rgba(251, 113, 133, 0.12)' : 'var(--bg-hover)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {children}
  </button>
);

const StatBadge: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 9px',
      borderRadius: 6,
      background: 'var(--bg-app)',
      border: '1px solid var(--border-subtle)',
      fontSize: 12,
      fontFamily: 'var(--font-mono)',
    }}
  >
    <span style={{ color: 'var(--accent-cyan)', display: 'flex' }}>{icon}</span>
    <span style={{ color: 'var(--text-muted)' }}>{label}:</span>
    <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{value}</span>
  </div>
);
