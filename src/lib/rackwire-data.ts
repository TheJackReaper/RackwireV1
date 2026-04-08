import type { RackWireProfile, ComponentRole } from './profile-types';
import { createDefaultProfile } from './default-profile';

export interface ComponentDef {
  id: string;
  name: string;
  excelId?: string;
  size: number;
  maxQty: number;
  color: string;
  role?: ComponentRole;
}

export const COMPONENTS: Record<string, ComponentDef> = {
  SN3700V: { id: 'SN3700V', name: 'NVIDIA SN3700V 200GbE ToR RackSwitch', excelId: 'SN3700V', size: 1, maxQty: 4, color: '#0078d4', role: 'data-switch' },
  SN2201: { id: 'SN2201', name: 'NVIDIA SN2201 1GbE Mgmt RackSwitch', excelId: 'SN2201', size: 1, maxQty: 4, color: '#10b981', role: 'mgmt-switch' },
  SR630_SERVICE: { id: 'SR630_SERVICE', name: 'Service Node - Lenovo SR630 V3', excelId: 'Service Node', size: 1, maxQty: 4, color: '#f97316', role: 'service-node' },
  SR630_COMPUTE: { id: 'SR630_COMPUTE', name: 'Storage/Compute Server - Lenovo SR630 V3', excelId: 'SR630', size: 1, maxQty: 16, color: '#8b5cf6', role: 'pool-server' },
  SR675_GPU: { id: 'SR675_GPU', name: 'GPU Server - Lenovo SR675 V3', excelId: 'SR675', size: 3, maxQty: 6, color: '#ec4899', role: 'pool-server' },
  KVM: { id: 'KVM', name: 'KVM Service Console 7316-TF5', excelId: 'KVM', size: 1, maxQty: 2, color: '#fbbf24', role: 'kvm' },
  PDU: { id: 'PDU', name: 'PDU', excelId: 'PDU', size: 1, maxQty: 12, color: '#ef4444', role: 'pdu' },
  FILLER: { id: 'FILLER', name: '1U Filler', excelId: 'Filler', size: 1, maxQty: 20, color: '#334155', role: 'filler' },
  RESERVE: { id: 'RESERVE', name: 'Reserve', excelId: 'Reserve', size: 1, maxQty: 1, color: '#22334d', role: 'filler' },
};

export function getProfileComponents(profile?: RackWireProfile): Record<string, ComponentDef> {
  if (!profile) return COMPONENTS;
  const result: Record<string, ComponentDef> = {};
  for (const [id, comp] of Object.entries(profile.components)) {
    result[id] = { id: comp.id, name: comp.name, excelId: comp.excelId, size: comp.size, maxQty: comp.maxQty, color: comp.color, role: comp.role };
  }
  return result;
}

function getExcelId(componentId: string, profile?: RackWireProfile): string {
  if (profile?.components[componentId]?.excelId) return profile.components[componentId].excelId!;
  if (COMPONENTS[componentId]?.excelId) return COMPONENTS[componentId].excelId!;
  return componentId;
}

function findCompsByType(rack: RackState, componentId: string): { u: number; num: number }[] {
  const results: { u: number; num: number }[] = [];
  let count = 0;
  for (let u = 1; u <= rack.slots.length; u++) {
    const slot = rack.slots[u - 1];
    if (slot.componentId === componentId && !slot.isPartOf3U) {
      count++;
      results.push({ u, num: count });
    }
  }
  return results;
}

function findCompsByRole(rack: RackState, role: string, profile?: RackWireProfile): { u: number; num: number; componentId: string }[] {
  const results: { u: number; num: number; componentId: string }[] = [];
  let count = 0;
  for (let u = 1; u <= rack.slots.length; u++) {
    const slot = rack.slots[u - 1];
    if (!slot.componentId || slot.isPartOf3U) continue;
    if (getCompRole(slot.componentId, profile) === role) {
      count++;
      results.push({ u, num: count, componentId: slot.componentId });
    }
  }
  return results;
}

export function getProfilePresets(profile?: RackWireProfile): PresetConfig[] {
  if (!profile) return PRESETS;
  return profile.presets.map(p => ({ gpuCount: p.gpuCount, label: p.label }));
}

export interface RackSlot {
  u: number;
  componentId: string | null;
  instanceLabel?: string;
  isPartOf3U?: number;
}

export interface RackState {
  slots: RackSlot[];
  verticalPDUs: [boolean, boolean, boolean, boolean];
}

export function createEmptyRack(profile?: RackWireProfile): RackState {
  const rackSize = profile?.rackSize || 42;
  const slots: RackSlot[] = [];
  for (let u = 1; u <= rackSize; u++) {
    slots.push({ u, componentId: null });
  }
  if (profile) {
    const reserve = profile.fixedPlacements.find(fp => fp.componentId === 'RESERVE');
    if (reserve) slots[reserve.u - 1].componentId = 'RESERVE';
  } else {
    slots[0].componentId = 'RESERVE';
  }
  return { slots, verticalPDUs: [false, false, false, false] };
}

function getSlot(rack: RackState, u: number): RackSlot {
  return rack.slots[u - 1];
}

export function getCompSize(componentId: string, profile?: RackWireProfile): number {
  if (profile?.components[componentId]) return profile.components[componentId].size;
  if (COMPONENTS[componentId]) return COMPONENTS[componentId].size;
  return 1;
}

export function getCompRole(componentId: string, profile?: RackWireProfile): ComponentRole | undefined {
  if (profile?.components[componentId]?.role) return profile.components[componentId].role;
  if (COMPONENTS[componentId]?.role) return COMPONENTS[componentId].role;
  return undefined;
}

function placeComponent(rack: RackState, u: number, componentId: string, profile?: RackWireProfile) {
  const slot = getSlot(rack, u);
  slot.componentId = componentId;
  slot.isPartOf3U = undefined;
  const size = getCompSize(componentId, profile);
  if (size > 1) {
    for (let offset = 1; offset < size; offset++) {
      getSlot(rack, u + offset).componentId = componentId;
      getSlot(rack, u + offset).isPartOf3U = u;
    }
  }
}

function placeFixedComponents(rack: RackState) {
  for (let u = 35; u <= 42; u++) placeComponent(rack, u, 'PDU');
  placeComponent(rack, 23, 'SR630_SERVICE');
  placeComponent(rack, 22, 'KVM');
  placeComponent(rack, 21, 'SN3700V');
  placeComponent(rack, 20, 'SN3700V');
  placeComponent(rack, 19, 'SN2201');
  placeComponent(rack, 18, 'SN2201');
}

export type PresetConfig = {
  gpuCount: number;
  label: string;
};

export const PRESETS: PresetConfig[] = [
  { gpuCount: 0, label: '0 GPU (16× SR630)' },
  { gpuCount: 1, label: '1 GPU (1× SR675 + 15× SR630)' },
  { gpuCount: 2, label: '2 GPU (2× SR675 + 14× SR630)' },
  { gpuCount: 3, label: '3 GPU (3× SR675 + 13× SR630)' },
  { gpuCount: 4, label: '4 GPU (4× SR675 + 12× SR630)' },
  { gpuCount: 5, label: '5 GPU (5× SR675 + 12× SR630)' },
  { gpuCount: 6, label: '6 GPU (6× SR675 + 9× SR630)' },
];

export function applyPreset(gpuCount: number, profile?: RackWireProfile): RackState {
  const p = profile || createDefaultProfile();
  const rack = createEmptyRack(p);

  for (const fp of p.fixedPlacements) {
    if (fp.componentId !== 'RESERVE') {
      placeComponent(rack, fp.u, fp.componentId, p);
    }
  }

  const preset = p.presets.find(pr => pr.gpuCount === gpuCount);
  if (preset) {
    for (const item of preset.placements) {
      placeComponent(rack, item.u, item.componentId, p);
    }
  }

  rack.verticalPDUs = [true, true, true, true];
  assignInstanceLabels(rack, profile || p);
  return rack;
}

export function assignInstanceLabels(rack: RackState, profile?: RackWireProfile) {
  const counters: Record<string, number> = {};
  let pduCount = rack.verticalPDUs.filter(Boolean).length;

  const exId = (compId: string) => getExcelId(compId, profile);

  for (let u = 1; u <= rack.slots.length; u++) {
    const slot = getSlot(rack, u);
    slot.instanceLabel = undefined;
    if (!slot.componentId) continue;
    if (slot.isPartOf3U) continue;

    const compId = slot.componentId;
    const role = getCompRole(compId, profile);

    switch (role) {
      case 'data-switch':
      case 'mgmt-switch':
      case 'pool-server': {
        counters[compId] = (counters[compId] || 0) + 1;
        slot.instanceLabel = `${exId(compId)} ${counters[compId]}`;
        break;
      }
      case 'pdu': {
        pduCount++;
        slot.instanceLabel = `${exId(compId)} ${pduCount}`;
        break;
      }
      case 'service-node': {
        slot.instanceLabel = exId(compId);
        break;
      }
      case 'kvm': {
        slot.instanceLabel = `${exId(compId)} Console`;
        break;
      }
      case 'filler': {
        slot.instanceLabel = exId(compId);
        break;
      }
      default: {
        counters[compId] = (counters[compId] || 0) + 1;
        slot.instanceLabel = `${exId(compId)} ${counters[compId]}`;
        break;
      }
    }
  }
}

export interface PoolNode {
  u: number;
  type: string;
  instanceNum: number;
  instanceLabel: string;
  poolIndex: number;
}

export function buildNodePool(rack: RackState, profile?: RackWireProfile): PoolNode[] {
  const pool: PoolNode[] = [];
  const counters: Record<string, number> = {};

  for (let u = 1; u <= rack.slots.length; u++) {
    const slot = getSlot(rack, u);
    if (!slot.componentId) continue;
    if (slot.isPartOf3U) continue;

    const role = getCompRole(slot.componentId, profile);
    if (role === 'pool-server') {
      const compId = slot.componentId;
      counters[compId] = (counters[compId] || 0) + 1;
      const label = getExcelId(compId, profile);
      pool.push({
        u,
        type: compId,
        instanceNum: counters[compId],
        instanceLabel: `${label} ${counters[compId]}`,
        poolIndex: pool.length,
      });
    }
  }
  return pool;
}

export interface CableRow {
  fromULoc: string;
  fromComponent: string;
  fromPort: string;
  toULoc: string;
  toComponent: string;
  toChassis: string;
  toPort: string;
  toPortType: string;
  toTransceiver: string;
  cableDescription: string;
  cablePn: string;
  fromTransceiver: string;
  fromPortType: string;
  rowColor?: string;
  isSectionHeader?: boolean;
  fromComponentId?: string;
  toComponentId?: string;
}

export function generateCables(rack: RackState, profile?: RackWireProfile): CableRow[] {
  const p = profile || createDefaultProfile();
  const pool = buildNodePool(rack, p);
  const cables: CableRow[] = [];

  const findRule = (id: string) => p.connectionRules.find(r => r.id === id);
  const sn3700vServiceRule = findRule('sn3700v-to-service-node');
  const sn3700vBreakoutRule = findRule('sn3700v-to-sn2201-breakout');
  const computeAocRule = findRule('sn3700v-data-to-pool-compute');
  const gpuAocRule = findRule('sn3700v-data-to-pool-gpu');
  const breakoutComputeRule = findRule('sn3700v-breakout-to-pool-compute');
  const islRule = findRule('sn3700v-isl');
  const mgmtLinkRule = findRule('sn3700v-mgmt-link');
  const sw1MgmtRule = findRule('sn2201-to-pool-mgmt');
  const sw2ImmRule = findRule('sn2201-to-pool-imm');
  const pduRule = findRule('sn2201-to-pdu');
  const sn2201IslRule = findRule('sn2201-isl');
  const sn2201Sn3700vRule = findRule('sn2201-to-sn3700v');

  const computeChassis = p.mlnxRules.computeChassisSlot;
  const gpuChassis = p.mlnxRules.gpuChassisSlot;
  const breakoutComputeChassis = p.mlnxRules.breakoutComputeSlot;
  const breakoutGpuChassis = p.mlnxRules.breakoutGpuSlot;

  const dataSwitchPositions = findCompsByRole(rack, 'data-switch', p);
  const mgmtSwitchPositions = findCompsByRole(rack, 'mgmt-switch', p);
  const serviceNodePositions = findCompsByRole(rack, 'service-node', p);

  const dsCompId = dataSwitchPositions[0]?.componentId || 'SN3700V';
  const msCompId = mgmtSwitchPositions[0]?.componentId || 'SN2201';
  const snCompId = serviceNodePositions[0]?.componentId || 'SR630_SERVICE';
  const pduCompId = (() => { for (const [id, c] of Object.entries(p.components)) { if (c.role === 'pdu') return id; } return 'PDU'; })();

  const sn3700vLabel = getExcelId(dsCompId, p);
  const sn2201Label = getExcelId(msCompId, p);
  const serviceNodeLabel = getExcelId(snCompId, p);
  const pduLabel = getExcelId(pduCompId, p);

  const sn3700vPositions = dataSwitchPositions;
  const sn2201Positions = mgmtSwitchPositions;

  const verticalPDUDefs = [
    { pos: 'L1' },
    { pos: 'R1' },
    { pos: 'L2' },
    { pos: 'R2' },
  ];

  const allPDUs: Array<{ num: number; label: string; uLoc: string }> = [];
  let pduN = 0;

  for (let i = 0; i < 4; i++) {
    if (rack.verticalPDUs[i]) {
      pduN++;
      const vp = verticalPDUDefs[i];
      allPDUs.push({ num: pduN, label: `${pduLabel} ${pduN}`, uLoc: vp.pos });
    }
  }

  for (let u = 1; u <= rack.slots.length; u++) {
    const slot = getSlot(rack, u);
    if (!slot.componentId || slot.isPartOf3U) continue;
    if (getCompRole(slot.componentId, p) === 'pdu') {
      pduN++;
      allPDUs.push({ num: pduN, label: `${pduLabel} ${pduN}`, uLoc: `U${u}` });
    }
  }

  for (let sw = 1; sw <= 2; sw++) {
    const swPos = sn3700vPositions[sw - 1];
    if (!swPos) continue;
    const swU = swPos.u;
    const pSuffix = sw === 1 ? 'P1' : 'P2';
    const swExLabel = `${sn3700vLabel} ${sw}`;

    cables.push({
      fromULoc: '', fromComponent: '', fromPort: '',
      toULoc: '', toComponent: '', toChassis: '',
      toPort: '', toPortType: '', toTransceiver: '',
      cableDescription: `--- ${swExLabel} (U${swU}) ---`,
      cablePn: '', fromTransceiver: '', fromPortType: '',
      isSectionHeader: true, rowColor: p.components[dsCompId]?.color || '#0078d4',
    });

    const svcNode = serviceNodePositions[0];
    const svcU = svcNode ? svcNode.u : 0;
    if (svcNode) {
      cables.push({
        fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: '1',
        toULoc: `U${svcU}`, toComponent: serviceNodeLabel, toChassis: 'C1',
        toPort: pSuffix, toPortType: sn3700vServiceRule?.portType || 'SFP28', toTransceiver: sn3700vServiceRule?.transceiver || '01FT845',
        cableDescription: sn3700vServiceRule?.cableType || '1m 10Gb DAC + SFP28/QSFP28 adapter',
        cablePn: sn3700vServiceRule?.cablePN || '01KL948', fromTransceiver: '', fromPortType: 'QSFP28',
        fromComponentId: dsCompId, toComponentId: snCompId,
        rowColor: p.components[snCompId]?.color || '#f97316',
      });
    }

    const sn2201_1 = sn2201Positions[0];
    const sn2201_2 = sn2201Positions[1];
    const sn2201_1_port = sw === 1 ? '49' : '50';
    const sn2201_2_port = sw === 1 ? '49' : '50';
    if (sn2201_1) {
      cables.push({
        fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: '2/1',
        toULoc: `U${sn2201_1.u}`, toComponent: `${sn2201Label} 1`, toChassis: '',
        toPort: sn2201_1_port, toPortType: 'SFP28', toTransceiver: '',
        cableDescription: sn3700vBreakoutRule?.cableType || 'QSFP28 100GbE to 2x50GbE Breakout 1.0m',
        cablePn: sn3700vBreakoutRule?.cablePN || '03MT733', fromTransceiver: '', fromPortType: 'QSFP28',
        fromComponentId: dsCompId, toComponentId: msCompId,
        rowColor: p.components[msCompId]?.color || '#10b981',
      });
    }
    if (sn2201_2) {
      cables.push({
        fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: '2/2',
        toULoc: `U${sn2201_2.u}`, toComponent: `${sn2201Label} 2`, toChassis: '',
        toPort: sn2201_2_port, toPortType: 'SFP28', toTransceiver: '',
        cableDescription: sn3700vBreakoutRule?.cableType || 'QSFP28 100GbE to 2x50GbE Breakout 1.0m',
        cablePn: '', fromTransceiver: '', fromPortType: 'QSFP28',
        fromComponentId: dsCompId, toComponentId: msCompId,
        rowColor: p.components[msCompId]?.color || '#10b981',
      });
    }

    for (let port = 3; port <= 18; port++) {
      const nodeIdx = port - 3;
      if (nodeIdx < pool.length) {
        const node = pool[nodeIdx];
        const isMultiU = getCompSize(node.type, p) > 1;
        const aocRule = isMultiU ? gpuAocRule : computeAocRule;
        const chassisSlot = isMultiU ? gpuChassis : computeChassis;
        const cable = aocRule?.cablePN || (isMultiU ? '01FT683' : '01FT722');
        const cableDesc = aocRule?.cableType || (isMultiU ? '5m 200Gb QSFP56 AOC' : '3m 100Gb QSFP28 AOC');
        const portType = aocRule?.portType || (isMultiU ? 'QSFP56' : 'QSFP28');
        cables.push({
          fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: String(port),
          toULoc: `U${node.u}`, toComponent: node.instanceLabel, toChassis: chassisSlot,
          toPort: `${chassisSlot}-${pSuffix}`, toPortType: portType,
          toTransceiver: '', cableDescription: cableDesc,
          cablePn: cable, fromTransceiver: '', fromPortType: portType,
          fromComponentId: dsCompId, toComponentId: node.type,
          rowColor: p.components[node.type]?.color || (isMultiU ? '#ec4899' : '#8b5cf6'),
        });
      } else {
        cables.push({
          fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: String(port),
          toULoc: '', toComponent: 'Reserved', toChassis: '',
          toPort: '', toPortType: '', toTransceiver: '',
          cableDescription: '', cablePn: '', fromTransceiver: '', fromPortType: '',
          rowColor: '#334155',
        });
      }
    }

    for (let rp = 19; rp <= 22; rp++) {
      cables.push({
        fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: String(rp),
        toULoc: '', toComponent: 'Reserved', toChassis: '',
        toPort: '', toPortType: '', toTransceiver: '',
        cableDescription: '', cablePn: '', fromTransceiver: '', fromPortType: '',
        rowColor: '#334155',
      });
    }

    for (let physPort = 23; physPort <= 26; physPort++) {
      for (let sub = 1; sub <= 4; sub++) {
        const nodeIdx = (physPort - 23) * 4 + (sub - 1);
        if (nodeIdx < pool.length) {
          const node = pool[nodeIdx];
          const isMultiU2 = getCompSize(node.type, p) > 1;
          const chassisSlot = isMultiU2 ? breakoutGpuChassis : breakoutComputeChassis;
          cables.push({
            fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: `${physPort}/${sub}`,
            toULoc: `U${node.u}`, toComponent: node.instanceLabel, toChassis: chassisSlot,
            toPort: `${chassisSlot}-${pSuffix}`, toPortType: 'SFP28',
            toTransceiver: '', cableDescription: breakoutComputeRule?.cableType || 'QSFP28 to 4x SFP28 25GbE Breakout DAC 2.0m',
            cablePn: sub === 1 ? (breakoutComputeRule?.cablePN || '01FT739') : '',
            fromTransceiver: '', fromPortType: sub === 1 ? 'QSFP28' : '',
            fromComponentId: dsCompId, toComponentId: node.type,
            rowColor: p.components[node.type]?.color || (isMultiU2 ? '#ec4899' : '#8b5cf6'),
          });
        } else {
          cables.push({
            fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: `${physPort}/${sub}`,
            toULoc: '', toComponent: 'Reserved', toChassis: '',
            toPort: '', toPortType: '', toTransceiver: '',
            cableDescription: '', cablePn: '', fromTransceiver: '', fromPortType: '',
            rowColor: '#334155',
          });
        }
      }
    }

    for (let rp = 27; rp <= 28; rp++) {
      cables.push({
        fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: String(rp),
        toULoc: '', toComponent: 'Reserved', toChassis: '',
        toPort: '', toPortType: '', toTransceiver: '',
        cableDescription: '', cablePn: '', fromTransceiver: '', fromPortType: '',
        rowColor: '#334155',
      });
    }

    const peerSwPos = sn3700vPositions[sw === 1 ? 1 : 0];
    const peerSwU = peerSwPos ? peerSwPos.u : 0;
    const peerNum = sw === 1 ? 2 : 1;
    const peerLabel = `${sn3700vLabel} ${peerNum}`;
    if (peerSwPos) {
      cables.push({
        fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: '29',
        toULoc: `U${peerSwU}`, toComponent: peerLabel, toChassis: '',
        toPort: '29', toPortType: islRule?.portType || 'QSFP28', toTransceiver: '',
        cableDescription: islRule?.cableType || '0.5m 100Gb QSFP28 DAC',
        cablePn: islRule?.cablePN || '01FT718', fromTransceiver: '', fromPortType: islRule?.portType || 'QSFP28',
        fromComponentId: dsCompId, toComponentId: dsCompId,
        rowColor: p.components[dsCompId]?.color || '#0078d4',
      });
      cables.push({
        fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: '30',
        toULoc: `U${peerSwU}`, toComponent: peerLabel, toChassis: '',
        toPort: '30', toPortType: islRule?.portType || 'QSFP28', toTransceiver: '',
        cableDescription: islRule?.cableType || '0.5m 100Gb QSFP28 DAC',
        cablePn: islRule?.cablePN || '01FT718', fromTransceiver: '', fromPortType: islRule?.portType || 'QSFP28',
        fromComponentId: dsCompId, toComponentId: dsCompId,
        rowColor: p.components[dsCompId]?.color || '#0078d4',
      });
    }

    cables.push({
      fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: '31',
      toULoc: '', toComponent: 'Customer Data (uplink)', toChassis: '',
      toPort: '', toPortType: '', toTransceiver: '',
      cableDescription: 'Customer-provided', cablePn: '',
      fromTransceiver: '', fromPortType: '',
      rowColor: '#334155',
    });
    cables.push({
      fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: '32',
      toULoc: '', toComponent: 'Customer Data (uplink)', toChassis: '',
      toPort: '', toPortType: '', toTransceiver: '',
      cableDescription: 'Customer-provided', cablePn: '',
      fromTransceiver: '', fromPortType: '',
      rowColor: '#334155',
    });

    if (peerSwPos) {
      cables.push({
        fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: 'MGMT',
        toULoc: `U${peerSwU}`, toComponent: peerLabel, toChassis: '',
        toPort: 'MGMT', toPortType: 'RJ45', toTransceiver: '',
        cableDescription: mgmtLinkRule?.cableType || '0.6m CAT5e RJ45 Green',
        cablePn: mgmtLinkRule?.cablePN || '01AF210', fromTransceiver: '', fromPortType: 'RJ45',
      fromComponentId: dsCompId, toComponentId: dsCompId,
      rowColor: p.components[dsCompId]?.color || '#0078d4',
    });

    }

    cables.push({
      fromULoc: `U${swU}`, fromComponent: swExLabel, fromPort: 'SERIAL',
      toULoc: '', toComponent: 'Empty', toChassis: '',
      toPort: '', toPortType: '', toTransceiver: '',
      cableDescription: '', cablePn: '', fromTransceiver: '', fromPortType: '',
      rowColor: '#334155',
    });
  }

  for (let sw = 1; sw <= 2; sw++) {
    const sw2Pos = sn2201Positions[sw - 1];
    if (!sw2Pos) continue;
    const swU = sw2Pos.u;
    const sw2ExLabel = `${sn2201Label} ${sw}`;

    cables.push({
      fromULoc: '', fromComponent: '', fromPort: '',
      toULoc: '', toComponent: '', toChassis: '',
      toPort: '', toPortType: '', toTransceiver: '',
      cableDescription: `--- ${sw2ExLabel} (U${swU}) ---`,
      cablePn: '', fromTransceiver: '', fromPortType: '',
      isSectionHeader: true, rowColor: p.components[msCompId]?.color || '#10b981',
    });

    for (let port = 1; port <= 16; port++) {
      const nodeIdx = port - 1;
      if (nodeIdx < pool.length) {
        const node = pool[nodeIdx];
        const mgmtRule = sw === 1 ? sw1MgmtRule : sw2ImmRule;
        const destPort = sw === 1 ? 'MGMT' : (sw2ImmRule?.toPort || 'P1 IMM');
        const cableColor = mgmtRule?.cablePN || (sw === 1 ? '01AF039' : '01AF054');
        const cableDesc = mgmtRule?.cableType || (sw === 1 ? 'CAT5e 1GbE Blue' : 'CAT5e 1GbE Black');
        cables.push({
          fromULoc: `U${swU}`, fromComponent: sw2ExLabel, fromPort: String(port),
          toULoc: `U${node.u}`, toComponent: node.instanceLabel, toChassis: '',
          toPort: destPort, toPortType: 'RJ45', toTransceiver: '',
          cableDescription: cableDesc, cablePn: cableColor,
          fromTransceiver: '', fromPortType: 'RJ45',
          fromComponentId: msCompId, toComponentId: node.type,
          rowColor: p.components[node.type]?.color || (getCompSize(node.type, p) > 1 ? '#ec4899' : '#8b5cf6'),
        });
      } else {
        cables.push({
          fromULoc: `U${swU}`, fromComponent: sw2ExLabel, fromPort: String(port),
          toULoc: '', toComponent: 'Reserved', toChassis: '',
          toPort: '', toPortType: '', toTransceiver: '',
          cableDescription: '', cablePn: '', fromTransceiver: '', fromPortType: '',
          rowColor: '#334155',
        });
      }
    }

    const targetPDUs = sw === 1
      ? allPDUs.filter((_, i) => i % 2 === 0)
      : allPDUs.filter((_, i) => i % 2 === 1);

    for (let i = 0; i < 6; i++) {
      const port = 27 + i;
      if (i < targetPDUs.length) {
        const pdu = targetPDUs[i];
        cables.push({
          fromULoc: `U${swU}`, fromComponent: sw2ExLabel, fromPort: String(port),
          toULoc: pdu.uLoc, toComponent: pdu.label, toChassis: '',
          toPort: 'MGMT', toPortType: 'RJ45', toTransceiver: '',
          cableDescription: pduRule?.cableType || 'CAT5e 1GbE PDU 3m', cablePn: pduRule?.cablePN || '01AF040',
          fromTransceiver: '', fromPortType: 'RJ45',
          fromComponentId: msCompId, toComponentId: pduCompId,
          rowColor: p.components[pduCompId]?.color || '#ef4444',
        });
      } else {
        cables.push({
          fromULoc: `U${swU}`, fromComponent: sw2ExLabel, fromPort: String(port),
          toULoc: '', toComponent: 'Reserved', toChassis: '',
          toPort: '', toPortType: '', toTransceiver: '',
          cableDescription: '', cablePn: '', fromTransceiver: '', fromPortType: '',
          rowColor: '#334155',
        });
      }
    }

    const svcNode = serviceNodePositions[0];
    if (svcNode) {
      const svcImmPort = sw === 1 ? 'IMM' : 'P1 IMM';
      cables.push({
        fromULoc: `U${swU}`, fromComponent: sw2ExLabel, fromPort: '33',
        toULoc: `U${svcNode.u}`, toComponent: serviceNodeLabel, toChassis: '',
        toPort: svcImmPort, toPortType: 'RJ45', toTransceiver: '',
        cableDescription: 'CAT5e 1GbE', cablePn: '',
        fromTransceiver: '', fromPortType: 'RJ45',
        fromComponentId: msCompId, toComponentId: snCompId,
        rowColor: p.components[snCompId]?.color || '#f97316',
      });

      const svcSshPort = sw === 1 ? 'P2 IMM' : 'P3 IMM';
      cables.push({
        fromULoc: `U${swU}`, fromComponent: sw2ExLabel, fromPort: '35',
        toULoc: `U${svcNode.u}`, toComponent: serviceNodeLabel, toChassis: '',
        toPort: svcSshPort, toPortType: 'RJ45', toTransceiver: '',
        cableDescription: 'CAT5e 1GbE', cablePn: '',
        fromTransceiver: '', fromPortType: 'RJ45',
        fromComponentId: msCompId, toComponentId: snCompId,
        rowColor: p.components[snCompId]?.color || '#f97316',
      });
    }

    cables.push({
      fromULoc: `U${swU}`, fromComponent: sw2ExLabel, fromPort: '46',
      toULoc: '', toComponent: 'CE Laptop', toChassis: '',
      toPort: '', toPortType: 'RJ45', toTransceiver: '',
      cableDescription: 'CAT5e 1GbE', cablePn: '',
      fromTransceiver: '', fromPortType: 'RJ45',
      rowColor: '#334155',
    });

    const sn3700v_1 = sn3700vPositions[0];
    const sn3700v_2 = sn3700vPositions[1];
    if (sn3700v_1) {
      cables.push({
        fromULoc: `U${swU}`, fromComponent: sw2ExLabel, fromPort: '49',
        toULoc: `U${sn3700v_1.u}`, toComponent: `${sn3700vLabel} 1`, toChassis: '',
        toPort: sw === 1 ? '2/1' : '2/2', toPortType: 'SFP28', toTransceiver: '',
        cableDescription: sn2201Sn3700vRule?.cableType || 'QSFP28 100GbE to 2x50GbE Breakout', cablePn: sn2201Sn3700vRule?.cablePN || '03MT733',
        fromTransceiver: '', fromPortType: 'SFP28',
        fromComponentId: msCompId, toComponentId: dsCompId,
        rowColor: p.components[dsCompId]?.color || '#0078d4',
      });
    }

    if (sn3700v_2) {
      cables.push({
        fromULoc: `U${swU}`, fromComponent: sw2ExLabel, fromPort: '50',
        toULoc: `U${sn3700v_2.u}`, toComponent: `${sn3700vLabel} 2`, toChassis: '',
        toPort: sw === 1 ? '2/1' : '2/2', toPortType: 'SFP28', toTransceiver: '',
        cableDescription: sn2201Sn3700vRule?.cableType || 'QSFP28 100GbE to 2x50GbE Breakout', cablePn: sn2201Sn3700vRule?.cablePN || '03MT733',
        fromTransceiver: '', fromPortType: 'SFP28',
        fromComponentId: msCompId, toComponentId: dsCompId,
        rowColor: p.components[dsCompId]?.color || '#0078d4',
      });
    }

    const peerSw2Pos = sn2201Positions[sw === 1 ? 1 : 0];
    if (peerSw2Pos) {
      const peerNum2 = sw === 1 ? 2 : 1;
      const peerLabel2 = `${sn2201Label} ${peerNum2}`;
      cables.push({
        fromULoc: `U${swU}`, fromComponent: sw2ExLabel, fromPort: '51',
        toULoc: `U${peerSw2Pos.u}`, toComponent: peerLabel2, toChassis: '',
        toPort: '51', toPortType: sn2201IslRule?.portType || 'SFP28', toTransceiver: '',
        cableDescription: sn2201IslRule?.cableType || '1m 25Gb SFP28 DAC', cablePn: sn2201IslRule?.cablePN || '',
        fromTransceiver: '', fromPortType: sn2201IslRule?.portType || 'SFP28',
        fromComponentId: msCompId, toComponentId: msCompId,
        rowColor: p.components[msCompId]?.color || '#10b981',
      });
      cables.push({
        fromULoc: `U${swU}`, fromComponent: sw2ExLabel, fromPort: '52',
        toULoc: `U${peerSw2Pos.u}`, toComponent: peerLabel2, toChassis: '',
        toPort: '52', toPortType: sn2201IslRule?.portType || 'SFP28', toTransceiver: '',
        cableDescription: sn2201IslRule?.cableType || '1m 25Gb SFP28 DAC', cablePn: sn2201IslRule?.cablePN || '',
        fromTransceiver: '', fromPortType: sn2201IslRule?.portType || 'SFP28',
        fromComponentId: msCompId, toComponentId: msCompId,
        rowColor: p.components[msCompId]?.color || '#10b981',
      });
    }

    cables.push({
      fromULoc: `U${swU}`, fromComponent: sw2ExLabel, fromPort: 'MGT',
      toULoc: '', toComponent: 'Management Network uplink', toChassis: '',
      toPort: '', toPortType: 'RJ45', toTransceiver: '',
      cableDescription: 'CAT5e 1GbE', cablePn: '',
      fromTransceiver: '', fromPortType: 'RJ45',
      rowColor: '#334155',
    });
  }

  return cables;
}

export function getComponentCount(rack: RackState, componentId: string, profile?: RackWireProfile): number {
  let count = 0;
  for (const slot of rack.slots) {
    if (slot.componentId === componentId && !slot.isPartOf3U) {
      count++;
    }
  }
  const role = getCompRole(componentId, profile);
  if (role === 'pdu') {
    count += rack.verticalPDUs.filter(Boolean).length;
  }
  return count;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  lastModified: string;
  rack: RackState;
  gpuPreset: number;
  profileId?: string;
  profileName?: string;
  profileVersion?: string;
}

export function loadProjects(): Project[] {
  try {
    const data = localStorage.getItem('rackwire_projects');
    const projects: Project[] = data ? JSON.parse(data) : [];
    for (const p of projects) {
      if (!p.rack.verticalPDUs) {
        p.rack.verticalPDUs = [false, false, false, false];
      }
    }
    return projects;
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]) {
  localStorage.setItem('rackwire_projects', JSON.stringify(projects));
}

export function createProject(name: string, profile?: RackWireProfile): Project {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    rack: createEmptyRack(profile),
    gpuPreset: -1,
  };
}
