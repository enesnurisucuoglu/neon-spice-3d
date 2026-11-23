import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, GripHorizontal } from 'lucide-react';
import {
  AnalysisConfig,
  AnalysisType,
  CircuitComponent,
  CircuitSchematic,
  CompiledNetlist,
  ComponentParams,
  ComponentType,
  DCOPResult,
  ProbeMarker,
  Rotation,
  SimulationResult,
  Wire,
} from './types/circuit';
import { AcademyLevel, AcademyProgress } from './types/academy';
import { compileNetlist, runSimulation, solveDCOP } from './engine';
import { PRESET_CIRCUITS } from './circuits/presets';
import {
  ACADEMY_LEVELS,
  getLevelById,
  loadAcademyProgress,
  saveAcademyProgress,
} from './data/academyLevels';
import { getComponentPrefix, getDefaultParams } from './utils/format';
import { ComponentPalette, Toolbar, ViewMode } from './components/Toolbar';
import { SchematicCanvas, SelectionTarget, ToolMode } from './components/SchematicCanvas';
import { Circuit3DView } from './components/Circuit3DView';
import { Oscilloscope } from './components/Oscilloscope';
import { InspectorPanel } from './components/InspectorPanel';
import { AcademyPanel } from './components/AcademyPanel';
import { TutorialModal } from './components/TutorialModal';

const PROBE_COLORS = ['#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#60a5fa'];

function cloneSchematic(s: CircuitSchematic): CircuitSchematic {
  return {
    ...s,
    components: s.components.map((c) => ({ ...c, params: { ...c.params } })),
    wires: s.wires.map((w) => ({ ...w })),
    probes: s.probes.map((p) => ({ ...p })),
    recommendedAnalysis: {
      type: s.recommendedAnalysis.type,
      transient: { ...s.recommendedAnalysis.transient },
      ac: { ...s.recommendedAnalysis.ac },
      dcSweep: { ...s.recommendedAnalysis.dcSweep },
    },
  };
}

function cloneAnalysisConfig(c: AnalysisConfig): AnalysisConfig {
  return {
    type: c.type,
    transient: { ...c.transient },
    ac: { ...c.ac },
    dcSweep: { ...c.dcSweep },
  };
}

function nextComponentName(type: ComponentType, existing: CircuitComponent[]): string {
  const prefix = getComponentPrefix(type);
  const used = new Set(existing.map((c) => c.name.toUpperCase()));
  let idx = 1;
  while (used.has(`${prefix}${idx}`.toUpperCase())) {
    idx++;
  }
  return `${prefix}${idx}`;
}

function nextProbeLabel(existing: ProbeMarker[]): string {
  const used = new Set(existing.map((p) => p.label.toUpperCase()));
  let idx = 1;
  while (used.has(`V_P${idx}`)) {
    idx++;
  }
  return `V_P${idx}`;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function App() {
  const initialPreset = PRESET_CIRCUITS[0];

  const [schematic, setSchematic] = useState<CircuitSchematic>(() => cloneSchematic(initialPreset));
  const [analysisConfig, setAnalysisConfig] = useState<AnalysisConfig>(() =>
    cloneSchematic(initialPreset).recommendedAnalysis
  );
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [placingType, setPlacingType] = useState<ComponentType>('resistor');
  const [placingRotation, setPlacingRotation] = useState<Rotation>(0);
  const [selection, setSelection] = useState<SelectionTarget>(null);

  // Academy & Tutorial UI states
  const [academyOpen, setAcademyOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [academyProgress, setAcademyProgress] = useState<AcademyProgress>(() =>
    loadAcademyProgress()
  );

  const activeLevel = useMemo(
    () => getLevelById(academyProgress.currentLevelId) ?? ACADEMY_LEVELS[0],
    [academyProgress.currentLevelId]
  );

  // Simulation outputs
  const [netlist, setNetlist] = useState<CompiledNetlist | null>(null);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [dcOpResult, setDcOpResult] = useState<DCOPResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [solveTimeMs, setSolveTimeMs] = useState<number | null>(null);
  const [runCounter, setRunCounter] = useState(0);

  // Vertical split ratio for center pane (top 2D/3D %, bottom Oscilloscope %)
  const [splitRatio, setSplitRatio] = useState(0.56);
  const centerPaneRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

  // Run compilation + simulation whenever schematic, analysisConfig, or manual Run triggers
  const executeSimulation = useCallback(
    (curSchematic: CircuitSchematic, curConfig: AnalysisConfig) => {
      const t0 = performance.now();
      try {
        const compiled = compileNetlist(curSchematic);
        setNetlist(compiled);

        const mainResult = runSimulation(curSchematic, curConfig);
        const dt = performance.now() - t0;
        setSimResult(mainResult);
        setSolveTimeMs(dt);
        setSimError(null);

        if (mainResult.type === 'dc_op') {
          setDcOpResult(mainResult);
        } else {
          try {
            const dcop = solveDCOP(curSchematic, compiled);
            setDcOpResult(dcop);
          } catch {
            setDcOpResult(null);
          }
        }
      } catch (err) {
        const dt = performance.now() - t0;
        setSolveTimeMs(dt);
        setSimError(err instanceof Error ? err.message : String(err));
        setSimResult(null);
        setDcOpResult(null);
      }
    },
    []
  );

  useEffect(() => {
    executeSimulation(schematic, analysisConfig);
  }, [schematic, analysisConfig, runCounter, executeSimulation]);

  // Load an Academy level starter circuit
  const loadAcademyLevel = useCallback((level: AcademyLevel) => {
    setSchematic(cloneSchematic(level.starterSchematic));
    setAnalysisConfig(cloneAnalysisConfig(level.verificationAnalysis));
    setSelection(null);
    setToolMode('select');
    setAcademyProgress((prev) => {
      const next: AcademyProgress = {
        ...prev,
        currentLevelId: level.id,
        lastUpdated: new Date().toISOString(),
      };
      saveAcademyProgress(next);
      return next;
    });
  }, []);

  const handleToggleAcademy = useCallback(() => {
    setAcademyOpen((prevOpen) => {
      const nextOpen = !prevOpen;
      if (nextOpen && activeLevel) {
        // Load active level circuit when opening Academy
        setSchematic(cloneSchematic(activeLevel.starterSchematic));
        setAnalysisConfig(cloneAnalysisConfig(activeLevel.verificationAnalysis));
        setSelection(null);
        setToolMode('select');
      }
      return nextOpen;
    });
  }, [activeLevel]);

  const handleApplySolution = useCallback((level: AcademyLevel) => {
    setSchematic(cloneSchematic(level.solutionSchematic));
    setAnalysisConfig(cloneAnalysisConfig(level.verificationAnalysis));
    setSelection(null);
    setToolMode('select');
  }, []);

  const handleMarkLevelCompleted = useCallback((levelId: number) => {
    setAcademyProgress((prev) => {
      if (prev.completedIds.includes(levelId)) return prev;
      const next: AcademyProgress = {
        ...prev,
        completedIds: [...prev.completedIds, levelId].sort((a, b) => a - b),
        lastUpdated: new Date().toISOString(),
      };
      saveAcademyProgress(next);
      return next;
    });
  }, []);

  // Preset switching & reset
  const handleSelectPreset = useCallback((id: string) => {
    const found = PRESET_CIRCUITS.find((p) => p.id === id);
    if (!found) return;
    const cloned = cloneSchematic(found);
    setSchematic(cloned);
    setAnalysisConfig(cloned.recommendedAnalysis);
    setSelection(null);
    setToolMode('select');
  }, []);

  const handleResetPreset = useCallback(() => {
    if (academyOpen && activeLevel) {
      loadAcademyLevel(activeLevel);
      return;
    }
    const found = PRESET_CIRCUITS.find((p) => p.id === schematic.id) ?? PRESET_CIRCUITS[0];
    const cloned = cloneSchematic(found);
    setSchematic(cloned);
    setAnalysisConfig(cloned.recommendedAnalysis);
    setSelection(null);
    setToolMode('select');
  }, [academyOpen, activeLevel, loadAcademyLevel, schematic.id]);

  // Schematic editing handlers
  const handleMoveComponent = useCallback((id: string, x: number, y: number) => {
    setSchematic((prev) => {
      const target = prev.components.find((c) => c.id === id);
      if (!target || (target.x === x && target.y === y)) return prev;
      return {
        ...prev,
        components: prev.components.map((c) => (c.id === id ? { ...c, x, y } : c)),
      };
    });
  }, []);

  const handleRotateComponent = useCallback((id: string) => {
    setSchematic((prev) => ({
      ...prev,
      components: prev.components.map((c) =>
        c.id === id ? { ...c, rotation: (((c.rotation + 90) % 360) as Rotation) } : c
      ),
    }));
  }, []);

  const handleUpdateComponent = useCallback((id: string, patch: Partial<CircuitComponent>) => {
    setSchematic((prev) => ({
      ...prev,
      components: prev.components.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const handleUpdateComponentParams = useCallback(
    (id: string, paramsPatch: Partial<ComponentParams>) => {
      setSchematic((prev) => ({
        ...prev,
        components: prev.components.map((c) =>
          c.id === id ? { ...c, params: { ...c.params, ...paramsPatch } } : c
        ),
      }));
    },
    []
  );

  const handlePlaceComponent = useCallback(
    (type: ComponentType, x: number, y: number, rotation: Rotation) => {
      const newId = uid('comp');
      setSchematic((prev) => {
        const name = nextComponentName(type, prev.components);
        const newComp: CircuitComponent = {
          id: newId,
          name,
          type,
          x,
          y,
          rotation,
          params: getDefaultParams(type),
        };
        return {
          ...prev,
          components: [...prev.components, newComp],
        };
      });
      setSelection({ kind: 'component', id: newId });
    },
    []
  );

  const handleAddWireSegments = useCallback((segments: Omit<Wire, 'id'>[]) => {
    setSchematic((prev) => ({
      ...prev,
      wires: [
        ...prev.wires,
        ...segments
          .filter((s) => s.x1 !== s.x2 || s.y1 !== s.y2)
          .map((s) => ({ ...s, id: uid('w') })),
      ],
    }));
  }, []);

  const handlePlaceProbe = useCallback((x: number, y: number) => {
    const newId = uid('prb');
    setSchematic((prev) => {
      const label = nextProbeLabel(prev.probes);
      const color = PROBE_COLORS[prev.probes.length % PROBE_COLORS.length];
      return {
        ...prev,
        probes: [...prev.probes, { id: newId, label, x, y, color }],
      };
    });
    setSelection({ kind: 'probe', id: newId });
  }, []);

  const handleUpdateProbe = useCallback((id: string, patch: Partial<ProbeMarker>) => {
    setSchematic((prev) => ({
      ...prev,
      probes: prev.probes.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  const handleDeleteTarget = useCallback((target: NonNullable<SelectionTarget>) => {
    setSchematic((prev) => {
      if (target.kind === 'component') {
        return { ...prev, components: prev.components.filter((c) => c.id !== target.id) };
      }
      if (target.kind === 'wire') {
        return { ...prev, wires: prev.wires.filter((w) => w.id !== target.id) };
      }
      return { ...prev, probes: prev.probes.filter((p) => p.id !== target.id) };
    });
    setSelection((cur) => (cur && cur.kind === target.kind && cur.id === target.id ? null : cur));
  }, []);

  // Global keyboard shortcuts (preserving WASD + Arrows for 3D PCB navigation!)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        tutorialOpen ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'Escape') {
        setToolMode('select');
        setSelection(null);
      } else if ((e.key === 'w' || e.key === 'W') && (viewMode === '2d' || e.shiftKey)) {
        // Bare 'w' only activates Wire tool in pure 2D mode so WASD always moves the 3D camera in 3D & Split views!
        setToolMode('wire');
      } else if (e.key === 'r' || e.key === 'R') {
        if (toolMode === 'place') {
          setPlacingRotation((rot) => ((rot + 90) % 360) as Rotation);
        } else if (selection?.kind === 'component') {
          handleRotateComponent(selection.id);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection) {
          e.preventDefault();
          handleDeleteTarget(selection);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tutorialOpen, viewMode, toolMode, selection, handleRotateComponent, handleDeleteTarget]);

  // Draggable split divider between Schematic/3D and Oscilloscope
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current || !centerPaneRef.current) return;
      const rect = centerPaneRef.current.getBoundingClientRect();
      if (rect.height <= 0) return;
      const rel = (e.clientY - rect.top) / rect.height;
      setSplitRatio(Math.max(0.25, Math.min(0.78, rel)));
    };
    const onMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleSelectAnalysisType = (type: AnalysisType) => {
    setAnalysisConfig((prev) => ({ ...prev, type }));
  };

  const solverWarnings = simResult?.warnings ?? [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Top Bar */}
      <Toolbar
        presets={PRESET_CIRCUITS}
        activePresetId={schematic.id}
        analysisType={analysisConfig.type}
        viewMode={viewMode}
        solveTimeMs={solveTimeMs}
        hasError={Boolean(simError)}
        academyOpen={academyOpen}
        academyCompletedCount={academyProgress.completedIds.length}
        academyTotalCount={ACADEMY_LEVELS.length}
        onSelectPreset={handleSelectPreset}
        onSelectAnalysisType={handleSelectAnalysisType}
        onSelectViewMode={setViewMode}
        onRunSimulation={() => setRunCounter((c) => c + 1)}
        onResetPreset={handleResetPreset}
        onToggleAcademy={handleToggleAcademy}
        onOpenTutorial={() => setTutorialOpen(true)}
      />

      {/* Main Workbench Area */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Left Tool & Component Palette */}
        <ComponentPalette
          toolMode={toolMode}
          placingType={placingType}
          onSelectTool={(mode) => setToolMode(mode)}
          onSelectPlacingType={(type) => {
            setPlacingType(type);
            setToolMode('place');
            if (viewMode === '3d') {
              setViewMode('split');
            }
          }}
        />

        {/* Docked 50-Level Interactive Electronics Academy Drawer */}
        {activeLevel && (
          <AcademyPanel
            open={academyOpen}
            levels={ACADEMY_LEVELS}
            progress={academyProgress}
            activeLevel={activeLevel}
            currentSchematic={schematic}
            onClose={() => setAcademyOpen(false)}
            onSelectLevel={loadAcademyLevel}
            onApplySolution={handleApplySolution}
            onResetLevel={loadAcademyLevel}
            onMarkCompleted={handleMarkLevelCompleted}
          />
        )}

        {/* Center Split Pane: 2D/3D Workspace (top) + Oscilloscope (bottom) */}
        <div
          ref={centerPaneRef}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Top: 2D Schematic / Split 2D + 3D / 3D PCB Lab */}
          <div
            style={{
              height: `${splitRatio * 100}%`,
              minHeight: 160,
              position: 'relative',
              display: 'flex',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            {(viewMode === '2d' || viewMode === 'split') && (
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: '100%',
                  position: 'relative',
                  borderRight: viewMode === 'split' ? '1px solid var(--border-strong)' : 'none',
                }}
              >
                <SchematicCanvas
                  schematic={schematic}
                  netlist={netlist}
                  dcOpResult={dcOpResult}
                  toolMode={toolMode}
                  placingType={placingType}
                  placingRotation={placingRotation}
                  selection={selection}
                  onSelect={setSelection}
                  onMoveComponent={handleMoveComponent}
                  onAddWireSegments={handleAddWireSegments}
                  onPlaceComponent={handlePlaceComponent}
                  onPlaceProbe={handlePlaceProbe}
                  onDeleteTarget={handleDeleteTarget}
                  onRotatePlacing={() => setPlacingRotation((rot) => ((rot + 90) % 360) as Rotation)}
                />
              </div>
            )}

            {(viewMode === '3d' || viewMode === 'split') && (
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: '100%',
                  position: 'relative',
                }}
              >
                <Circuit3DView
                  schematic={schematic}
                  netlist={netlist}
                  dcOpResult={dcOpResult}
                  selectedComponentId={selection?.kind === 'component' ? selection.id : null}
                  onSelectComponent={(compId) =>
                    setSelection(compId ? { kind: 'component', id: compId } : null)
                  }
                />
              </div>
            )}
          </div>

          {/* Draggable Horizontal Divider */}
          <div
            onMouseDown={() => {
              isResizingRef.current = true;
              document.body.style.cursor = 'row-resize';
            }}
            title="Şema / Osiloskop oranını sürükleyerek ayarlayın"
            style={{
              height: 8,
              flexShrink: 0,
              background: 'var(--bg-panel)',
              borderTop: '1px solid var(--border-subtle)',
              borderBottom: '1px solid var(--border-subtle)',
              cursor: 'row-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <GripHorizontal size={15} />
          </div>

          {/* Bottom: Oscilloscope / Bode / DC Table */}
          <div style={{ flex: 1, minHeight: 140, overflow: 'hidden' }}>
            <Oscilloscope result={simResult} probes={schematic.probes} error={simError} />
          </div>
        </div>

        {/* Right Sidebar: Inspector / Netlist / Theory */}
        <InspectorPanel
          schematic={schematic}
          selection={selection}
          analysisConfig={analysisConfig}
          netlist={netlist}
          solverWarnings={solverWarnings}
          onUpdateComponent={handleUpdateComponent}
          onUpdateComponentParams={handleUpdateComponentParams}
          onRotateComponent={handleRotateComponent}
          onDeleteTarget={handleDeleteTarget}
          onUpdateProbe={handleUpdateProbe}
          onUpdateAnalysisConfig={setAnalysisConfig}
        />
      </div>

      {/* Bottom Status Bar */}
      <footer
        style={{
          height: 28,
          flexShrink: 0,
          background: simError ? 'rgba(159, 18, 57, 0.35)' : 'var(--bg-panel)',
          borderTop: `1px solid ${simError ? 'rgba(251, 113, 133, 0.45)' : 'var(--border-subtle)'}`,
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          {simError ? (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                color: 'var(--accent-rose)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <AlertCircle size={13} />
              {simError}
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-emerald)' }}>
              <CheckCircle2 size={13} />
              SPICE Hazır · {netlist?.nodes.length ?? 0} düğüm · {schematic.components.length} eleman
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--text-muted)', flexShrink: 0 }}>
          <span>{viewMode === '2d' ? '[W] Kablo' : '[WASD/Ok] 3D Hareket · [Shift+W] Kablo'}</span>
          <span>[R] Döndür</span>
          <span>[Del] Sil</span>
          <span>[Esc] Seç</span>
        </div>
      </footer>

      {/* 5-Step Quick Start Tutorial Modal */}
      <TutorialModal
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
        onOpenAcademy={() => {
          if (!academyOpen) handleToggleAcademy();
        }}
      />
    </div>
  );
}
