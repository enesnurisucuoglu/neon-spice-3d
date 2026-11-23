import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Activity, RotateCw } from 'lucide-react';
import {
  CircuitComponent,
  CircuitSchematic,
  CompiledNetlist,
  COMPONENT_PINS,
  ComponentType,
  DCOPResult,
  getPinWorldPos,
  Point,
  pointKey,
  ProbeMarker,
  Rotation,
  Wire,
} from '../types/circuit';
import { formatSI } from '../utils/format';
import { ComponentSymbol, GRID_SIZE } from './ComponentSymbols';

export type ToolMode = 'select' | 'wire' | 'place' | 'probe' | 'delete';

export type SelectionTarget =
  | { kind: 'component'; id: string }
  | { kind: 'wire'; id: string }
  | { kind: 'probe'; id: string }
  | null;

export interface SchematicCanvasProps {
  schematic: CircuitSchematic;
  netlist: CompiledNetlist | null;
  dcOpResult: DCOPResult | null;
  toolMode: ToolMode;
  placingType: ComponentType;
  placingRotation: Rotation;
  selection: SelectionTarget;
  onSelect: (target: SelectionTarget) => void;
  onMoveComponent: (id: string, x: number, y: number) => void;
  onAddWireSegments: (segments: Omit<Wire, 'id'>[]) => void;
  onPlaceComponent: (type: ComponentType, x: number, y: number, rotation: Rotation) => void;
  onPlaceProbe: (x: number, y: number) => void;
  onDeleteTarget: (target: NonNullable<SelectionTarget>) => void;
  onRotatePlacing?: () => void;
}

function pointOnSegment(px: number, py: number, w: Wire): boolean {
  if (w.x1 === w.x2 && px === w.x1) {
    const minY = Math.min(w.y1, w.y2);
    const maxY = Math.max(w.y1, w.y2);
    return py > minY && py < maxY;
  }
  if (w.y1 === w.y2 && py === w.y1) {
    const minX = Math.min(w.x1, w.x2);
    const maxX = Math.max(w.x1, w.x2);
    return px > minX && px < maxX;
  }
  return false;
}

export const SchematicCanvas: React.FC<SchematicCanvasProps> = ({
  schematic,
  netlist,
  dcOpResult,
  toolMode,
  placingType,
  placingRotation,
  selection,
  onSelect,
  onMoveComponent,
  onAddWireSegments,
  onPlaceComponent,
  onPlaceProbe,
  onDeleteTarget,
  onRotatePlacing,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Camera state: viewOffset is world-pixel translation in screen space
  const [zoom, setZoom] = useState(1.15);
  const [pan, setPan] = useState<Point>({ x: 40, y: 30 });
  const [showDcBadges, setShowDcBadges] = useState(true);

  // Interactive transient states
  const [hoverGrid, setHoverGrid] = useState<Point | null>(null);
  const [wireStart, setWireStart] = useState<Point | null>(null);
  const [wireHorizontalFirst, setWireHorizontalFirst] = useState(true);
  const [draggingComp, setDraggingComp] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);

  // Clear wire start when switching away from wire mode
  useEffect(() => {
    if (toolMode !== 'wire') {
      setWireStart(null);
    }
  }, [toolMode]);

  // Spacebar pan support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)
      ) {
        setSpacePressed(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Compute bounding box and fit view
  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const xs: number[] = [];
    const ys: number[] = [];
    for (const c of schematic.components) {
      xs.push((c.x - 3) * GRID_SIZE, (c.x + 3) * GRID_SIZE);
      ys.push((c.y - 3) * GRID_SIZE, (c.y + 3) * GRID_SIZE);
    }
    for (const w of schematic.wires) {
      xs.push(w.x1 * GRID_SIZE, w.x2 * GRID_SIZE);
      ys.push(w.y1 * GRID_SIZE, w.y2 * GRID_SIZE);
    }
    for (const p of schematic.probes) {
      xs.push(p.x * GRID_SIZE);
      ys.push(p.y * GRID_SIZE);
    }

    if (xs.length === 0) {
      setZoom(1.1);
      setPan({ x: rect.width / 2 - 200, y: rect.height / 2 - 150 });
      return;
    }

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const contentW = Math.max(maxX - minX, 160);
    const contentH = Math.max(maxY - minY, 120);
    const padX = 72;
    const padY = 56;
    const scaleX = (rect.width - padX * 2) / contentW;
    const scaleY = (rect.height - padY * 2) / contentH;
    const nextZoom = Math.max(0.55, Math.min(1.65, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setZoom(nextZoom);
    setPan({
      x: rect.width / 2 - centerX * nextZoom,
      y: rect.height / 2 - centerY * nextZoom,
    });
  }, [schematic.components, schematic.wires, schematic.probes]);

  // Auto-fit when preset ID changes
  useEffect(() => {
    const id = requestAnimationFrame(() => fitToView());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schematic.id]);

  // Convert client mouse event to snapped grid coordinates
  const clientToGrid = useCallback(
    (clientX: number, clientY: number): Point => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const worldX = (clientX - rect.left - pan.x) / zoom;
      const worldY = (clientY - rect.top - pan.y) / zoom;
      return {
        x: Math.round(worldX / GRID_SIZE),
        y: Math.round(worldY / GRID_SIZE),
      };
    },
    [pan, zoom]
  );

  // Compute junction dots where 3+ wire endpoints/pins meet or T-junctions occur
  const junctions = useMemo(() => {
    const degree = new Map<string, { x: number; y: number; count: number }>();
    const bump = (x: number, y: number, inc = 1) => {
      const k = pointKey(x, y);
      const cur = degree.get(k);
      if (cur) cur.count += inc;
      else degree.set(k, { x, y, count: inc });
    };

    for (const w of schematic.wires) {
      bump(w.x1, w.y1, 1);
      bump(w.x2, w.y2, 1);
    }
    for (const c of schematic.components) {
      for (const pin of COMPONENT_PINS[c.type]) {
        const pt = getPinWorldPos(c, pin);
        bump(pt.x, pt.y, 1);
      }
    }

    // Check T-junctions (endpoint lying on interior of another wire)
    for (const entry of degree.values()) {
      for (const w of schematic.wires) {
        if (pointOnSegment(entry.x, entry.y, w)) {
          entry.count += 2;
        }
      }
    }

    const pts: Point[] = [];
    for (const entry of degree.values()) {
      if (entry.count >= 3) {
        pts.push({ x: entry.x, y: entry.y });
      }
    }
    return pts;
  }, [schematic.wires, schematic.components]);

  // Compute DC operating point voltage badges for probes & key non-ground nodes
  const dcBadges = useMemo(() => {
    if (!showDcBadges || !dcOpResult || !dcOpResult.converged || !netlist) return [];
    const badges: { key: string; x: number; y: number; voltage: number; color: string; isProbe: boolean }[] = [];
    const coveredNodes = new Set<number>([0]);

    // First place badges on probe nodes (offset slightly below probe marker)
    for (const probe of schematic.probes) {
      const nodeId = netlist.probeNodes[probe.label];
      if (nodeId !== undefined && nodeId !== 0 && dcOpResult.nodeVoltages[nodeId] !== undefined) {
        coveredNodes.add(nodeId);
        badges.push({
          key: `probe-${probe.id}`,
          x: probe.x,
          y: probe.y,
          voltage: dcOpResult.nodeVoltages[nodeId],
          color: probe.color,
          isProbe: true,
        });
      }
    }

    // Also show non-probe key nodes (pick top-most point of each remaining node)
    for (const node of netlist.nodes) {
      if (coveredNodes.has(node.id) || node.points.length === 0) continue;
      const v = dcOpResult.nodeVoltages[node.id];
      if (v === undefined || !Number.isFinite(v)) continue;
      let best = node.points[0];
      for (const pt of node.points) {
        if (pt.y < best.y || (pt.y === best.y && pt.x > best.x)) {
          best = pt;
        }
      }
      badges.push({
        key: `node-${node.id}`,
        x: best.x,
        y: best.y,
        voltage: v,
        color: '#94a3b8',
        isProbe: false,
      });
    }

    return badges;
  }, [showDcBadges, dcOpResult, netlist, schematic.probes]);

  // Wheel zoom centered on cursor
  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nextZoom = Math.max(0.35, Math.min(3.0, zoom * factor));
      const worldX = (mouseX - pan.x) / zoom;
      const worldY = (mouseY - pan.y) / zoom;

      setZoom(nextZoom);
      setPan({
        x: mouseX - worldX * nextZoom,
        y: mouseY - worldY * nextZoom,
      });
    },
    [zoom, pan]
  );

  // Mouse down on canvas background
  const handleCanvasMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Middle mouse or Space+left-click or left-click on empty canvas in select mode -> pan
    if (e.button === 1 || (e.button === 0 && spacePressed)) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }

    if (e.button === 2) {
      // Right-click cancels wire drawing or flips L-orientation
      if (toolMode === 'wire' && wireStart) {
        setWireStart(null);
      } else if (toolMode === 'place' && onRotatePlacing) {
        onRotatePlacing();
      }
      return;
    }

    if (e.button !== 0) return;
    const grid = clientToGrid(e.clientX, e.clientY);

    if (toolMode === 'select') {
      // Clicked on empty background -> clear selection & start pan
      onSelect(null);
      setIsPanning(true);
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    } else if (toolMode === 'wire') {
      if (!wireStart) {
        setWireStart(grid);
      } else {
        if (wireStart.x !== grid.x || wireStart.y !== grid.y) {
          const segments: Omit<Wire, 'id'>[] = [];
          if (wireStart.x === grid.x || wireStart.y === grid.y) {
            segments.push({ x1: wireStart.x, y1: wireStart.y, x2: grid.x, y2: grid.y });
          } else if (wireHorizontalFirst) {
            segments.push({ x1: wireStart.x, y1: wireStart.y, x2: grid.x, y2: wireStart.y });
            segments.push({ x1: grid.x, y1: wireStart.y, x2: grid.x, y2: grid.y });
          } else {
            segments.push({ x1: wireStart.x, y1: wireStart.y, x2: wireStart.x, y2: grid.y });
            segments.push({ x1: wireStart.x, y1: grid.y, x2: grid.x, y2: grid.y });
          }
          onAddWireSegments(segments);
        }
        setWireStart(null);
      }
    } else if (toolMode === 'place') {
      onPlaceComponent(placingType, grid.x, grid.y, placingRotation);
    } else if (toolMode === 'probe') {
      onPlaceProbe(grid.x, grid.y);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const grid = clientToGrid(e.clientX, e.clientY);
    setHoverGrid(grid);

    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.clientX;
      const dy = e.clientY - panStartRef.current.clientY;
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
      return;
    }

    if (draggingComp) {
      const nextX = grid.x - draggingComp.offsetX;
      const nextY = grid.y - draggingComp.offsetY;
      onMoveComponent(draggingComp.id, nextX, nextY);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    panStartRef.current = null;
    setDraggingComp(null);
  };

  const handleComponentMouseDown = (comp: CircuitComponent, e: React.MouseEvent<SVGGElement>) => {
    if (spacePressed || e.button === 1) return;
    e.stopPropagation();

    if (toolMode === 'delete') {
      onDeleteTarget({ kind: 'component', id: comp.id });
      return;
    }

    if (toolMode === 'select') {
      onSelect({ kind: 'component', id: comp.id });
      const grid = clientToGrid(e.clientX, e.clientY);
      setDraggingComp({
        id: comp.id,
        offsetX: grid.x - comp.x,
        offsetY: grid.y - comp.y,
      });
    } else if (toolMode === 'wire' || toolMode === 'probe') {
      // Allow clicking directly on component pins while wiring or probing
      const grid = clientToGrid(e.clientX, e.clientY);
      if (toolMode === 'probe') {
        onPlaceProbe(grid.x, grid.y);
      } else if (toolMode === 'wire') {
        if (!wireStart) {
          setWireStart(grid);
        } else {
          if (wireStart.x !== grid.x || wireStart.y !== grid.y) {
            const segments: Omit<Wire, 'id'>[] = [];
            if (wireStart.x === grid.x || wireStart.y === grid.y) {
              segments.push({ x1: wireStart.x, y1: wireStart.y, x2: grid.x, y2: grid.y });
            } else if (wireHorizontalFirst) {
              segments.push({ x1: wireStart.x, y1: wireStart.y, x2: grid.x, y2: wireStart.y });
              segments.push({ x1: grid.x, y1: wireStart.y, x2: grid.x, y2: grid.y });
            } else {
              segments.push({ x1: wireStart.x, y1: wireStart.y, x2: wireStart.x, y2: grid.y });
              segments.push({ x1: wireStart.x, y1: grid.y, x2: grid.x, y2: grid.y });
            }
            onAddWireSegments(segments);
          }
          setWireStart(null);
        }
      }
    }
  };

  const handleWireClick = (wire: Wire, e: React.MouseEvent) => {
    if (toolMode === 'wire' || toolMode === 'probe') return;
    e.stopPropagation();
    if (toolMode === 'delete') {
      onDeleteTarget({ kind: 'wire', id: wire.id });
    } else if (toolMode === 'select') {
      onSelect({ kind: 'wire', id: wire.id });
    }
  };

  const handleProbeClick = (probe: ProbeMarker, e: React.MouseEvent) => {
    if (toolMode === 'wire') return;
    e.stopPropagation();
    if (toolMode === 'delete') {
      onDeleteTarget({ kind: 'probe', id: probe.id });
    } else if (toolMode === 'select') {
      onSelect({ kind: 'probe', id: probe.id });
    }
  };

  // Cursor style based on mode
  const canvasCursor = isPanning
    ? 'grabbing'
    : spacePressed
    ? 'grab'
    : toolMode === 'wire' || toolMode === 'place' || toolMode === 'probe'
    ? 'crosshair'
    : toolMode === 'delete'
    ? 'not-allowed'
    : 'default';

  // Wire preview path
  const wirePreviewPath = useMemo(() => {
    if (toolMode !== 'wire' || !wireStart || !hoverGrid) return null;
    const x1 = wireStart.x * GRID_SIZE;
    const y1 = wireStart.y * GRID_SIZE;
    const x2 = hoverGrid.x * GRID_SIZE;
    const y2 = hoverGrid.y * GRID_SIZE;
    if (wireHorizontalFirst) {
      return `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2}`;
    }
    return `M ${x1} ${y1} L ${x1} ${y2} L ${x2} ${y2}`;
  }, [toolMode, wireStart, hoverGrid, wireHorizontalFirst]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'radial-gradient(circle at 50% 35%, #0f172a 0%, #0b0f17 75%)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ display: 'block', cursor: canvasCursor }}
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setHoverGrid(null);
          handleMouseUp();
        }}
      >
        <defs>
          {/* Dynamic dot-grid pattern aligned to pan & zoom */}
          <pattern
            id="neon-grid-dots"
            x={pan.x % (GRID_SIZE * zoom)}
            y={pan.y % (GRID_SIZE * zoom)}
            width={GRID_SIZE * zoom}
            height={GRID_SIZE * zoom}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={1} cy={1} r={Math.max(0.85, Math.min(1.35, zoom * 0.95))} fill="#26334a" />
          </pattern>
          <pattern
            id="neon-grid-major"
            x={pan.x % (GRID_SIZE * 5 * zoom)}
            y={pan.y % (GRID_SIZE * 5 * zoom)}
            width={GRID_SIZE * 5 * zoom}
            height={GRID_SIZE * 5 * zoom}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={1} cy={1} r={Math.max(1.2, Math.min(1.9, zoom * 1.35))} fill="#3b4d6b" />
          </pattern>
        </defs>

        {/* Background Grid */}
        <rect width="100%" height="100%" fill="url(#neon-grid-dots)" />
        <rect width="100%" height="100%" fill="url(#neon-grid-major)" />

        {/* World Transform Layer */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Wires */}
          {schematic.wires.map((wire) => {
            const isSelected = selection?.kind === 'wire' && selection.id === wire.id;
            return (
              <g
                key={wire.id}
                onClick={(e) => handleWireClick(wire, e)}
                style={{ cursor: toolMode === 'delete' ? 'pointer' : toolMode === 'select' ? 'pointer' : 'inherit' }}
              >
                {/* Wide invisible hit stroke */}
                <line
                  x1={wire.x1 * GRID_SIZE}
                  y1={wire.y1 * GRID_SIZE}
                  x2={wire.x2 * GRID_SIZE}
                  y2={wire.y2 * GRID_SIZE}
                  stroke="transparent"
                  strokeWidth={12}
                />
                {/* Visible wire */}
                <line
                  x1={wire.x1 * GRID_SIZE}
                  y1={wire.y1 * GRID_SIZE}
                  x2={wire.x2 * GRID_SIZE}
                  y2={wire.y2 * GRID_SIZE}
                  stroke={isSelected ? '#22d3ee' : '#34d399'}
                  strokeWidth={isSelected ? 2.8 : 2.1}
                  strokeLinecap="round"
                  style={
                    isSelected
                      ? { filter: 'drop-shadow(0 0 5px rgba(34, 211, 238, 0.75))' }
                      : { filter: 'drop-shadow(0 0 2px rgba(52, 211, 153, 0.35))' }
                  }
                />
              </g>
            );
          })}

          {/* Wire Junction Dots */}
          {junctions.map((pt) => (
            <circle
              key={`junc-${pt.x}-${pt.y}`}
              cx={pt.x * GRID_SIZE}
              cy={pt.y * GRID_SIZE}
              r={3.8}
              fill="#34d399"
              stroke="#0b0f17"
              strokeWidth={1.1}
              pointerEvents="none"
            />
          ))}

          {/* Components */}
          {schematic.components.map((comp) => {
            const isSelected = selection?.kind === 'component' && selection.id === comp.id;
            return (
              <ComponentSymbol
                key={comp.id}
                component={comp}
                selected={isSelected}
                liveCurrent={dcOpResult?.branchCurrents[comp.name]}
                livePower={dcOpResult?.componentPower[comp.name]}
                onMouseDown={(e) => handleComponentMouseDown(comp, e)}
              />
            );
          })}

          {/* Live Orthogonal Wire Preview */}
          {wirePreviewPath && (
            <path
              d={wirePreviewPath}
              fill="none"
              stroke="#22d3ee"
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          )}
          {toolMode === 'wire' && wireStart && (
            <circle
              cx={wireStart.x * GRID_SIZE}
              cy={wireStart.y * GRID_SIZE}
              r={4}
              fill="#22d3ee"
              pointerEvents="none"
            />
          )}

          {/* Ghost Component Placement Preview */}
          {toolMode === 'place' && hoverGrid && (
            <g pointerEvents="none">
              <ComponentSymbol
                component={{
                  name: '',
                  type: placingType,
                  x: hoverGrid.x,
                  y: hoverGrid.y,
                  rotation: placingRotation,
                  params: {},
                }}
                ghost
              />
            </g>
          )}

          {/* Snap Cursor Reticle for wire / probe */}
          {(toolMode === 'wire' || toolMode === 'probe') && hoverGrid && (
            <g
              transform={`translate(${hoverGrid.x * GRID_SIZE}, ${hoverGrid.y * GRID_SIZE})`}
              pointerEvents="none"
            >
              <circle r={5.5} fill="none" stroke="#22d3ee" strokeWidth={1.3} strokeOpacity={0.85} />
              <circle r={1.8} fill="#22d3ee" />
            </g>
          )}

          {/* Probe Flags */}
          {schematic.probes.map((probe) => {
            const isSelected = selection?.kind === 'probe' && selection.id === probe.id;
            const px = probe.x * GRID_SIZE;
            const py = probe.y * GRID_SIZE;
            const labelW = Math.max(36, probe.label.length * 7 + 14);
            return (
              <g
                key={probe.id}
                transform={`translate(${px}, ${py})`}
                onClick={(e) => handleProbeClick(probe, e)}
                style={{ cursor: 'pointer' }}
              >
                {/* Probe pin anchor dot */}
                <circle
                  cx={0}
                  cy={0}
                  r={4.2}
                  fill={probe.color}
                  stroke="#0b0f17"
                  strokeWidth={1.5}
                />
                {/* Angled probe stem */}
                <line x1={0} y1={0} x2={8} y2={-14} stroke={probe.color} strokeWidth={1.8} />
                {/* Flag pill */}
                <rect
                  x={6}
                  y={-28}
                  width={labelW}
                  height={16}
                  rx={4}
                  fill="#0b0f17"
                  fillOpacity={0.94}
                  stroke={isSelected ? '#ffffff' : probe.color}
                  strokeWidth={isSelected ? 1.8 : 1.3}
                  style={{ filter: `drop-shadow(0 0 5px ${probe.color}55)` }}
                />
                <text
                  x={6 + labelW / 2}
                  y={-17}
                  textAnchor="middle"
                  fill={probe.color}
                  fontSize={9.5}
                  fontWeight={700}
                  fontFamily="var(--font-mono)"
                >
                  {probe.label}
                </text>
              </g>
            );
          })}

          {/* DC Operating Point Node Voltage Pills */}
          {dcBadges.map((b) => {
            const text = formatSI(b.voltage, 'V', 2);
            const pillW = Math.max(40, text.length * 6.1 + 10);
            const ox = b.isProbe ? 8 : 6;
            const oy = b.isProbe ? 6 : -22;
            return (
              <g
                key={b.key}
                transform={`translate(${b.x * GRID_SIZE + ox}, ${b.y * GRID_SIZE + oy})`}
                pointerEvents="none"
              >
                <rect
                  x={0}
                  y={0}
                  width={pillW}
                  height={15}
                  rx={3.5}
                  fill="rgba(15, 23, 42, 0.9)"
                  stroke={b.isProbe ? b.color : '#334155'}
                  strokeWidth={0.9}
                  strokeOpacity={0.85}
                />
                <text
                  x={pillW / 2}
                  y={10.5}
                  textAnchor="middle"
                  fill={b.isProbe ? '#f8fafc' : '#cbd5e1'}
                  fontSize={8.8}
                  fontWeight={600}
                  fontFamily="var(--font-mono)"
                >
                  {text}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Top-left floating mode / hint badge */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: 'rgba(17, 24, 39, 0.85)',
            backdropFilter: 'blur(6px)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
            padding: '4px 9px',
            fontSize: 11,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background:
                toolMode === 'wire'
                  ? '#34d399'
                  : toolMode === 'place'
                  ? '#22d3ee'
                  : toolMode === 'probe'
                  ? '#fbbf24'
                  : toolMode === 'delete'
                  ? '#fb7185'
                  : '#60a5fa',
              boxShadow: '0 0 6px currentColor',
            }}
          />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600, textTransform: 'uppercase' }}>
            {toolMode === 'place' ? `PLACE ${placingType.toUpperCase()}` : toolMode.toUpperCase()}
          </span>
          {hoverGrid && (
            <span style={{ color: 'var(--text-muted)' }}>
              ({hoverGrid.x}, {hoverGrid.y})
            </span>
          )}
        </div>

        {toolMode === 'wire' && wireStart && (
          <button
            onClick={() => setWireHorizontalFirst((v) => !v)}
            style={{
              pointerEvents: 'auto',
              background: 'rgba(17, 24, 39, 0.9)',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              color: 'var(--accent-cyan)',
              fontFamily: 'var(--font-mono)',
            }}
            title="Toggle L-corner routing direction"
          >
            Flip L-Bend
          </button>
        )}

        {toolMode === 'place' && onRotatePlacing && (
          <button
            onClick={onRotatePlacing}
            style={{
              pointerEvents: 'auto',
              background: 'rgba(17, 24, 39, 0.9)',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              color: 'var(--accent-cyan)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title="Rotate component (R)"
          >
            <RotateCw size={12} /> {placingRotation}°
          </button>
        )}
      </div>

      {/* Top-right DC OP overlay toggle */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <button
          onClick={() => setShowDcBadges((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 9px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            background: showDcBadges ? 'rgba(34, 211, 238, 0.14)' : 'rgba(17, 24, 39, 0.85)',
            border: `1px solid ${showDcBadges ? 'rgba(34, 211, 238, 0.45)' : 'var(--border-subtle)'}`,
            color: showDcBadges ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            backdropFilter: 'blur(6px)',
          }}
          title="Toggle live DC Operating Point node voltage labels"
        >
          <Activity size={12} />
          DC Bias {showDcBadges ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Bottom-right Zoom & Fit controls */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: 'rgba(17, 24, 39, 0.9)',
          backdropFilter: 'blur(6px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 7,
          padding: 3,
        }}
      >
        <button
          onClick={() => setZoom((z) => Math.max(0.35, +(z / 1.2).toFixed(2)))}
          style={{
            padding: '4px 6px',
            borderRadius: 4,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Zoom Out"
        >
          <ZoomOut size={14} />
        </button>
        <span
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            minWidth: 40,
            textAlign: 'center',
          }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(3.0, +(z * 1.2).toFixed(2)))}
          style={{
            padding: '4px 6px',
            borderRadius: 4,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Zoom In"
        >
          <ZoomIn size={14} />
        </button>
        <div style={{ width: 1, height: 14, background: 'var(--border-subtle)', margin: '0 2px' }} />
        <button
          onClick={fitToView}
          style={{
            padding: '4px 7px',
            borderRadius: 4,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
          }}
          title="Fit Schematic to View"
        >
          <Maximize2 size={13} />
          Fit
        </button>
      </div>
    </div>
  );
};
