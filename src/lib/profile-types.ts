export type ComponentRole = 'data-switch' | 'mgmt-switch' | 'pool-server' | 'service-node' | 'kvm' | 'pdu' | 'filler';

export interface ComponentDef {
  id: string;
  name: string;
  excelId?: string;
  size: number;
  maxQty: number;
  color: string;
  category: 'switch' | 'server' | 'infrastructure' | 'filler';
  role?: ComponentRole;
  ports: PortDef[];
}

export interface PortDef {
  id: string;
  name: string;
  type: string;
  count: number;
}

export type SheetTarget = 'etn-ntw' | 'switch-pdu' | 'mlnx-100gb';

export interface CableDef {
  id: string;
  name: string;
  excelId?: string;
  partNumber: string;
  connectorType: string;
  isBreakout: boolean;
  splitCount?: number;
  transceiver?: string;
  sheetTarget?: SheetTarget;
}

export interface PresetLayout {
  gpuCount: number;
  label: string;
  placements: { u: number; componentId: string }[];
}

export interface ConnectionRule {
  id: string;
  fromComponent: string;
  fromPort: string;
  toComponent: string;
  toPort: string;
  cableId?: string;
  cableType: string;
  cablePN: string;
  portType: string;
  transceiver: string;
  splitCount?: number;
}

export interface ExcelSheetConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  footerPN: string;
  footerEC: string;
}

export interface RackWireProfile {
  id: string;
  name: string;
  version: string;
  createdAt: string;
  lastModified: string;
  isBuiltIn: boolean;
  rackSize: number;
  components: Record<string, ComponentDef>;
  cables: Record<string, CableDef>;
  fixedPlacements: { u: number; componentId: string }[];
  presets: PresetLayout[];
  connectionRules: ConnectionRule[];
  excelSheets: ExcelSheetConfig[];
  etnRules: EtnRuleSet;
  mlnxRules: MlnxRuleSet;
  switchPduRules: SwitchPduRuleSet;
}

export interface EtnRuleSet {
  sw1Header: ConditionalCable[];
  sw2Header: ConditionalCable[];
  sw1Short: ConditionalCable[];
  sw2Short: ConditionalCable[];
  sw2ServerPort: ConditionalValue[];
  sw2ServicePorts: ConditionalServicePorts[];
}

export interface ConditionalCable {
  condition: { gpuMin: number; gpuMax: number };
  cableType: string;
  cablePn: string;
}

export interface ConditionalValue {
  condition: { gpuMin: number; gpuMax: number };
  value: string;
}

export interface ConditionalServicePorts {
  condition: { gpuMin: number; gpuMax: number };
  p33: string;
  p35: string;
}

export interface MlnxRuleSet {
  aocCable: CableSpec;
  gpuAocCable: CableSpec;
  breakoutCable: CableSpec;
  serviceNodeSfpCable: CableSpec;
  computeChassisSlot: string;
  gpuChassisSlot: string;
  breakoutComputeSlot: string;
  breakoutGpuSlot: string;
}

export interface CableSpec {
  type: string;
  partNumber: string;
  description: string;
}

export interface SwitchPduRuleSet {
  pduCable: CableSpec;
  sn2201InterLink: CableSpec;
  sn3700vInterLink: CableSpec;
  greenEtnCable: CableSpec;
  sn3700vBreakoutCable: CableSpec;
  kvmVideoCable: string;
  kvmUsbCable: string;
  serviceNodeLabel: string;
}
