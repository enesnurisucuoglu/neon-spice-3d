import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Flame, Activity, RotateCcw, Orbit, Eye } from 'lucide-react';
import {
  CircuitSchematic,
  CompiledNetlist,
  COMPONENT_PINS,
  DCOPResult,
  getPinWorldPos,
  pointKey,
} from '../types/circuit';
import { formatSI } from '../utils/format';
import {
  createComponent3DMesh,
  createLabelTexture,
  disposeObject3D,
} from './Component3DMeshes';

export type PCBThemeId = 'green' | 'black' | 'blue' | 'white';
export type CameraPreset = 'iso' | 'top' | 'bench';

export interface Circuit3DViewProps {
  schematic: CircuitSchematic;
  netlist: CompiledNetlist | null;
  dcOpResult: DCOPResult | null;
  selectedComponentId: string | null;
  onSelectComponent: (componentId: string | null) => void;
}

interface PCBThemeConfig {
  id: PCBThemeId;
  label: string;
  swatch: string;
  boardColor: string;
  gridColor: string;
  traceColor: string;
}

const PCB_THEMES: Record<PCBThemeId, PCBThemeConfig> = {
  green: {
    id: 'green',
    label: 'Green',
    swatch: '#0b4f32',
    boardColor: '#0b4f32',
    gridColor: '#157a4f',
    traceColor: '#d49a45',
  },
  black: {
    id: 'black',
    label: 'Black',
    swatch: '#141821',
    boardColor: '#141821',
    gridColor: '#293244',
    traceColor: '#d9a441',
  },
  blue: {
    id: 'blue',
    label: 'Blue',
    swatch: '#10346b',
    boardColor: '#10346b',
    gridColor: '#1e539e',
    traceColor: '#dfb055',
  },
  white: {
    id: 'white',
    label: 'White',
    swatch: '#e2e8f0',
    boardColor: '#e2e8f0',
    gridColor: '#cbd5e1',
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

function computeBoardBounds(schematic: CircuitSchematic): BoardBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const include = (x: number, z: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
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

  if (!Number.isFinite(minX)) {
    minX = -6;
    maxX = 6;
    minZ = -4;
    maxZ = 4;
  }

  const margin = 3.2;
  minX -= margin;
  maxX += margin;
  minZ -= margin;
  maxZ += margin;

  const width = Math.max(10, maxX - minX);
  const depth = Math.max(8, maxZ - minZ);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  return { cx, cz, width, depth, minX, maxX, minZ, maxZ };
}

export const Circuit3DView: React.FC<Circuit3DViewProps> = ({
  schematic,
  netlist,
  dcOpResult,
  selectedComponentId,
  onSelectComponent,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Interactive HUD controls
  const [pcbTheme, setPcbTheme] = useState<PCBThemeId>('green');
  const [thermalMode, setThermalMode] = useState(false);
  const [showCurrentFlow, setShowCurrentFlow] = useState(true);
  const [autoOrbit, setAutoOrbit] = useState(false);

  // Three.js persistent refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const circuitGroupRef = useRef<THREE.Group | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);

  // Animated current-flow particle refs
  const flowMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const flowSegmentsRef = useRef<FlowSegment[]>([]);
  const showFlowRef = useRef(showCurrentFlow);
  const autoOrbitRef = useRef(autoOrbit);
  const boundsRef = useRef<BoardBounds>(computeBoardBounds(schematic));
  const lastPresetIdRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelectComponent);

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
  }, [onSelectComponent]);

  // Helper to position camera cleanly around current PCB bounds
  const applyCameraPreset = useCallback((preset: CameraPreset, bounds?: BoardBounds) => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    const b = bounds ?? boundsRef.current;
    const span = Math.max(b.width, b.depth);
    const dist = Math.max(13, span * 1.05);

    ctrl.target.set(b.cx, 0.3, b.cz);
    if (preset === 'iso') {
      cam.position.set(b.cx + dist * 0.62, dist * 0.68, b.cz + dist * 0.72);
    } else if (preset === 'top') {
      cam.position.set(b.cx, dist * 1.18, b.cz + 0.01);
    } else {
      // Low bench inspection angle
      cam.position.set(b.cx + dist * 0.2, dist * 0.34, b.cz + dist * 0.96);
    }
    cam.lookAt(b.cx, 0.3, b.cz);
    ctrl.update();
  }, []);

  // Initialize Three.js WebGLRenderer, Scene, Studio Lighting, OrbitControls & Raycaster once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070b12');
    scene.fog = new THREE.Fog('#070b12', 42, 110);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
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
    controls.maxDistance = 85;
    controls.autoRotate = autoOrbitRef.current;
    controls.autoRotateSpeed = 1.15;
    controlsRef.current = controls;

    // Studio Lighting Rig
    const hemi = new THREE.HemisphereLight('#e2e8f0', '#0f172a', 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#fff8eb', 1.65);
    keyLight.position.set(14, 24, 16);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 80;
    keyLight.shadow.camera.left = -22;
    keyLight.shadow.camera.right = 22;
    keyLight.shadow.camera.top = 22;
    keyLight.shadow.camera.bottom = -22;
    scene.add(keyLight);
    scene.add(keyLight.target);
    keyLightRef.current = keyLight;

    // Cool cyan rim light for metallic highlights
    const rimLight = new THREE.DirectionalLight('#38bdf8', 0.7);
    rimLight.position.set(-18, 12, -16);
    scene.add(rimLight);

    // Subtle workbench floor plane underneath the PCB standoffs
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#090e18',
      roughness: 0.88,
      metalness: 0.12,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.58;
    floor.receiveShadow = true;
    scene.add(floor);

    // Dynamic circuit group
    const circuitGroup = new THREE.Group();
    circuitGroup.name = 'circuit-root';
    scene.add(circuitGroup);
    circuitGroupRef.current = circuitGroup;

    // Raycast click selection (ignores drag gestures)
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dist > 5) return; // User orbited or panned

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(circuitGroup.children, true);

      let foundId: string | null = null;
      for (const hit of hits) {
        const cid = hit.object.userData?.componentId;
        if (typeof cid === 'string') {
          foundId = cid;
          break;
        }
      }
      onSelectRef.current(foundId);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
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

    // Keyboard navigation state (WASD + Arrow Keys + Q/E elevation)
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

    // Animation loop for WASD/Arrow 3D navigation + OrbitControls damping + live current-flow particles
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
            // Fallback when looking straight down in Top view
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

      controls.update();

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
        // Hide unused instances cleanly
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
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();

      if (circuitGroupRef.current) {
        disposeObject3D(circuitGroupRef.current);
      }
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
      flowMeshRef.current = null;
    };
  }, []);

  // Rebuild 3D PCB, copper traces, gold vias, components, current particles & probes when state changes
  useEffect(() => {
    const circuitGroup = circuitGroupRef.current;
    if (!circuitGroup) return;

    // Cleanly dispose previous frame's geometries, materials, and CanvasTextures
    disposeObject3D(circuitGroup);
    circuitGroup.clear();
    flowMeshRef.current = null;
    flowSegmentsRef.current = [];

    const bounds = computeBoardBounds(schematic);
    boundsRef.current = bounds;

    // Keep shadow camera tightly fitted around the PCB
    if (keyLightRef.current) {
      const halfSpan = Math.max(bounds.width, bounds.depth) * 0.72;
      keyLightRef.current.position.set(bounds.cx + halfSpan * 0.8, 22, bounds.cz + halfSpan * 0.85);
      keyLightRef.current.target.position.set(bounds.cx, 0, bounds.cz);
      keyLightRef.current.shadow.camera.left = -halfSpan;
      keyLightRef.current.shadow.camera.right = halfSpan;
      keyLightRef.current.shadow.camera.top = halfSpan;
      keyLightRef.current.shadow.camera.bottom = -halfSpan;
      keyLightRef.current.shadow.camera.updateProjectionMatrix();
    }

    // Auto-frame camera only on initial load or when switching presets
    if (lastPresetIdRef.current !== schematic.id) {
      lastPresetIdRef.current = schematic.id;
      applyCameraPreset('iso', bounds);
    }

    const theme = PCB_THEMES[pcbTheme];

    /* 1. FR-4 PCB Substrate + Corner Brass Standoffs + Silkscreen Grid */
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

    // Subtle FR-4 fiberglass edge trim
    const edgeMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.6,
      metalness: 0.25,
    });
    const edgeLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(bounds.width + 0.01, boardThickness + 0.005, bounds.depth + 0.01)),
      new THREE.LineBasicMaterial({ color: thermalMode ? '#1e3a8a' : theme.gridColor, transparent: true, opacity: 0.55 })
    );
    edgeLines.position.copy(board.position);
    circuitGroup.add(edgeLines);
    edgeMat.dispose();

    // Faint PCB silkscreen grid lines (1-unit grid)
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
        opacity: pcbTheme === 'white' ? 0.5 : 0.28,
      });
      circuitGroup.add(new THREE.LineSegments(gridGeom, gridMat));
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
      // Gold mounting ring on top
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 20), brassMat);
      ring.position.set(cx, 0.01, cz);
      circuitGroup.add(ring);

      // Center drill hole
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.24, 16), holeMat);
      hole.position.set(cx, -0.1, cz);
      circuitGroup.add(hole);

      // Hex brass standoff underneath PCB resting on workbench
      const standoff = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.36, 6), brassMat);
      standoff.position.set(cx, -0.4, cz);
      standoff.castShadow = true;
      circuitGroup.add(standoff);
    }

    /* 2. Raised 3D Copper PCB Traces & Gold Solder Pads */
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

    // Determine if circuit is energized for live current-flow animation
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

      const trace = new THREE.Mesh(new THREE.BoxGeometry(len, 0.032, 0.16), traceMat);
      trace.position.set((w.x1 + w.x2) / 2, 0.025, (w.y1 + w.y2) / 2);
      trace.rotation.y = -Math.atan2(dz, dx);
      trace.receiveShadow = true;
      circuitGroup.add(trace);

      if (energized) {
        // Modulate speed subtly by local net voltage magnitude
        const nodeId = netlist?.pointToNode[pointKey(w.x1, w.y1)];
        const nodeV = nodeId !== undefined ? Math.abs(dcOpResult?.nodeVoltages[nodeId] ?? 0) : 0;
        const speed = (0.42 + Math.min(1.1, nodeV * 0.08 + totalPower * 2.5)) / Math.max(1.2, len * 0.45);
        segments.push({ x1: w.x1, z1: w.y1, x2: w.x2, z2: w.y2, length: len, speed });
      }
    }

    // Add via pads at every component pin & probe position
    for (const comp of schematic.components) {
      for (const pin of COMPONENT_PINS[comp.type]) {
        const wp = getPinWorldPos(comp, pin);
        addViaPoint(wp.x, wp.y);
      }
    }
    for (const prb of schematic.probes) {
      addViaPoint(prb.x, prb.y);
    }

    // Render deduplicated gold-plated via pads with center solder holes
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

    /* 5. 3D Probe Flags with Live DC Voltage Badges */
    for (const probe of schematic.probes) {
      const probeGroup = new THREE.Group();
      probeGroup.position.set(probe.x, 0, probe.y);

      const stemMat = new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        metalness: 0.9,
        roughness: 0.2,
      });
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.25, 10), stemMat);
      stem.position.y = 1.12;
      probeGroup.add(stem);

      const tipMat = new THREE.MeshStandardMaterial({
        color: probe.color,
        emissive: probe.color,
        emissiveIntensity: 1.5,
        roughness: 0.2,
      });
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 14), tipMat);
      tip.position.y = 2.26;
      probeGroup.add(tip);

      // Floating Sprite voltage readout badge
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
      probeGroup.add(sprite);

      circuitGroup.add(probeGroup);
    }
  }, [schematic, netlist, dcOpResult, selectedComponentId, pcbTheme, thermalMode, applyCameraPreset]);

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
      <div ref={containerRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

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
            applyCameraPreset('iso');
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
