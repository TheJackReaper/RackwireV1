import { useState, useCallback, useEffect } from 'react';
import {
  COMPONENTS, PRESETS, applyPreset, createEmptyRack, assignInstanceLabels, generateCables,
  getComponentCount, loadProjects, saveProjects, createProject,
  getProfileComponents, getProfilePresets, getCompSize, getCompRole,
  type Project, type RackState, type CableRow, type RackSlot,
} from './lib/rackwire-data';
import { exportToExcel } from './lib/excel-export';
import { loadProfiles } from './lib/profile-store';
import type { RackWireProfile } from './lib/profile-types';
import ConfigurationPage from './components/ConfigurationPage';

function resolveProfile(profileId?: string): RackWireProfile | undefined {
  if (!profileId) return undefined;
  const profiles = loadProfiles();
  return profiles.find(p => p.id === profileId);
}

function App() {
  const [screen, setScreen] = useState<'home' | 'builder' | 'cables' | 'config'>('home');
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [activeProfile, setActiveProfile] = useState<RackWireProfile | undefined>(undefined);
  const [cables, setCables] = useState<CableRow[]>([]);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState('fusion-hci-gen2');

  useEffect(() => { saveProjects(projects); }, [projects]);

  const openProject = useCallback((p: Project) => {
    setCurrentProject(p);
    setActiveProfile(resolveProfile(p.profileId));
    setScreen('builder');
    setSelectedComponent(null);
    setCables([]);
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleCreateProject = useCallback(() => {
    if (!newProjectName.trim()) return;
    const profiles = loadProfiles();
    const profile = profiles.find(p => p.id === selectedProfileId) || profiles[0];
    const p = createProject(newProjectName.trim(), profile);
    p.profileId = profile.id;
    p.profileName = profile.name;
    p.profileVersion = profile.version;
    setProjects(prev => [...prev, p]);
    setNewProjectName('');
    setShowNewModal(false);
    setSelectedProfileId('fusion-hci-gen2');
    openProject(p);
  }, [newProjectName, selectedProfileId, openProject]);

  const updateCurrentProject = useCallback((updater: (p: Project) => Project) => {
    setCurrentProject(prev => {
      if (!prev) return prev;
      const updated = updater(prev);
      updated.lastModified = new Date().toISOString();
      setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
      return updated;
    });
  }, []);

  const handlePreset = useCallback((gpuCount: number) => {
    updateCurrentProject(p => ({ ...p, rack: applyPreset(gpuCount, activeProfile), gpuPreset: gpuCount }));
    setCables([]);
  }, [updateCurrentProject, activeProfile]);

  const handleClearRack = useCallback(() => {
    updateCurrentProject(p => ({ ...p, rack: createEmptyRack(activeProfile), gpuPreset: -1 }));
    setCables([]);
    setSelectedComponent(null);
  }, [updateCurrentProject, activeProfile]);

  const handleSlotClick = useCallback((u: number) => {
    if (!selectedComponent || !currentProject) return;
    if (u === 1) return;

    const comps = getProfileComponents(activeProfile);
    const rack = { ...currentProject.rack, slots: currentProject.rack.slots.map(s => ({ ...s })) };
    const comp = comps[selectedComponent];
    if (!comp) return;

    const count = getComponentCount(rack, selectedComponent, activeProfile);
    if (count >= comp.maxQty) return;

    const rackSize = rack.slots.length;
    if (comp.size > 1) {
      if (u + comp.size - 1 > rackSize) return;
      for (let i = 0; i < comp.size; i++) {
        const s = rack.slots[u - 1 + i];
        if (s.componentId && s.componentId !== 'FILLER') return;
      }
      rack.slots[u - 1] = { u, componentId: selectedComponent };
      for (let i = 1; i < comp.size; i++) {
        rack.slots[u - 1 + i] = { u: u + i, componentId: selectedComponent, isPartOf3U: u };
      }
    } else {
      const slot = rack.slots[u - 1];
      if (slot.componentId && slot.componentId !== 'FILLER') return;
      rack.slots[u - 1] = { u, componentId: selectedComponent };
    }

    assignInstanceLabels(rack, activeProfile);
    updateCurrentProject(p => ({ ...p, rack }));
    setCables([]);
  }, [selectedComponent, currentProject, updateCurrentProject, activeProfile]);

  const handleAutoPlace = useCallback((componentId: string) => {
    if (!currentProject) return;
    const comps = getProfileComponents(activeProfile);
    const comp = comps[componentId];
    if (!comp) return;

    const rack = { ...currentProject.rack, slots: currentProject.rack.slots.map(s => ({ ...s })) };
    const count = getComponentCount(rack, componentId, activeProfile);
    if (count >= comp.maxQty) return;

    let placed = false;
    const rackSize = rack.slots.length;
    for (let u = 2; u <= rackSize; u++) {
      if (comp.size > 1) {
        if (u + comp.size - 1 > rackSize) continue;
        let canPlace = true;
        for (let i = 0; i < comp.size; i++) {
          const s = rack.slots[u - 1 + i];
          if (s.componentId) { canPlace = false; break; }
        }
        if (!canPlace) continue;
        rack.slots[u - 1] = { u, componentId: componentId };
        for (let i = 1; i < comp.size; i++) {
          rack.slots[u - 1 + i] = { u: u + i, componentId: componentId, isPartOf3U: u };
        }
        placed = true;
        break;
      } else {
        const slot = rack.slots[u - 1];
        if (slot.componentId) continue;
        rack.slots[u - 1] = { u, componentId: componentId };
        placed = true;
        break;
      }
    }

    if (placed) {
      assignInstanceLabels(rack, activeProfile);
      updateCurrentProject(p => ({ ...p, rack }));
      setCables([]);
    }
  }, [currentProject, updateCurrentProject, activeProfile]);

  const handleRemoveSlot = useCallback((u: number) => {
    if (!currentProject || u === 1) return;
    const rack = { ...currentProject.rack, slots: currentProject.rack.slots.map(s => ({ ...s })) };
    const slot = rack.slots[u - 1];
    if (!slot.componentId) return;

    if (slot.isPartOf3U) {
      const base = slot.isPartOf3U;
      for (let i = 0; i < 3; i++) {
        rack.slots[base - 1 + i] = { u: base + i, componentId: null };
      }
    } else {
      const compSize = getCompSize(slot.componentId, activeProfile);
      if (compSize > 1) {
        for (let i = 0; i < compSize; i++) {
          rack.slots[u - 1 + i] = { u: u + i, componentId: null };
        }
      } else {
        rack.slots[u - 1] = { u, componentId: null };
      }
    }

    assignInstanceLabels(rack, activeProfile);
    updateCurrentProject(p => ({ ...p, rack }));
    setCables([]);
  }, [currentProject, updateCurrentProject, activeProfile]);

  const handleToggleVPDU = useCallback((idx: number) => {
    if (!currentProject) return;
    const rack = {
      ...currentProject.rack,
      slots: currentProject.rack.slots.map(s => ({ ...s })),
      verticalPDUs: [...currentProject.rack.verticalPDUs] as [boolean, boolean, boolean, boolean],
    };
    rack.verticalPDUs[idx] = !rack.verticalPDUs[idx];
    const pduComp = getProfileComponents(activeProfile);
    const pduId = Object.keys(pduComp).find(k => pduComp[k]?.role === 'pdu') || 'PDU';
    const totalPDUs = getComponentCount(rack, pduId, activeProfile);
    if (totalPDUs > (pduComp[pduId]?.maxQty || 12)) {
      rack.verticalPDUs[idx] = false;
      return;
    }
    assignInstanceLabels(rack, activeProfile);
    updateCurrentProject(p => ({ ...p, rack }));
    setCables([]);
  }, [currentProject, updateCurrentProject, activeProfile]);

  const handleGenerateCables = useCallback(() => {
    if (!currentProject) return;
    const c = generateCables(currentProject.rack, activeProfile);
    setCables(c);
    setScreen('cables');
  }, [currentProject, activeProfile]);

  const handleExport = useCallback(async () => {
    if (!currentProject) return;
    const c = cables.length > 0 ? cables : generateCables(currentProject.rack, activeProfile);
    await exportToExcel(c, currentProject.rack, currentProject.name, activeProfile);
  }, [currentProject, cables, activeProfile]);

  if (screen === 'home') {
    return <HomeScreen
      projects={projects}
      onOpen={openProject}
      onDelete={deleteProject}
      showNewModal={showNewModal}
      setShowNewModal={setShowNewModal}
      newProjectName={newProjectName}
      setNewProjectName={setNewProjectName}
      onCreateProject={handleCreateProject}
      onOpenConfig={() => setScreen('config')}
      selectedProfileId={selectedProfileId}
      setSelectedProfileId={setSelectedProfileId}
    />;
  }

  if (screen === 'config') {
    return <ConfigurationPage onBack={() => setScreen('home')} />;
  }

  if (screen === 'cables') {
    return <CableMapScreen
      cables={cables}
      projectName={currentProject?.name || ''}
      onBack={() => setScreen('builder')}
      onExport={handleExport}
    />;
  }

  return <BuilderScreen
    project={currentProject!}
    profile={activeProfile}
    selectedComponent={selectedComponent}
    onSelectComponent={setSelectedComponent}
    onAutoPlace={handleAutoPlace}
    onSlotClick={handleSlotClick}
    onRemoveSlot={handleRemoveSlot}
    onToggleVPDU={handleToggleVPDU}
    onPreset={handlePreset}
    onClearRack={handleClearRack}
    onGenerateCables={handleGenerateCables}
    onExport={handleExport}
    onHome={() => { setScreen('home'); setCurrentProject(null); setCables([]); }}
  />;
}

function HomeScreen({ projects, onOpen, onDelete, showNewModal, setShowNewModal, newProjectName, setNewProjectName, onCreateProject, onOpenConfig, selectedProfileId, setSelectedProfileId }: {
  projects: Project[];
  onOpen: (p: Project) => void;
  onDelete: (id: string) => void;
  showNewModal: boolean;
  setShowNewModal: (v: boolean) => void;
  newProjectName: string;
  setNewProjectName: (v: string) => void;
  onCreateProject: () => void;
  onOpenConfig: () => void;
  selectedProfileId: string;
  setSelectedProfileId: (id: string) => void;
}) {
  const profiles = loadProfiles();
  return (
    <div className="min-h-screen flex flex-col items-center p-8" style={{ background: '#0a0f1a' }}>
      <div className="w-full max-w-3xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
            <span style={{ color: '#0078d4' }}>Rack</span>Wire
          </h1>
          <p className="text-sm" style={{ color: '#94a3b8' }}>
            Lenovo Fusion Rack Layout & Cable Label Generator
          </p>
        </div>

        <div className="flex justify-center gap-3 mb-8">
          <button
            onClick={() => setShowNewModal(true)}
            className="px-6 py-3 rounded-lg font-semibold text-white transition-all hover:brightness-110"
            style={{ background: '#0078d4' }}
          >
            + New Project
          </button>
          <button
            onClick={onOpenConfig}
            className="px-6 py-3 rounded-lg font-semibold transition-all hover:brightness-110"
            style={{ color: '#94a3b8', border: '1px solid #334155' }}
          >
            Configuration
          </button>
        </div>

        {showNewModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="rounded-xl p-6 w-96" style={{ background: '#111827', border: '1px solid #1e293b' }}>
              <h2 className="text-lg font-semibold text-white mb-4">New Project</h2>
              <input
                type="text"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onCreateProject()}
                placeholder="Project name..."
                className="w-full px-4 py-2.5 rounded-lg text-white mb-3 outline-none"
                style={{ background: '#1e293b', border: '1px solid #334155' }}
                autoFocus
              />
              <div className="mb-4">
                <label className="text-xs mb-1.5 block" style={{ color: '#64748b' }}>RackWire Version</label>
                <select
                  value={selectedProfileId}
                  onChange={e => setSelectedProfileId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                  style={{ background: '#1e293b', border: '1px solid #334155' }}
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name} v{p.version}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setShowNewModal(false); setNewProjectName(''); }}
                  className="px-4 py-2 rounded-lg text-sm"
                  style={{ color: '#94a3b8', border: '1px solid #334155' }}
                >
                  Cancel
                </button>
                <button
                  onClick={onCreateProject}
                  className="px-4 py-2 rounded-lg text-white font-semibold text-sm hover:brightness-110"
                  style={{ background: '#0078d4' }}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="text-center py-16" style={{ color: '#64748b' }}>
            <p className="text-lg mb-2">No projects yet</p>
            <p className="text-sm">Create a new project to get started</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {projects.map(p => {
              const currentProfile = p.profileId ? profiles.find(pr => pr.id === p.profileId) : null;
              const isOutdated = currentProfile && p.profileVersion && currentProfile.version !== p.profileVersion;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-5 py-4 rounded-lg cursor-pointer transition-all hover:brightness-110"
                  style={{ background: '#111827', border: '1px solid #1e293b' }}
                  onClick={() => onOpen(p)}
                >
                  <div>
                    <div className="text-white font-medium flex items-center gap-2">
                      {p.name}
                      {isOutdated && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: '#fbbf2422', color: '#fbbf24', border: '1px solid #fbbf2444' }}>
                          Outdated v{p.profileVersion}
                        </span>
                      )}
                    </div>
                    <div className="text-xs mt-1" style={{ color: '#64748b' }}>
                      Created {new Date(p.createdAt).toLocaleDateString()} &middot; Modified {new Date(p.lastModified).toLocaleDateString()}
                      &middot; {PRESETS[p.gpuPreset]?.label || getProfilePresets(profiles.find(pr => pr.id === p.profileId)).find(pp => pp.gpuCount === p.gpuPreset)?.label || 'Custom'}
                      {p.profileName && (
                        <span> &middot; {p.profileName} v{p.profileVersion || '1.0'}{isOutdated ? ` (current: v${currentProfile!.version})` : ''}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(p.id); }}
                    className="px-3 py-1.5 rounded text-xs font-medium hover:brightness-125 transition-all"
                    style={{ color: '#ef4444', border: '1px solid #ef444444' }}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function BuilderScreen({ project, profile, selectedComponent, onSelectComponent, onAutoPlace, onSlotClick, onRemoveSlot, onToggleVPDU, onPreset, onClearRack, onGenerateCables, onExport, onHome }: {
  project: Project;
  profile?: RackWireProfile;
  selectedComponent: string | null;
  onSelectComponent: (id: string | null) => void;
  onAutoPlace: (componentId: string) => void;
  onSlotClick: (u: number) => void;
  onRemoveSlot: (u: number) => void;
  onToggleVPDU: (idx: number) => void;
  onPreset: (gpu: number) => void;
  onClearRack: () => void;
  onGenerateCables: () => void;
  onExport: () => void;
  onHome: () => void;
}) {
  const comps = getProfileComponents(profile);
  const presets = getProfilePresets(profile);
  const paletteItems = Object.keys(comps).filter(id => id !== 'RESERVE');

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0f1a' }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #1e293b' }}>
        <div className="flex items-center gap-4">
          <button onClick={onHome} className="text-sm px-3 py-1.5 rounded transition-all hover:brightness-125" style={{ color: '#0078d4', border: '1px solid #0078d444' }}>
            &larr; Home
          </button>
          <h1 className="text-white font-semibold text-lg">{project.name} <span className="text-sm font-normal" style={{ color: '#64748b' }}>Build</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onGenerateCables} className="px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition-all" style={{ background: '#10b981', color: '#fff' }}>
            Generate Cables
          </button>
          <button onClick={onExport} className="px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition-all" style={{ background: '#10b981', color: '#fff' }}>
            Export XLSX
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 flex-shrink-0 overflow-y-auto p-4" style={{ borderRight: '1px solid #1e293b' }}>
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: '#64748b', letterSpacing: '0.05em' }}>Presets</h3>
          <div className="grid gap-1.5 mb-5">
            {presets.map((preset, i) => (
              <button
                key={i}
                onClick={() => onPreset(preset.gpuCount)}
                className={`text-left px-3 py-2 rounded text-xs transition-all hover:brightness-125 ${project.gpuPreset === preset.gpuCount ? 'ring-1' : ''}`}
                style={{
                  background: project.gpuPreset === preset.gpuCount ? '#1e293b' : '#111827',
                  color: '#e2e8f0',
                  borderColor: '#0078d4',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button
            onClick={onClearRack}
            className="w-full px-3 py-2 rounded text-xs font-semibold transition-all hover:brightness-125"
            style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b' }}
          >
            Clear Rack
          </button>

          <h3 className="text-xs font-semibold uppercase mb-3 mt-5" style={{ color: '#64748b', letterSpacing: '0.05em' }}>Components</h3>
          <div className="grid gap-2">
            {paletteItems.map(id => {
              const comp = comps[id];
              if (!comp) return null;
              const count = getComponentCount(project.rack, id, profile);
              const atMax = count >= comp.maxQty;
              const isSelected = selectedComponent === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    if (atMax) return;
                    if (isSelected) {
                      onAutoPlace(id);
                    } else {
                      onSelectComponent(id);
                    }
                  }}
                  disabled={atMax}
                  title={isSelected ? 'Click again to auto-place at lowest slot · Or click a rack slot to place there' : 'Click to select this component'}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all ${atMax ? 'opacity-40 cursor-not-allowed' : 'hover:brightness-110 cursor-pointer'}`}
                  style={{
                    background: isSelected ? '#1e293b' : '#111827',
                    border: isSelected ? `2px solid ${comp.color}` : '1px solid #1e293b',
                  }}
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: comp.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white font-medium">{comp.name}</div>
                    <div className="text-xs" style={{ color: '#64748b' }}>
                      {count}/{comp.maxQty} &middot; {comp.size}U
                      {isSelected && <span style={{ color: comp.color }}> &middot; Selected</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

        </div>

        <div className="flex-1 overflow-y-auto flex justify-center p-6">
          <RackView
            rack={project.rack}
            components={comps}
            selectedComponent={selectedComponent}
            profile={profile}
            onSlotClick={onSlotClick}
            onRemoveSlot={onRemoveSlot}
            onToggleVPDU={onToggleVPDU}
          />
        </div>
      </div>
    </div>
  );
}

function RackView({ rack, components: comps, selectedComponent, profile, onSlotClick, onRemoveSlot, onToggleVPDU }: {
  rack: RackState;
  components: Record<string, any>;
  selectedComponent: string | null;
  profile?: RackWireProfile;
  onSlotClick: (u: number) => void;
  onRemoveSlot: (u: number) => void;
  onToggleVPDU: (idx: number) => void;
}) {
  const rendered = new Set<number>();

  const pduSelected = selectedComponent ? getCompRole(selectedComponent, profile) === 'pdu' : false;
  const allVPduZones = [
    { idx: 0, startU: 8, endU: 18, side: 'left' as const, sideChar: 'L' },
    { idx: 1, startU: 8, endU: 18, side: 'right' as const, sideChar: 'R' },
    { idx: 2, startU: 22, endU: 32, side: 'left' as const, sideChar: 'L' },
    { idx: 3, startU: 22, endU: 32, side: 'right' as const, sideChar: 'R' },
  ];
  let vPduCounter = 0;
  const vPduZones = allVPduZones.map((z) => {
    const filled = rack.verticalPDUs[z.idx];
    if (filled) vPduCounter++;
    const canPlace = !filled && pduSelected;
    return { ...z, filled, canPlace, label: filled ? `PDU ${vPduCounter} (${z.sideChar})` : `(${z.sideChar})` };
  });

  const slotHeight = 28;
  const slot3UHeight = 84;

  const uPositions: Record<number, number> = {};
  let yOffset = 0;
  const rackSize = rack.slots.length;
  for (let u = rackSize; u >= 1; u--) {
    const slot = rack.slots[u - 1];
    if (slot.isPartOf3U) {
      uPositions[u] = uPositions[u + 1] !== undefined ? uPositions[u + 1] : yOffset;
      continue;
    }
    uPositions[u] = yOffset;
    const slotCompSize = slot.componentId ? getCompSize(slot.componentId, profile) : 1;
    if (slotCompSize > 1) {
      yOffset += slotHeight * slotCompSize;
    } else {
      yOffset += slotHeight;
    }
  }

  return (
    <div className="flex items-start gap-1">
      <div className="w-6 relative" style={{ height: `${yOffset}px` }}>
        {vPduZones.filter(z => z.side === 'left').map((zone) => {
          const topPx = uPositions[zone.endU] ?? 0;
          const bottomPx = (uPositions[zone.startU] ?? 0) + slotHeight;
          const height = bottomPx - topPx;
          const clickable = zone.filled || zone.canPlace;
          return (
            <div
              key={`left-${zone.idx}`}
              onClick={() => clickable && onToggleVPDU(zone.idx)}
              className={`absolute w-5 rounded-sm flex items-center justify-center transition-all ${clickable ? 'cursor-pointer' : ''} ${zone.canPlace ? 'hover:brightness-150' : ''}`}
              style={{
                top: `${topPx}px`,
                height: `${height}px`,
                left: 0,
                background: zone.filled ? '#ef444433' : zone.canPlace ? '#ef444415' : 'transparent',
                border: zone.filled ? '1px solid #ef444488' : zone.canPlace ? '1px dashed #ef444466' : '1px dashed #334155',
              }}
            >
              <span className="text-[8px] font-mono whitespace-nowrap" style={{ color: zone.filled ? '#f87171' : zone.canPlace ? '#ef4444aa' : '#475569', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                {zone.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="w-[420px]">
        <div className="rounded-xl overflow-hidden" style={{ background: '#0e1824', border: '2px solid #1e293b' }}>
          {Array.from({ length: rackSize }, (_, i) => rackSize - i).map(u => {
            if (rendered.has(u)) return null;

            const slot = rack.slots[u - 1];
            const compId = slot.componentId;
            const comp = compId ? comps[compId] : null;

            const compSize = compId ? getCompSize(compId, profile) : 1;
            if (compSize > 1 && !slot.isPartOf3U) {
              for (let i = 0; i < compSize; i++) rendered.add(u + i);
              return (
                <Slot3U
                  key={u}
                  baseU={u}
                  slot={slot}
                  comp={comp!}
                  selectedComponent={selectedComponent}
                  onSlotClick={onSlotClick}
                  onRemoveSlot={onRemoveSlot}
                />
              );
            }

            if (slot.isPartOf3U) {
              rendered.add(u);
              return null;
            }

            rendered.add(u);
            return (
              <Slot1U
                key={u}
                u={u}
                slot={slot}
                comp={comp}
                selectedComponent={selectedComponent}
                selectedColor={selectedComponent ? comps[selectedComponent]?.color : undefined}
                onSlotClick={onSlotClick}
                onRemoveSlot={onRemoveSlot}
              />
            );
          })}
        </div>
      </div>

      <div className="w-6 relative" style={{ height: `${yOffset}px` }}>
        {vPduZones.filter(z => z.side === 'right').map((zone) => {
          const topPx = uPositions[zone.endU] ?? 0;
          const bottomPx = (uPositions[zone.startU] ?? 0) + slotHeight;
          const height = bottomPx - topPx;
          const clickable = zone.filled || zone.canPlace;
          return (
            <div
              key={`right-${zone.idx}`}
              onClick={() => clickable && onToggleVPDU(zone.idx)}
              className={`absolute w-5 rounded-sm flex items-center justify-center transition-all ${clickable ? 'cursor-pointer' : ''} ${zone.canPlace ? 'hover:brightness-150' : ''}`}
              style={{
                top: `${topPx}px`,
                height: `${height}px`,
                right: 0,
                background: zone.filled ? '#ef444433' : zone.canPlace ? '#ef444415' : 'transparent',
                border: zone.filled ? '1px solid #ef444488' : zone.canPlace ? '1px dashed #ef444466' : '1px dashed #334155',
              }}
            >
              <span className="text-[8px] font-mono whitespace-nowrap" style={{ color: zone.filled ? '#f87171' : zone.canPlace ? '#ef4444aa' : '#475569', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                {zone.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Slot1U({ u, slot, comp, selectedComponent, selectedColor, onSlotClick, onRemoveSlot }: {
  u: number;
  slot: RackSlot;
  comp: any;
  selectedComponent: string | null;
  selectedColor?: string;
  onSlotClick: (u: number) => void;
  onRemoveSlot: (u: number) => void;
}) {
  const isEmpty = !slot.componentId;
  const isReserve = u === 1;
  const canPlace = selectedComponent && isEmpty && !isReserve;
  const canRemove = !isEmpty && !isReserve && slot.componentId !== 'RESERVE';

  return (
    <div
      className={`flex items-center h-7 relative group ${canPlace ? 'cursor-pointer' : ''}`}
      style={{ borderBottom: '1px solid #1a2332' }}
      onClick={() => canPlace && onSlotClick(u)}
    >
      <div className="w-10 text-center text-[10px] font-mono flex-shrink-0" style={{ color: '#475569' }}>
        U{u}
      </div>
      {comp && (
        <div className="w-1 h-full flex-shrink-0" style={{ background: comp.color }} />
      )}
      <div className="flex-1 px-3 flex items-center justify-between min-w-0">
        <span className={`text-xs truncate ${isEmpty ? '' : 'font-medium'}`} style={{ color: isEmpty ? '#334155' : '#e2e8f0' }}>
          {slot.instanceLabel || (isEmpty ? '' : comp?.name) || ''}
        </span>
        {canRemove && (
          <button
            onClick={e => { e.stopPropagation(); onRemoveSlot(u); }}
            className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded transition-opacity"
            style={{ color: '#ef4444', background: '#1e293b' }}
          >
            ×
          </button>
        )}
      </div>
      {canPlace && (
        <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity" style={{ background: `${selectedColor || '#ffffff'}22` }} />
      )}
    </div>
  );
}

function Slot3U({ baseU, slot, comp, selectedComponent, onSlotClick, onRemoveSlot }: {
  baseU: number;
  slot: RackSlot;
  comp: any;
  selectedComponent: string | null;
  onSlotClick: (u: number) => void;
  onRemoveSlot: (u: number) => void;
}) {
  const isFixed = false;
  const canRemove = !isFixed;

  return (
    <div className="flex relative group" style={{ height: '84px', borderBottom: '1px solid #1a2332' }}>
      <div className="w-10 flex flex-col justify-between py-0.5 flex-shrink-0">
        {[baseU + 2, baseU + 1, baseU].map(u => (
          <div key={u} className="text-center text-[10px] font-mono" style={{ color: '#475569' }}>U{u}</div>
        ))}
      </div>
      <div className="w-1 h-full flex-shrink-0" style={{ background: comp.color }} />
      <div className="flex-1 px-3 flex items-center justify-between min-w-0">
        <span className="text-xs font-medium" style={{ color: '#e2e8f0' }}>
          {slot.instanceLabel || comp.name}
        </span>
        {canRemove && (
          <button
            onClick={e => { e.stopPropagation(); onRemoveSlot(baseU); }}
            className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded transition-opacity"
            style={{ color: '#ef4444', background: '#1e293b' }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function CableMapScreen({ cables, projectName, onBack, onExport }: {
  cables: CableRow[];
  projectName: string;
  onBack: () => void;
  onExport: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0f1a' }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #1e293b' }}>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-sm px-3 py-1.5 rounded transition-all hover:brightness-125" style={{ color: '#0078d4', border: '1px solid #0078d444' }}>
            &larr; Rack Builder
          </button>
          <h1 className="text-white font-semibold">Cable Map — {projectName}</h1>
        </div>
        <button onClick={onExport} className="px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition-all" style={{ background: '#10b981', color: '#fff' }}>
          Export XLSX
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="min-w-[1400px]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {['From U-Loc', 'From Component', 'From Port', 'To U-Loc', 'To Component', 'To Chassis', 'To Port', 'To Port Type', 'To Transceiver', 'Cable Description', 'Cable P/N', 'From Transceiver', 'From Port Type'].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-semibold" style={{ background: '#000', color: '#fff', borderBottom: '2px solid #333' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cables.map((cable, i) => {
                if (cable.isSectionHeader) {
                  return (
                    <tr key={i}>
                      <td colSpan={13} className="px-3 py-2 font-bold text-white text-center text-sm" style={{ background: cable.rowColor }}>
                        {cable.cableDescription}
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={i} style={{ background: `${cable.rowColor}18` }}>
                    <td className="px-2 py-1.5 border-b" style={{ borderColor: '#1e293b', color: '#e2e8f0' }}>{cable.fromULoc}</td>
                    <td className="px-2 py-1.5 border-b" style={{ borderColor: '#1e293b', color: '#e2e8f0' }}>{cable.fromComponent}</td>
                    <td className="px-2 py-1.5 border-b font-mono" style={{ borderColor: '#1e293b', color: '#e2e8f0' }}>{cable.fromPort}</td>
                    <td className="px-2 py-1.5 border-b" style={{ borderColor: '#1e293b', color: '#e2e8f0' }}>{cable.toULoc}</td>
                    <td className="px-2 py-1.5 border-b" style={{ borderColor: '#1e293b', color: '#e2e8f0' }}>{cable.toComponent}</td>
                    <td className="px-2 py-1.5 border-b font-mono" style={{ borderColor: '#1e293b', color: '#e2e8f0' }}>{cable.toChassis}</td>
                    <td className="px-2 py-1.5 border-b font-mono" style={{ borderColor: '#1e293b', color: '#e2e8f0' }}>{cable.toPort}</td>
                    <td className="px-2 py-1.5 border-b" style={{ borderColor: '#1e293b', color: '#e2e8f0' }}>{cable.toPortType}</td>
                    <td className="px-2 py-1.5 border-b" style={{ borderColor: '#1e293b', color: '#e2e8f0' }}>{cable.toTransceiver}</td>
                    <td className="px-2 py-1.5 border-b" style={{ borderColor: '#1e293b', color: '#e2e8f0' }}>{cable.cableDescription}</td>
                    <td className="px-2 py-1.5 border-b font-mono" style={{ borderColor: '#1e293b', color: '#e2e8f0' }}>{cable.cablePn}</td>
                    <td className="px-2 py-1.5 border-b" style={{ borderColor: '#1e293b', color: '#e2e8f0' }}>{cable.fromTransceiver}</td>
                    <td className="px-2 py-1.5 border-b" style={{ borderColor: '#1e293b', color: '#e2e8f0' }}>{cable.fromPortType}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;
