import { useState, useCallback } from 'react';
import type { RackWireProfile, ComponentDef, ConnectionRule, PresetLayout, CableDef, SheetTarget, ComponentRole } from '../lib/profile-types';
import { loadProfiles, saveProfile, deleteProfile, cloneProfile, bumpVersion } from '../lib/profile-store';

interface ConfigurationPageProps {
  onBack: () => void;
}

export default function ConfigurationPage({ onBack }: ConfigurationPageProps) {
  const [profiles, setProfiles] = useState<RackWireProfile[]>(() => loadProfiles());
  const [selectedProfileId, setSelectedProfileId] = useState<string>(profiles[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'components' | 'cables' | 'connections' | 'presets' | 'export'>('components');
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [editingComponent, setEditingComponent] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [showAddComponent, setShowAddComponent] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [editingCable, setEditingCable] = useState<string | null>(null);
  const [showAddCable, setShowAddCable] = useState(false);

  const selectedProfile = profiles.find(p => p.id === selectedProfileId) || profiles[0];

  const refreshProfiles = useCallback(() => {
    setProfiles(loadProfiles());
  }, []);

  const updateProfile = useCallback((updater: (p: RackWireProfile) => RackWireProfile) => {
    if (!selectedProfile) return;
    const updated = updater({ ...selectedProfile });
    updated.lastModified = new Date().toISOString();
    updated.version = bumpVersion(selectedProfile);
    saveProfile(updated);
    refreshProfiles();
  }, [selectedProfile, refreshProfiles]);

  const handleClone = useCallback(() => {
    if (!cloneName.trim() || !selectedProfileId) return;
    const cloned = cloneProfile(selectedProfileId, cloneName.trim());
    setCloneName('');
    setShowCloneModal(false);
    refreshProfiles();
    setSelectedProfileId(cloned.id);
  }, [cloneName, selectedProfileId, refreshProfiles]);

  const handleDeleteProfile = useCallback(() => {
    if (!selectedProfile || selectedProfile.isBuiltIn) return;
    if (!confirm(`Delete profile "${selectedProfile.name}"?`)) return;
    deleteProfile(selectedProfile.id);
    refreshProfiles();
    setSelectedProfileId('fusion-hci-gen2');
  }, [selectedProfile, refreshProfiles]);

  if (!selectedProfile) return null;

  const tabs = [
    { id: 'components' as const, label: 'Components', count: Object.keys(selectedProfile.components).length },
    { id: 'cables' as const, label: 'Cables', count: Object.keys(selectedProfile.cables || {}).length },
    { id: 'connections' as const, label: 'Connections', count: selectedProfile.connectionRules.length },
    { id: 'presets' as const, label: 'Presets', count: selectedProfile.presets.length },
    { id: 'export' as const, label: 'Export & Cable Specs', count: selectedProfile.excelSheets.length },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0f1a' }}>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #1e293b' }}>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="px-3 py-1.5 rounded text-sm" style={{ color: '#94a3b8', border: '1px solid #334155' }}>
            &larr; Back
          </button>
          <h1 className="text-xl font-bold text-white">Configuration</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedProfileId}
            onChange={e => setSelectedProfileId(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm text-white outline-none"
            style={{ background: '#1e293b', border: '1px solid #334155' }}
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} v{p.version} {p.isBuiltIn ? '(built-in)' : ''}
              </option>
            ))}
          </select>
          <button onClick={() => setShowCloneModal(true)} className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#0078d4' }}>
            Clone
          </button>
          {!selectedProfile.isBuiltIn && (
            <button onClick={handleDeleteProfile} className="px-3 py-2 rounded-lg text-sm" style={{ color: '#ef4444', border: '1px solid #ef444444' }}>
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="px-6 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid #1e293b' }}>
        <div className="flex items-center gap-1 text-xs" style={{ color: '#64748b' }}>
          <span className="font-medium text-white">{selectedProfile.name}</span>
          <span>&middot;</span>
          <span>v{selectedProfile.version}</span>
          <span>&middot;</span>
          <span>Rack: {selectedProfile.rackSize}U</span>
          <span>&middot;</span>
          <span>Modified: {new Date(selectedProfile.lastModified).toLocaleDateString()}</span>
          {selectedProfile.isBuiltIn && (
            <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#0078d422', color: '#0078d4', border: '1px solid #0078d444' }}>
              Read-Only (clone to edit)
            </span>
          )}
        </div>
      </div>

      <div className="flex" style={{ borderBottom: '1px solid #1e293b' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-5 py-3 text-sm font-medium transition-all"
            style={{
              color: activeTab === tab.id ? '#0078d4' : '#94a3b8',
              borderBottom: activeTab === tab.id ? '2px solid #0078d4' : '2px solid transparent',
              background: activeTab === tab.id ? '#0078d40a' : 'transparent',
            }}
          >
            {tab.label} <span className="ml-1 text-xs opacity-60">({tab.count})</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'components' && (
          <ComponentsTab
            profile={selectedProfile}
            onUpdate={updateProfile}
            editingId={editingComponent}
            setEditingId={setEditingComponent}
            showAdd={showAddComponent}
            setShowAdd={setShowAddComponent}
          />
        )}
        {activeTab === 'cables' && (
          <CablesTab
            profile={selectedProfile}
            onUpdate={updateProfile}
            editingId={editingCable}
            setEditingId={setEditingCable}
            showAdd={showAddCable}
            setShowAdd={setShowAddCable}
          />
        )}
        {activeTab === 'connections' && (
          <ConnectionsTab
            profile={selectedProfile}
            onUpdate={updateProfile}
            editingId={editingRule}
            setEditingId={setEditingRule}
            showAdd={showAddRule}
            setShowAdd={setShowAddRule}
          />
        )}
        {activeTab === 'presets' && (
          <PresetsTab profile={selectedProfile} onUpdate={updateProfile} />
        )}
        {activeTab === 'export' && (
          <ExportTab profile={selectedProfile} onUpdate={updateProfile} />
        )}
      </div>

      {showCloneModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="rounded-xl p-6 w-96" style={{ background: '#111827', border: '1px solid #1e293b' }}>
            <h2 className="text-lg font-semibold text-white mb-4">Clone Profile</h2>
            <p className="text-xs mb-3" style={{ color: '#64748b' }}>
              Create an editable copy of "{selectedProfile.name}"
            </p>
            <input
              type="text"
              value={cloneName}
              onChange={e => setCloneName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleClone()}
              placeholder="New profile name..."
              className="w-full px-4 py-2.5 rounded-lg text-white mb-4 outline-none"
              style={{ background: '#1e293b', border: '1px solid #334155' }}
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowCloneModal(false); setCloneName(''); }} className="px-4 py-2 rounded-lg text-sm" style={{ color: '#94a3b8', border: '1px solid #334155' }}>
                Cancel
              </button>
              <button onClick={handleClone} className="px-4 py-2 rounded-lg text-white font-semibold text-sm" style={{ background: '#0078d4' }}>
                Clone
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PORT_TYPES = ['RJ45', 'SFP28', 'QSFP28', 'QSFP56', 'USB', 'VIDEO', 'SERIAL'];

function ComponentsTab({ profile, onUpdate, editingId, setEditingId, showAdd, setShowAdd }: {
  profile: RackWireProfile;
  onUpdate: (updater: (p: RackWireProfile) => RackWireProfile) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
}) {
  const canEdit = !profile.isBuiltIn;
  const components = Object.values(profile.components);

  const handleSaveComponent = useCallback((comp: ComponentDef) => {
    onUpdate(p => ({
      ...p,
      components: { ...p.components, [comp.id]: comp },
    }));
    setEditingId(null);
    setShowAdd(false);
  }, [onUpdate, setEditingId, setShowAdd]);

  const handleDeleteComponent = useCallback((id: string) => {
    if (!confirm(`Remove component "${id}"? Connection rules and fixed placements that reference it will also be removed.`)) return;
    onUpdate(p => {
      const comps = { ...p.components };
      delete comps[id];
      return {
        ...p,
        components: comps,
        fixedPlacements: p.fixedPlacements.filter(fp => fp.componentId !== id),
        connectionRules: p.connectionRules.filter(r => r.fromComponent !== id && r.toComponent !== id),
      };
    });
  }, [onUpdate]);

  const categoryOrder: ComponentDef['category'][] = ['switch', 'server', 'infrastructure', 'filler'];
  const categoryLabels: Record<string, string> = { switch: 'Switches', server: 'Servers', infrastructure: 'Infrastructure', filler: 'Fillers' };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Components</h2>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>
            Hardware in this rack. Each component defines its ports (type, count, and what it connects to).
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: '#0078d4' }}>
            + Add Component
          </button>
        )}
      </div>

      {showAdd && (
        <ComponentEditor
          component={{
            id: '', name: '', size: 1, maxQty: 1, color: '#6366f1',
            ports: [], category: 'server',
          }}
          isNew
          onSave={handleSaveComponent}
          onCancel={() => setShowAdd(false)}
          existingIds={Object.keys(profile.components)}
        />
      )}

      {categoryOrder.map(cat => {
        const catComponents = components.filter(c => c.category === cat);
        if (catComponents.length === 0) return null;
        return (
          <div key={cat} className="mb-6">
            <h3 className="text-sm font-medium mb-3 px-1" style={{ color: '#64748b' }}>{categoryLabels[cat]}</h3>
            <div className="grid gap-3">
              {catComponents.map(comp => (
                editingId === comp.id ? (
                  <ComponentEditor
                    key={comp.id}
                    component={comp}
                    onSave={handleSaveComponent}
                    onCancel={() => setEditingId(null)}
                    existingIds={Object.keys(profile.components)}
                  />
                ) : (
                  <ComponentCard
                    key={comp.id}
                    component={comp}
                    canEdit={canEdit}
                    onEdit={() => setEditingId(comp.id)}
                    onDelete={() => handleDeleteComponent(comp.id)}
                  />
                )
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ComponentCard({ component: c, canEdit, onEdit, onDelete }: {
  component: ComponentDef; canEdit: boolean; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className="rounded-lg px-4 py-3" style={{ background: '#111827', border: '1px solid #1e293b' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded" style={{ background: c.color }} />
          <div>
            <span className="text-white text-sm font-medium">{c.name}</span>
            <span className="text-xs ml-2" style={{ color: '#64748b' }}>
              {c.size}U &middot; Max: {c.maxQty} &middot; ID: {c.id}{c.excelId ? ` \u00b7 Excel: ${c.excelId}` : ''}
            </span>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="px-2 py-1 rounded text-xs" style={{ color: '#0078d4', border: '1px solid #0078d444' }}>Edit</button>
            <button onClick={onDelete} className="px-2 py-1 rounded text-xs" style={{ color: '#ef4444', border: '1px solid #ef444444' }}>Remove</button>
          </div>
        )}
      </div>
      {c.ports.length > 0 && (
        <div className="ml-7 mt-1">
          <table className="w-full text-xs" style={{ color: '#94a3b8' }}>
            <thead>
              <tr style={{ color: '#64748b' }}>
                <th className="text-left font-medium py-1 pr-4">Port</th>
                <th className="text-left font-medium py-1 pr-4">Type</th>
                <th className="text-left font-medium py-1">Count</th>
              </tr>
            </thead>
            <tbody>
              {c.ports.map((port, i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-4">{port.name}</td>
                  <td className="py-0.5 pr-4">
                    <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: '#1e293b' }}>{port.type}</span>
                  </td>
                  <td className="py-0.5 font-mono">{port.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ComponentEditor({ component, isNew, onSave, onCancel, existingIds }: {
  component: ComponentDef; isNew?: boolean; onSave: (c: ComponentDef) => void; onCancel: () => void; existingIds: string[];
}) {
  const [form, setForm] = useState<ComponentDef>({ ...component, ports: component.ports.map(p => ({ ...p })) });
  const [newPortName, setNewPortName] = useState('');
  const [newPortType, setNewPortType] = useState('RJ45');
  const [newPortCount, setNewPortCount] = useState(1);

  const handleSubmit = () => {
    if (!form.id.trim() || !form.name.trim()) return;
    if (isNew && existingIds.includes(form.id)) {
      alert(`Component ID "${form.id}" already exists`);
      return;
    }
    onSave(form);
  };

  const addPort = () => {
    if (!newPortName.trim()) return;
    setForm(f => ({
      ...f,
      ports: [...f.ports, {
        id: newPortName.toLowerCase().replace(/\s+/g, '-'),
        name: newPortName,
        type: newPortType,
        count: newPortCount,
      }],
    }));
    setNewPortName('');
    setNewPortCount(1);
  };

  const removePort = (idx: number) => {
    setForm(f => ({ ...f, ports: f.ports.filter((_, i) => i !== idx) }));
  };

  const updatePort = (idx: number, field: string, value: string | number) => {
    setForm(f => ({
      ...f,
      ports: f.ports.map((p, i) => i === idx ? { ...p, [field]: value } : p),
    }));
  };

  return (
    <div className="rounded-lg p-4 mb-3" style={{ background: '#111827', border: '1px solid #0078d4' }}>
      <div className="grid grid-cols-6 gap-3 mb-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>ID</label>
          <input
            value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') }))}
            className="w-full px-3 py-1.5 rounded text-sm text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
            disabled={!isNew}
          />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Excel ID</label>
          <input value={form.excelId || ''} onChange={e => setForm(f => ({ ...f, excelId: e.target.value }))}
            placeholder={form.id}
            className="w-full px-3 py-1.5 rounded text-sm text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Name</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-1.5 rounded text-sm text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Size (U)</label>
            <input type="number" min={1} max={10} value={form.size}
              onChange={e => setForm(f => ({ ...f, size: parseInt(e.target.value) || 1 }))}
              className="w-full px-3 py-1.5 rounded text-sm text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Max Qty</label>
            <input type="number" min={1} max={50} value={form.maxQty}
              onChange={e => setForm(f => ({ ...f, maxQty: parseInt(e.target.value) || 1 }))}
              className="w-full px-3 py-1.5 rounded text-sm text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <div>
            <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Color</label>
            <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              className="w-full h-8 rounded cursor-pointer" style={{ background: '#1e293b', border: '1px solid #334155' }}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as ComponentDef['category'] }))}
              className="w-full px-3 py-1.5 rounded text-sm text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
            >
              <option value="switch">Switch</option>
              <option value="server">Server</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="filler">Filler</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Role</label>
            <select value={form.role || ''} onChange={e => setForm(f => ({ ...f, role: (e.target.value || undefined) as ComponentRole | undefined }))}
              className="w-full px-3 py-1.5 rounded text-sm text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
            >
              <option value="">None</option>
              <option value="data-switch">Data Switch</option>
              <option value="mgmt-switch">Mgmt Switch</option>
              <option value="pool-server">Pool Server</option>
              <option value="service-node">Service Node</option>
              <option value="kvm">KVM</option>
              <option value="pdu">PDU</option>
              <option value="filler">Filler</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <label className="text-xs mb-2 block font-medium" style={{ color: '#94a3b8' }}>Ports</label>
        {form.ports.length > 0 && (
          <table className="w-full text-xs mb-2" style={{ color: '#94a3b8' }}>
            <thead>
              <tr style={{ color: '#64748b' }}>
                <th className="text-left font-medium py-1 pr-2">Port Name</th>
                <th className="text-left font-medium py-1 pr-2">Type</th>
                <th className="text-left font-medium py-1 pr-2 w-16">Count</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {form.ports.map((port, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <input value={port.name} onChange={e => updatePort(i, 'name', e.target.value)}
                      className="w-full px-2 py-1 rounded text-xs text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <select value={port.type} onChange={e => updatePort(i, 'type', e.target.value)}
                      className="px-2 py-1 rounded text-xs text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
                    >
                      {PORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" min={1} max={100} value={port.count}
                      onChange={e => updatePort(i, 'count', parseInt(e.target.value) || 1)}
                      className="w-16 px-2 py-1 rounded text-xs text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
                    />
                  </td>
                  <td className="py-1">
                    <button onClick={() => removePort(i)} className="text-red-400 hover:text-red-300 px-1">&times;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex items-center gap-2 mt-1">
          <input value={newPortName} onChange={e => setNewPortName(e.target.value)} placeholder="Port name..."
            className="px-2 py-1.5 rounded text-xs text-white outline-none flex-1" style={{ background: '#1e293b', border: '1px solid #334155' }}
            onKeyDown={e => e.key === 'Enter' && addPort()}
          />
          <select value={newPortType} onChange={e => setNewPortType(e.target.value)}
            className="px-2 py-1.5 rounded text-xs text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
          >
            {PORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="number" min={1} max={100} value={newPortCount} onChange={e => setNewPortCount(parseInt(e.target.value) || 1)}
            className="w-14 px-2 py-1.5 rounded text-xs text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
            placeholder="Qty"
          />
          <button onClick={addPort} className="px-3 py-1.5 rounded text-xs text-white whitespace-nowrap" style={{ background: '#334155' }}>+ Add Port</button>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 rounded text-sm" style={{ color: '#94a3b8', border: '1px solid #334155' }}>Cancel</button>
        <button onClick={handleSubmit} className="px-3 py-1.5 rounded text-sm text-white font-medium" style={{ background: '#0078d4' }}>
          {isNew ? 'Add Component' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

const SHEET_TARGET_LABELS: Record<string, string> = {
  'etn-ntw': 'ETN NTW',
  'switch-pdu': 'Switch & PDU',
  'mlnx-100gb': 'MLNX 100GB',
};

function CablesTab({ profile, onUpdate, editingId, setEditingId, showAdd, setShowAdd }: {
  profile: RackWireProfile;
  onUpdate: (updater: (p: RackWireProfile) => RackWireProfile) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
}) {
  const canEdit = !profile.isBuiltIn;
  const cables = Object.values(profile.cables || {});

  const handleSaveCable = useCallback((cable: CableDef) => {
    onUpdate(p => ({
      ...p,
      cables: { ...p.cables, [cable.id]: cable },
    }));
    setEditingId(null);
    setShowAdd(false);
  }, [onUpdate, setEditingId, setShowAdd]);

  const handleDeleteCable = useCallback((id: string) => {
    const usedBy = profile.connectionRules.filter(r => r.cableId === id);
    if (usedBy.length > 0) {
      alert(`Cannot delete: this cable is used by ${usedBy.length} connection rule(s).`);
      return;
    }
    if (!confirm('Remove this cable?')) return;
    onUpdate(p => {
      const newCables = { ...p.cables };
      delete newCables[id];
      return { ...p, cables: newCables };
    });
  }, [onUpdate, profile.connectionRules]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Cable Catalog</h2>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>
            Define the cables available for use in this rack. When creating connections, you'll pick from this list.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: '#0078d4' }}>
            + Add Cable
          </button>
        )}
      </div>

      {showAdd && (
        <CableEditor
          cable={{ id: '', name: '', partNumber: '', connectorType: '', isBreakout: false }}
          isNew
          onSave={handleSaveCable}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1e293b' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: '#111827', color: '#64748b' }}>
              <th className="text-left font-medium py-2 px-3">Cable Name</th>
              <th className="text-left font-medium py-2 px-3">Part Number</th>
              <th className="text-left font-medium py-2 px-3">Connector</th>
              <th className="text-left font-medium py-2 px-3">Sheet</th>
              <th className="text-left font-medium py-2 px-3">Breakout</th>
              <th className="text-left font-medium py-2 px-3">Transceiver</th>
              {canEdit && <th className="w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {cables.map(cable => (
              editingId === cable.id ? (
                <tr key={cable.id}>
                  <td colSpan={canEdit ? 7 : 6} className="p-0">
                    <CableEditor
                      cable={cable}
                      onSave={handleSaveCable}
                      onCancel={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={cable.id} className="hover:bg-white/5" style={{ borderBottom: '1px solid #1e293b11' }}>
                  <td className="py-2 px-3 text-white">{cable.name}</td>
                  <td className="py-2 px-3 font-mono" style={{ color: '#fbbf24' }}>{cable.partNumber || '—'}</td>
                  <td className="py-2 px-3" style={{ color: '#60a5fa' }}>{cable.connectorType}</td>
                  <td className="py-2 px-3">
                    {cable.sheetTarget ? (
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{
                        background: cable.sheetTarget === 'etn-ntw' ? '#1565c022' : cable.sheetTarget === 'mlnx-100gb' ? '#6a1b9a22' : '#00695c22',
                        color: cable.sheetTarget === 'etn-ntw' ? '#42a5f5' : cable.sheetTarget === 'mlnx-100gb' ? '#ce93d8' : '#4db6ac',
                      }}>
                        {SHEET_TARGET_LABELS[cable.sheetTarget]}
                      </span>
                    ) : (
                      <span style={{ color: '#475569' }}>—</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {cable.isBreakout ? (
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: '#7c3aed22', color: '#a78bfa' }}>
                        1:{cable.splitCount}
                      </span>
                    ) : (
                      <span style={{ color: '#475569' }}>—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono" style={{ color: '#94a3b8' }}>{cable.transceiver || '—'}</td>
                  {canEdit && (
                    <td className="py-2 px-3">
                      <div className="flex gap-1">
                        <button onClick={() => setEditingId(cable.id)} className="px-2 py-0.5 rounded text-xs" style={{ color: '#0078d4' }}>Edit</button>
                        <button onClick={() => handleDeleteCable(cable.id)} className="px-2 py-0.5 rounded text-xs" style={{ color: '#ef4444' }}>Del</button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CableEditor({ cable, isNew, onSave, onCancel }: {
  cable: CableDef; isNew?: boolean; onSave: (c: CableDef) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState<CableDef>({ ...cable });

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    const finalForm = { ...form };
    if (isNew && !finalForm.id.trim()) {
      finalForm.id = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    if (!finalForm.isBreakout) {
      delete finalForm.splitCount;
    }
    onSave(finalForm);
  };

  const inputCls = "w-full px-2 py-1.5 rounded text-xs text-white outline-none";
  const inputStyle = { background: '#1e293b', border: '1px solid #334155' };

  return (
    <div className="rounded-lg p-4 mb-2" style={{ background: '#111827', border: '1px solid #0078d4' }}>
      <div className="grid grid-cols-7 gap-3 mb-3">
        <div className="col-span-2">
          <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Cable Name</label>
          <input value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className={inputCls} style={inputStyle}
            placeholder="e.g. 3m 100Gb QSFP28 AOC"
          />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Excel ID</label>
          <input value={form.excelId || ''}
            onChange={e => setForm(f => ({ ...f, excelId: e.target.value || undefined }))}
            className={inputCls} style={inputStyle}
            placeholder={form.id}
          />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Part Number</label>
          <input value={form.partNumber}
            onChange={e => setForm(f => ({ ...f, partNumber: e.target.value }))}
            className={`${inputCls} font-mono`} style={inputStyle}
            placeholder="e.g. 01FT722"
          />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Connector Type</label>
          <input value={form.connectorType}
            onChange={e => setForm(f => ({ ...f, connectorType: e.target.value }))}
            className={inputCls} style={inputStyle}
            placeholder="e.g. QSFP28"
          />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Excel Sheet</label>
          <select value={form.sheetTarget || ''}
            onChange={e => setForm(f => ({ ...f, sheetTarget: (e.target.value || undefined) as SheetTarget | undefined }))}
            className={inputCls} style={inputStyle}
          >
            <option value="">— None —</option>
            <option value="etn-ntw">ETN NTW</option>
            <option value="switch-pdu">Switch & PDU</option>
            <option value="mlnx-100gb">MLNX 100GB</option>
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Transceiver PN <span style={{ color: '#475569' }}>(opt)</span></label>
          <input value={form.transceiver || ''}
            onChange={e => setForm(f => ({ ...f, transceiver: e.target.value || undefined }))}
            className={`${inputCls} font-mono`} style={inputStyle}
            placeholder="e.g. 01FT845"
          />
        </div>
      </div>
      <div className="flex items-center gap-4 mb-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={form.isBreakout}
            onChange={e => {
              setForm(f => ({ ...f, isBreakout: e.target.checked, splitCount: e.target.checked ? (f.splitCount || 2) : undefined }));
            }}
            className="w-3.5 h-3.5 rounded accent-purple-500"
          />
          <span className="text-xs font-medium" style={{ color: '#a78bfa' }}>Breakout Cable</span>
        </label>
        {form.isBreakout && (
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: '#64748b' }}>Splits into</span>
            <input type="number" min={2} max={8} value={form.splitCount || 2}
              onChange={e => setForm(f => ({ ...f, splitCount: parseInt(e.target.value) || 2 }))}
              className="w-14 px-2 py-1 rounded text-xs text-white text-center outline-none" style={inputStyle}
            />
            <span className="text-xs" style={{ color: '#64748b' }}>sub-cables</span>
          </div>
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 rounded text-sm" style={{ color: '#94a3b8', border: '1px solid #334155' }}>Cancel</button>
        <button onClick={handleSubmit} className="px-3 py-1.5 rounded text-sm text-white font-medium" style={{ background: '#0078d4' }}>
          {isNew ? 'Add Cable' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function ConnectionsTab({ profile, onUpdate, editingId, setEditingId, showAdd, setShowAdd }: {
  profile: RackWireProfile;
  onUpdate: (updater: (p: RackWireProfile) => RackWireProfile) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
}) {
  const canEdit = !profile.isBuiltIn;
  const rules = profile.connectionRules;

  const handleSaveRule = useCallback((rule: ConnectionRule) => {
    onUpdate(p => ({
      ...p,
      connectionRules: editingId
        ? p.connectionRules.map(r => r.id === editingId ? rule : r)
        : [...p.connectionRules, rule],
    }));
    setEditingId(null);
    setShowAdd(false);
  }, [onUpdate, editingId, setEditingId, setShowAdd]);

  const handleDeleteRule = useCallback((id: string) => {
    if (!confirm('Remove this connection rule?')) return;
    onUpdate(p => ({
      ...p,
      connectionRules: p.connectionRules.filter(r => r.id !== id),
    }));
  }, [onUpdate]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Connections</h2>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>
            From component/port → To component/port, using which cable and part number. These map directly to the Excel output.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: '#0078d4' }}>
            + Add Connection
          </button>
        )}
      </div>

      {showAdd && (
        <ConnectionEditor
          rule={{
            id: '', fromComponent: '', fromPort: '', toComponent: '', toPort: '',
            cableType: '', cablePN: '', portType: '', transceiver: '',
          }}
          isNew
          componentIds={[...Object.keys(profile.components), 'Pool Node']}
          cables={profile.cables || {}}
          onSave={handleSaveRule}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1e293b' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: '#111827', color: '#64748b' }}>
              <th className="text-left font-medium py-2 px-3">From Component</th>
              <th className="text-left font-medium py-2 px-3">From Port</th>
              <th className="text-center font-medium py-2 px-1">&rarr;</th>
              <th className="text-left font-medium py-2 px-3">To Component</th>
              <th className="text-left font-medium py-2 px-3">To Port</th>
              <th className="text-left font-medium py-2 px-3">Cable Type</th>
              <th className="text-left font-medium py-2 px-3">Part Number</th>
              <th className="text-left font-medium py-2 px-3">Split</th>
              {canEdit && <th className="w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              editingId === rule.id ? (
                <tr key={rule.id}>
                  <td colSpan={canEdit ? 9 : 8} className="p-0">
                    <ConnectionEditor
                      rule={rule}
                      componentIds={[...Object.keys(profile.components), 'Pool Node']}
                      cables={profile.cables || {}}
                      onSave={handleSaveRule}
                      onCancel={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={rule.id} className="hover:bg-white/5" style={{ borderBottom: '1px solid #1e293b11' }}>
                  <td className="py-2 px-3 text-white">{rule.fromComponent}</td>
                  <td className="py-2 px-3" style={{ color: '#94a3b8' }}>{rule.fromPort}</td>
                  <td className="py-2 px-1 text-center" style={{ color: '#475569' }}>&rarr;</td>
                  <td className="py-2 px-3 text-white">{rule.toComponent}</td>
                  <td className="py-2 px-3" style={{ color: '#94a3b8' }}>{rule.toPort}</td>
                  <td className="py-2 px-3" style={{ color: '#60a5fa' }}>{rule.cableType}</td>
                  <td className="py-2 px-3 font-mono" style={{ color: '#fbbf24' }}>{rule.cablePN || '—'}</td>
                  <td className="py-2 px-3">
                    {rule.splitCount ? (
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: '#7c3aed22', color: '#a78bfa' }}>
                        1:{rule.splitCount}
                      </span>
                    ) : (
                      <span style={{ color: '#475569' }}>—</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="py-2 px-3">
                      <div className="flex gap-1">
                        <button onClick={() => setEditingId(rule.id)} className="px-2 py-0.5 rounded text-xs" style={{ color: '#0078d4' }}>Edit</button>
                        <button onClick={() => handleDeleteRule(rule.id)} className="px-2 py-0.5 rounded text-xs" style={{ color: '#ef4444' }}>Del</button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConnectionEditor({ rule, isNew, componentIds, cables, onSave, onCancel }: {
  rule: ConnectionRule; isNew?: boolean; componentIds: string[];
  cables: Record<string, CableDef>;
  onSave: (r: ConnectionRule) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState<ConnectionRule>({ ...rule });

  const generateId = (from: string, to: string) => {
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${slug(from)}-to-${slug(to)}`;
  };

  const updateFrom = (fromComponent: string) => {
    setForm(f => {
      const updated = { ...f, fromComponent };
      if (isNew) updated.id = generateId(fromComponent, f.toComponent);
      return updated;
    });
  };

  const updateTo = (toComponent: string) => {
    setForm(f => {
      const updated = { ...f, toComponent };
      if (isNew) updated.id = generateId(f.fromComponent, toComponent);
      return updated;
    });
  };

  const selectCable = (cableId: string) => {
    const cable = cables[cableId];
    if (cable) {
      setForm(f => ({
        ...f,
        cableId,
        cableType: cable.name,
        cablePN: cable.partNumber,
        portType: cable.connectorType,
        transceiver: cable.transceiver || '',
        splitCount: cable.isBreakout ? cable.splitCount : undefined,
      }));
    } else {
      setForm(f => ({ ...f, cableId: undefined }));
    }
  };

  const parsePortRange = (portStr: string): [string, string] => {
    const m = portStr.match(/^(.+?)\s*-\s*(.+)$/);
    if (m) return [m[1], m[2]];
    return [portStr, ''];
  };

  const combinePortRange = (start: string, end: string): string => {
    if (!end.trim()) return start.trim();
    return `${start.trim()}-${end.trim()}`;
  };

  const [fromPortStart, fromPortEnd] = parsePortRange(form.fromPort);
  const [toPortStart, toPortEnd] = parsePortRange(form.toPort);

  const handleSubmit = () => {
    if (!form.fromComponent.trim() || !form.toComponent.trim()) return;
    const finalForm = { ...form };
    if (isNew && !finalForm.id.trim()) {
      finalForm.id = generateId(finalForm.fromComponent, finalForm.toComponent);
    }
    onSave(finalForm);
  };

  const inputCls = "w-full px-2 py-1.5 rounded text-xs text-white outline-none";
  const inputStyle = { background: '#1e293b', border: '1px solid #334155' };
  const labelCls = "text-xs mb-1 block";
  const labelStyle = { color: '#64748b' };

  const cableList = Object.values(cables);
  const selectedCable = form.cableId ? cables[form.cableId] : null;

  return (
    <div className="rounded-lg p-4 mb-2" style={{ background: '#111827', border: '1px solid #0078d4' }}>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="rounded-lg p-3" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
          <div className="text-xs font-medium mb-2" style={{ color: '#60a5fa' }}>From (Source)</div>
          <div className="mb-2">
            <label className={labelCls} style={labelStyle}>Component</label>
            <select value={form.fromComponent}
              onChange={e => updateFrom(e.target.value)}
              className={inputCls} style={inputStyle}
            >
              <option value="">— Select Component —</option>
              {componentIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Port Range</label>
            <div className="flex items-center gap-1">
              <input value={fromPortStart}
                onChange={e => setForm(f => ({ ...f, fromPort: combinePortRange(e.target.value, fromPortEnd) }))}
                className={inputCls} style={inputStyle}
                placeholder="Start (e.g. P3)"
              />
              <span className="text-xs px-1" style={{ color: '#475569' }}>to</span>
              <input value={fromPortEnd}
                onChange={e => setForm(f => ({ ...f, fromPort: combinePortRange(fromPortStart, e.target.value) }))}
                className={inputCls} style={inputStyle}
                placeholder="End (e.g. P18)"
              />
            </div>
            <span className="text-xs mt-0.5 block" style={{ color: '#334155' }}>Leave "End" empty for a single port</span>
          </div>
        </div>

        <div className="rounded-lg p-3" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
          <div className="text-xs font-medium mb-2" style={{ color: '#60a5fa' }}>To (Destination)</div>
          <div className="mb-2">
            <label className={labelCls} style={labelStyle}>Component</label>
            <select value={form.toComponent}
              onChange={e => updateTo(e.target.value)}
              className={inputCls} style={inputStyle}
            >
              <option value="">— Select Component —</option>
              {componentIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Port Range</label>
            <div className="flex items-center gap-1">
              <input value={toPortStart}
                onChange={e => setForm(f => ({ ...f, toPort: combinePortRange(e.target.value, toPortEnd) }))}
                className={inputCls} style={inputStyle}
                placeholder="Start (e.g. C3-P1)"
              />
              <span className="text-xs px-1" style={{ color: '#475569' }}>to</span>
              <input value={toPortEnd}
                onChange={e => setForm(f => ({ ...f, toPort: combinePortRange(toPortStart, e.target.value) }))}
                className={inputCls} style={inputStyle}
                placeholder="End (optional)"
              />
            </div>
            <span className="text-xs mt-0.5 block" style={{ color: '#334155' }}>Leave "End" empty for a single port</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg p-3 mb-3" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
        <div className="text-xs font-medium mb-2" style={{ color: '#fbbf24' }}>Cable</div>
        <div className="mb-2">
          <label className={labelCls} style={labelStyle}>Select Cable from Catalog</label>
          <select value={form.cableId || ''}
            onChange={e => selectCable(e.target.value)}
            className={inputCls} style={inputStyle}
          >
            <option value="">— Select Cable —</option>
            {cableList.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.partNumber ? `(${c.partNumber})` : ''} {c.isBreakout ? `[1:${c.splitCount} breakout]` : ''}
              </option>
            ))}
          </select>
        </div>
        {selectedCable && (
          <div className="flex items-center gap-3 text-xs mt-1" style={{ color: '#64748b' }}>
            <span>Connector: <span style={{ color: '#60a5fa' }}>{selectedCable.connectorType}</span></span>
            {selectedCable.partNumber && <span>PN: <span className="font-mono" style={{ color: '#fbbf24' }}>{selectedCable.partNumber}</span></span>}
            {selectedCable.isBreakout && (
              <span className="px-1.5 py-0.5 rounded font-medium" style={{ background: '#7c3aed22', color: '#a78bfa' }}>
                1:{selectedCable.splitCount} breakout
              </span>
            )}
            {selectedCable.transceiver && <span>Transceiver: <span className="font-mono">{selectedCable.transceiver}</span></span>}
          </div>
        )}
      </div>

      {isNew && (
        <div className="mb-3">
          <label className={labelCls} style={{ color: '#475569' }}>
            Rule ID <span style={{ color: '#334155' }}>(auto-generated)</span>
          </label>
          <input value={form.id}
            onChange={e => setForm(f => ({ ...f, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
            className={`${inputCls} w-64`} style={{ ...inputStyle, color: '#475569' }}
          />
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 rounded text-sm" style={{ color: '#94a3b8', border: '1px solid #334155' }}>Cancel</button>
        <button onClick={handleSubmit} className="px-3 py-1.5 rounded text-sm text-white font-medium" style={{ background: '#0078d4' }}>
          {isNew ? 'Add Connection' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function PresetsTab({ profile, onUpdate }: { profile: RackWireProfile; onUpdate: (updater: (p: RackWireProfile) => RackWireProfile) => void }) {
  const canEdit = !profile.isBuiltIn;
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const components = profile.components;
  const fixedPlacements = profile.fixedPlacements;

  const handleSavePreset = (preset: PresetLayout, idx?: number) => {
    onUpdate(p => ({
      ...p,
      presets: idx !== undefined
        ? p.presets.map((pr, i) => i === idx ? preset : pr)
        : [...p.presets, preset],
    }));
    setEditingIdx(null);
    setShowAdd(false);
  };

  const handleDeletePreset = (idx: number) => {
    if (!confirm('Remove this preset?')) return;
    onUpdate(p => ({ ...p, presets: p.presets.filter((_, i) => i !== idx) }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Presets</h2>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>
            Quick-fill rack layouts by GPU count. Each preset places servers and GPUs in predefined U positions.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: '#0078d4' }}>
            + Add Preset
          </button>
        )}
      </div>

      {showAdd && (
        <PresetEditor
          preset={{ gpuCount: 0, label: '', placements: [] }}
          components={components}
          fixedPlacements={fixedPlacements}
          onSave={p => handleSavePreset(p)}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <div className="grid gap-3">
        {profile.presets.map((preset, idx) => (
          editingIdx === idx ? (
            <PresetEditor
              key={idx}
              preset={preset}
              components={components}
              fixedPlacements={fixedPlacements}
              onSave={p => handleSavePreset(p, idx)}
              onCancel={() => setEditingIdx(null)}
            />
          ) : (
            <div key={idx} className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: '#111827', border: '1px solid #1e293b' }}>
              <div>
                <div className="text-white text-sm font-medium">{preset.label}</div>
                <div className="text-xs mt-1 flex items-center gap-3" style={{ color: '#64748b' }}>
                  <span>GPU Count: {preset.gpuCount}</span>
                  <span>&middot;</span>
                  <span>{preset.placements.length} placements</span>
                  <span>&middot;</span>
                  <span>
                    {Object.entries(
                      preset.placements.reduce<Record<string, number>>((acc, p) => {
                        const comp = components[p.componentId];
                        const label = comp?.name?.split(' ')[0] || p.componentId;
                        acc[label] = (acc[label] || 0) + 1;
                        return acc;
                      }, {})
                    ).map(([id, count]) => `${id} x${count}`).join(', ')}
                  </span>
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <button onClick={() => setEditingIdx(idx)} className="px-2 py-1 rounded text-xs" style={{ color: '#0078d4', border: '1px solid #0078d444' }}>Edit</button>
                  <button onClick={() => handleDeletePreset(idx)} className="px-2 py-1 rounded text-xs" style={{ color: '#ef4444', border: '1px solid #ef444444' }}>Remove</button>
                </div>
              )}
            </div>
          )
        ))}
      </div>
    </div>
  );
}

function PresetEditor({ preset, components, fixedPlacements, onSave, onCancel }: {
  preset: PresetLayout;
  components: Record<string, ComponentDef>;
  fixedPlacements: { u: number; componentId: string }[];
  onSave: (p: PresetLayout) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PresetLayout>({ ...preset, placements: preset.placements.map(p => ({ ...p })) });

  const fixedUs = new Set(fixedPlacements.map(fp => fp.u));
  const serverComponents = Object.values(components).filter(c => c.category === 'server' || c.category === 'filler');

  const addPlacement = () => {
    const usedUs = new Set([...form.placements.map(p => p.u), ...fixedUs]);
    let nextU = 2;
    while (usedUs.has(nextU) && nextU <= 42) nextU++;
    if (nextU > 42) return;
    setForm(f => ({ ...f, placements: [...f.placements, { u: nextU, componentId: serverComponents[0]?.id || '' }] }));
  };

  const removePlacement = (idx: number) => {
    setForm(f => ({ ...f, placements: f.placements.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="rounded-lg p-4 mb-3" style={{ background: '#111827', border: '1px solid #0078d4' }}>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Label</label>
          <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            className="w-full px-3 py-1.5 rounded text-sm text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
          />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>GPU Count</label>
          <input type="number" min={0} max={10} value={form.gpuCount}
            onChange={e => setForm(f => ({ ...f, gpuCount: parseInt(e.target.value) || 0 }))}
            className="w-full px-3 py-1.5 rounded text-sm text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
          />
        </div>
      </div>
      <label className="text-xs mb-1 block" style={{ color: '#64748b' }}>Placements ({form.placements.length})</label>
      <div className="max-h-40 overflow-y-auto mb-2 grid grid-cols-4 gap-1">
        {form.placements.map((p, i) => (
          <div key={i} className="flex items-center gap-1 text-xs">
            <span className="text-white w-8">U{p.u}:</span>
            <select value={p.componentId}
              onChange={e => setForm(f => ({ ...f, placements: f.placements.map((pl, j) => j === i ? { ...pl, componentId: e.target.value } : pl) }))}
              className="flex-1 px-1 py-0.5 rounded text-xs text-white outline-none" style={{ background: '#1e293b', border: '1px solid #334155' }}
            >
              {serverComponents.map(c => (
                <option key={c.id} value={c.id}>{c.id} ({c.size}U)</option>
              ))}
            </select>
            <button onClick={() => removePlacement(i)} className="text-red-400 text-xs px-1">&times;</button>
          </div>
        ))}
      </div>
      <button onClick={addPlacement} className="text-xs px-2 py-1 rounded mb-3" style={{ color: '#0078d4', border: '1px solid #0078d444' }}>+ Add Placement</button>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 rounded text-sm" style={{ color: '#94a3b8', border: '1px solid #334155' }}>Cancel</button>
        <button onClick={() => onSave(form)} className="px-3 py-1.5 rounded text-sm text-white font-medium" style={{ background: '#0078d4' }}>Save</button>
      </div>
    </div>
  );
}

function ExportTab({ profile }: { profile: RackWireProfile; onUpdate: (updater: (p: RackWireProfile) => RackWireProfile) => void }) {
  const cables = Object.values(profile.cables || {});
  const etnCables = cables.filter(c => c.sheetTarget === 'etn-ntw');
  const mlnxCables = cables.filter(c => c.sheetTarget === 'mlnx-100gb');
  const spduCables = cables.filter(c => c.sheetTarget === 'switch-pdu');

  const sheetCableSummary = (sheetCables: CableDef[]) => (
    sheetCables.length > 0 ? (
      <div className="flex flex-wrap gap-1 mt-1.5">
        {sheetCables.map(c => (
          <span key={c.id} className="px-1.5 py-0.5 rounded text-xs" style={{ background: '#1e293b', color: '#94a3b8' }}>
            {c.name}{c.partNumber ? ` (${c.partNumber})` : ''}
          </span>
        ))}
      </div>
    ) : (
      <p className="text-xs mt-1" style={{ color: '#475569' }}>No cables assigned to this sheet.</p>
    )
  );

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-1">Excel Sheets</h2>
        <p className="text-xs mb-3" style={{ color: '#64748b' }}>
          The generated workbook contains these sheets. Each cable in the Cables tab is assigned to a sheet via the "Excel Sheet" field.
        </p>
        <div className="grid gap-3">
          {profile.excelSheets.map(sheet => (
            <div key={sheet.id} className="rounded-lg px-4 py-3" style={{ background: '#111827', border: '1px solid #1e293b' }}>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full" style={{ background: sheet.enabled ? '#10b981' : '#334155' }} />
                <span className="text-white text-sm font-medium">{sheet.name}</span>
                <span className="text-xs" style={{ color: '#64748b' }}>{sheet.description}</span>
              </div>
              {sheet.id === 'etn-ntw' && sheetCableSummary(etnCables)}
              {sheet.id === 'mlnx-100gb' && sheetCableSummary(mlnxCables)}
              {sheet.id === 'switch-pdu' && sheetCableSummary(spduCables)}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-1">Label Nomenclature</h2>
        <p className="text-xs mb-3" style={{ color: '#64748b' }}>
          How to read the generated cable labels in the Excel export. Each label has two sides printed one above the other.
        </p>
        <div className="rounded-lg p-4" style={{ background: '#111827', border: '1px solid #1e293b' }}>
          <div className="mb-4">
            <h3 className="text-sm font-medium text-white mb-2">Label Format</h3>
            <div className="rounded-lg p-3 mb-3" style={{ background: '#0a0f1a', border: '1px solid #334155' }}>
              <div className="text-center">
                <div className="text-xs font-mono mb-1" style={{ color: '#60a5fa' }}>
                  <span style={{ color: '#fbbf24' }}>U20</span>/<span style={{ color: '#10b981' }}>SN3700V 1</span>/<span style={{ color: '#a78bfa' }}>P3</span>
                </div>
                <div className="text-xs mb-2" style={{ color: '#475569' }}>over</div>
                <div className="text-xs font-mono" style={{ color: '#60a5fa' }}>
                  <span style={{ color: '#fbbf24' }}>U2</span>/<span style={{ color: '#10b981' }}>SR630 1</span>/<span style={{ color: '#a78bfa' }}>C3-P1</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded p-2" style={{ background: '#1e293b' }}>
                <div className="font-medium mb-1" style={{ color: '#fbbf24' }}>Rack Position</div>
                <div style={{ color: '#94a3b8' }}>U# = the rack unit where the component is installed (e.g. U20, U2)</div>
              </div>
              <div className="rounded p-2" style={{ background: '#1e293b' }}>
                <div className="font-medium mb-1" style={{ color: '#10b981' }}>Component</div>
                <div style={{ color: '#94a3b8' }}>Device name + instance number (e.g. SN3700V 1, SR630 1, SN2201 2, PDU 3)</div>
              </div>
              <div className="rounded p-2" style={{ background: '#1e293b' }}>
                <div className="font-medium mb-1" style={{ color: '#a78bfa' }}>Port</div>
                <div style={{ color: '#94a3b8' }}>Port identifier on the device (e.g. P3, C3-P1, MGMT, P1 IMM, OCP-P1)</div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-sm font-medium text-white mb-2">Label Structure</h3>
            <p className="text-xs mb-2" style={{ color: '#94a3b8' }}>
              Each printed label has two lines stacked vertically:
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded p-2" style={{ background: '#1e293b' }}>
                <div className="font-medium mb-1" style={{ color: '#60a5fa' }}>Top Line (Side A)</div>
                <div style={{ color: '#94a3b8' }}>Switch-side connection: which switch port this cable plugs into</div>
              </div>
              <div className="rounded p-2" style={{ background: '#1e293b' }}>
                <div className="font-medium mb-1" style={{ color: '#60a5fa' }}>Bottom Line (Side B)</div>
                <div style={{ color: '#94a3b8' }}>Server-side connection: which server/device port the other end plugs into</div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-sm font-medium text-white mb-2">Grouping by Cable Type</h3>
            <p className="text-xs mb-2" style={{ color: '#94a3b8' }}>
              Labels are organized into sections. Each section starts with a header showing the cable type name and part number, followed by all the connection labels that use that cable.
            </p>
            <div className="rounded-lg p-3" style={{ background: '#0a0f1a', border: '1px solid #334155' }}>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono text-center">
                <div>
                  <div className="font-bold mb-0.5" style={{ color: '#fbbf24' }}>3m 100Gb QSFP28 AOC</div>
                  <div style={{ color: '#475569' }}>PN:01FT722</div>
                </div>
                <div>
                  <div style={{ color: '#60a5fa' }}>U20/SN3700V 1/P3</div>
                  <div style={{ color: '#94a3b8' }}>U2/SR630 1/C3-P1</div>
                </div>
                <div>
                  <div style={{ color: '#60a5fa' }}>U20/SN3700V 1/P4</div>
                  <div style={{ color: '#94a3b8' }}>U3/SR630 2/C3-P1</div>
                </div>
              </div>
              <div className="text-xs text-center mt-2" style={{ color: '#475569' }}>Cable header is followed by all labels using that cable type...</div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-white mb-2">Breakout Labels</h3>
            <p className="text-xs mb-2" style={{ color: '#94a3b8' }}>
              For breakout cables (1:N split), the header shows the switch port, a summary of the connected range, and individual legs labeled with (1), (2), (3), (4) suffixes for each sub-cable.
            </p>
            <div className="rounded-lg p-3" style={{ background: '#0a0f1a', border: '1px solid #334155' }}>
              <div className="grid grid-cols-4 gap-2 text-xs font-mono text-center">
                <div>
                  <div className="font-bold mb-0.5" style={{ color: '#fbbf24' }}>QSFP28 Breakout</div>
                  <div style={{ color: '#475569' }}>PN:01FT739</div>
                </div>
                <div>
                  <div style={{ color: '#60a5fa' }}>U20/SN3700V 1/P23</div>
                  <div style={{ color: '#94a3b8' }}>U2-U5/SR630/C1-P1</div>
                </div>
                <div>
                  <div style={{ color: '#94a3b8' }}>U2/SR630 1/C1-P1(1)</div>
                </div>
                <div>
                  <div style={{ color: '#94a3b8' }}>U3/SR630 2/C1-P1(2)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
