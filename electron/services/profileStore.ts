import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { BrowserProfile, CreateProfileInput, ProfileHistoryEvent, UpdateProfileInput } from '../../src/types';
import { generateFingerprint } from './fingerprint';
import { parseProxyUrl } from './proxy';

const PROFILE_COLORS = ['#52ff9b', '#5ee7ff', '#ffd166', '#ff5d73', '#b58cff', '#ff9f43'];

interface ProfileDatabase {
  profiles: BrowserProfile[];
}

type StoredBrowserProfile = Omit<BrowserProfile, 'proxy'> & {
  proxy?: BrowserProfile['proxy'] & {
    passwordCiphertext?: string;
    passwordIv?: string;
  };
};

interface StoredProfileDatabase {
  profiles: StoredBrowserProfile[];
}

export class ProfileStore {
  private readonly filePath: string;
  private readonly profilesDir: string;

  constructor(private readonly dataDir: string) {
    this.filePath = join(dataDir, 'profiles.json');
    this.profilesDir = join(dataDir, 'profiles');
  }

  async list(): Promise<BrowserProfile[]> {
    const database = await this.read();
    return database.profiles;
  }

  async create(input: CreateProfileInput): Promise<BrowserProfile> {
    const database = await this.read();
    const now = new Date().toISOString();
    const id = createProfileId();
    const userDataDir = join(this.profilesDir, id, 'chromium-user-data');
    const profile: BrowserProfile = {
      id,
      name: input.name,
      group: input.group ?? 'Default',
      notes: input.notes ?? '',
      color: input.color ?? defaultProfileColor(id),
      proxy: input.proxyUrl ? parseProxyUrl(input.proxyUrl) : undefined,
      fingerprint: input.fingerprint ?? generateFingerprint(id),
      userDataDir,
      status: 'idle',
      history: [createHistoryEvent('created', 'profile created')],
      createdAt: now,
      updatedAt: now,
    };

    database.profiles.push(profile);
    await mkdir(userDataDir, { recursive: true });
    await this.write(database);
    return profile;
  }

  async update(id: string, input: UpdateProfileInput): Promise<BrowserProfile> {
    const database = await this.read();
    const index = database.profiles.findIndex((profile) => profile.id === id);
    if (index === -1) {
      throw new Error(`Profile not found: ${id}`);
    }

    const historyMessage = summarizeUpdate(input);
    const updated = {
      ...database.profiles[index],
      ...input,
      history: historyMessage
        ? appendHistory(database.profiles[index].history, createHistoryEvent('updated', historyMessage))
        : database.profiles[index].history,
      updatedAt: new Date().toISOString(),
    };
    database.profiles[index] = updated;
    await this.write(database);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const database = await this.read();
    database.profiles = database.profiles.filter((profile) => profile.id !== id);
    await this.write(database);
  }

  async duplicate(id: string): Promise<BrowserProfile> {
    const database = await this.read();
    const source = database.profiles.find((profile) => profile.id === id);
    if (!source) {
      throw new Error(`Profile not found: ${id}`);
    }

    const now = new Date().toISOString();
    const nextId = createProfileId();
    const duplicated: BrowserProfile = {
      id: nextId,
      name: `${source.name} copy`,
      group: source.group,
      notes: source.notes,
      color: source.color,
      proxy: source.proxy,
      fingerprint: generateFingerprint(nextId),
      userDataDir: join(this.profilesDir, nextId, 'chromium-user-data'),
      status: 'idle',
      history: [createHistoryEvent('duplicated', `duplicated from ${source.name}`)],
      createdAt: now,
      updatedAt: now,
    };

    database.profiles.push(duplicated);
    await mkdir(duplicated.userDataDir, { recursive: true });
    await this.write(database);
    return duplicated;
  }

  async regenerateFingerprint(id: string, seed = `${id}:${Date.now()}`): Promise<BrowserProfile> {
    const database = await this.read();
    const index = database.profiles.findIndex((profile) => profile.id === id);
    if (index === -1) {
      throw new Error(`Profile not found: ${id}`);
    }

    const profile = database.profiles[index];
    const updated = {
      ...profile,
      fingerprint: generateFingerprint(seed),
      selfTestUrl: undefined,
      selfTestSummary: undefined,
      selfTestReport: undefined,
      launchTrace: [...(profile.launchTrace ?? []), 'fingerprint regenerated'].slice(-12),
      history: appendHistory(profile.history, createHistoryEvent('updated', 'fingerprint regenerated')),
      updatedAt: new Date().toISOString(),
    };
    database.profiles[index] = updated;
    await this.write(database);
    return updated;
  }

  async get(id: string): Promise<BrowserProfile> {
    const profile = (await this.list()).find((item) => item.id === id);
    if (!profile) {
      throw new Error(`Profile not found: ${id}`);
    }
    return profile;
  }

  async reconcileRuntimeState(): Promise<BrowserProfile[]> {
    const database = await this.read();
    const reconciled: BrowserProfile[] = [];
    database.profiles = database.profiles.map((profile) => {
      if (profile.status !== 'running') {
        return profile;
      }

      const updated = {
        ...profile,
        status: 'warning' as const,
        pid: undefined,
        lastError: 'Previous browser process is no longer managed by this app session.',
        history: appendHistory(profile.history, createHistoryEvent('error', 'runtime state reconciled after app restart')),
        updatedAt: new Date().toISOString(),
      };
      reconciled.push(updated);
      return updated;
    });

    if (reconciled.length > 0) {
      await this.write(database);
    }
    return reconciled;
  }

  async recordHistory(id: string, type: ProfileHistoryEvent['type'], message: string): Promise<BrowserProfile> {
    const database = await this.read();
    const index = database.profiles.findIndex((profile) => profile.id === id);
    if (index === -1) {
      throw new Error(`Profile not found: ${id}`);
    }

    const profile = database.profiles[index];
    const updated = {
      ...profile,
      history: appendHistory(profile.history, createHistoryEvent(type, message)),
      updatedAt: new Date().toISOString(),
    };
    database.profiles[index] = updated;
    await this.write(database);
    return updated;
  }

  private async read(): Promise<ProfileDatabase> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      return deserializeDatabase(JSON.parse(await readFile(this.filePath, 'utf8')) as StoredProfileDatabase, this.dataDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { profiles: [] };
      }
      throw error;
    }
  }

  private async write(database: ProfileDatabase): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(serializeDatabase(database, this.dataDir), null, 2)}\n`, 'utf8');
  }
}

function createProfileId(): string {
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultProfileColor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return PROFILE_COLORS[hash % PROFILE_COLORS.length];
}

function createHistoryEvent(type: ProfileHistoryEvent['type'], message: string): ProfileHistoryEvent {
  return {
    id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    createdAt: new Date().toISOString(),
  };
}

function appendHistory(history: ProfileHistoryEvent[] | undefined, event: ProfileHistoryEvent): ProfileHistoryEvent[] {
  return [...(history ?? []), event].slice(-40);
}

function summarizeUpdate(input: UpdateProfileInput): string | undefined {
  if (input.status === 'running' && input.pid) {
    return `browser launched pid ${input.pid}`;
  }
  if (input.status === 'idle' && Object.hasOwn(input, 'pid')) {
    return 'browser stopped';
  }
  if (input.proxy?.lastCheckStatus) {
    return `proxy check ${input.proxy.lastCheckStatus}`;
  }
  if (input.lastError) {
    return input.lastError;
  }
  if (input.fingerprint) {
    return 'fingerprint customized';
  }
  if (input.name || input.group || input.notes || input.color || Object.hasOwn(input, 'proxy')) {
    return 'profile settings updated';
  }
  return undefined;
}

function serializeDatabase(database: ProfileDatabase, dataDir: string): StoredProfileDatabase {
  return {
    profiles: database.profiles.map((profile) => {
      if (!profile.proxy?.password) {
        return profile as StoredBrowserProfile;
      }
      const { password, ...proxy } = profile.proxy;
      return {
        ...profile,
        proxy: {
          ...proxy,
          ...encryptSecret(password, dataDir),
        },
      };
    }),
  };
}

function deserializeDatabase(database: StoredProfileDatabase, dataDir: string): ProfileDatabase {
  return {
    profiles: database.profiles.map((profile) => {
      if (!profile.proxy?.passwordCiphertext) {
        return profile as BrowserProfile;
      }
      const { passwordCiphertext, passwordIv, ...proxy } = profile.proxy;
      return {
        ...profile,
        proxy: {
          ...proxy,
          password: decryptSecret(passwordCiphertext, dataDir, passwordIv),
        },
      };
    }),
  };
}

function encryptSecret(value: string, dataDir: string): { passwordCiphertext: string; passwordIv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(dataDir), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    passwordCiphertext: `v2:${Buffer.concat([tag, encrypted]).toString('base64')}`,
    passwordIv: iv.toString('base64'),
  };
}

function decryptSecret(value: string, dataDir: string, passwordIv?: string): string {
  if (value.startsWith('v2:') && passwordIv) {
    const payload = Buffer.from(value.slice(3), 'base64');
    const tag = payload.subarray(0, 16);
    const encrypted = payload.subarray(16);
    const decipher = createDecipheriv('aes-256-gcm', secretKey(dataDir), Buffer.from(passwordIv, 'base64'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
  if (!value.startsWith('v1:')) {
    return value;
  }
  const payload = Buffer.from(value.slice(3), 'base64');
  const tag = payload.subarray(0, 16);
  const encrypted = payload.subarray(16);
  const decipher = createDecipheriv('aes-256-gcm', secretKey(dataDir), Buffer.alloc(12, 0));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function secretKey(dataDir: string): Buffer {
  return createHash('sha256').update(`local-fingerprint-browser:${dataDir}`).digest();
}
