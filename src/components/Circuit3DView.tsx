import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Flame, Activity, RotateCcw, Orbit, Eye } from 'lucide-react';
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
  Rotation,
} from '../types/circuit';
import { GuidedTargetGhost } from '../types/academy';
import { formatSI, getDefaultParams } from '../utils/format';
import {
  createComponent3DMesh,
  createLabelTexture,
  disposeObject3D,
} from './Component3DMeshes';

export type PCBThemeId = 'green' | 'black' | 'blue' | 'white';
export type CameraPreset = 'top3d' | 'iso' | 'top' | 'bench';

export interface Circuit3DViewProps {
  schematic: CircuitSchematic;
  netlist: CompiledNetlist | null;
  dcOpResult: DCOPResult | null;
  selectedComponentId: string | null;
  onSelectComponent: (componentId: string | null) => void;
  toolMode?: 'select' | 'wire' | 'place' | 'probe' | 'delete';
  placingType?: ComponentType;
  placingRotation?: Rotation;
  guidedTarget?: GuidedTargetGhost | null;
  onMoveComponent?: (id: string, x: number, y: number) => void;
  onAddWireSegments?: (segments: Array<{ x1: number; y1: number; x2: number; y2: number }>) => void;
  onPlaceComponent?: (type: ComponentType, x: number, y: number, rotation: Rotation) => void;
  onPlaceProbe?: (x: number, y: number) => void;
  onDeleteTarget?: (target: { kind: 'component' | 'wire' | 'probe'; id: string }) => void;
  onRotatePlacing?: () => void;
}

interface PCBThemeConfig {
  id: PCBThemeId;
  label: string;
  swatch: string;
  boardColor: string;
  gridColor: string;
  dotColor: string;
  traceColor: string;
}

const PCB_THEMES: Record<PCBThemeId, PCBThemeConfig> = {
  green: {
    id: 'green',
    label: 'Green',
    swatch: '#0b4f32',
    boardColor: '#0b4f32',
    gridColor: '#157a4f',
    dotColor: '#2ea673',
    traceColor: '#d49a45',
  },
  black: {
    id: 'black',
    label: 'Black',
    swatch: '#141821',
    boardColor: '#141821',
    gridColor: '#293244',
    dotColor: '#475569',
    traceColor: '#d9a441',
  },
  blue: {
    id: 'blue',
    label: 'Blue',
    swatch: '#10346b',
    boardColor: '#10346b',
    gridColor: '#1e539e',
    dotColor: '#3b82f6',
    traceColor: '#dfb055',
  },
  white: {
    id: 'white',
    label: 'White',
    swatch: '#e2e8f0',
    boardColor: '#e2e8f0',
    gridColor: '#cbd5e1',
    dotColor: '#94a3b8',
    traceColor: '#c98a2e',
  },
};

interface FlowSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  length: number;
  speed: number;
}

interface BoardBounds {
  cx: number;
  cz: number;
  width: number;
  depth: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

type DeleteTarget = { kind: 'component' | 'wire' | 'probe'; id: string };

function computeBoardBounds(schematic: CircuitSchematic, guidedTarget?: GuidedTargetGhost | null): BoardBounds {
  // Always guarantee a generous fixed minimum FR-4 PCB area (x: 2..24, z: 2..14)
  // so empty Academy boards are immediately welcoming and buildable!
  let minX = 2;
  let maxX = 24;
  let minZ = 2;
  let maxZ = 14;

  const include = (x: number, z: number, pad = 2.6) => {
    if (x - pad < minX) minX = x - pad;
    if (x + pad > maxX) maxX = x + pad;
    if (z - pad < minZ) minZ = z - pad;
    if (z + pad > maxZ) maxZ = z + pad;
  };

  for (const c of schematic.components) {
    include(c.x, c.y);
    for (const pin of COMPONENT_PINS[c.type]) {
      const wp = getPinWorldPos(c, pin);
      include(wp.x, wp.y);
    }
  }
  for (const w of schematic.wires) {
    include(w.x1, w.y1);
    include(w.x2, w.y2);
  }
  for (const p of schematic.probes) {
    include(p.x, p.y);
  }
  if (guidedTarget) {
    if (guidedTarget.x !== undefined && guidedTarget.y !== undefined) {
      include(guidedTarget.x, guidedTarget.y);
    }
    if (guidedTarget.wires) {
      for (const w of guidedTarget.wires) {
        include(w.x1, w.y1);
        include(w.x2, w.y2);
      }
    }
  }

  const width = Math.max(22, maxX - minX);
  const depth = Math.max(12, maxZ - minZ);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  return { cx, cz, width, depth, minX, maxX, minZ, maxZ };
}

/**
 * Converts a procedurally built 3D component group into a translucent glowing hologram ghost
 * for Cities: Skylines-style placement preview or tutorial guidance.
 */
function buildGhostComponentMesh(
  type: ComponentType,
  x: number,
  z: number,
  rotation: Rotation,
  colorHex: string,
  opacity: number
): THREE.Group {
  const dummyComp: CircuitComponent = {
    id: '__ghost__',
    name: type.toUpperCase(),
    type,
    x,
    y: z,
    rotation,
    params: getDefaultParams(type),
  };
  const ghostGroup = createComponent3DMesh(dummyComp, {
    liveCurrent: 0,
    livePower: 0,
    isSelected: false,
    thermalMode: false,
  });

  const ghostMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity,
    roughness: 0.25,
    metalness: 0.15,
    depthWrite: false,
  });

  // Dispose original materials/textures on the ghost and replace with shared translucent hologram material
  const toRemove: THREE.Object3D[] = [];
  ghostGroup.traverse((obj) => {
    if (obj instanceof THREE.PointLight) {
      toRemove.push(obj);
      return;
    }
    if (obj instanceof THREE.Mesh) {
      const oldMats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of oldMats) {
        if (!m) continue;
        const anyM = m as unknown as Record<string, unknown>;
        for (const k of ['map', 'emissiveMap']) {
          const tex = anyM[k];
          if (tex instanceof THREE.Texture) tex.dispose();
        }
        m.dispose();
      }
      obj.material = ghostMat.clone();
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });
  for (const r of toRemove) {
    r.parent?.remove(r);
  }

  return ghostGroup;
}

/**
 * Builds orthogonal L-shaped wire segments between start and end (horizontal first, then vertical).
 */
function buildOrthogonalSegments(
  start: Point,
  end: Point
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  if (start.x === end.x && start.y === end.y) return segs;

  if (start.x !== end.x && start.y !== end.y) {
    segs.push({ x1: start.x, y1: start.y, x2: end.x, y2: start.y });
    segs.push({ x1: end.x, y1: start.y, x2: end.x, y2: end.y });
  } else {
    segs.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
  }
  return segs;
}

export const Circuit3DView: React.FC<Circuit3DViewProps> = ({
  schematic,
  netlist,
  dcOpResult,
  selectedComponentId,
  onSelectComponent,
  toolMode = 'select',
  placingType = 'resistor',
  placingRotation = 0,
  guidedTarget = null,
  onMoveComponent,
  onAddWireSegments,
  onPlaceComponent,
  onPlaceProbe,
  onDeleteTarget,
  onRotatePlacing,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Interactive HUD controls
  const [pcbTheme, setPcbTheme] = useState<PCBThemeId>('green');
  const [thermalMode, setThermalMode] = useState(false);
  const [showCurrentFlow, setShowCurrentFlow] = useState(true);
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [wireStartState, setWireStartState] = useState<Point | null>(null);

  // Three.js persistent refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const circuitGroupRef = useRef<THREE.Group | null>(null);
  const guidedGroupRef = useRef<THREE.Group | null>(null);
  const previewGroupRef = useRef<THREE.Group | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);

  // Animated current-flow particle refs
  const flowMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const flowSegmentsRef = useRef<FlowSegment[]>([]);
  const showFlowRef = useRef(showCurrentFlow);
  const autoOrbitRef = useRef(autoOrbit);
  const boundsRef = useRef<BoardBounds>(computeBoardBounds(schematic, guidedTarget));
  const lastPresetIdRef = useRef<string | null>(null);

  // Live editing refs (so pointer listeners always see latest props without tearing down WebGL)
  const toolModeRef = useRef(toolMode);
  const placingTypeRef = useRef(placingType);
  const placingRotationRef = useRef(placingRotation);
  const hoverGridRef = useRef<Point | null>(null);
  const wireStartRef = useRef<Point | null>(null);
  const deleteHoverRef = useRef<{ target: DeleteTarget; pos: THREE.Vector3 } | null>(null);

  // Callback refs
  const onSelectRef = useRef(onSelectComponent);
  const onMoveCompRef = useRef(onMoveComponent);
  const onAddWireRef = useRef(onAddWireSegments);
  const onPlaceCompRef = useRef(onPlaceComponent);
  const onPlaceProbeRef = useRef(onPlaceProbe);
  const onDeleteTargetRef = useRef(onDeleteTarget);
  const onRotatePlacingRef = useRef(onRotatePlacing);

  useEffect(() => {
    showFlowRef.current = showCurrentFlow;
    if (flowMeshRef.current) {
      flowMeshRef.current.visible = showCurrentFlow && flowSegmentsRef.current.length > 0;
    }
  }, [showCurrentFlow]);

  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoOrbit;
    }
  }, [autoOrbit]);

  useEffect(() => {
    onSelectRef.current = onSelectComponent;
    onMoveCompRef.current = onMoveComponent;
    onAddWireRef.current = onAddWireSegments;
    onPlaceCompRef.current = onPlaceComponent;
    onPlaceProbeRef.current = onPlaceProbe;
    onDeleteTargetRef.current = onDeleteTarget;
    onRotatePlacingRef.current = onRotatePlacing;
  }, [
    onSelectComponent,
    onMoveComponent,
    onAddWireSegments,
    onPlaceComponent,
    onPlaceProbe,
    onDeleteTarget,
    onRotatePlacing,
  ]);

  // Rebuild only the lightweight previewGroup (60fps mouse hover, never rebuilds PCB!)
  const rebuildPreview = useCallback(() => {
    const previewGroup = previewGroupRef.current;
    if (!previewGroup) return;

    disposeObject3D(previewGroup);
    previewGroup.clear();

    const mode = toolModeRef.current;
    const grid = hoverGridRef.current;

    if (mode === 'place' && grid) {
      const pType = placingTypeRef.current;
      const pRot = placingRotationRef.current;

      // Glowing translucent cyan 3D ghost of the component being placed
      const ghost = buildGhostComponentMesh(pType, grid.x, grid.y, pRot, '#22d3ee', 0.56);
      previewGroup.add(ghost);

      // Gold pin-landing rings on the PCB surface
      const pinRingGeom = new THREE.RingGeometry(0.18, 0.32, 24);
      const pinRingMat = new THREE.MeshBasicMaterial({
        color: '#fbbf24',
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      });
      const dummyComp = { x: grid.x, y: grid.y, rotation: pRot };
      for (const pin of COMPONENT_PINS[pType]) {
        const wp = getPinWorldPos(dummyComp, pin);
        const ring = new THREE.Mesh(pinRingGeom, pinRingMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(wp.x, 0.055, wp.y);
        previewGroup.add(ring);
      }

      // Subtle base footprint halo
      const baseRing = new THREE.Mesh(
        new THREE.RingGeometry(1.15, 1.32, 32),
        new THREE.MeshBasicMaterial({
          color: '#22d3ee',
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
        })
      );
      baseRing.rotation.x = -Math.PI / 2;
      baseRing.position.set(grid.x, 0.048, grid.y);
      previewGroup.add(baseRing);
    } else if (mode === 'wire') {
      const wStart = wireStartRef.current;

      if (grid) {
        // Glowing cyan cursor ring snapped to (gx, gz)
        const cursorRing = new THREE.Mesh(
          new THREE.RingGeometry(0.18, 0.34, 24),
          new THREE.MeshBasicMaterial({
            color: '#22d3ee',
            transparent: true,
            opacity: 0.92,
            side: THREE.DoubleSide,
          })
        );
        cursorRing.rotation.x = -Math.PI / 2;
        cursorRing.position.set(grid.x, 0.06, grid.y);
        previewGroup.add(cursorRing);
      }

      if (wStart) {
        // Anchor dot at wireStart
        const startDot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.24, 0.06, 18),
          new THREE.MeshBasicMaterial({ color: '#34d399' })
        );
        startDot.position.set(wStart.x, 0.06, wStart.y);
        previewGroup.add(startDot);

        if (grid) {
          const segs = buildOrthogonalSegments(wStart, grid);
          const tracePreviewMat = new THREE.MeshStandardMaterial({
            color: '#22d3ee',
            emissive: '#22d3ee',
            emissiveIntensity: 1.4,
            transparent: true,
            opacity: 0.85,
            roughness: 0.2,
          });
          for (const seg of segs) {
            const dx = seg.x2 - seg.x1;
            const dz = seg.y2 - seg.y1;
            const len = Math.hypot(dx, dz);
            if (len < 1e-4) continue;
            const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.045, 0.2), tracePreviewMat);
            bar.position.set((seg.x1 + seg.x2) / 2, 0.06, (seg.y1 + seg.y2) / 2);
            bar.rotation.y = -Math.atan2(dz, dx);
            previewGroup.add(bar);
          }
          // Elbow corner joint
          if (segs.length === 2) {
            const elbow = new THREE.Mesh(
              new THREE.CylinderGeometry(0.14, 0.14, 0.05, 14),
              tracePreviewMat
            );
            elbow.position.set(grid.x, 0.06, wStart.y);
            previewGroup.add(elbow);
          }
        }
      }
    } else if (mode === 'probe' && grid) {
      // Glowing amber probe preview pin
      const amberMat = new THREE.MeshStandardMaterial({
        color: '#fbbf24',
        emissive: '#f59e0b',
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.78,
      });
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 10), amberMat);
      stem.position.set(grid.x, 1.1, grid.y);
      previewGroup.add(stem);

      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), amberMat);
      tip.position.set(grid.x, 2.24, grid.y);
      previewGroup.add(tip);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.22, 0.4, 24),
        new THREE.MeshBasicMaterial({
          color: '#fbbf24',
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(grid.x, 0.055, grid.y);
      previewGroup.add(ring);
    } else if (mode === 'delete' && deleteHoverRef.current) {
      const { pos, target } = deleteHoverRef.current;
      const r = target.kind === 'component' ? 1.55 : 0.65;
      const delRing = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.18, r, 32),
        new THREE.MeshBasicMaterial({
          color: '#fb7185',
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
        })
      );
      delRing.rotation.x = -Math.PI / 2;
      delRing.position.set(pos.x, 0.065, pos.z);
      previewGroup.add(delRing);
    }
  }, []);

  // Sync editing mode props to refs & refresh preview immediately
  useEffect(() => {
    toolModeRef.current = toolMode;
    placingTypeRef.current = placingType;
    placingRotationRef.current = placingRotation;
    if (toolMode !== 'wire') {
      wireStartRef.current = null;
      setWireStartState(null);
    }
    if (toolMode !== 'delete') {
      deleteHoverRef.current = null;
    }
    rebuildPreview();
  }, [toolMode, placingType, placingRotation, rebuildPreview]);

  // Helper to position camera cleanly around current PCB bounds (default: Cities: Skylines 'top3d')
  const applyCameraPreset = useCallback((preset: CameraPreset, bounds?: BoardBounds) => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    const b = bounds ?? boundsRef.current;
    const span = Math.max(b.width, b.depth);
    const dist = Math.max(15, span * 1.05);

    ctrl.target.set(b.cx, 0, b.cz);
    if (preset === 'top3d') {
      // Elevated Cities: Skylines bird's-eye 3D build angle
      cam.position.set(b.cx, span * 1.18, b.cz + span * 0.42);
    } else if (preset === 'iso') {
      cam.position.set(b.cx + dist * 0.62, dist * 0.68, b.cz + dist * 0.72);
    } else if (preset === 'top') {
      cam.position.set(b.cx, dist * 1.18, b.cz + 0.01);
    } else {
      // Low bench inspection angle
      cam.position.set(b.cx + dist * 0.2, dist * 0.34, b.cz + dist * 0.96);
    }
    cam.lookAt(b.cx, 0, b.cz);
    ctrl.update();
  }, []);

  // Initialize Three.js WebGLRenderer, Scene, Studio Lighting, OrbitControls & Interactive Raycasting once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070b12');
    scene.fog = new THREE.Fog('#070b12', 55, 130);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 220);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = 4;
    controls.maxDistance = 95;
    controls.autoRotate = autoOrbitRef.current;
    controls.autoRotateSpeed = 1.15;
    controlsRef.current = controls;

    // Studio Lighting Rig
    const hemi = new THREE.HemisphereLight('#e2e8f0', '#0f172a', 0.88);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#fff8eb', 1.65);
    keyLight.position.set(14, 26, 16);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 90;
    keyLight.shadow.camera.left = -24;
    keyLight.shadow.camera.right = 24;
    keyLight.shadow.camera.top = 24;
    keyLight.shadow.camera.bottom = -24;
    scene.add(keyLight);
    scene.add(keyLight.target);
    keyLightRef.current = keyLight;

    // Cool cyan rim light for metallic highlights
    const rimLight = new THREE.DirectionalLight('#38bdf8', 0.72);
    rimLight.position.set(-18, 12, -16);
    scene.add(rimLight);

    // Subtle workbench floor plane underneath the PCB standoffs
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#090e18',
      roughness: 0.88,
      metalness: 0.12,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.58;
    floor.receiveShadow = true;
    scene.add(floor);

    // 3 Separate Scene Groups for 60fps leak-free updates
    const circuitGroup = new THREE.Group();
    circuitGroup.name = 'circuit-root';
    scene.add(circuitGroup);
    circuitGroupRef.current = circuitGroup;

    const guidedGroup = new THREE.Group();
    guidedGroup.name = 'guided-target-root';
    scene.add(guidedGroup);
    guidedGroupRef.current = guidedGroup;

    const previewGroup = new THREE.Group();
    previewGroup.name = 'interactive-preview-root';
    scene.add(previewGroup);
    previewGroupRef.current = previewGroup;

    // Raycasting helpers for Y = 0 PCB plane & interactive object picking
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pcbPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const planeHit = new THREE.Vector3();

    const setPointerNDC = (clientX: number, clientY: number): boolean => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      return true;
    };

    const raycastGridPoint = (clientX: number, clientY: number): Point | null => {
      if (!setPointerNDC(clientX, clientY)) return null;
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(pcbPlane, planeHit)) {
        return { x: Math.round(planeHit.x), y: Math.round(planeHit.z) };
      }
      return null;
    };

    const raycastTarget = (
      clientX: number,
      clientY: number
    ): { target: DeleteTarget; pos: THREE.Vector3 } | null => {
      if (!setPointerNDC(clientX, clientY)) return null;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(circuitGroup.children, true);
      for (const hit of hits) {
        const ud = hit.object.userData;
        if (typeof ud?.componentId === 'string') {
          return {
            target: { kind: 'component', id: ud.componentId },
            pos: hit.point.clone(),
          };
        }
        if (typeof ud?.probeId === 'string') {
          return {
            target: { kind: 'probe', id: ud.probeId },
            pos: hit.point.clone(),
          };
        }
        if (typeof ud?.wireId === 'string') {
          return {
            target: { kind: 'wire', id: ud.wireId },
            pos: hit.point.clone(),
          };
        }
      }
      return null;
    };

    // Pointer interaction state (click vs orbit drag vs 3D component grid-drag)
    let downX = 0;
    let downY = 0;
    let downButton = -1;
    let dragComp: {
      id: string;
      moved: boolean;
      lastGx: number;
      lastGz: number;
    } | null = null;

    const onContextMenu = (e: MouseEvent) => {
      if (toolModeRef.current === 'place' || toolModeRef.current === 'wire') {
        e.preventDefault();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downButton = e.button;

      if (e.button === 0 && toolModeRef.current === 'select' && onMoveCompRef.current) {
        const hit = raycastTarget(e.clientX, e.clientY);
        if (hit && hit.target.kind === 'component') {
          const gp = raycastGridPoint(e.clientX, e.clientY);
          if (gp) {
            dragComp = {
              id: hit.target.id,
              moved: false,
              lastGx: gp.x,
              lastGz: gp.y,
            };
            controls.enabled = false;
          }
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const mode = toolModeRef.current;

      // Active 3D component drag in select mode
      if (dragComp) {
        const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (dist > 4) {
          dragComp.moved = true;
        }
        if (dragComp.moved) {
          const gp = raycastGridPoint(e.clientX, e.clientY);
          if (gp && (gp.x !== dragComp.lastGx || gp.y !== dragComp.lastGz)) {
            dragComp.lastGx = gp.x;
            dragComp.lastGz = gp.y;
            onMoveCompRef.current?.(dragComp.id, gp.x, gp.y);
          }
        }
        return;
      }

      if (mode === 'place' || mode === 'wire' || mode === 'probe') {
        const gp = raycastGridPoint(e.clientX, e.clientY);
        const prev = hoverGridRef.current;
        if (gp && (!prev || prev.x !== gp.x || prev.y !== gp.y)) {
          hoverGridRef.current = gp;
          rebuildPreview();
        }
      } else if (mode === 'delete') {
        const hit = raycastTarget(e.clientX, e.clientY);
        const prev = deleteHoverRef.current;
        if (
          hit?.target.id !== prev?.target.id ||
          hit?.target.kind !== prev?.target.kind
        ) {
          deleteHoverRef.current = hit;
          rebuildPreview();
        }
      }
    };

    const onPointerLeave = () => {
      hoverGridRef.current = null;
      deleteHoverRef.current = null;
      if (dragComp) {
        dragComp = null;
        controls.enabled = true;
      }
      rebuildPreview();
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);

      if (dragComp) {
        const finished = dragComp;
        dragComp = null;
        controls.enabled = true;
        if (!finished.moved && dist <= 5) {
          onSelectRef.current(finished.id);
        }
        return;
      }

      if (dist > 5) return; // User orbited or panned with OrbitControls

      const mode = toolModeRef.current;

      // Right-click shortcuts: rotate in place mode, cancel in wire mode
      if (downButton === 2) {
        if (mode === 'place') {
          onRotatePlacingRef.current?.();
        } else if (mode === 'wire' && wireStartRef.current) {
          wireStartRef.current = null;
          setWireStartState(null);
          rebuildPreview();
        }
        return;
      }

      if (downButton !== 0) return;

      if (mode === 'place') {
        const gp = raycastGridPoint(e.clientX, e.clientY);
        if (gp) {
          onPlaceCompRef.current?.(
            placingTypeRef.current,
            gp.x,
            gp.y,
            placingRotationRef.current
          );
        }
        return;
      }

      if (mode === 'wire') {
        const gp = raycastGridPoint(e.clientX, e.clientY);
        if (!gp) return;
        if (!wireStartRef.current) {
          wireStartRef.current = gp;
          setWireStartState(gp);
          rebuildPreview();
        } else {
          const segs = buildOrthogonalSegments(wireStartRef.current, gp);
          if (segs.length > 0) {
            onAddWireRef.current?.(segs);
          }
          wireStartRef.current = null;
          setWireStartState(null);
          rebuildPreview();
        }
        return;
      }

      if (mode === 'probe') {
        const gp = raycastGridPoint(e.clientX, e.clientY);
        if (gp) {
          onPlaceProbeRef.current?.(gp.x, gp.y);
        }
        return;
      }

      if (mode === 'delete') {
        const hit = raycastTarget(e.clientX, e.clientY);
        if (hit) {
          onDeleteTargetRef.current?.(hit.target);
          deleteHoverRef.current = null;
          rebuildPreview();
        }
        return;
      }

      // Default 'select' mode: pick component or deselect
      const hit = raycastTarget(e.clientX, e.clientY);
      if (hit && hit.target.kind === 'component') {
        onSelectRef.current(hit.target.id);
      } else {
        onSelectRef.current(null);
      }
    };

    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // ResizeObserver for seamless split-pane & window resizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(1, Math.floor(entry.contentRect.width));
        const h = Math.max(1, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      }
    });
    resizeObserver.observe(container);

    // Keyboard navigation state (WASD + Arrow Keys + Q/E elevation + Esc cancels wire)
    const pressedKeys = new Set<string>();
    const isEditableElement = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      return (el as HTMLElement).isContentEditable === true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableElement(document.activeElement) || isEditableElement(e.target as Element | null)) {
        return;
      }
      if (e.key === 'Escape' && wireStartRef.current) {
        wireStartRef.current = null;
        setWireStartState(null);
        rebuildPreview();
        return;
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (
        key === 'ArrowUp' ||
        key === 'ArrowDown' ||
        key === 'ArrowLeft' ||
        key === 'ArrowRight'
      ) {
        e.preventDefault();
        pressedKeys.add(key);
      } else if (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === 'q' || key === 'e') {
        pressedKeys.add(key);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pressedKeys.delete(key);
    };

    const onWindowBlur = () => {
      pressedKeys.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);

    // Animation loop: WASD/Arrow 3D navigation + holographic tutorial pulse + current-flow particles
    const clock = new THREE.Clock();
    const dummy = new THREE.Object3D();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const moveVec = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);
    let elapsed = 0;
    let rafId = 0;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;

      // Smooth dt-scaled horizontal XZ glide + Q/E elevation
      if (pressedKeys.size > 0) {
        const fwdInput =
          (pressedKeys.has('w') || pressedKeys.has('ArrowUp') ? 1 : 0) -
          (pressedKeys.has('s') || pressedKeys.has('ArrowDown') ? 1 : 0);
        const strafeInput =
          (pressedKeys.has('d') || pressedKeys.has('ArrowRight') ? 1 : 0) -
          (pressedKeys.has('a') || pressedKeys.has('ArrowLeft') ? 1 : 0);
        const elevInput = (pressedKeys.has('e') ? 1 : 0) - (pressedKeys.has('q') ? 1 : 0);

        const distToTarget = camera.position.distanceTo(controls.target);
        const panSpeed = Math.max(6.5, Math.min(28, distToTarget * 0.72));

        if (fwdInput !== 0 || strafeInput !== 0) {
          camera.getWorldDirection(forward);
          forward.y = 0;
          if (forward.lengthSq() > 1e-6) {
            forward.normalize();
          } else {
            forward.set(0, 1, 0).applyQuaternion(camera.quaternion);
            forward.y = 0;
            if (forward.lengthSq() > 1e-6) {
              forward.normalize();
            } else {
              forward.set(0, 0, -1);
            }
          }
          right.crossVectors(forward, upAxis).normalize();

          moveVec.set(0, 0, 0);
          if (fwdInput !== 0) moveVec.addScaledVector(forward, fwdInput);
          if (strafeInput !== 0) moveVec.addScaledVector(right, strafeInput);
          if (moveVec.lengthSq() > 1e-6) {
            moveVec.normalize().multiplyScalar(panSpeed * dt);
            camera.position.add(moveVec);
            controls.target.add(moveVec);
          }
        }

        if (elevInput !== 0) {
          const elevSpeed = Math.max(4.5, Math.min(18, distToTarget * 0.48));
          const requestedDy = elevInput * elevSpeed * dt;
          const clampedCamY = Math.max(1.0, Math.min(60, camera.position.y + requestedDy));
          const actualDy = clampedCamY - camera.position.y;
          camera.position.y = clampedCamY;
          controls.target.y = Math.max(0.0, controls.target.y + actualDy);
        }
      }

      // Animate pulsing holographic tutorial target (zero allocations per frame)
      const gGroup = guidedGroupRef.current;
      if (gGroup && gGroup.children.length > 0) {
        const pulse01 = 0.5 + 0.5 * Math.sin(elapsed * 4.2);
        gGroup.traverse((obj) => {
          if (obj.userData?.pulseRing) {
            const s = 0.92 + pulse01 * 0.18;
            obj.scale.set(s, s, 1);
            if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshBasicMaterial) {
              obj.material.opacity = 0.45 + pulse01 * 0.5;
            }
          } else if (obj.userData?.pulseMesh && obj instanceof THREE.Mesh) {
            const mat = obj.material;
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.opacity = 0.32 + pulse01 * 0.36;
              mat.emissiveIntensity = 0.7 + pulse01 * 0.9;
            }
          }
        });
      }

      controls.update();

      // Animate live current-flow particles
      const flowMesh = flowMeshRef.current;
      const segs = flowSegmentsRef.current;
      if (flowMesh && showFlowRef.current && segs.length > 0) {
        const beadsPerSeg = 2;
        let idx = 0;
        const maxCount = flowMesh.count;
        for (let s = 0; s < segs.length && idx < maxCount; s++) {
          const seg = segs[s];
          const spacing = Math.max(1, Math.floor(seg.length / 2.2));
          const countForSeg = Math.min(beadsPerSeg, spacing);
          for (let b = 0; b < countForSeg && idx < maxCount; b++) {
            const phase = (elapsed * seg.speed + b / countForSeg + s * 0.17) % 1;
            const x = seg.x1 + (seg.x2 - seg.x1) * phase;
            const z = seg.z1 + (seg.z2 - seg.z1) * phase;
            const pulse = 0.85 + 0.25 * Math.sin(elapsed * 6 + idx);
            dummy.position.set(x, 0.068, z);
            dummy.scale.setScalar(pulse);
            dummy.updateMatrix();
            flowMesh.setMatrixAt(idx, dummy.matrix);
            idx++;
          }
        }
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        for (; idx < maxCount; idx++) {
          flowMesh.setMatrixAt(idx, dummy.matrix);
        }
        flowMesh.instanceMatrix.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();

      if (circuitGroupRef.current) disposeObject3D(circuitGroupRef.current);
      if (guidedGroupRef.current) disposeObject3D(guidedGroupRef.current);
      if (previewGroupRef.current) disposeObject3D(previewGroupRef.current);
      floor.geometry.dispose();
      floorMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      circuitGroupRef.current = null;
      guidedGroupRef.current = null;
      previewGroupRef.current = null;
      flowMeshRef.current = null;
    };
  }, [rebuildPreview]);

  // Rebuild Holographic Tutorial Target (`guidedTarget`) independently from the PCB
  useEffect(() => {
    const guidedGroup = guidedGroupRef.current;
    if (!guidedGroup) return;

    disposeObject3D(guidedGroup);
    guidedGroup.clear();

    if (!guidedTarget) return;

    if (
      guidedTarget.kind === 'component' &&
      guidedTarget.componentType &&
      guidedTarget.x !== undefined &&
      guidedTarget.y !== undefined
    ) {
      const gx = guidedTarget.x;
      const gz = guidedTarget.y;
      const rot = guidedTarget.rotation ?? 0;

      // Pulsing emerald holographic 3D ghost component
      const ghost = buildGhostComponentMesh(guidedTarget.componentType, gx, gz, rot, '#34d399', 0.48);
      ghost.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.userData.pulseMesh = true;
        }
      });
      guidedGroup.add(ghost);

      // Pulsing beacon ring on PCB underneath
      const beaconRing = new THREE.Mesh(
        new THREE.RingGeometry(1.35, 1.62, 36),
        new THREE.MeshBasicMaterial({
          color: '#34d399',
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        })
      );
      beaconRing.rotation.x = -Math.PI / 2;
      beaconRing.position.set(gx, 0.052, gz);
      beaconRing.userData.pulseRing = true;
      guidedGroup.add(beaconRing);

      // Pin landing dots
      const pinGeom = new THREE.RingGeometry(0.16, 0.3, 20);
      const pinMat = new THREE.MeshBasicMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      });
      for (const pin of COMPONENT_PINS[guidedTarget.componentType]) {
        const wp = getPinWorldPos({ x: gx, y: gz, rotation: rot }, pin);
        const pr = new THREE.Mesh(pinGeom, pinMat);
        pr.rotation.x = -Math.PI / 2;
        pr.position.set(wp.x, 0.056, wp.y);
        guidedGroup.add(pr);
      }

      // Optional floating target label badge
      if (guidedTarget.label) {
        const tex = createLabelTexture([guidedTarget.label], {
          width: 300,
          height: 72,
          bg: '#064e3b',
          fg: '#6ee7b7',
          border: '#34d399',
          fontSize: 30,
        });
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
        );
        sprite.position.set(gx, 2.35, gz);
        sprite.scale.set(2.8, 0.68, 1);
        sprite.renderOrder = 12;
        guidedGroup.add(sprite);
      }
    } else if (guidedTarget.kind === 'wire' && guidedTarget.wires) {
      const guideMat = new THREE.MeshStandardMaterial({
        color: '#34d399',
        emissive: '#10b981',
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.55,
        roughness: 0.25,
        depthWrite: false,
      });
      const endRingGeom = new THREE.RingGeometry(0.16, 0.32, 20);

      for (const w of guidedTarget.wires) {
        const dx = w.x2 - w.x1;
        const dz = w.y2 - w.y1;
        const len = Math.hypot(dx, dz);
        if (len < 1e-4) continue;

        const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.22), guideMat.clone());
        bar.position.set((w.x1 + w.x2) / 2, 0.055, (w.y1 + w.y2) / 2);
        bar.rotation.y = -Math.atan2(dz, dx);
        bar.userData.pulseMesh = true;
        guidedGroup.add(bar);

        for (const [ex, ez] of [
          [w.x1, w.y1],
          [w.x2, w.y2],
        ]) {
          const r = new THREE.Mesh(
            endRingGeom,
            new THREE.MeshBasicMaterial({
              color: '#34d399',
              transparent: true,
              opacity: 0.85,
              side: THREE.DoubleSide,
            })
          );
          r.rotation.x = -Math.PI / 2;
          r.position.set(ex, 0.058, ez);
          r.userData.pulseRing = true;
          guidedGroup.add(r);
        }
      }
    } else if (
      guidedTarget.kind === 'probe' &&
      guidedTarget.x !== undefined &&
      guidedTarget.y !== undefined
    ) {
      const px = guidedTarget.x;
      const pz = guidedTarget.y;

      const amberMat = new THREE.MeshStandardMaterial({
        color: '#fbbf24',
        emissive: '#f59e0b',
        emissiveIntensity: 1.3,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.3, 12), amberMat);
      stem.position.set(px, 1.15, pz);
      stem.userData.pulseMesh = true;
      guidedGroup.add(stem);

      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), amberMat.clone());
      tip.position.set(px, 2.32, pz);
      tip.userData.pulseMesh = true;
      guidedGroup.add(tip);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.32, 0.55, 28),
        new THREE.MeshBasicMaterial({
          color: '#fbbf24',
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(px, 0.055, pz);
      ring.userData.pulseRing = true;
      guidedGroup.add(ring);
    }
  }, [guidedTarget]);

  // Rebuild 3D PCB, copper traces, gold vias, components, current particles & probes when schematic changes
  useEffect(() => {
    const circuitGroup = circuitGroupRef.current;
    if (!circuitGroup) return;

    disposeObject3D(circuitGroup);
    circuitGroup.clear();
    flowMeshRef.current = null;
    flowSegmentsRef.current = [];

    const bounds = computeBoardBounds(schematic, guidedTarget);
    boundsRef.current = bounds;

    // Keep shadow camera tightly fitted around the PCB
    if (keyLightRef.current) {
      const halfSpan = Math.max(bounds.width, bounds.depth) * 0.72;
      keyLightRef.current.position.set(bounds.cx + halfSpan * 0.8, 24, bounds.cz + halfSpan * 0.85);
      keyLightRef.current.target.position.set(bounds.cx, 0, bounds.cz);
      keyLightRef.current.shadow.camera.left = -halfSpan;
      keyLightRef.current.shadow.camera.right = halfSpan;
      keyLightRef.current.shadow.camera.top = halfSpan;
      keyLightRef.current.shadow.camera.bottom = -halfSpan;
      keyLightRef.current.shadow.camera.updateProjectionMatrix();
    }

    // Auto-frame camera in default Cities: Skylines Top-3D bird's-eye angle on initial load / preset switch
    if (lastPresetIdRef.current !== schematic.id) {
      lastPresetIdRef.current = schematic.id;
      applyCameraPreset('top3d', bounds);
    }

    const theme = PCB_THEMES[pcbTheme];

    /* 1. FR-4 PCB Substrate + Corner Brass Standoffs + Silkscreen Grid + Pin-Grid Dots */
    const boardThickness = 0.22;
    const boardMat = new THREE.MeshStandardMaterial({
      color: thermalMode ? '#090f2e' : theme.boardColor,
      roughness: pcbTheme === 'black' ? 0.55 : 0.36,
      metalness: 0.12,
    });
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(bounds.width, boardThickness, bounds.depth),
      boardMat
    );
    board.position.set(bounds.cx, -boardThickness / 2, bounds.cz);
    board.receiveShadow = true;
    board.castShadow = true;
    circuitGroup.add(board);

    const edgeLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(bounds.width + 0.01, boardThickness + 0.005, bounds.depth + 0.01)
      ),
      new THREE.LineBasicMaterial({
        color: thermalMode ? '#1e3a8a' : theme.gridColor,
        transparent: true,
        opacity: 0.6,
      })
    );
    edgeLines.position.copy(board.position);
    circuitGroup.add(edgeLines);

    // Crisp 1-unit silkscreen grid lines
    const gridVerts: number[] = [];
    const gxStart = Math.ceil(bounds.minX + 0.5);
    const gxEnd = Math.floor(bounds.maxX - 0.5);
    const gzStart = Math.ceil(bounds.minZ + 0.5);
    const gzEnd = Math.floor(bounds.maxZ - 0.5);
    for (let gx = gxStart; gx <= gxEnd; gx++) {
      gridVerts.push(gx, 0.004, bounds.minZ + 0.4, gx, 0.004, bounds.maxZ - 0.4);
    }
    for (let gz = gzStart; gz <= gzEnd; gz++) {
      gridVerts.push(bounds.minX + 0.4, 0.004, gz, bounds.maxX - 0.4, 0.004, gz);
    }
    if (gridVerts.length > 0) {
      const gridGeom = new THREE.BufferGeometry();
      gridGeom.setAttribute('position', new THREE.Float32BufferAttribute(gridVerts, 3));
      const gridMat = new THREE.LineBasicMaterial({
        color: thermalMode ? '#1e293b' : theme.gridColor,
        transparent: true,
        opacity: pcbTheme === 'white' ? 0.55 : 0.34,
      });
      circuitGroup.add(new THREE.LineSegments(gridGeom, gridMat));
    }

    // Subtle instanced pin-grid snap dots at integer (x, z) intersections
    const dotCountX = Math.max(0, gxEnd - gxStart + 1);
    const dotCountZ = Math.max(0, gzEnd - gzStart + 1);
    const totalDots = dotCountX * dotCountZ;
    if (totalDots > 0 && totalDots <= 2500) {
      const dotGeom = new THREE.CircleGeometry(0.055, 8);
      dotGeom.rotateX(-Math.PI / 2);
      const dotMat = new THREE.MeshBasicMaterial({
        color: thermalMode ? '#334155' : theme.dotColor,
        transparent: true,
        opacity: pcbTheme === 'white' ? 0.55 : 0.38,
      });
      const dotInst = new THREE.InstancedMesh(dotGeom, dotMat, totalDots);
      const dm = new THREE.Object3D();
      let di = 0;
      for (let gx = gxStart; gx <= gxEnd; gx++) {
        for (let gz = gzStart; gz <= gzEnd; gz++) {
          dm.position.set(gx, 0.006, gz);
          dm.updateMatrix();
          dotInst.setMatrixAt(di++, dm.matrix);
        }
      }
      dotInst.instanceMatrix.needsUpdate = true;
      circuitGroup.add(dotInst);
    }

    // Corner brass mounting standoffs & holes
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#eab308',
      metalness: 0.88,
      roughness: 0.22,
    });
    const holeMat = new THREE.MeshStandardMaterial({ color: '#070b12', roughness: 0.9 });
    const inset = 0.85;
    const corners: [number, number][] = [
      [bounds.minX + inset, bounds.minZ + inset],
      [bounds.maxX - inset, bounds.minZ + inset],
      [bounds.minX + inset, bounds.maxZ - inset],
      [bounds.maxX - inset, bounds.maxZ - inset],
    ];
    for (const [cx, cz] of corners) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 20), brassMat);
      ring.position.set(cx, 0.01, cz);
      circuitGroup.add(ring);

      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.24, 16), holeMat);
      hole.position.set(cx, -0.1, cz);
      circuitGroup.add(hole);

      const standoff = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.36, 6), brassMat);
      standoff.position.set(cx, -0.4, cz);
      standoff.castShadow = true;
      circuitGroup.add(standoff);
    }

    /* 2. Raised 3D Copper PCB Traces (tagged with wireId for 3D deletion) & Gold Solder Pads */
    const traceMat = new THREE.MeshStandardMaterial({
      color: thermalMode ? '#334155' : theme.traceColor,
      metalness: 0.85,
      roughness: 0.26,
    });
    const viaPadMat = new THREE.MeshStandardMaterial({
      color: '#eab308',
      metalness: 0.9,
      roughness: 0.2,
    });

    const viaPoints = new Map<string, { x: number; z: number }>();
    const addViaPoint = (x: number, z: number) => {
      const key = pointKey(x, z);
      if (!viaPoints.has(key)) {
        viaPoints.set(key, { x, z });
      }
    };

    const totalPower = dcOpResult
      ? Object.values(dcOpResult.componentPower).reduce((acc, p) => acc + Math.abs(p), 0)
      : 0;
    const maxNodeV = dcOpResult
      ? Math.max(0, ...Object.values(dcOpResult.nodeVoltages).map((v) => Math.abs(v)))
      : 0;
    const energized = Boolean(dcOpResult?.converged && (totalPower > 1e-7 || maxNodeV > 0.05));

    const segments: FlowSegment[] = [];

    for (const w of schematic.wires) {
      addViaPoint(w.x1, w.y1);
      addViaPoint(w.x2, w.y2);

      const dx = w.x2 - w.x1;
      const dz = w.y2 - w.y1;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;

      const trace = new THREE.Mesh(new THREE.BoxGeometry(len, 0.036, 0.18), traceMat);
      trace.position.set((w.x1 + w.x2) / 2, 0.025, (w.y1 + w.y2) / 2);
      trace.rotation.y = -Math.atan2(dz, dx);
      trace.receiveShadow = true;
      trace.userData.wireId = w.id;
      circuitGroup.add(trace);

      if (energized) {
        const nodeId = netlist?.pointToNode[pointKey(w.x1, w.y1)];
        const nodeV = nodeId !== undefined ? Math.abs(dcOpResult?.nodeVoltages[nodeId] ?? 0) : 0;
        const speed = (0.42 + Math.min(1.1, nodeV * 0.08 + totalPower * 2.5)) / Math.max(1.2, len * 0.45);
        segments.push({ x1: w.x1, z1: w.y1, x2: w.x2, z2: w.y2, length: len, speed });
      }
    }

    for (const comp of schematic.components) {
      for (const pin of COMPONENT_PINS[comp.type]) {
        const wp = getPinWorldPos(comp, pin);
        addViaPoint(wp.x, wp.y);
      }
    }
    for (const prb of schematic.probes) {
      addViaPoint(prb.x, prb.y);
    }

    const viaGeom = new THREE.CylinderGeometry(0.21, 0.23, 0.036, 16);
    const drillGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12);
    for (const pt of viaPoints.values()) {
      const pad = new THREE.Mesh(viaGeom, viaPadMat);
      pad.position.set(pt.x, 0.02, pt.z);
      pad.receiveShadow = true;
      circuitGroup.add(pad);

      const drill = new THREE.Mesh(drillGeom, holeMat);
      drill.position.set(pt.x, 0.022, pt.z);
      circuitGroup.add(drill);
    }

    /* 3. Live Animated Current-Flow Beads (InstancedMesh) */
    if (segments.length > 0) {
      const totalInstances = segments.length * 2;
      const beadGeom = new THREE.SphereGeometry(0.085, 10, 10);
      const beadMat = new THREE.MeshBasicMaterial({
        color: thermalMode ? '#fbbf24' : '#22d3ee',
      });
      const instanced = new THREE.InstancedMesh(beadGeom, beadMat, totalInstances);
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instanced.visible = showFlowRef.current;
      circuitGroup.add(instanced);
      flowMeshRef.current = instanced;
      flowSegmentsRef.current = segments;
    }

    /* 4. Procedural PBR 3D Electronic Components */
    for (const comp of schematic.components) {
      const liveCurrent = dcOpResult?.branchCurrents[comp.name] ?? 0;
      const livePower = dcOpResult?.componentPower[comp.name] ?? 0;
      const compMesh = createComponent3DMesh(comp, {
        liveCurrent,
        livePower,
        isSelected: comp.id === selectedComponentId,
        thermalMode,
      });
      circuitGroup.add(compMesh);
    }

    /* 5. 3D Probe Flags with Live DC Voltage Badges (tagged with probeId for 3D deletion) */
    for (const probe of schematic.probes) {
      const probeGroup = new THREE.Group();
      probeGroup.position.set(probe.x, 0, probe.y);

      const stemMat = new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        metalness: 0.9,
        roughness: 0.2,
      });
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.25, 10), stemMat);
      stem.position.y = 1.12;
      stem.userData.probeId = probe.id;
      probeGroup.add(stem);

      const tipMat = new THREE.MeshStandardMaterial({
        color: probe.color,
        emissive: probe.color,
        emissiveIntensity: 1.5,
        roughness: 0.2,
      });
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 14), tipMat);
      tip.position.y = 2.26;
      tip.userData.probeId = probe.id;
      probeGroup.add(tip);

      const v = dcOpResult?.probeVoltages[probe.label];
      const vStr = v !== undefined && Number.isFinite(v) ? formatSI(v, 'V', 2) : '— V';
      const badgeTex = createLabelTexture([`${probe.label}: ${vStr}`], {
        width: 320,
        height: 76,
        bg: '#0b1220',
        fg: probe.color,
        border: probe.color,
        fontSize: 32,
      });
      const spriteMat = new THREE.SpriteMaterial({
        map: badgeTex,
        transparent: true,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, 2.82, 0);
      sprite.scale.set(2.8, 0.68, 1);
      sprite.renderOrder = 10;
      sprite.userData.probeId = probe.id;
      probeGroup.add(sprite);

      circuitGroup.add(probeGroup);
    }
  }, [schematic, netlist, dcOpResult, selectedComponentId, pcbTheme, thermalMode, guidedTarget, applyCameraPreset]);

  // Cursor style reflects active 3D build mode
  const canvasCursor =
    toolMode === 'place' || toolMode === 'wire' || toolMode === 'probe'
      ? 'crosshair'
      : toolMode === 'delete'
      ? 'pointer'
      : 'grab';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#070b12',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Three.js WebGL Mount */}
      <div ref={containerRef} style={{ width: '100%', height: '100%', cursor: canvasCursor }} />

      {/* Top-Left Floating HUD: Camera Presets & Orbit Controls */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 8px',
          borderRadius: 9,
          background: 'rgba(10, 15, 26, 0.88)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(148, 163, 184, 0.32)',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            color: '#22d3ee',
            padding: '0 4px',
            letterSpacing: '0.04em',
          }}
        >
          <Eye size={13} />
          3D LAB
        </span>

        <HudDivider />

        <HudButton label="Top-3D" onClick={() => applyCameraPreset('top3d')} />
        <HudButton label="Iso" onClick={() => applyCameraPreset('iso')} />
        <HudButton label="Top" onClick={() => applyCameraPreset('top')} />
        <HudButton label="Bench" onClick={() => applyCameraPreset('bench')} />

        <HudDivider />

        <HudButton
          label="Orbit"
          active={autoOrbit}
          accent="#22d3ee"
          onClick={() => setAutoOrbit((v) => !v)}
          icon={<Orbit size={12} />}
        />

        <HudButton
          label="Reset"
          onClick={() => {
            setAutoOrbit(false);
            applyCameraPreset('top3d');
          }}
          icon={<RotateCcw size={12} />}
        />
      </div>

      {/* Top-Right Floating HUD: PCB Theme + Thermal Cam + Current Flow */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 8px',
          borderRadius: 9,
          background: 'rgba(10, 15, 26, 0.88)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(148, 163, 184, 0.32)',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
        }}
      >
        {/* PCB Soldermask Theme Swatches */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {(Object.values(PCB_THEMES) as PCBThemeConfig[]).map((t) => {
            const active = pcbTheme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setPcbTheme(t.id)}
                title={`PCB Theme: ${t.label}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: active ? 700 : 600,
                  fontFamily: 'var(--font-mono)',
                  color: active ? '#ffffff' : '#cbd5e1',
                  background: active ? 'rgba(34, 211, 238, 0.24)' : 'rgba(30, 41, 59, 0.5)',
                  border: `1px solid ${active ? 'rgba(34, 211, 238, 0.75)' : 'rgba(148, 163, 184, 0.22)'}`,
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: t.swatch,
                    border: '1px solid rgba(255,255,255,0.6)',
                    display: 'inline-block',
                  }}
                />
                {t.label}
              </button>
            );
          })}
        </div>

        <HudDivider />

        <HudButton
          label="Thermal Cam"
          active={thermalMode}
          accent="#fb923c"
          onClick={() => setThermalMode((v) => !v)}
          icon={<Flame size={12} />}
        />

        <HudButton
          label="Current Flow"
          active={showCurrentFlow}
          accent="#34d399"
          onClick={() => setShowCurrentFlow((v) => !v)}
          icon={<Activity size={12} />}
        />
      </div>

      {/* Bottom-Left Stack: FLIR Thermal Legend (optional) + Navigation Controls Glass Badge */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 6,
          pointerEvents: 'none',
        }}
      >
        {thermalMode && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 11px',
              borderRadius: 7,
              background: 'rgba(10, 15, 26, 0.9)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(251, 146, 60, 0.55)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: '#f8fafc',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
            }}
          >
            <span style={{ color: '#fb923c', fontWeight: 700 }}>FLIR POWER</span>
            <span style={{ color: '#cbd5e1' }}>0 mW</span>
            <div
              style={{
                width: 96,
                height: 8,
                borderRadius: 4,
                background:
                  'linear-gradient(90deg, #0c1445 0%, #4c1d95 25%, #be185d 50%, #ea580c 75%, #facc15 92%, #fef9c3 100%)',
              }}
            />
            <span style={{ color: '#fef08a', fontWeight: 600 }}>100+ mW</span>
          </div>
        )}

        <div
          style={{
            padding: '5px 11px',
            borderRadius: 8,
            background: 'rgba(10, 15, 26, 0.86)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(34, 211, 238, 0.35)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 600,
            color: '#e2e8f0',
            letterSpacing: '0.01em',
          }}
        >
          WASD / ↑↓←→ Gezin • Sürükle: Döndür • Tekerlek: Yaklaş
        </div>
      </div>

      {/* Bottom-Right Active 3D Build Tool Indicator */}
      {toolMode !== 'select' && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            padding: '5px 11px',
            borderRadius: 8,
            background: 'rgba(10, 15, 26, 0.9)',
            backdropFilter: 'blur(10px)',
            border: `1px solid ${
              toolMode === 'delete'
                ? 'rgba(251, 113, 133, 0.65)'
                : toolMode === 'probe'
                ? 'rgba(251, 191, 36, 0.65)'
                : 'rgba(52, 211, 153, 0.65)'
            }`,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            color:
              toolMode === 'delete'
                ? '#fda4af'
                : toolMode === 'probe'
                ? '#fde047'
                : '#6ee7b7',
            pointerEvents: 'none',
          }}
        >
          {toolMode === 'place' &&
            `YERLEŞTİR: ${placingType.toUpperCase()} (${placingRotation}°) · Sol Tık: Koy · R / Sağ Tık: Döndür`}
          {toolMode === 'wire' &&
            (wireStartState
              ? `KABLO: (${wireStartState.x}, ${wireStartState.y}) → Bitişe tıkla · Sağ Tık / Esc: İptal`
              : 'KABLO: Başlangıç pinine tıkla')}
          {toolMode === 'probe' && 'PROB: Ölçüm noktasına tıkla'}
          {toolMode === 'delete' && 'SİL: Parça, kablo veya proba tıkla'}
        </div>
      )}
    </div>
  );
};

const HudDivider: React.FC = () => (
  <div style={{ width: 1, height: 18, background: 'rgba(148, 163, 184, 0.32)' }} />
);

const HudButton: React.FC<{
  label: string;
  active?: boolean;
  accent?: string;
  icon?: React.ReactNode;
  onClick: () => void;
}> = ({ label, active = false, accent = '#22d3ee', icon, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 10px',
      borderRadius: 6,
      fontSize: 11.5,
      fontWeight: active ? 700 : 600,
      fontFamily: 'var(--font-mono)',
      color: active ? '#ffffff' : '#e2e8f0',
      background: active ? `${accent}33` : 'rgba(30, 41, 59, 0.72)',
      border: `1px solid ${active ? accent : 'rgba(148, 163, 184, 0.3)'}`,
      boxShadow: active ? `0 0 10px ${accent}44` : 'none',
      cursor: 'pointer',
      transition: 'all 0.12s ease',
    }}
  >
    {icon}
    {label}
  </button>
);
