import type { RackWireProfile, ConnectionRule, ComponentDef } from './profile-types';
import { createDefaultProfile } from './default-profile';

const PROFILES_KEY = 'rackwire_profiles';
const ACTIVE_PROFILE_KEY = 'rackwire_active_profile';

function migrateProfile(p: RackWireProfile): RackWireProfile {
  if (p.id === 'fusion-hci-gen2') return createDefaultProfile();

  if (p.connectionRules) {
    p.connectionRules = p.connectionRules.map((r: ConnectionRule & Record<string, unknown>) => {
      const legacy = r as Record<string, unknown>;
      const cable = legacy.cable as { type?: string; partNumber?: string } | undefined;
      return {
        id: r.id,
        fromComponent: r.fromComponent,
        fromPort: r.fromPort || (legacy.fromPortName as string) || '',
        toComponent: r.toComponent,
        toPort: r.toPort || (legacy.toPortName as string) || '',
        cableId: r.cableId,
        cableType: r.cableType || cable?.type || '',
        cablePN: r.cablePN || cable?.partNumber || '',
        portType: r.portType || '',
        transceiver: r.transceiver || '',
        splitCount: r.splitCount,
      };
    });
  }

  if (!p.cables) {
    p.cables = {};
  }

  if (p.components) {
    for (const key of Object.keys(p.components)) {
      const c = p.components[key] as ComponentDef & Record<string, unknown>;
      delete c.shortName;
      delete c.isFixedPosition;
      delete c.fixedU;
      if (!c.ports) c.ports = [];
      for (const port of c.ports as unknown as (Record<string, unknown>)[]) {
        delete port.connectsTo;
        delete port.splitCount;
      }
    }
  }

  return p;
}

export function loadProfiles(): RackWireProfile[] {
  try {
    const data = localStorage.getItem(PROFILES_KEY);
    if (!data) {
      const defaultProfile = createDefaultProfile();
      saveProfiles([defaultProfile]);
      return [defaultProfile];
    }
    let profiles: RackWireProfile[] = JSON.parse(data);
    profiles = profiles.map(migrateProfile);
    const hasDefault = profiles.some(p => p.id === 'fusion-hci-gen2');
    if (!hasDefault) {
      profiles.unshift(createDefaultProfile());
    }
    saveProfiles(profiles);
    return profiles;
  } catch {
    const defaultProfile = createDefaultProfile();
    saveProfiles([defaultProfile]);
    return [defaultProfile];
  }
}

export function saveProfiles(profiles: RackWireProfile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function getProfile(profileId: string): RackWireProfile | null {
  const profiles = loadProfiles();
  return profiles.find(p => p.id === profileId) || null;
}

export function saveProfile(profile: RackWireProfile) {
  const profiles = loadProfiles();
  const idx = profiles.findIndex(p => p.id === profile.id);
  if (idx >= 0) {
    profiles[idx] = profile;
  } else {
    profiles.push(profile);
  }
  saveProfiles(profiles);
}

export function deleteProfile(profileId: string) {
  if (profileId === 'fusion-hci-gen2') return;
  const profiles = loadProfiles().filter(p => p.id !== profileId);
  saveProfiles(profiles);
}

export function cloneProfile(sourceId: string, newName: string): RackWireProfile {
  const source = getProfile(sourceId);
  if (!source) throw new Error(`Profile ${sourceId} not found`);
  const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const cloned: RackWireProfile = {
    ...JSON.parse(JSON.stringify(source)),
    id: newId,
    name: newName,
    version: '1.0',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    isBuiltIn: false,
  };
  saveProfile(cloned);
  return cloned;
}

export function bumpVersion(profile: RackWireProfile): string {
  const parts = profile.version.split('.');
  const minor = parseInt(parts[1] || '0', 10) + 1;
  return `${parts[0]}.${minor}`;
}

export function getActiveProfileId(): string {
  return localStorage.getItem(ACTIVE_PROFILE_KEY) || 'fusion-hci-gen2';
}

export function setActiveProfileId(profileId: string) {
  localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
}

export interface ProfileSnapshot {
  profileId: string;
  profileName: string;
  profileVersion: string;
}

export function createProfileSnapshot(profileId: string): ProfileSnapshot | null {
  const profile = getProfile(profileId);
  if (!profile) return null;
  return {
    profileId: profile.id,
    profileName: profile.name,
    profileVersion: profile.version,
  };
}

export function isProfileOutdated(snapshot: ProfileSnapshot): { outdated: boolean; currentVersion: string } {
  const profile = getProfile(snapshot.profileId);
  if (!profile) return { outdated: true, currentVersion: 'deleted' };
  return {
    outdated: profile.version !== snapshot.profileVersion,
    currentVersion: profile.version,
  };
}
