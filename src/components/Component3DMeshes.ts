import * as THREE from 'three';
import { CircuitComponent, COMPONENT_PINS, ComponentType } from '../types/circuit';
import { formatSICompact, getComponentPrimaryLabel } from '../utils/format';

export interface Component3DOptions {
  liveCurrent?: number; // Amps
  livePower?: number;   // Watts
  isSelected?: boolean;
  thermalMode?: boolean;
}

/* --------------------- EIA 4-Band Resistor Color Codes --------------------- */

const EIA_DIGIT_COLORS: Record<number, string> = {
  0: '#18181b', // Black
  1: '#78350f', // Brown
  2: '#dc2626', // Red
  3: '#f97316', // Orange
  4: '#eab308', // Yellow
  5: '#16a34a', // Green
  6: '#2563eb', // Blue
  7: '#7c3aed', // Violet
  8: '#71717a', // Gray
  9: '#f8fafc', // White
};

const EIA_MULT_COLORS: Record<number, string> = {
  ...EIA_DIGIT_COLORS,
  [-1]: '#d4af37', // Gold (x0.1)
  [-2]: '#cbd5e1', // Silver (x0.01)
};

export function getResistorBands(ohms: number): [string, string, string, string] {
  const safe = Math.max(0.01, Number.isFinite(ohms) ? ohms : 1000);
  const exp = Math.floor(Math.log10(safe));
  const scaled = Math.round(safe / Math.pow(10, exp - 1));

  let d1 = Math.floor(scaled / 10);
  let d2 = scaled % 10;
  let mult = exp - 1;

  if (d1 >= 10) {
    d1 = 1;
    d2 = 0;
    mult += 1;
  }

  d1 = Math.max(0, Math.min(9, d1));
  d2 = Math.max(0, Math.min(9, d2));
  const clampedMult = Math.max(-2, Math.min(9, mult));

  return [
    EIA_DIGIT_COLORS[d1] ?? '#78350f',
    EIA_DIGIT_COLORS[d2] ?? '#18181b',
    EIA_MULT_COLORS[clampedMult] ?? '#dc2626',
    '#d4af37', // 5% Gold tolerance band
  ];
}

/* --------------------- FLIR Ironbow Thermal Palette --------------------- */

const FLIR_STOPS: { t: number; color: THREE.Color }[] = [
  { t: 0.0, color: new THREE.Color('#0c1445') },  // Deep cold navy
  { t: 0.22, color: new THREE.Color('#4c1d95') }, // Indigo / purple
  { t: 0.45, color: new THREE.Color('#be185d') }, // Hot magenta
  { t: 0.7, color: new THREE.Color('#ea580c') },  // Bright orange
  { t: 0.9, color: new THREE.Color('#facc15') },  // Yellow
  { t: 1.0, color: new THREE.Color('#fef9c3') },  // Incandescent white-yellow
];

export function powerToFLIRColor(watts: number): THREE.Color {
  const mW = Math.max(0, Math.abs(watts) * 1000);
  // Log-compressed mapping: 0mW -> 0, ~10mW -> 0.5, >= 100mW -> 1.0
  const t = Math.min(1, Math.log10(1 + mW * 0.99) / Math.log10(100));
  for (let i = 0; i < FLIR_STOPS.length - 1; i++) {
    const a = FLIR_STOPS[i];
    const b = FLIR_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return a.color.clone().lerp(b.color, f);
    }
  }
  return FLIR_STOPS[FLIR_STOPS.length - 1].color.clone();
}

/* --------------------- Crisp CanvasTexture Silkscreen Helper --------------------- */

export function createLabelTexture(
  lines: string[],
  options?: {
    width?: number;
    height?: number;
    bg?: string;
    fg?: string;
    accent?: string;
    border?: string;
    fontSize?: number;
  }
): THREE.CanvasTexture {
  const width = options?.width ?? 256;
  const height = options?.height ?? 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    if (options?.bg && options.bg !== 'transparent') {
      ctx.fillStyle = options.bg;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    if (options?.border) {
      ctx.strokeStyle = options.border;
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, width - 8, height - 8);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const baseSize = options?.fontSize ?? (lines.length === 1 ? 42 : 30);
    const totalH = lines.length * (baseSize * 1.18);
    const startY = (height - totalH) / 2 + baseSize * 0.58;

    lines.forEach((line, idx) => {
      const isSecond = idx > 0;
      const size = isSecond ? Math.round(baseSize * 0.78) : baseSize;
      ctx.font = `700 ${size}px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace`;
      ctx.fillStyle = isSecond && options?.accent ? options.accent : options?.fg ?? '#f1f5f9';
      ctx.fillText(line, width / 2, startY + idx * baseSize * 1.18, width - 16);
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/* --------------------- Geometry & Lead Helpers --------------------- */

function createCylinderBetween(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  radialSegments = 10
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  const geom = new THREE.CylinderGeometry(radius, radius, Math.max(len, 0.001), radialSegments);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
  if (len > 1e-5) {
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addBentLead(
  group: THREE.Group,
  bodyExit: THREE.Vector3,
  pinX: number,
  pinZ: number,
  material: THREE.Material,
  radius = 0.055
): void {
  const elbow = new THREE.Vector3(pinX, bodyExit.y, pinZ);
  const pcbPad = new THREE.Vector3(pinX, -0.04, pinZ);

  if (bodyExit.distanceTo(elbow) > 0.01) {
    group.add(createCylinderBetween(bodyExit, elbow, radius, material, 8));
    const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.05, 8, 8), material);
    joint.position.copy(elbow);
    group.add(joint);
  }
  group.add(createCylinderBetween(elbow, pcbPad, radius, material, 8));
}

function addAngledLead(
  group: THREE.Group,
  start: THREE.Vector3,
  pinX: number,
  pinZ: number,
  material: THREE.Material,
  radius = 0.048,
  kneeY = 0.28
): void {
  const knee = new THREE.Vector3(pinX, kneeY, pinZ);
  const pcbPad = new THREE.Vector3(pinX, -0.04, pinZ);
  group.add(createCylinderBetween(start, knee, radius, material, 8));
  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.05, 8, 8), material);
  joint.position.copy(knee);
  group.add(joint);
  group.add(createCylinderBetween(knee, pcbPad, radius, material, 8));
}

function makeLeadMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#d4dce6',
    metalness: 0.9,
    roughness: 0.22,
  });
}

function makeBrassMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#eab308',
    metalness: 0.88,
    roughness: 0.24,
  });
}

function makeDarkEpoxyMaterial(color = '#181c24'): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.08,
    roughness: 0.48,
  });
}

/* --------------------- Individual 25 Component Builders --------------------- */

function buildResistor(group: THREE.Group, comp: CircuitComponent): void {
  const leadMat = makeLeadMaterial();
  const bodyY = 0.48;
  const tanMat = new THREE.MeshStandardMaterial({
    color: '#d6b68a',
    metalness: 0.05,
    roughness: 0.45,
  });

  // Central ceramic barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.5, 20), tanMat);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0, bodyY, 0);
  barrel.castShadow = true;
  barrel.receiveShadow = true;
  group.add(barrel);

  // Classic bulbous ceramic end-caps
  for (const sx of [-0.72, 0.72]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), tanMat);
    cap.scale.set(0.85, 1.0, 1.0);
    cap.position.set(sx, bodyY, 0);
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);
  }

  // Dynamic EIA 4-band color code rings
  const bands = getResistorBands(comp.params.resistance ?? 1000);
  const bandPositions = [-0.46, -0.18, 0.1, 0.46];
  bands.forEach((hex, idx) => {
    const isGoldOrSilver = hex === '#d4af37' || hex === '#cbd5e1';
    const bandMat = new THREE.MeshStandardMaterial({
      color: hex,
      metalness: isGoldOrSilver ? 0.8 : 0.08,
      roughness: isGoldOrSilver ? 0.28 : 0.38,
    });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.292, 0.292, 0.14, 20), bandMat);
    ring.rotation.z = Math.PI / 2;
    ring.position.set(bandPositions[idx], bodyY, 0);
    group.add(ring);
  });

  addBentLead(group, new THREE.Vector3(-0.95, bodyY, 0), -2, 0, leadMat);
  addBentLead(group, new THREE.Vector3(0.95, bodyY, 0), 2, 0, leadMat);
}

function buildPotentiometer(group: THREE.Group, comp: CircuitComponent): void {
  const leadMat = makeLeadMaterial();
  const blueBodyMat = new THREE.MeshStandardMaterial({
    color: '#1d4ed8',
    metalness: 0.1,
    roughness: 0.35,
  });

  // Classic Bourns square blue trimmer body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.05, 1.55), blueBodyMat);
  body.position.set(0, 0.56, -0.15);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Brass/silver recessed rotary knob driven by wiperPos (0..1 -> -135°..+135°)
  const wiper = Math.max(0, Math.min(1, comp.params.wiperPos ?? 0.5));
  const knobAngleRad = ((-135 + wiper * 270) * Math.PI) / 180;

  const knobGroup = new THREE.Group();
  knobGroup.position.set(0, 1.12, -0.15);
  knobGroup.rotation.y = -knobAngleRad;

  const dialMat = new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    metalness: 0.72,
    roughness: 0.25,
  });
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.55, 0.18, 24), dialMat);
  dial.castShadow = true;
  knobGroup.add(dial);

  // Brass indicator slot + pointer arrow
  const brassMat = makeBrassMaterial();
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.21, 0.84), brassMat);
  slot.position.y = 0.02;
  knobGroup.add(slot);

  const pointer = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.22, 0.22),
    new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#0891b2', emissiveIntensity: 0.5 })
  );
  pointer.position.set(0, 0.03, -0.36);
  knobGroup.add(pointer);

  group.add(knobGroup);

  // Side silkscreen label
  const tex = createLabelTexture([comp.name, formatSICompact(comp.params.resistance ?? 10000, 'Ω')], {
    bg: '#1e40af',
    fg: '#ffffff',
    accent: '#93c5fd',
    fontSize: 34,
  });
  const labelMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 });
  const labelPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), labelMat);
  labelPlane.position.set(0, 0.56, 0.635);
  group.add(labelPlane);

  // Leads to p1(-2,0), p2(2,0), wiper(0,-2)
  addBentLead(group, new THREE.Vector3(-0.85, 0.22, 0), -2, 0, leadMat);
  addBentLead(group, new THREE.Vector3(0.85, 0.22, 0), 2, 0, leadMat);
  addBentLead(group, new THREE.Vector3(0, 0.22, -0.9), 0, -2, leadMat);
}

function buildCapacitor(group: THREE.Group, comp: CircuitComponent): void {
  const leadMat = makeLeadMaterial();
  const cap = comp.params.capacitance ?? 1e-6;

  if (cap >= 1e-6) {
    // Radial aluminum electrolytic can
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: '#172554',
      metalness: 0.22,
      roughness: 0.34,
    });
    const aluMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      metalness: 0.88,
      roughness: 0.22,
    });

    const radius = cap >= 100e-6 ? 0.78 : 0.62;
    const height = cap >= 100e-6 ? 1.85 : 1.48;

    const can = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 28), sleeveMat);
    can.position.set(0, height / 2 + 0.14, 0);
    can.castShadow = true;
    can.receiveShadow = true;
    group.add(can);

    // Brushed silver top cap
    const topCap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.92, radius * 0.94, 0.05, 28), aluMat);
    topCap.position.set(0, height + 0.15, 0);
    group.add(topCap);

    // X-vent score lines on aluminum top
    const ventMat = new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.6, roughness: 0.5 });
    for (const rotY of [Math.PI / 4, -Math.PI / 4]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.35, 0.015, 0.04), ventMat);
      vent.position.set(0, height + 0.175, 0);
      vent.rotation.y = rotY;
      group.add(vent);
    }

    // Light-gray negative polarity stripe toward p2 (+X)
    const stripeMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      metalness: 0.15,
      roughness: 0.4,
    });
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.012, radius + 0.012, height * 0.92, 16, 1, true, Math.PI * 0.35, Math.PI * 0.3),
      stripeMat
    );
    stripe.position.set(0, height / 2 + 0.14, 0);
    group.add(stripe);

    // Rubber base bung
    const bung = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.95, radius * 0.95, 0.12, 20), makeDarkEpoxyMaterial('#111827'));
    bung.position.set(0, 0.08, 0);
    group.add(bung);

    addBentLead(group, new THREE.Vector3(-radius * 0.48, 0.14, 0), -2, 0, leadMat);
    addBentLead(group, new THREE.Vector3(radius * 0.48, 0.14, 0), 2, 0, leadMat);
  } else {
    // Classic glossy orange-amber ceramic disc capacitor
    const discMat = new THREE.MeshStandardMaterial({
      color: '#d97706',
      metalness: 0.06,
      roughness: 0.22,
    });
    const disc = new THREE.Mesh(new THREE.SphereGeometry(0.62, 22, 16), discMat);
    disc.scale.set(1.0, 1.0, 0.36);
    disc.position.set(0, 0.82, 0);
    disc.castShadow = true;
    disc.receiveShadow = true;
    group.add(disc);

    // Ceramic legs coating at base
    for (const sx of [-0.28, 0.28]) {
      const drip = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.24, 10), discMat);
      drip.position.set(sx, 0.32, 0);
      group.add(drip);
    }

    addAngledLead(group, new THREE.Vector3(-0.28, 0.3, 0), -2, 0, leadMat, 0.048, 0.18);
    addAngledLead(group, new THREE.Vector3(0.28, 0.3, 0), 2, 0, leadMat, 0.048, 0.18);
  }
}

function buildInductor(group: THREE.Group, _comp: CircuitComponent): void {
  const leadMat = makeLeadMaterial();
  const ferriteMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    metalness: 0.32,
    roughness: 0.55,
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: '#d97706',
    metalness: 0.86,
    roughness: 0.22,
  });

  // Vertical ferrite spool flanges + core
  const botFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.78, 0.16, 24), ferriteMat);
  botFlange.position.set(0, 0.16, 0);
  botFlange.castShadow = true;
  group.add(botFlange);

  const topFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.14, 24), ferriteMat);
  topFlange.position.set(0, 1.38, 0);
  topFlange.castShadow = true;
  group.add(topFlange);

  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.18, 20), ferriteMat);
  core.position.set(0, 0.77, 0);
  group.add(core);

  // Stacked shiny copper enameled windings
  const turns = 7;
  for (let i = 0; i < turns; i++) {
    const y = 0.31 + (i / (turns - 1)) * 0.92;
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.085, 10, 26), copperMat);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(0, y, 0);
    coil.castShadow = true;
    group.add(coil);
  }

  addBentLead(group, new THREE.Vector3(-0.7, 0.16, 0), -2, 0, leadMat);
  addBentLead(group, new THREE.Vector3(0.7, 0.16, 0), 2, 0, leadMat);
}

function buildTransformer(group: THREE.Group, comp: CircuitComponent): void {
  const leadMat = makeLeadMaterial();
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#64748b',
    metalness: 0.78,
    roughness: 0.32,
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: '#d97706',
    metalness: 0.85,
    roughness: 0.24,
  });
  const bobbinMat = makeDarkEpoxyMaterial('#27272a');

  // Laminated E-I steel core stack
  const coreMain = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.75, 1.9), steelMat);
  coreMain.position.set(0, 0.94, 0);
  coreMain.castShadow = true;
  coreMain.receiveShadow = true;
  group.add(coreMain);

  // Subtle steel lamination grooves
  const grooveMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.6, roughness: 0.5 });
  for (let i = -3; i <= 3; i++) {
    const lam = new THREE.Mesh(new THREE.BoxGeometry(1.52, 1.77, 0.03), grooveMat);
    lam.position.set(0, 0.94, i * 0.24);
    group.add(lam);
  }

  // Primary & Secondary copper coil bobbins protruding left & right
  for (const sx of [-0.95, 0.95]) {
    const winding = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.15, 1.35), copperMat);
    winding.position.set(sx, 0.94, 0);
    winding.castShadow = true;
    group.add(winding);

    for (const fy of [0.34, 1.54]) {
      const flange = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 1.48), bobbinMat);
      flange.position.set(sx, fy, 0);
      group.add(flange);
    }
  }

  // Top label plate
  const tex = createLabelTexture([comp.name, getComponentPrimaryLabel('transformer', comp.params)], {
    bg: '#1e293b',
    fg: '#f8fafc',
    accent: '#34d399',
    fontSize: 32,
  });
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 0.85),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 })
  );
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, 1.83, 0);
  group.add(label);

  // 4 pins: (-2,-1), (-2,1), (2,-1), (2,1)
  addBentLead(group, new THREE.Vector3(-1.1, 0.22, -0.7), -2, -1, leadMat);
  addBentLead(group, new THREE.Vector3(-1.1, 0.22, 0.7), -2, 1, leadMat);
  addBentLead(group, new THREE.Vector3(1.1, 0.22, -0.7), 2, -1, leadMat);
  addBentLead(group, new THREE.Vector3(1.1, 0.22, 0.7), 2, 1, leadMat);
}

function buildFuse(group: THREE.Group, comp: CircuitComponent, liveCurrent: number): void {
  const leadMat = makeLeadMaterial();
  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    metalness: 0.94,
    roughness: 0.14,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#e0f2fe',
    transparent: true,
    opacity: 0.36,
    roughness: 0.08,
    metalness: 0.05,
    clearcoat: 1.0,
    depthWrite: false,
  });

  const bodyY = 0.48;
  const rating = comp.params.fuseRating ?? 1.0;
  const overloaded = Math.abs(liveCurrent) > rating;

  // Transparent glass cylinder
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.65, 22), glassMat);
  glass.rotation.z = Math.PI / 2;
  glass.position.set(0, bodyY, 0);
  group.add(glass);

  // Chrome end-caps
  for (const sx of [-0.92, 0.92]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.42, 20), chromeMat);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(sx, bodyY, 0);
    cap.castShadow = true;
    group.add(cap);
  }

  // Internal silver filament (glows hot red-orange if overloaded)
  const filamentMat = new THREE.MeshStandardMaterial({
    color: overloaded ? '#ef4444' : '#cbd5e1',
    emissive: overloaded ? '#ef4444' : '#000000',
    emissiveIntensity: overloaded ? 3.0 : 0,
    metalness: overloaded ? 0.2 : 0.9,
    roughness: 0.25,
  });
  const filament = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.65, 8), filamentMat);
  filament.rotation.z = Math.PI / 2;
  filament.position.set(0, bodyY, 0);
  group.add(filament);

  if (overloaded) {
    const alertLight = new THREE.PointLight('#ef4444', 1.8, 3.5);
    alertLight.position.set(0, bodyY + 0.15, 0);
    group.add(alertLight);
  }

  addBentLead(group, new THREE.Vector3(-1.12, bodyY, 0), -2, 0, leadMat);
  addBentLead(group, new THREE.Vector3(1.12, bodyY, 0), 2, 0, leadMat);
}

function buildLamp(group: THREE.Group, comp: CircuitComponent, livePower: number): void {
  const leadMat = makeLeadMaterial();
  const brassMat = makeBrassMaterial();
  const rated = Math.max(0.05, comp.params.ratedPower ?? 1.0);
  const glow = Math.max(0, Math.min(1, Math.abs(livePower) / rated));

  // Brass screw base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.42, 0.55, 22), brassMat);
  base.position.set(0, 0.32, 0);
  base.castShadow = true;
  group.add(base);

  // Decorative screw threads
  for (let i = 0; i < 3; i++) {
    const thread = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 8, 22), brassMat);
    thread.rotation.x = Math.PI / 2;
    thread.position.set(0, 0.18 + i * 0.13, 0);
    group.add(thread);
  }

  // Translucent glass bulb dome
  const bulbMat = new THREE.MeshPhysicalMaterial({
    color: glow > 0.05 ? '#fef3c7' : '#e2e8f0',
    emissive: '#f59e0b',
    emissiveIntensity: glow * 1.4,
    transparent: true,
    opacity: 0.42 + glow * 0.25,
    roughness: 0.1,
    clearcoat: 1.0,
    depthWrite: false,
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.68, 24, 18), bulbMat);
  bulb.position.set(0, 1.15, 0);
  group.add(bulb);

  // Internal tungsten filament coil
  const filamentMat = new THREE.MeshStandardMaterial({
    color: glow > 0.02 ? '#fef08a' : '#64748b',
    emissive: '#fbbf24',
    emissiveIntensity: glow * 5.0,
    roughness: 0.3,
  });
  const filament = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 18, Math.PI), filamentMat);
  filament.position.set(0, 1.05, 0);
  group.add(filament);

  // Filament support posts
  for (const sx of [-0.2, 0.2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 8), leadMat);
    post.position.set(sx, 0.78, 0);
    group.add(post);
  }

  // Live warm amber PointLight
  if (glow > 0.03) {
    const light = new THREE.PointLight('#fbbf24', 0.6 + glow * 4.2, 6.5, 1.6);
    light.position.set(0, 1.25, 0);
    group.add(light);
  }

  addBentLead(group, new THREE.Vector3(-0.42, 0.2, 0), -2, 0, leadMat);
  addBentLead(group, new THREE.Vector3(0.42, 0.2, 0), 2, 0, leadMat);
}

function buildAxialDiode(
  group: THREE.Group,
  bodyColor: string,
  bandColor: string,
  options?: { glossy?: boolean; radius?: number; length?: number; bandMetallic?: boolean }
): void {
  const leadMat = makeLeadMaterial();
  const bodyY = 0.44;
  const r = options?.radius ?? 0.25;
  const len = options?.length ?? 1.45;

  const bodyMat = options?.glossy
    ? new THREE.MeshPhysicalMaterial({
        color: bodyColor,
        roughness: 0.15,
        metalness: 0.05,
        clearcoat: 0.9,
      })
    : new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0.1,
        roughness: 0.42,
      });

  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), bodyMat);
  cyl.rotation.z = Math.PI / 2;
  cyl.position.set(0, bodyY, 0);
  cyl.castShadow = true;
  cyl.receiveShadow = true;
  group.add(cyl);

  // Cathode polarity band near +X (cathode = (2, 0))
  const bandMat = new THREE.MeshStandardMaterial({
    color: bandColor,
    metalness: options?.bandMetallic ? 0.85 : 0.15,
    roughness: options?.bandMetallic ? 0.22 : 0.35,
  });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.22, 20), bandMat);
  band.rotation.z = Math.PI / 2;
  band.position.set(len * 0.32, bodyY, 0);
  group.add(band);

  addBentLead(group, new THREE.Vector3(-len / 2, bodyY, 0), -2, 0, leadMat);
  addBentLead(group, new THREE.Vector3(len / 2, bodyY, 0), 2, 0, leadMat);
}

const LED_HEX: Record<string, string> = {
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  amber: '#f59e0b',
  white: '#f8fafc',
};

function buildLED(group: THREE.Group, comp: CircuitComponent, liveCurrent: number): void {
  const leadMat = makeLeadMaterial();
  const hex = LED_HEX[comp.params.ledColor ?? 'red'] ?? '#ef4444';

  // Forward current > 0.3mA illuminates LED brightly
  const iMa = Math.max(0, liveCurrent * 1000);
  const lit = iMa > 0.3;
  const brightness = lit ? Math.min(1, 0.25 + Math.log10(1 + iMa) / Math.log10(25)) : 0;

  const lensMat = new THREE.MeshPhysicalMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: brightness * 2.8,
    transparent: true,
    opacity: lit ? 0.92 : 0.62,
    roughness: 0.12,
    metalness: 0.05,
    clearcoat: 1.0,
  });

  // Base flange rim
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.18, 24), lensMat);
  flange.position.set(0, 0.45, 0);
  flange.castShadow = true;
  group.add(flange);

  // Cylindrical LED body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.68, 24), lensMat);
  body.position.set(0, 0.88, 0);
  body.castShadow = true;
  group.add(body);

  // Hemispherical top dome
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.47, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    lensMat
  );
  dome.position.set(0, 1.22, 0);
  group.add(dome);

  // Internal metallic anvil & reflector cup
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 0.08), leadMat);
  anvil.position.set(0.14, 0.72, 0);
  group.add(anvil);

  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.06), leadMat);
  post.position.set(-0.14, 0.7, 0);
  group.add(post);

  // Real Three.js PointLight casting colored light onto PCB & neighboring components
  if (lit) {
    const pointLight = new THREE.PointLight(hex, 0.8 + brightness * 3.8, 6.0, 1.7);
    pointLight.position.set(0, 1.35, 0);
    group.add(pointLight);
  }

  addAngledLead(group, new THREE.Vector3(-0.22, 0.4, 0), -2, 0, leadMat, 0.048, 0.22);
  addAngledLead(group, new THREE.Vector3(0.22, 0.4, 0), 2, 0, leadMat, 0.048, 0.22);
}

function buildBJT(group: THREE.Group, comp: CircuitComponent): void {
  const leadMat = makeLeadMaterial();
  const epoxyMat = makeDarkEpoxyMaterial('#14171f');
  const isNPN = comp.type === 'bjt_npn';

  // TO-92 D-shaped black epoxy body (half-cylinder + flat front block)
  const halfCyl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.96, 20, 1, false, -Math.PI / 2, Math.PI),
    epoxyMat
  );
  halfCyl.rotation.y = Math.PI / 2;
  halfCyl.position.set(0, 0.95, 0);
  halfCyl.castShadow = true;
  halfCyl.receiveShadow = true;
  group.add(halfCyl);

  const flatFront = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.96, 1.1), epoxyMat);
  flatFront.position.set(-0.13, 0.95, 0);
  flatFront.castShadow = true;
  group.add(flatFront);

  // Subtle color-coded top mark (cyan dot for NPN, rose dot for PNP) + label
  const tex = createLabelTexture([comp.name, isNPN ? 'NPN' : 'PNP'], {
    bg: '#14171f',
    fg: '#e2e8f0',
    accent: isNPN ? '#22d3ee' : '#fb7185',
    fontSize: 38,
  });
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.65),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 })
  );
  label.rotation.y = -Math.PI / 2;
  label.position.set(-0.265, 0.95, 0);
  group.add(label);

  // 3 bent metallic legs landing accurately on pins
  const pins = COMPONENT_PINS[comp.type];
  const starts = [
    new THREE.Vector3(-0.08, 0.48, 0),
    new THREE.Vector3(0.08, 0.48, -0.28),
    new THREE.Vector3(0.08, 0.48, 0.28),
  ];
  pins.forEach((pin, idx) => {
    const st = starts[idx] ?? starts[0];
    addAngledLead(group, st, pin.dx, pin.dy, leadMat, 0.045, 0.24);
  });
}

function buildMOSFET(group: THREE.Group, comp: CircuitComponent): void {
  const leadMat = makeLeadMaterial();
  const epoxyMat = makeDarkEpoxyMaterial('#14171f');
  const aluMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    metalness: 0.88,
    roughness: 0.24,
  });
  const isNMOS = comp.type === 'nmos';

  // TO-220 black epoxy package body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.22, 1.48), epoxyMat);
  body.position.set(0.15, 0.98, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Tall brushed aluminum heatsink tab on the back (+X side)
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.05, 1.48), aluMat);
  tab.position.set(0.5, 1.42, 0);
  tab.castShadow = true;
  tab.receiveShadow = true;
  group.add(tab);

  // Mounting hole illusion (dark recessed cylinder on upper tab)
  const hole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.17, 18),
    new THREE.MeshStandardMaterial({ color: '#0b0f17', roughness: 0.9 })
  );
  hole.rotation.z = Math.PI / 2;
  hole.position.set(0.5, 2.02, 0);
  group.add(hole);

  // Front silkscreen marking
  const tex = createLabelTexture([comp.name, isNMOS ? 'NMOS' : 'PMOS'], {
    bg: '#14171f',
    fg: '#f1f5f9',
    accent: isNMOS ? '#c084fc' : '#f472b6',
    fontSize: 36,
  });
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.32, 0.95),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 })
  );
  label.rotation.y = -Math.PI / 2;
  label.position.set(-0.135, 0.98, 0);
  group.add(label);

  // 3 bent metal legs landing cleanly on gate, drain, source
  const pins = COMPONENT_PINS[comp.type];
  const starts = [
    new THREE.Vector3(0.08, 0.38, 0),
    new THREE.Vector3(0.15, 0.38, -0.42),
    new THREE.Vector3(0.15, 0.38, 0.42),
  ];
  pins.forEach((pin, idx) => {
    const st = starts[idx] ?? starts[0];
    addAngledLead(group, st, pin.dx, pin.dy, leadMat, 0.052, 0.22);
  });
}

function buildOpAmp(group: THREE.Group, comp: CircuitComponent): void {
  const leadMat = makeLeadMaterial();
  const icMat = makeDarkEpoxyMaterial('#171a21');

  // 8-pin DIP black matte IC package
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.56, 1.56), icMat);
  body.position.set(0, 0.44, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Pin-1 semicircle notch on -X edge
  const notch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.58, 16),
    new THREE.MeshStandardMaterial({ color: '#090d14', roughness: 0.8 })
  );
  notch.position.set(-1.18, 0.44, 0);
  group.add(notch);

  // Pin-1 white dot
  const dot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12),
    new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.4 })
  );
  dot.position.set(-0.92, 0.73, -0.5);
  group.add(dot);

  // Top silkscreen CanvasTexture
  const tex = createLabelTexture(['OPA', comp.name], {
    bg: '#171a21',
    fg: '#e2e8f0',
    accent: '#a78bfa',
    fontSize: 38,
  });
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 1.25),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 })
  );
  label.rotation.x = -Math.PI / 2;
  label.position.set(0.05, 0.728, 0);
  group.add(label);

  // 8 classic DIP legs along the two long edges
  for (let i = 0; i < 4; i++) {
    const x = -0.84 + i * 0.56;
    for (const sz of [-0.84, 0.84]) {
      const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.14), leadMat);
      shoulder.position.set(x, 0.36, sz * 0.94);
      group.add(shoulder);

      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.05), leadMat);
      leg.position.set(x, 0.18, sz);
      group.add(leg);
    }
  }

  // Precision leads connecting to the 3 schematic pin coordinates: (-2,-1), (-2,1), (2,0)
  addBentLead(group, new THREE.Vector3(-1.15, 0.18, -0.84), -2, -1, leadMat, 0.048);
  addBentLead(group, new THREE.Vector3(-1.15, 0.18, 0.84), -2, 1, leadMat, 0.048);
  addBentLead(group, new THREE.Vector3(1.15, 0.18, 0), 2, 0, leadMat, 0.048);
}

function buildRelay(group: THREE.Group, comp: CircuitComponent): void {
  const leadMat = makeLeadMaterial();
  const relayMat = new THREE.MeshStandardMaterial({
    color: '#2563eb',
    metalness: 0.08,
    roughness: 0.32,
  });

  // Blue electromechanical PCB relay block
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.48, 1.75), relayMat);
  body.position.set(0, 0.8, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const tex = createLabelTexture([`RELAY ${comp.name}`, `Vth=${comp.params.vThreshold ?? 2.5}V`], {
    bg: '#2563eb',
    fg: '#ffffff',
    accent: '#bfdbfe',
    fontSize: 32,
  });
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(2.35, 1.45),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 })
  );
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, 1.548, 0);
  group.add(label);

  // 4 pins: (-2,-1), (-2,1), (2,-1), (2,1)
  addBentLead(group, new THREE.Vector3(-1.25, 0.16, -0.75), -2, -1, leadMat);
  addBentLead(group, new THREE.Vector3(-1.25, 0.16, 0.75), -2, 1, leadMat);
  addBentLead(group, new THREE.Vector3(1.25, 0.16, -0.75), 2, -1, leadMat);
  addBentLead(group, new THREE.Vector3(1.25, 0.16, 0.75), 2, 1, leadMat);
}

function buildSourceModule(group: THREE.Group, comp: CircuitComponent): void {
  const leadMat = makeLeadMaterial();
  const slateMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    metalness: 0.35,
    roughness: 0.38,
  });

  const accentByType: Record<string, string> = {
    vdc: '#22d3ee',
    vac: '#fbbf24',
    vpulse: '#a78bfa',
    idc: '#34d399',
    iac: '#34d399',
  };
  const accent = accentByType[comp.type] ?? '#22d3ee';

  // Sleek dark-slate lab power/signal terminal housing
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.96, 2.55), slateMat);
  base.position.set(0, 0.5, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Glowing top status LED ring
  const ringMat = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });
  const ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 8, 20), ringMat);
  ledRing.rotation.x = Math.PI / 2;
  ledRing.position.set(0, 0.99, -0.92);
  group.add(ledRing);

  // Crisp OLED-style readout on top face
  const primaryVal = getComponentPrimaryLabel(comp.type, comp.params);
  const tex = createLabelTexture([comp.name, primaryVal], {
    bg: '#090f1a',
    fg: '#f8fafc',
    accent,
    border: accent,
    fontSize: 34,
  });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.42, 1.2),
    new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.35,
      roughness: 0.25,
    })
  );
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(0, 0.988, 0.16);
  group.add(screen);

  // Red (+) binding post at (0, -2) and Black (-) binding post at (0, 2)
  const postConfigs = [
    { z: -2, color: '#dc2626', exitZ: -1.25 },
    { z: 2, color: '#18181b', exitZ: 1.25 },
  ];
  for (const cfg of postConfigs) {
    const postMat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      metalness: 0.25,
      roughness: 0.3,
    });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.56, 18), postMat);
    collar.position.set(0, 0.32, cfg.z);
    collar.castShadow = true;
    group.add(collar);

    const brassTip = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.72, 14), makeBrassMaterial());
    brassTip.position.set(0, 0.34, cfg.z);
    group.add(brassTip);

    // Bus bar connecting module to binding post
    group.add(
      createCylinderBetween(
        new THREE.Vector3(0, 0.26, cfg.exitZ),
        new THREE.Vector3(0, 0.26, cfg.z),
        0.065,
        leadMat,
        10
      )
    );
  }
}

function buildControlledSource(group: THREE.Group, comp: CircuitComponent): void {
  const leadMat = makeLeadMaterial();
  const isVCVS = comp.type === 'vcvs';
  const hexMat = new THREE.MeshStandardMaterial({
    color: '#334155',
    metalness: 0.72,
    roughness: 0.28,
  });

  // Sleek metallic hexagonal/diamond module
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.24, 0.85, 6), hexMat);
  body.position.set(0, 0.48, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const tex = createLabelTexture(
    [isVCVS ? `E ${comp.name}` : `G ${comp.name}`, getComponentPrimaryLabel(comp.type, comp.params)],
    {
      bg: '#0f172a',
      fg: '#fbbf24',
      accent: '#f8fafc',
      border: '#f59e0b',
      fontSize: 34,
    }
  );
  const topLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 1.05),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 })
  );
  topLabel.rotation.x = -Math.PI / 2;
  topLabel.position.set(0, 0.915, 0);
  group.add(topLabel);

  // 4 pins: (-2,-1), (-2,1), (2,-1), (2,1)
  addBentLead(group, new THREE.Vector3(-0.95, 0.2, -0.65), -2, -1, leadMat);
  addBentLead(group, new THREE.Vector3(-0.95, 0.2, 0.65), -2, 1, leadMat);
  addBentLead(group, new THREE.Vector3(0.95, 0.2, -0.65), 2, -1, leadMat);
  addBentLead(group, new THREE.Vector3(0.95, 0.2, 0.65), 2, 1, leadMat);
}

function buildGroundTurret(group: THREE.Group): void {
  const brassMat = makeBrassMaterial();

  // Gold-plated brass PCB ground test turret pin at (0, -1)
  const baseFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.12, 20), brassMat);
  baseFlange.position.set(0, 0.06, -1);
  baseFlange.castShadow = true;
  group.add(baseFlange);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.72, 16), brassMat);
  post.position.set(0, 0.42, -1);
  post.castShadow = true;
  group.add(post);

  const topCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 18), brassMat);
  topCollar.position.set(0, 0.72, -1);
  group.add(topCollar);

  // Ground loop eyelet
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 8, 18), brassMat);
  loop.position.set(0, 0.96, -1);
  group.add(loop);
}

/* --------------------- Main Factory & Disposal --------------------- */

export function createComponent3DMesh(
  comp: CircuitComponent,
  options: Component3DOptions = {}
): THREE.Group {
  const { liveCurrent = 0, livePower = 0, isSelected = false, thermalMode = false } = options;

  const group = new THREE.Group();
  group.name = `comp-${comp.id}`;
  group.userData.componentId = comp.id;

  // Map 2D schematic (x, y) -> 3D PCB plane (X = x, Y = 0, Z = y)
  group.position.set(comp.x, 0, comp.y);
  // Exact sign: 2D CW rotation around screen +Z maps to -rotation around 3D +Y
  group.rotation.y = -(comp.rotation * Math.PI) / 180;

  switch (comp.type as ComponentType) {
    case 'resistor':
      buildResistor(group, comp);
      break;
    case 'potentiometer':
      buildPotentiometer(group, comp);
      break;
    case 'capacitor':
      buildCapacitor(group, comp);
      break;
    case 'inductor':
      buildInductor(group, comp);
      break;
    case 'transformer':
      buildTransformer(group, comp);
      break;
    case 'fuse':
      buildFuse(group, comp, liveCurrent);
      break;
    case 'lamp':
      buildLamp(group, comp, livePower);
      break;
    case 'diode':
      buildAxialDiode(group, '#18181b', '#e2e8f0', { radius: 0.25, length: 1.45, bandMetallic: true });
      break;
    case 'zener':
      buildAxialDiode(group, '#ea580c', '#111827', { glossy: true, radius: 0.22, length: 1.35 });
      break;
    case 'schottky':
      buildAxialDiode(group, '#1e293b', '#eab308', { radius: 0.3, length: 1.55, bandMetallic: true });
      break;
    case 'led':
      buildLED(group, comp, liveCurrent);
      break;
    case 'bjt_npn':
    case 'bjt_pnp':
      buildBJT(group, comp);
      break;
    case 'nmos':
    case 'pmos':
      buildMOSFET(group, comp);
      break;
    case 'opamp':
      buildOpAmp(group, comp);
      break;
    case 'vswitch':
      buildRelay(group, comp);
      break;
    case 'vdc':
    case 'vac':
    case 'vpulse':
    case 'idc':
    case 'iac':
      buildSourceModule(group, comp);
      break;
    case 'vcvs':
    case 'vccs':
      buildControlledSource(group, comp);
      break;
    case 'ground':
      buildGroundTurret(group);
      break;
  }

  // Apply FLIR thermal camera heat tint when thermalMode is active
  if (thermalMode) {
    const flirColor = powerToFLIRColor(livePower);
    const mW = Math.abs(livePower) * 1000;
    const heatIntensity = Math.min(1.6, 0.38 + Math.log10(1 + mW) * 0.48);

    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
            m.color.lerp(flirColor, 0.72);
            m.emissive.copy(flirColor);
            m.emissiveIntensity = heatIntensity;
          }
        });
      }
    });
  }

  // Selection halo ring on the PCB underneath the component
  if (isSelected) {
    const haloRadius = comp.type === 'ground' ? 0.65 : 1.55;
    const haloMat = new THREE.MeshBasicMaterial({
      color: '#22d3ee',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(haloRadius - 0.14, haloRadius, 40),
      haloMat
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(0, 0.038, comp.type === 'ground' ? -1 : 0);
    halo.userData.isHalo = true;
    group.add(halo);
  }

  // Tag all child meshes for O(1) raycast component selection
  group.traverse((obj) => {
    obj.userData.componentId = comp.id;
  });

  return group;
}

/**
 * Recursively disposes geometries, materials, and CanvasTextures inside a Three.js Object3D
 * to guarantee zero WebGL GPU memory leaks across schematic updates and unmount.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        // Dispose any texture maps attached to standard/physical/basic/sprite materials
        const anyMat = mat as unknown as Record<string, unknown>;
        for (const key of ['map', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'alphaMap']) {
          const tex = anyMat[key];
          if (tex instanceof THREE.Texture) {
            tex.dispose();
          }
        }
        mat.dispose();
      }
    } else if (obj instanceof THREE.Sprite) {
      obj.material.map?.dispose();
      obj.material.dispose();
    }
  });
}
