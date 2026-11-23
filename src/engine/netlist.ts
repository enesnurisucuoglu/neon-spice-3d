/**
 * Schematic-to-SPICE Netlist Compiler.
 * Uses Disjoint Set Union (Union-Find) on integer grid coordinates with
 * orthogonal wire T-junction detection to extract electrical nets and
 * generate authentic SPICE netlist text.
 */

import {
  COMPONENT_PINS,
  CircuitComponent,
  CircuitSchematic,
  CompiledNetlist,
  CompiledNode,
  Point,
  getPinWorldPos,
  pointKey,
} from '../types/circuit';

class DisjointSet {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  add(key: string): void {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      this.rank.set(key, 0);
    }
  }

  find(key: string): string {
    let root = key;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let curr = key;
    while (curr !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;

    const rankA = this.rank.get(ra) ?? 0;
    const rankB = this.rank.get(rb) ?? 0;
    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }
}

function formatSpiceValue(val: number): string {
  if (!Number.isFinite(val)) return '0';
  if (val === 0) return '0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  const prefixes: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'G'],
    [1e6, 'Meg'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'u'],
    [1e-9, 'n'],
    [1e-12, 'p'],
    [1e-15, 'f'],
  ];
  for (const [factor, suffix] of prefixes) {
    if (abs >= factor * 0.9999) {
      const scaled = abs / factor;
      const num = parseFloat(scaled.toPrecision(4)).toString();
      return `${sign}${num}${suffix}`;
    }
  }
  return val.toExponential(2);
}

function formatNodeName(nodeId: number): string {
  return nodeId === 0 ? '0' : `N${nodeId}`;
}

function formatComponentCard(
  comp: CircuitComponent,
  pins: Record<string, number>
): string | null {
  const n = (pinId: string) => formatNodeName(pins[pinId] ?? 0);
  const p = comp.params;

  switch (comp.type) {
    case 'ground':
      return null;
    case 'resistor':
      return `${comp.name} ${n('p1')} ${n('p2')} ${formatSpiceValue(p.resistance ?? 1000)}`;
    case 'potentiometer': {
      const r = p.resistance ?? 10000;
      const pos = Math.min(Math.max(p.wiperPos ?? 0.5, 0.001), 0.999);
      return `${comp.name}A ${n('p1')} ${n('wiper')} ${formatSpiceValue(r * pos)}\n${comp.name}B ${n('wiper')} ${n('p2')} ${formatSpiceValue(r * (1 - pos))}`;
    }
    case 'capacitor': {
      const icStr = p.ic ? ` IC=${formatSpiceValue(p.ic)}` : '';
      return `${comp.name} ${n('p1')} ${n('p2')} ${formatSpiceValue(p.capacitance ?? 1e-6)}${icStr}`;
    }
    case 'inductor': {
      const icStr = p.ic ? ` IC=${formatSpiceValue(p.ic)}` : '';
      return `${comp.name} ${n('p1')} ${n('p2')} ${formatSpiceValue(p.inductance ?? 10e-3)}${icStr}`;
    }
    case 'transformer': {
      const ratio = p.turnsRatio ?? 0.1;
      return `X${comp.name} ${n('p1')} ${n('p2')} ${n('s1')} ${n('s2')} XFORM ; N=${ratio}`;
    }
    case 'fuse': {
      const rOn = formatSpiceValue(p.rOn ?? 0.05);
      const rating = formatSpiceValue(p.fuseRating ?? 1.0);
      return `R${comp.name} ${n('p1')} ${n('p2')} ${rOn} ; FUSE IMAX=${rating}A`;
    }
    case 'lamp': {
      const r = formatSpiceValue(p.resistance ?? 100);
      const pwr = formatSpiceValue(p.ratedPower ?? 1.0);
      return `R${comp.name} ${n('p1')} ${n('p2')} ${r} ; LAMP PRATED=${pwr}W`;
    }
    case 'vdc': {
      const acStr = p.acMag && p.acMag > 0 ? ` AC ${formatSpiceValue(p.acMag)}` : '';
      return `${comp.name} ${n('pos')} ${n('neg')} DC ${formatSpiceValue(p.voltage ?? 5)}${acStr}`;
    }
    case 'vac': {
      const vdc = formatSpiceValue(p.voltage ?? 0);
      const amp = formatSpiceValue(p.amplitude ?? 5);
      const freq = formatSpiceValue(p.frequency ?? 1000);
      const phase = p.phase ?? 0;
      const acMag = p.acMag ?? 1;
      const acStr = acMag > 0 ? ` AC ${formatSpiceValue(acMag)}` : '';
      return `${comp.name} ${n('pos')} ${n('neg')} SIN(${vdc} ${amp} ${freq} 0 0 ${phase})${acStr}`;
    }
    case 'vpulse': {
      const v1 = formatSpiceValue(p.vLow ?? 0);
      const v2 = formatSpiceValue(p.vHigh ?? 5);
      const td = formatSpiceValue(p.delay ?? 0);
      const tr = formatSpiceValue(p.riseTime ?? 1e-6);
      const tf = formatSpiceValue(p.fallTime ?? 1e-6);
      const pw = formatSpiceValue(p.pulseWidth ?? 0.5e-3);
      const per = formatSpiceValue(p.period ?? 1e-3);
      const acStr = p.acMag && p.acMag > 0 ? ` AC ${formatSpiceValue(p.acMag)}` : '';
      return `${comp.name} ${n('pos')} ${n('neg')} PULSE(${v1} ${v2} ${td} ${tr} ${tf} ${pw} ${per})${acStr}`;
    }
    case 'idc':
      return `${comp.name} ${n('pos')} ${n('neg')} DC ${formatSpiceValue(p.current ?? 1e-3)}`;
    case 'iac': {
      const idc = formatSpiceValue(p.current ?? 0);
      const amp = formatSpiceValue(p.amplitude ?? 1e-3);
      const freq = formatSpiceValue(p.frequency ?? 1000);
      const phase = p.phase ?? 0;
      const acMag = p.acMag ?? 1e-3;
      const acStr = acMag > 0 ? ` AC ${formatSpiceValue(acMag)}` : '';
      return `${comp.name} ${n('pos')} ${n('neg')} SIN(${idc} ${amp} ${freq} 0 0 ${phase})${acStr}`;
    }
    case 'vcvs':
      return `${comp.name} ${n('out_pos')} ${n('out_neg')} ${n('ctrl_pos')} ${n('ctrl_neg')} ${formatSpiceValue(p.gain ?? 2)}`;
    case 'vccs':
      return `${comp.name} ${n('out_pos')} ${n('out_neg')} ${n('ctrl_pos')} ${n('ctrl_neg')} ${formatSpiceValue(p.gm ?? 1e-3)}`;
    case 'diode': {
      const is = (p.is ?? 1e-12).toExponential(1);
      const nf = p.n ?? 1.0;
      return `${comp.name} ${n('anode')} ${n('cathode')} DMOD ; IS=${is} N=${nf}`;
    }
    case 'zener': {
      const is = (p.is ?? 1e-12).toExponential(1);
      const nf = p.n ?? 1.0;
      const bv = p.bv ?? 5.1;
      return `${comp.name} ${n('anode')} ${n('cathode')} DZENER ; IS=${is} N=${nf} BV=${bv}V`;
    }
    case 'schottky': {
      const is = (p.is ?? 1e-6).toExponential(1);
      const nf = p.n ?? 1.05;
      return `${comp.name} ${n('anode')} ${n('cathode')} DSCHOTTKY ; IS=${is} N=${nf}`;
    }
    case 'led': {
      const color = (p.ledColor ?? 'red').toUpperCase();
      return `${comp.name} ${n('anode')} ${n('cathode')} DLED_${color}`;
    }
    case 'bjt_npn': {
      const is = (p.is ?? 1e-14).toExponential(1);
      const bf = p.bf ?? 150;
      const br = p.br ?? 1;
      return `${comp.name} ${n('collector')} ${n('base')} ${n('emitter')} QNPN ; IS=${is} BF=${bf} BR=${br}`;
    }
    case 'bjt_pnp': {
      const is = (p.is ?? 1e-14).toExponential(1);
      const bf = p.bf ?? 120;
      const br = p.br ?? 1;
      return `${comp.name} ${n('collector')} ${n('base')} ${n('emitter')} QPNP ; IS=${is} BF=${bf} BR=${br}`;
    }
    case 'nmos': {
      const vth = p.vth ?? 1.5;
      const kp = formatSpiceValue(p.kp ?? 0.02);
      const lam = p.lambda ?? 0.02;
      return `${comp.name} ${n('drain')} ${n('gate')} ${n('source')} ${n('source')} NMOS ; VTO=${vth} KP=${kp} LAMBDA=${lam}`;
    }
    case 'pmos': {
      const vth = p.vth ?? -1.5;
      const kp = formatSpiceValue(p.kp ?? 0.02);
      const lam = p.lambda ?? 0.02;
      return `${comp.name} ${n('drain')} ${n('gate')} ${n('source')} ${n('source')} PMOS ; VTO=${vth} KP=${kp} LAMBDA=${lam}`;
    }
    case 'opamp': {
      const aol = (p.gain ?? 1e5).toExponential(0);
      const vp = p.vSatPos ?? 15;
      const vn = p.vSatNeg ?? -15;
      return `${comp.name} ${n('in_pos')} ${n('in_neg')} ${n('out')} OPAMP ; AOL=${aol} VSAT=[${vn}V, ${vp}V]`;
    }
    case 'vswitch': {
      const vt = p.vThreshold ?? 2.5;
      const rOn = formatSpiceValue(p.rOn ?? 0.1);
      const rOff = formatSpiceValue(p.rOff ?? 1e7);
      return `${comp.name} ${n('p1')} ${n('p2')} ${n('ctrl_pos')} ${n('ctrl_neg')} SWMOD ; VT=${vt}V RON=${rOn} ROFF=${rOff}`;
    }
  }
}

/**
 * Compile a visual CircuitSchematic into electrical nets and a SPICE netlist.
 */
export function compileNetlist(schematic: CircuitSchematic): CompiledNetlist {
  const dsu = new DisjointSet();
  const warnings: string[] = [];

  // Registry of all unique integer grid points in the schematic
  const allPoints = new Map<string, Point>();
  const registerPoint = (x: number, y: number): string => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const key = pointKey(rx, ry);
    if (!allPoints.has(key)) {
      allPoints.set(key, { x: rx, y: ry });
      dsu.add(key);
    }
    return key;
  };

  // 1. Register all component pin coordinates
  const compPinKeys = new Map<string, Record<string, string>>();
  for (const comp of schematic.components) {
    const pinDefs = COMPONENT_PINS[comp.type];
    const pinMap: Record<string, string> = {};
    for (const pin of pinDefs) {
      const pos = getPinWorldPos(comp, pin);
      pinMap[pin.id] = registerPoint(pos.x, pos.y);
    }
    compPinKeys.set(comp.id, pinMap);
  }

  // 2. Register all wire endpoints and union each wire's two endpoints
  const normalizedWires = schematic.wires.map((w) => {
    const x1 = Math.round(w.x1);
    const y1 = Math.round(w.y1);
    const x2 = Math.round(w.x2);
    const y2 = Math.round(w.y2);
    const k1 = registerPoint(x1, y1);
    const k2 = registerPoint(x2, y2);
    dsu.union(k1, k2);
    return { x1, y1, x2, y2, k1, k2 };
  });

  // 3. Register all probe coordinates
  const probeKeys: { label: string; key: string }[] = [];
  for (const probe of schematic.probes) {
    const key = registerPoint(probe.x, probe.y);
    probeKeys.push({ label: probe.label, key });
  }

  // 4. Orthogonal wire T-junction & collinear overlap detection:
  // If any pin, probe, or wire endpoint lies along a horizontal or vertical wire segment,
  // union that point with the wire's endpoints.
  for (const [pKey, pt] of allPoints.entries()) {
    for (const w of normalizedWires) {
      if (w.y1 === w.y2 && pt.y === w.y1) {
        const minX = Math.min(w.x1, w.x2);
        const maxX = Math.max(w.x1, w.x2);
        if (pt.x >= minX && pt.x <= maxX) {
          dsu.union(pKey, w.k1);
        }
      } else if (w.x1 === w.x2 && pt.x === w.x1) {
        const minY = Math.min(w.y1, w.y2);
        const maxY = Math.max(w.y1, w.y2);
        if (pt.y >= minY && pt.y <= maxY) {
          dsu.union(pKey, w.k1);
        }
      }
    }
  }

  // 5. Identify Ground (Node 0) equivalence class
  const groundKeys: string[] = [];
  for (const comp of schematic.components) {
    if (comp.type === 'ground') {
      const pinMap = compPinKeys.get(comp.id);
      if (pinMap && pinMap.gnd) {
        groundKeys.push(pinMap.gnd);
      }
    }
  }

  let groundRoot: string | null = null;
  if (groundKeys.length > 0) {
    for (let i = 1; i < groundKeys.length; i++) {
      dsu.union(groundKeys[0], groundKeys[i]);
    }
    groundRoot = dsu.find(groundKeys[0]);
  } else {
    // Fallback: reference first voltage source negative terminal (or first node) to GND
    const firstVSource = schematic.components.find(
      (c) => c.type === 'vdc' || c.type === 'vac' || c.type === 'vpulse'
    );
    if (firstVSource) {
      const pinMap = compPinKeys.get(firstVSource.id);
      if (pinMap && pinMap.neg) {
        groundRoot = dsu.find(pinMap.neg);
        warnings.push(
          `No GND symbol found; referencing ${firstVSource.name} (-) terminal to Node 0.`
        );
      }
    }
    if (!groundRoot && allPoints.size > 0) {
      const firstKey = allPoints.keys().next().value;
      if (firstKey !== undefined) {
        groundRoot = dsu.find(firstKey);
        warnings.push(
          'No GND symbol found; automatically referencing first node to Node 0.'
        );
      }
    }
  }

  // 6. Group all points by DSU root and assign sequential node IDs (0 = GND)
  const rootToPoints = new Map<string, Point[]>();
  for (const [key, pt] of allPoints.entries()) {
    const root = dsu.find(key);
    let list = rootToPoints.get(root);
    if (!list) {
      list = [];
      rootToPoints.set(root, list);
    }
    list.push(pt);
  }

  const rootToNodeId = new Map<string, number>();
  const nodes: CompiledNode[] = [];

  // Always create Node 0 (GND)
  if (groundRoot !== null) {
    rootToNodeId.set(groundRoot, 0);
    nodes.push({
      id: 0,
      name: 'GND',
      points: rootToPoints.get(groundRoot) ?? [],
    });
  } else {
    nodes.push({ id: 0, name: 'GND', points: [] });
  }

  let nextNodeId = 1;
  for (const [root, pts] of rootToPoints.entries()) {
    if (root === groundRoot) continue;
    const id = nextNodeId++;
    rootToNodeId.set(root, id);
    nodes.push({
      id,
      name: `N${id}`,
      points: pts,
    });
  }

  // 7. Build pointToNode, componentNodes, and probeNodes maps
  const pointToNode: Record<string, number> = {};
  for (const key of allPoints.keys()) {
    const root = dsu.find(key);
    pointToNode[key] = rootToNodeId.get(root) ?? 0;
  }

  const componentNodes: Record<string, Record<string, number>> = {};
  for (const comp of schematic.components) {
    const pinMap = compPinKeys.get(comp.id) ?? {};
    const nodeMap: Record<string, number> = {};
    for (const [pinId, pKey] of Object.entries(pinMap)) {
      nodeMap[pinId] = pointToNode[pKey] ?? 0;
    }
    componentNodes[comp.id] = nodeMap;
  }

  const probeNodes: Record<string, number> = {};
  for (const { label, key } of probeKeys) {
    probeNodes[label] = pointToNode[key] ?? 0;
  }

  // 8. Generate authentic SPICE netlist text
  const lines: string[] = [
    `* NeonSPICE Netlist: ${schematic.name}`,
    `* Nodes: ${nodes.length} (${nodes.length - 1} active + GND)`,
    '',
  ];

  for (const comp of schematic.components) {
    const card = formatComponentCard(comp, componentNodes[comp.id] ?? {});
    if (card) lines.push(card);
  }

  if (schematic.probes.length > 0) {
    lines.push('');
    const probeList = schematic.probes
      .map((pr) => `${pr.label}=V(${formatNodeName(probeNodes[pr.label] ?? 0)})`)
      .join('  ');
    lines.push(`* Probes: ${probeList}`);
  }

  lines.push('.end');

  return {
    nodes,
    pointToNode,
    componentNodes,
    probeNodes,
    spiceText: lines.join('\n'),
    warnings,
  };
}
