import type { CableRow, RackState, PoolNode } from './rackwire-data';
import { COMPONENTS, buildNodePool, getProfileComponents, getCompSize, getCompRole } from './rackwire-data';
import type { RackWireProfile } from './profile-types';
import { createDefaultProfile } from './default-profile';

declare const ExcelJS: any;

function hexToArgb(hex: string): string {
  return 'FF' + hex.replace('#', '');
}

function getExcelId(componentId: string, profile?: RackWireProfile): string {
  if (profile?.components[componentId]?.excelId) return profile.components[componentId].excelId!;
  if (COMPONENTS[componentId]?.excelId) return COMPONENTS[componentId].excelId!;
  return componentId;
}

const COLOR_CATEGORIES = {
  dataAoc: { name: '100Gb AOC (Data Switch)', bg: 'FFE8EAF6', header: 'FF3949AB', text: 'FF1A237E' },
  dataBreakout: { name: '25Gb Breakout (Data Switch)', bg: 'FFEDE7F6', header: 'FF6A1B9A', text: 'FF4A148C' },
  mgmt: { name: '1GbE Mgmt (Mgmt Switch)', bg: 'FFE3F2FD', header: 'FF1565C0', text: 'FF0D47A1' },
  serviceNode: { name: 'Service Node Links', bg: 'FFFFF3E0', header: 'FFEF6C00', text: 'FFE65100' },
  pdu: { name: 'PDU Power Links', bg: 'FFFCE4EC', header: 'FFC62828', text: 'FFB71C1C' },
  switchInterlink: { name: 'Switch ISL / Uplink', bg: 'FFE0F2F1', header: 'FF00695C', text: 'FF004D40' },
  fixed: { name: 'Fixed / Infrastructure', bg: 'FFF5F5F5', header: 'FF455A64', text: 'FF263238' },
};

function getCableCategory(cable: CableRow, profile?: RackWireProfile): keyof typeof COLOR_CATEGORIES {
  if (cable.isSectionHeader) return 'fixed';
  const desc = cable.cableDescription.toLowerCase();
  const fromComp = cable.fromComponentId || '';
  const toComp = cable.toComponentId || '';
  const fromRole = fromComp ? getCompRole(fromComp, profile) : undefined;
  const toRole = toComp ? getCompRole(toComp, profile) : undefined;

  const fr = fromRole as string | undefined;
  const tr = toRole as string | undefined;

  if (tr === 'service-node' || fr === 'service-node') return 'serviceNode';
  if (tr === 'pdu' || fr === 'pdu') return 'pdu';
  if (fr === 'data-switch' && tr === 'pool-server') {
    if (desc.includes('breakout') || desc.includes('25g') || desc.includes('4×25') || desc.includes('4x25')) return 'dataBreakout';
    return 'dataAoc';
  }
  if (desc.includes('isl') || (fr === 'data-switch' && tr === 'data-switch')) return 'switchInterlink';
  if (fr === 'data-switch' && tr === 'mgmt-switch') return 'switchInterlink';
  if (fr === 'mgmt-switch' && tr === 'data-switch') return 'switchInterlink';
  if (fr === 'mgmt-switch' || tr === 'mgmt-switch') return 'mgmt';
  if (fr === 'data-switch') return 'dataAoc';
  if (cable.toComponent.toLowerCase().includes('reserved') || cable.toComponent.toLowerCase().includes('empty') || cable.toComponent.toLowerCase().includes('customer')) return 'fixed';
  return 'fixed';
}

function addColorLegend(ws: any, startCol: number, startRow: number) {
  const titleCell = ws.getCell(startRow, startCol);
  titleCell.value = 'Color Legend';
  titleCell.font = { bold: true, size: 11, color: { argb: 'FF000000' } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getColumn(startCol).width = 36;

  let row = startRow + 1;
  for (const [, cat] of Object.entries(COLOR_CATEGORIES)) {
    const cell = ws.getCell(row, startCol);
    cell.value = cat.name;
    cell.font = { size: 9, color: { argb: cat.text } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cat.bg } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    };
    cell.alignment = { vertical: 'middle' };
    row++;
  }
}

const LABEL_COLS = [1, 3, 5, 7, 9, 11, 15];
const ITEMS_PER_PAGE = 42;
const FONT = { size: 6, name: 'Arial' };
const FONT_BOLD = { size: 6, name: 'Arial', bold: true };
const FONT_NUM = { size: 6, name: 'Arial', color: { indexed: 9 } };

type GridItem =
  | { kind: 'header'; cableType: string; cablePn: string }
  | { kind: 'label'; switchSide: string; serverSide: string }
  | { kind: 'empty' };

interface BreakoutBlock {
  cableType: string;
  cablePn: string;
  switchPort: string;
  summary: string;
  legs: { serverSide: string }[];
}

function setupLabelColumns(ws: any) {
  const widths: Record<number, number> = {
    1: 14.71, 2: 2.43, 3: 14.71, 4: 3.43, 5: 14.71, 6: 3.29,
    7: 14.71, 8: 4.29, 9: 14.71, 10: 6.71, 11: 14.71,
    12: 14.86, 13: 13.71, 14: 5.43, 15: 14.71,
  };
  for (const [col, w] of Object.entries(widths)) {
    const c = Number(col);
    ws.getColumn(c).width = w;
  }
  ws.getColumn(12).hidden = true;
  ws.getColumn(13).hidden = true;
}

const BLUE_BORDER = {
  top: { style: 'thin' as const, color: { argb: 'FF4472C4' } },
  bottom: { style: 'thin' as const, color: { argb: 'FF4472C4' } },
  left: { style: 'thin' as const, color: { argb: 'FF4472C4' } },
  right: { style: 'thin' as const, color: { argb: 'FF4472C4' } },
};

function applyBlueBorders(ws: any, row: number, col: number) {
  ws.getCell(row, col).border = { ...BLUE_BORDER };
  ws.getCell(row + 1, col).border = { ...BLUE_BORDER };
  ws.getCell(row + 2, col).border = { ...BLUE_BORDER };
}

function writeStandardPage(ws: any, startRow: number, items: GridItem[]): number {
  while (items.length < ITEMS_PER_PAGE) items.push({ kind: 'empty' });

  let row = startRow;
  for (let block = 0; block < 6; block++) {
    const blockItems = items.slice(block * 7, block * 7 + 7);
    ws.getRow(row).height = 27;
    ws.getRow(row + 1).height = 22.5;
    ws.getRow(row + 2).height = 80;

    for (let i = 0; i < 7; i++) {
      const col = LABEL_COLS[i];
      const item = blockItems[i];
      const num = block * 7 + i + 1;

      if (item.kind === 'header') {
        ws.getCell(row, col).value = item.cableType;
        ws.getCell(row, col).font = { ...FONT_BOLD };
        ws.getCell(row, col).alignment = { horizontal: 'center' };
        ws.getCell(row + 1, col).value = `PN:${item.cablePn}`;
        ws.getCell(row + 1, col).font = { ...FONT_BOLD };
        ws.getCell(row + 1, col).alignment = { horizontal: 'center', vertical: 'top' };
      } else if (item.kind === 'label') {
        ws.getCell(row, col).value = item.switchSide;
        ws.getCell(row, col).font = { ...FONT };
        ws.getCell(row, col).alignment = { horizontal: 'center' };
        ws.getCell(row + 1, col).value = item.serverSide;
        ws.getCell(row + 1, col).font = { ...FONT };
        ws.getCell(row + 1, col).alignment = { horizontal: 'center', vertical: 'top' };
      }

      ws.getCell(row + 2, col).value = String(num);
      ws.getCell(row + 2, col).font = { ...FONT_NUM };
      ws.getCell(row + 2, col).alignment = { horizontal: 'center', vertical: 'middle' };

      applyBlueBorders(ws, row, col);
    }
    row += 3;
  }
  return row;
}

function writeFooter(ws: any, row: number): number {
  ws.getRow(row).height = 25.5;
  ws.getCell(row, 11).value = 'PN: ';
  ws.getCell(row, 11).font = { ...FONT };
  ws.getRow(row + 1).height = 22.5;
  ws.getCell(row + 1, 11).value = 'EC: ';
  ws.getCell(row + 1, 11).font = { ...FONT };
  ws.getRow(row + 2).height = 75;
  return row + 3;
}

function writeBreakoutBlocks(ws: any, startRow: number, blocks: BreakoutBlock[]): number {
  const breakoutCols = [1, 3, 5, 7, 9, 11];
  let row = startRow;

  for (const block of blocks) {
    ws.getRow(row).height = 27;
    ws.getRow(row + 1).height = 22.5;

    ws.getCell(row, 1).value = block.cableType;
    ws.getCell(row, 1).font = { ...FONT_BOLD };
    ws.getCell(row, 1).alignment = { horizontal: 'center' };

    for (let i = 1; i < breakoutCols.length; i++) {
      ws.getCell(row, breakoutCols[i]).value = block.switchPort;
      ws.getCell(row, breakoutCols[i]).font = { ...FONT };
      ws.getCell(row, breakoutCols[i]).alignment = { horizontal: 'center' };
    }

    ws.getCell(row + 1, 1).value = `PN:${block.cablePn}`;
    ws.getCell(row + 1, 1).font = { ...FONT_BOLD };
    ws.getCell(row + 1, 1).alignment = { horizontal: 'center', vertical: 'top' };

    ws.getCell(row + 1, 3).value = block.summary;
    ws.getCell(row + 1, 3).font = { ...FONT };
    ws.getCell(row + 1, 3).alignment = { horizontal: 'center', vertical: 'top' };

    for (let i = 0; i < block.legs.length && i < 4; i++) {
      const col = breakoutCols[i + 2];
      ws.getCell(row + 1, col).value = block.legs[i].serverSide;
      ws.getCell(row + 1, col).font = { ...FONT };
      ws.getCell(row + 1, col).alignment = { horizontal: 'center', vertical: 'top' };
    }

    for (const col of breakoutCols) {
      ws.getCell(row, col).border = { ...BLUE_BORDER };
      ws.getCell(row + 1, col).border = { ...BLUE_BORDER };
    }

    row += 3;
  }
  return row;
}

function writeServiceNodeSfp(ws: any, row: number, dataSwitches: { u: number; num: number }[], serviceNodeU: number, profile?: RackWireProfile): number {
  if (dataSwitches.length < 2) return row;
  const mlnx = profile?.mlnxRules;
  const dsLabel = dataSwitches.length > 0 ? getExcelId(findCompIdByRole('data-switch', profile) || 'SN3700V', profile) : 'SN3700V';
  const snLabel = getExcelId(findCompIdByRole('service-node', profile) || 'SR630_SERVICE', profile);
  ws.getRow(row).height = 27;
  ws.getRow(row + 1).height = 22.5;

  ws.getCell(row, 1).value = mlnx?.serviceNodeSfpCable.type || '10GB SFP Cable 1M';
  ws.getCell(row, 1).font = { ...FONT_BOLD };
  ws.getCell(row, 1).alignment = { horizontal: 'center' };
  ws.getCell(row + 1, 1).value = `PN:${mlnx?.serviceNodeSfpCable.partNumber || '01KL948 x2'}`;
  ws.getCell(row + 1, 1).font = { ...FONT_BOLD };
  ws.getCell(row + 1, 1).alignment = { horizontal: 'center', vertical: 'top' };

  const sw1U = dataSwitches[0].u;
  const sw2U = dataSwitches[1].u;
  const pairs = [
    { swU: sw1U, swNum: 1, port: 'C1-P1' },
    { swU: sw1U, swNum: 1, port: 'C1-P1' },
    { swU: sw2U, swNum: 2, port: 'C1-P2' },
    { swU: sw2U, swNum: 2, port: 'C1-P2' },
  ];
  const cols = [3, 5, 7, 9];
  for (let i = 0; i < pairs.length; i++) {
    ws.getCell(row, cols[i]).value = `U${pairs[i].swU}/${dsLabel} ${pairs[i].swNum}/P1`;
    ws.getCell(row, cols[i]).font = { ...FONT };
    ws.getCell(row, cols[i]).alignment = { horizontal: 'center' };
    ws.getCell(row + 1, cols[i]).value = `U${serviceNodeU}/${snLabel}/${pairs[i].port}`;
    ws.getCell(row + 1, cols[i]).font = { ...FONT };
    ws.getCell(row + 1, cols[i]).alignment = { horizontal: 'center', vertical: 'top' };
  }
  return row + 3;
}

function findCompIdByRole(role: string, profile?: RackWireProfile): string | undefined {
  if (profile) {
    for (const [id, comp] of Object.entries(profile.components)) {
      if (comp.role === role) return id;
    }
  }
  for (const [id, comp] of Object.entries(COMPONENTS)) {
    if (comp.role === role) return id;
  }
  return undefined;
}

function findComponentsByRole(rack: RackState, role: string, profile?: RackWireProfile): { u: number; instanceLabel: string; componentId: string }[] {
  const results: { u: number; instanceLabel: string; componentId: string }[] = [];
  for (let u = 1; u <= rack.slots.length; u++) {
    const slot = rack.slots[u - 1];
    if (!slot.componentId || slot.isPartOf3U) continue;
    const compRole = getCompRole(slot.componentId, profile);
    if (compRole === role) {
      results.push({ u, instanceLabel: slot.instanceLabel || '', componentId: slot.componentId });
    }
  }
  return results;
}

interface PduInfo {
  pduNum: number;
  u: number | null;
  isVertical: boolean;
  position: string;
}

function buildPduList(rack: RackState, profile?: RackWireProfile): PduInfo[] {
  const pdus: PduInfo[] = [];
  const vLabels = ['L1', 'R1', 'L2', 'R2'];
  for (let i = 0; i < 4; i++) {
    if (rack.verticalPDUs[i]) {
      pdus.push({ pduNum: i + 1, u: null, isVertical: true, position: vLabels[i] });
    }
  }
  let pduNum = 5;
  for (let u = 1; u <= rack.slots.length; u++) {
    const slot = rack.slots[u - 1];
    if (!slot.componentId) continue;
    const role = getCompRole(slot.componentId, profile);
    if (role === 'pdu') {
      pdus.push({ pduNum, u, isVertical: false, position: `U${u}` });
      pduNum++;
    }
  }
  return pdus;
}

function setCell(ws: any, r: number, c: number, val: string, bold = false) {
  const cell = ws.getCell(r, c);
  cell.value = val;
  cell.font = bold ? { ...FONT_BOLD } : { ...FONT };
  cell.alignment = { horizontal: 'center', vertical: 'top' };
  cell.border = { ...BLUE_BORDER };
}

function getEtnRules(gpuCount: number, profile?: RackWireProfile) {
  if (profile) {
    const rules = profile.etnRules;
    const findMatch = <T extends { condition: { gpuMin: number; gpuMax: number } }>(arr: T[]): T =>
      arr.find(r => gpuCount >= r.condition.gpuMin && gpuCount <= r.condition.gpuMax) || arr[0];

    const sw1H = findMatch(rules.sw1Header);
    const sw2H = findMatch(rules.sw2Header);
    const sw1S = findMatch(rules.sw1Short);
    const sw2S = findMatch(rules.sw2Short);
    const sw2SP = findMatch(rules.sw2ServerPort);
    const sw2SvcP = findMatch(rules.sw2ServicePorts);

    return {
      sw1Header: { type: sw1H.cableType, pn: sw1H.cablePn },
      sw2Header: { type: sw2H.cableType, pn: sw2H.cablePn },
      sw1Short: { type: sw1S.cableType, pn: sw1S.cablePn },
      sw2Short: { type: sw2S.cableType, pn: sw2S.cablePn },
      sw2ServerPort: sw2SP.value,
      sw2ServicePorts: { p33: sw2SvcP.p33, p35: sw2SvcP.p35 },
    };
  }

  const sw1Header = gpuCount === 4
    ? { type: '1.5M ETN BLUE', pn: '01AF039 ' }
    : { type: 'U2 ETN BLUE', pn: '01AF039 ' };

  const sw2Header = gpuCount === 4
    ? { type: '1.5M ETN BLUE', pn: '01AF039 ' }
    : { type: 'ETN Network Black', pn: '01AF054 ' };

  const sw1Short = { type: '1M ETN Blue', pn: '01KL931' };

  const sw2Short = gpuCount >= 3
    ? { type: '1M ETN Blue', pn: '01KL931' }
    : { type: '1M ETN Yellow', pn: '01KL755' };

  const sw2ServerPort = gpuCount >= 2 ? 'OCP-P1' : 'P1 IMM';

  const sw2ServicePorts = (gpuCount >= 2 && gpuCount <= 3)
    ? { p33: 'OCP-P1', p35: 'OCP-P3' }
    : { p33: 'P1 IMM', p35: 'P3 IMM' };

  return { sw1Header, sw2Header, sw1Short, sw2Short, sw2ServerPort, sw2ServicePorts };
}

function generateEtnItems(pool: PoolNode[], serviceNodes: { u: number; componentId: string }[], swNum: number, swU: number, gpuCount: number, mgmtSwitchLabel: string, sw2U?: number, profile?: RackWireProfile): GridItem[] {
  const items: GridItem[] = [];
  const rules = getEtnRules(gpuCount, profile);
  const mainCable = swNum === 1 ? rules.sw1Header : rules.sw2Header;
  const shortCable = swNum === 1 ? rules.sw1Short : rules.sw2Short;
  const serverPort = swNum === 1 ? 'MGMT' : rules.sw2ServerPort;

  items.push({ kind: 'header', cableType: mainCable.type, cablePn: mainCable.pn });

  let cableChanged = false;
  for (let i = 0; i < pool.length && i < 16; i++) {
    if (i === 8 && !cableChanged && pool.length > 8) {
      items.push({ kind: 'header', cableType: shortCable.type, cablePn: shortCable.pn });
      cableChanged = true;
    }
    const node = pool[i];
    const nodeLabel = `${getExcelId(node.type, profile)} ${node.instanceNum}`;
    const portNum = i + 1;
    const label: GridItem = {
      kind: 'label',
      switchSide: `U${swU}/${mgmtSwitchLabel} ${swNum}/P${portNum}`,
      serverSide: `U${node.u}/${nodeLabel}/${serverPort}`,
    };
    items.push(label, { ...label });
  }

  for (const sn of serviceNodes) {
    const snLabel = getExcelId(sn.componentId, profile);
    if (swNum === 1) {
      const mgmt: GridItem = { kind: 'label', switchSide: `U${swU}/${mgmtSwitchLabel} ${swNum}/P33`, serverSide: `U${sn.u}/${snLabel}/MGMT` };
      items.push(mgmt, { ...mgmt });
      const imm: GridItem = { kind: 'label', switchSide: `U${swU}/${mgmtSwitchLabel} ${swNum}/P35`, serverSide: `U${sn.u}/${snLabel}/P2 IMM` };
      items.push(imm, { ...imm });
    } else {
      const snSwU = sw2U || swU;
      const p33: GridItem = { kind: 'label', switchSide: `U${snSwU}/${mgmtSwitchLabel} 1/P33`, serverSide: `U${sn.u}/${snLabel}/${rules.sw2ServicePorts.p33}` };
      items.push(p33, { ...p33 });
      const p35: GridItem = { kind: 'label', switchSide: `U${snSwU}/${mgmtSwitchLabel} 1/P35`, serverSide: `U${sn.u}/${snLabel}/${rules.sw2ServicePorts.p35}` };
      items.push(p35, { ...p35 });
    }
  }

  return items;
}

function generateMlnxAocItems(pool: PoolNode[], swNum: number, swU: number, dataSwitchLabel: string, profile?: RackWireProfile): GridItem[] {
  const items: GridItem[] = [];
  const mlnx = profile?.mlnxRules;
  items.push({ kind: 'header', cableType: mlnx?.aocCable.type || 'QSFP28 (100Gb)', cablePn: mlnx?.aocCable.partNumber || '01FT722' });

  const portSuffix = swNum === 1 ? 'P1' : 'P2';
  const computeSlot = mlnx?.computeChassisSlot || 'C3';
  const gpuSlot = mlnx?.gpuChassisSlot || 'C15';
  for (let i = 0; i < pool.length && i < 16; i++) {
    const node = pool[i];
    const switchPort = i + 3;
    const nodeLabel = `${getExcelId(node.type, profile)} ${node.instanceNum}`;
    const compSize = getCompSize(node.type, profile);
    const chassisSlot = compSize > 1 ? gpuSlot : computeSlot;
    const label: GridItem = {
      kind: 'label',
      switchSide: `U${swU}/${dataSwitchLabel} ${swNum}/P${switchPort}`,
      serverSide: `U${node.u}/${nodeLabel}/${chassisSlot}-${portSuffix}`,
    };
    items.push(label, { ...label });
  }

  return items;
}

function generateBreakoutBlocks(pool: PoolNode[], swNum: number, swU: number, dataSwitchLabel: string, profile?: RackWireProfile): BreakoutBlock[] {
  const blocks: BreakoutBlock[] = [];
  const portSuffix = swNum === 1 ? 'P1' : 'P2';
  const mlnx = profile?.mlnxRules;
  const breakoutComputeSlot = mlnx?.breakoutComputeSlot || 'C1';
  const breakoutGpuSlot = mlnx?.breakoutGpuSlot || 'C20';

  for (let g = 0; g < Math.ceil(pool.length / 4) && g < 4; g++) {
    const group = pool.slice(g * 4, Math.min((g + 1) * 4, pool.length));
    if (group.length === 0) break;

    const switchPort = 23 + g;
    const firstU = group[0].u;
    const lastU = group[group.length - 1].u;
    const types = [...new Set(group.map(n => getExcelId(n.type, profile)))];
    const typeStr = types.length > 1 ? types.join(',') : types[0];
    const compSizes = [...new Set(group.map(n => getCompSize(n.type, profile)))];
    const slotStr = compSizes.length > 1 ? 'Cx' : (compSizes[0] > 1 ? breakoutGpuSlot : breakoutComputeSlot);
    const summary = `U${firstU}-U${lastU}/${typeStr} x/${slotStr}-${portSuffix}`;

    const legs = group.map((node, idx) => {
      const nodeLabel = `${getExcelId(node.type, profile)} ${node.instanceNum}`;
      const chassisSlot = getCompSize(node.type, profile) > 1 ? breakoutGpuSlot : breakoutComputeSlot;
      return {
        serverSide: `U${node.u}/${nodeLabel}/${chassisSlot}-${portSuffix}(${idx + 1})`,
      };
    });

    blocks.push({
      cableType: mlnx?.breakoutCable.type || 'QSFP28 (100Gb)',
      cablePn: mlnx?.breakoutCable.partNumber || '01FT739 x1',
      switchPort: `U${swU}/${dataSwitchLabel} ${swNum}/P${switchPort}`,
      summary,
      legs,
    });
  }
  return blocks;
}

function writeSwitchPduSheet(
  ws: any,
  rack: RackState,
  mgmtSwitches: { u: number; num: number; componentId: string }[],
  dataSwitches: { u: number; num: number; componentId: string }[],
  serviceNodes: { u: number; componentId: string }[],
  kvms: { u: number; componentId: string }[],
  profile?: RackWireProfile,
): void {
  const spdu = profile?.switchPduRules;
  const pdus = buildPduList(rack, profile);
  const oddPdus = pdus.filter(p => p.pduNum % 2 === 1);
  const evenPdus = pdus.filter(p => p.pduNum % 2 === 0);

  const mgmtLabel = mgmtSwitches.length > 0 ? getExcelId(mgmtSwitches[0].componentId, profile) : 'SN2201';
  const dsLabel = dataSwitches.length > 0 ? getExcelId(dataSwitches[0].componentId, profile) : 'SN3700V';
  const pduLabel = getExcelId(findCompIdByRole('pdu', profile) || 'PDU', profile);

  function pduLabelStr(pdu: PduInfo): string {
    return pdu.isVertical ? `${pdu.position}/${pduLabel} ${pdu.pduNum}/P1` : `U${pdu.u}/${pduLabel} ${pdu.pduNum}/P1`;
  }

  let row = 1;

  if (mgmtSwitches.length >= 1) {
    const sw1 = mgmtSwitches[0];
    ws.getRow(row).height = 29.25;
    ws.getRow(row + 1).height = 18.75;
    ws.getRow(row + 2).height = 99;
    setCell(ws, row, 1, spdu?.pduCable.type || 'CABLE Ethern \n3m Blue PDU', true);
    setCell(ws, row + 1, 1, `PN:${spdu?.pduCable.partNumber || '01AF040'}`, true);

    const oddPage1 = oddPdus.slice(0, 3);
    for (let i = 0; i < oddPage1.length; i++) {
      const port = 27 + i;
      const colA = LABEL_COLS[1 + i * 2];
      const colB = LABEL_COLS[2 + i * 2];
      if (colA) { setCell(ws, row, colA, `U${sw1.u}/${mgmtLabel} ${sw1.num}/P${port}`); setCell(ws, row + 1, colA, pduLabelStr(oddPage1[i])); }
      if (colB) { setCell(ws, row, colB, `U${sw1.u}/${mgmtLabel} ${sw1.num}/P${port}`); setCell(ws, row + 1, colB, pduLabelStr(oddPage1[i])); }
    }
    row += 3;

    const oddPage2 = oddPdus.slice(3, 6);
    if (oddPage2.length > 0) {
      ws.getRow(row).height = 27.75;
      ws.getRow(row + 1).height = 22.5;
      ws.getRow(row + 2).height = 104.25;
      for (let i = 0; i < oddPage2.length; i++) {
        const port = 30 + i;
        const colA = LABEL_COLS[1 + i * 2];
        const colB = LABEL_COLS[2 + i * 2];
        if (colA) { setCell(ws, row, colA, `U${sw1.u}/${mgmtLabel} ${sw1.num}/P${port}`); setCell(ws, row + 1, colA, pduLabelStr(oddPage2[i])); }
        if (colB) { setCell(ws, row, colB, `U${sw1.u}/${mgmtLabel} ${sw1.num}/P${port}`); setCell(ws, row + 1, colB, pduLabelStr(oddPage2[i])); }
      }
      row += 3;
    }
  }

  if (mgmtSwitches.length >= 2) {
    const sw2 = mgmtSwitches[1];
    ws.getRow(row).height = 24.75;
    ws.getRow(row + 1).height = 22.5;
    ws.getRow(row + 2).height = 91.5;
    setCell(ws, row, 1, spdu?.pduCable.type || 'CABLE Ethern \n3m Blue PDU', true);
    setCell(ws, row + 1, 1, `PN:${spdu?.pduCable.partNumber || '01AF040'}`, true);

    const evenPage1 = evenPdus.slice(0, 3);
    for (let i = 0; i < evenPage1.length; i++) {
      const port = 27 + i;
      const colA = LABEL_COLS[1 + i * 2];
      const colB = LABEL_COLS[2 + i * 2];
      if (colA) { setCell(ws, row, colA, `U${sw2.u}/${mgmtLabel} ${sw2.num}/P${port}`); setCell(ws, row + 1, colA, pduLabelStr(evenPage1[i])); }
      if (colB) { setCell(ws, row, colB, `U${sw2.u}/${mgmtLabel} ${sw2.num}/P${port}`); setCell(ws, row + 1, colB, pduLabelStr(evenPage1[i])); }
    }
    row += 3;

    const evenPage2 = evenPdus.slice(3, 6);
    if (evenPage2.length > 0) {
      ws.getRow(row).height = 27;
      ws.getRow(row + 1).height = 22.5;
      ws.getRow(row + 2).height = 91.5;
      for (let i = 0; i < evenPage2.length; i++) {
        const port = 30 + i;
        const colA = LABEL_COLS[1 + i * 2];
        const colB = LABEL_COLS[2 + i * 2];
        if (colA) { setCell(ws, row, colA, `U${sw2.u}/${mgmtLabel} ${sw2.num}/P${port}`); setCell(ws, row + 1, colA, pduLabelStr(evenPage2[i])); }
        if (colB) { setCell(ws, row, colB, `U${sw2.u}/${mgmtLabel} ${sw2.num}/P${port}`); setCell(ws, row + 1, colB, pduLabelStr(evenPage2[i])); }
      }
      row += 3;
    }
  }

  if (dataSwitches.length >= 1 && mgmtSwitches.length >= 2) {
    for (let i = 0; i < Math.min(2, dataSwitches.length); i++) {
      const sw3700 = dataSwitches[i];
      const snPort = 49 + i;
      ws.getRow(row).height = 27.75;
      ws.getRow(row + 1).height = 22.5;
      ws.getRow(row + 2).height = i === 0 ? 87 : 74.25;

      setCell(ws, row, 1, spdu?.sn3700vBreakoutCable.type || 'QSFP28 (100Gb)', true);
      setCell(ws, row + 1, 1, `PN:${spdu?.sn3700vBreakoutCable.partNumber || '03MT733 x1'}`, true);
      setCell(ws, row, 3, `U${sw3700.u}/${dsLabel} ${sw3700.num}/P2`);
      setCell(ws, row, 5, `U${sw3700.u}/${dsLabel} ${sw3700.num}/P2`);
      setCell(ws, row, 7, `U${sw3700.u}/${dsLabel} ${sw3700.num}/P2`);
      setCell(ws, row + 1, 3, `U${mgmtSwitches[0].u}-U${mgmtSwitches[1].u}/${mgmtLabel} ${mgmtSwitches[0].num}/P${snPort}`);
      setCell(ws, row + 1, 5, `U${mgmtSwitches[0].u}/${mgmtLabel} ${mgmtSwitches[0].num}/P${snPort}(A)`);
      setCell(ws, row + 1, 7, `U${mgmtSwitches[1].u}/${mgmtLabel} ${mgmtSwitches[1].num}/P${snPort}(B)`);
      row += 3;
    }
  }

  if (kvms.length > 0 && serviceNodes.length > 0) {
    const kvmU = kvms[0].u;
    const snU = serviceNodes[0].u;
    const kvmLabel = getExcelId(kvms[0].componentId, profile);
    const snLabel = spdu?.serviceNodeLabel || getExcelId(serviceNodes[0].componentId, profile);
    ws.getRow(row).height = 33.75;
    ws.getRow(row + 1).height = 22.5;
    ws.getRow(row + 2).height = 75.75;

    setCell(ws, row, 1, spdu?.kvmVideoCable || 'TF5 Video CBL', true);
    setCell(ws, row, 3, `U${kvmU}/${kvmLabel}/VIDEO`);
    setCell(ws, row, 5, `U${kvmU}/${kvmLabel}/VIDEO`);
    setCell(ws, row + 1, 3, `U${snU}/${snLabel}/video P1`);
    setCell(ws, row + 1, 5, `U${snU}/${snLabel}/video P1`);

    setCell(ws, row, 7, spdu?.kvmUsbCable || 'TF5 USB CBL', true);
    setCell(ws, row, 9, `U${kvmU}/${kvmLabel}/USB`);
    setCell(ws, row, 11, `U${kvmU}/${kvmLabel}/USB`);
    setCell(ws, row + 1, 9, `U${snU}/${snLabel}/USB P1`);
    setCell(ws, row + 1, 11, `U${snU}/${snLabel}/USB P1`);

    row += 3;
  }

  const hPdus = pdus.filter(p => !p.isVertical);
  if (hPdus.length > 0 && mgmtSwitches.length >= 2) {
    ws.getRow(row).height = 30;
    ws.getRow(row + 1).height = 19.5;
    ws.getRow(row + 2).height = 81;
    setCell(ws, row, 1, spdu?.pduCable.type || 'CABLE Ethern \n3m Blue PDU', true);
    setCell(ws, row + 1, 1, `PN:${spdu?.pduCable.partNumber || '01AF040'}`, true);

    const pairs: { swSide: string; pduSide: string }[] = [];
    for (const pdu of hPdus) {
      const swIdx = (pdu.pduNum % 2 === 1) ? 0 : 1;
      const sw = mgmtSwitches[swIdx];
      const port = 27 + Math.floor((pdu.pduNum - 1) / 2);
      pairs.push({
        swSide: `U${sw.u}/${mgmtLabel} ${sw.num}/P${port}`,
        pduSide: pduLabelStr(pdu),
      });
    }

    let ci = 1;
    let blockRow = row;
    for (let i = 0; i < pairs.length; i++) {
      const col = LABEL_COLS[ci];
      if (!col) break;
      setCell(ws, blockRow, col, pairs[i].swSide);
      setCell(ws, blockRow + 1, col, pairs[i].pduSide);
      ci++;
      if (ci < LABEL_COLS.length) {
        setCell(ws, blockRow, LABEL_COLS[ci], pairs[i].swSide);
        setCell(ws, blockRow + 1, LABEL_COLS[ci], pairs[i].pduSide);
        ci++;
      }
      if (ci >= LABEL_COLS.length) {
        blockRow += 3;
        ws.getRow(blockRow).height = 40.5;
        ws.getRow(blockRow + 1).height = 22.5;
        ws.getRow(blockRow + 2).height = 117;
        ci = 0;
      }
    }
    if (ci > 0 && ci < LABEL_COLS.length) {
      row = blockRow + 3;
    } else {
      row = blockRow;
    }
  }

  if (mgmtSwitches.length >= 2) {
    ws.getRow(row).height = 22.5;
    ws.getRow(row + 1).height = 22.5;
    ws.getRow(row + 2).height = 78.95;
    setCell(ws, row, 1, spdu?.sn2201InterLink.type || 'QSFP28 (100Gb) 0.5m', true);
    setCell(ws, row + 1, 1, `PN:${spdu?.sn2201InterLink.partNumber || '01FT718 x2'}`, true);
    for (let i = 0; i < 2; i++) {
      const port = 51 + i;
      const colA = LABEL_COLS[1 + i * 2];
      const colB = LABEL_COLS[2 + i * 2];
      setCell(ws, row, colA, `U${mgmtSwitches[0].u}/${mgmtLabel} ${mgmtSwitches[0].num}/P${port}`);
      setCell(ws, row, colB, `U${mgmtSwitches[0].u}/${mgmtLabel} ${mgmtSwitches[0].num}/P${port}`);
      setCell(ws, row + 1, colA, `U${mgmtSwitches[1].u}/${mgmtLabel} ${mgmtSwitches[1].num}/${port}`);
      setCell(ws, row + 1, colB, `U${mgmtSwitches[1].u}/${mgmtLabel} ${mgmtSwitches[1].num}/${port}`);
    }
    row += 3;
  }

  if (mgmtSwitches.length >= 2 && dataSwitches.length >= 2) {
    ws.getRow(row).height = 22.5;
    ws.getRow(row + 1).height = 22.5;
    ws.getRow(row + 2).height = 83.1;
    setCell(ws, row, 1, spdu?.greenEtnCable.type || 'GREEN ETN 0.6M', true);
    setCell(ws, row + 1, 1, `PN:${spdu?.greenEtnCable.partNumber || '01AF210x1'}`, true);
    setCell(ws, row, 3, `U${mgmtSwitches[0].u}/${mgmtLabel} ${mgmtSwitches[0].num}/MGMT`);
    setCell(ws, row, 5, `U${mgmtSwitches[0].u}/${mgmtLabel} ${mgmtSwitches[0].num}/MGMT`);
    setCell(ws, row, 7, `U${dataSwitches[0].u}/${dsLabel} ${dataSwitches[0].num}/MGMT`);
    setCell(ws, row, 9, `U${dataSwitches[0].u}/${dsLabel} ${dataSwitches[0].num}/MGMT`);
    setCell(ws, row + 1, 3, `U${mgmtSwitches[1].u}/${mgmtLabel} ${mgmtSwitches[1].num}/MGMT`);
    setCell(ws, row + 1, 5, `U${mgmtSwitches[1].u}/${mgmtLabel} ${mgmtSwitches[1].num}/MGMT`);
    setCell(ws, row + 1, 7, `U${dataSwitches[1].u}/${dsLabel} ${dataSwitches[1].num}/MGMT`);
    setCell(ws, row + 1, 9, `U${dataSwitches[1].u}/${dsLabel} ${dataSwitches[1].num}/MGMT`);
    row += 3;
  }

  if (dataSwitches.length >= 2) {
    ws.getRow(row).height = 22.5;
    ws.getRow(row + 1).height = 22.5;
    ws.getRow(row + 2).height = 78.95;
    setCell(ws, row, 1, spdu?.sn3700vInterLink.type || 'QSFP28 (100Gb) 0.5m', true);
    setCell(ws, row + 1, 1, `PN:${spdu?.sn3700vInterLink.partNumber || '01FT718 x2'}`, true);
    for (let i = 0; i < 2; i++) {
      const port = 29 + i;
      const colA = LABEL_COLS[1 + i * 2];
      const colB = LABEL_COLS[2 + i * 2];
      setCell(ws, row, colA, `U${dataSwitches[0].u}/${dsLabel} ${dataSwitches[0].num}/P${port}`);
      setCell(ws, row, colB, `U${dataSwitches[0].u}/${dsLabel} ${dataSwitches[0].num}/P${port}`);
      setCell(ws, row + 1, colA, `U${dataSwitches[1].u}/${dsLabel} ${dataSwitches[1].num}/P${port}`);
      setCell(ws, row + 1, colB, `U${dataSwitches[1].u}/${dsLabel} ${dataSwitches[1].num}/P${port}`);
    }
    row += 3;
  }

  while (row <= 39) {
    ws.getRow(row).height = 22.5;
    ws.getRow(row + 1).height = 22.5;
    ws.getRow(row + 2).height = 54;
    row += 3;
  }

  ws.getRow(row).height = 22.5;
  ws.getCell(row, 11).value = 'PN: ';
  ws.getCell(row, 11).font = { ...FONT };
  ws.getRow(row + 1).height = 22.5;
  ws.getCell(row + 1, 11).value = 'EC: ';
  ws.getCell(row + 1, 11).font = { ...FONT };
  ws.getRow(row + 2).height = 75.75;
}

export async function exportToExcel(cables: CableRow[], rack: RackState, projectName: string, profile?: RackWireProfile) {
  const p = profile || createDefaultProfile();
  const comps = getProfileComponents(p);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RackWire';

  const ws1 = wb.addWorksheet(p.excelSheets.find(s => s.id === 'labels-p2p')?.name || 'Labels (P2P)');
  const headers = [
    'From U-Location', 'From Component', 'From Port',
    'To U-Location', 'To Component', 'To Chassis',
    'To Port', 'To Port Type', 'To Transceiver',
    'Cable Description', 'Cable P/N',
    'From Transceiver', 'From Port Type'
  ];

  const headerRow = ws1.addRow(headers);
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2838' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF546E7A' } },
      bottom: { style: 'medium', color: { argb: 'FF37474F' } },
      left: { style: 'thin', color: { argb: 'FF546E7A' } },
      right: { style: 'thin', color: { argb: 'FF546E7A' } },
    };
  });

  ws1.columns = [
    { width: 14 }, { width: 28 }, { width: 10 },
    { width: 14 }, { width: 28 }, { width: 10 },
    { width: 12 }, { width: 12 }, { width: 14 },
    { width: 36 }, { width: 14 },
    { width: 14 }, { width: 12 },
  ];

  for (const cable of cables) {
    if (cable.isSectionHeader) {
      const cat = getCableCategory({ ...cable, isSectionHeader: false }, p);
      const colors = COLOR_CATEGORIES[cat] || COLOR_CATEGORIES.fixed;
      const sectionRow = ws1.addRow([cable.cableDescription]);
      ws1.mergeCells(sectionRow.number, 1, sectionRow.number, 13);
      sectionRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      sectionRow.getCell(1).fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: colors.header },
      };
      sectionRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      continue;
    }

    const cat = getCableCategory(cable, p);
    const colors = COLOR_CATEGORIES[cat];

    const row = ws1.addRow([
      cable.fromULoc, cable.fromComponent, cable.fromPort,
      cable.toULoc, cable.toComponent, cable.toChassis,
      cable.toPort, cable.toPortType, cable.toTransceiver,
      cable.cableDescription, cable.cablePn,
      cable.fromTransceiver, cable.fromPortType,
    ]);

    row.eachCell((cell: any) => {
      cell.font = { size: 9, color: { argb: colors.text } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } };
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'hair', color: { argb: 'FFE0E0E0' } },
        left: { style: 'hair', color: { argb: 'FFE0E0E0' } },
        right: { style: 'hair', color: { argb: 'FFE0E0E0' } },
      };
      cell.alignment = { vertical: 'middle' };
    });
  }

  addColorLegend(ws1, 15, 1);

  const sheetNames = {
    p2p: p.excelSheets.find(s => s.id === 'labels-p2p')?.name || 'Labels (P2P)',
    layout: p.excelSheets.find(s => s.id === 'server-layout')?.name || 'Server Layout',
    etn: p.excelSheets.find(s => s.id === 'etn-ntw')?.name || 'ETN NTW',
    spdu: p.excelSheets.find(s => s.id === 'switch-pdu')?.name || 'Switch&PDU',
    mlnx: p.excelSheets.find(s => s.id === 'mlnx-100gb')?.name || 'MLNX 100GB',
  };

  const ws2 = wb.addWorksheet(sheetNames.layout);
  ws2.columns = [{ width: 12 }, { width: 44 }];

  const layoutHeader = ws2.addRow(['U Position', 'Component']);
  layoutHeader.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2838' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const processedUs = new Set<number>();
  const rackLen = rack.slots.length;
  for (let u = rackLen; u >= 1; u--) {
    if (processedUs.has(u)) continue;
    const slot = rack.slots[u - 1];
    const compId = slot.componentId;
    if (slot.isPartOf3U) continue;

    const comp = compId ? comps[compId] : null;
    const color = comp ? hexToArgb(comp.color) : 'FF1a1a2e';
    const label = slot.instanceLabel || (compId ? comp?.name : 'Empty');
    const compSize = compId ? getCompSize(compId, p) : 1;

    if (compSize > 1) {
      const baseU = u;
      for (let i = 0; i < compSize; i++) processedUs.add(baseU + i);
      const startRow = ws2.rowCount + 1;
      for (let subU = baseU + compSize - 1; subU >= baseU; subU--) {
        const row = ws2.addRow([`U${subU}`, subU === baseU + Math.floor(compSize / 2) ? label : '']);
        row.eachCell((cell: any) => {
          cell.font = { color: { argb: 'FFFFFFFF' }, size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
      }
      const endRow = ws2.rowCount;
      if (endRow > startRow) ws2.mergeCells(startRow, 2, endRow, 2);
    } else {
      processedUs.add(u);
      const row = ws2.addRow([`U${u}`, label]);
      row.eachCell((cell: any) => {
        cell.font = { color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    }
  }

  const pool = buildNodePool(rack, p);
  const mgmtSwitches = findComponentsByRole(rack, 'mgmt-switch', p).map((c, i) => ({ ...c, num: i + 1 }));
  const dataSwitches = findComponentsByRole(rack, 'data-switch', p).map((c, i) => ({ ...c, num: i + 1 }));
  const serviceNodes = findComponentsByRole(rack, 'service-node', p);
  const kvms = findComponentsByRole(rack, 'kvm', p);

  const gpuCount = pool.filter(n => getCompSize(n.type, p) > 1).length;

  const mgmtLabel = mgmtSwitches.length > 0 ? getExcelId(mgmtSwitches[0].componentId, p) : 'SN2201';
  const dsLabel = dataSwitches.length > 0 ? getExcelId(dataSwitches[0].componentId, p) : 'SN3700V';

  if (pool.length > 0 && mgmtSwitches.length >= 1) {
    const wsEtn = wb.addWorksheet(sheetNames.etn);
    setupLabelColumns(wsEtn);

    const sw1Items = generateEtnItems(pool, serviceNodes, 1, mgmtSwitches[0].u, gpuCount, mgmtLabel, undefined, p);
    let etnRow = writeStandardPage(wsEtn, 1, sw1Items);
    etnRow = writeFooter(wsEtn, etnRow);

    if (mgmtSwitches.length >= 2) {
      const sw2Items = generateEtnItems(pool, serviceNodes, 2, mgmtSwitches[1].u, gpuCount, mgmtLabel, mgmtSwitches[1].u, p);
      etnRow = writeStandardPage(wsEtn, etnRow, sw2Items);
      writeFooter(wsEtn, etnRow);
    }
  }

  const wsSpdu = wb.addWorksheet(sheetNames.spdu);
  setupLabelColumns(wsSpdu);
  writeSwitchPduSheet(wsSpdu, rack, mgmtSwitches, dataSwitches, serviceNodes, kvms, p);

  if (pool.length > 0 && dataSwitches.length >= 1) {
    const wsMlnx = wb.addWorksheet(sheetNames.mlnx);
    setupLabelColumns(wsMlnx);

    const sw1AocItems = generateMlnxAocItems(pool, 1, dataSwitches[0].u, dsLabel, p);
    let mlnxRow = writeStandardPage(wsMlnx, 1, sw1AocItems);
    mlnxRow = writeFooter(wsMlnx, mlnxRow);

    if (dataSwitches.length >= 2) {
      const sw2AocItems = generateMlnxAocItems(pool, 2, dataSwitches[1].u, dsLabel, p);
      mlnxRow = writeStandardPage(wsMlnx, mlnxRow, sw2AocItems);
      mlnxRow = writeFooter(wsMlnx, mlnxRow);
    }

    const sw1Breakout = generateBreakoutBlocks(pool, 1, dataSwitches[0].u, dsLabel, p);
    mlnxRow = writeBreakoutBlocks(wsMlnx, mlnxRow, sw1Breakout);

    if (serviceNodes.length > 0) {
      mlnxRow = writeServiceNodeSfp(wsMlnx, mlnxRow, dataSwitches, serviceNodes[0].u, p);
    }
    mlnxRow = writeFooter(wsMlnx, mlnxRow);

    if (dataSwitches.length >= 2) {
      const sw2Breakout = generateBreakoutBlocks(pool, 2, dataSwitches[1].u, dsLabel, p);
      mlnxRow = writeBreakoutBlocks(wsMlnx, mlnxRow, sw2Breakout);
      writeFooter(wsMlnx, mlnxRow);
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}_RackWire.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
