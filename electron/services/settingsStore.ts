import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppSettings } from '../../src/types';

export const DEFAULT_BROWSER_ZOOM_FACTOR = 1;
export const SUPPORTED_BROWSER_ZOOM_FACTORS = [0.8, 0.9, 1, 1.1, 1.25] as const;

export function normalizeBrowserZoomFactor(value: unknown): number {
  return typeof value === 'number' && SUPPORTED_BROWSER_ZOOM_FACTORS.includes(value as (typeof SUPPORTED_BROWSER_ZOOM_FACTORS)[number])
    ? value
    : DEFAULT_BROWSER_ZOOM_FACTOR;
}

function normalizeSettings(input: AppSettings): AppSettings {
  return {
    chromiumPath: input.chromiumPath,
    browserZoomFactor: normalizeBrowserZoomFactor(input.browserZoomFactor),
  };
}

export class SettingsStore {
  private readonly filePath: string;

  constructor(private readonly dataDir: string) {
    this.filePath = join(dataDir, 'settings.json');
  }

  async get(): Promise<AppSettings> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      return normalizeSettings(JSON.parse(await readFile(this.filePath, 'utf8')) as AppSettings);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return normalizeSettings({ chromiumPath: undefined });
      }
      throw error;
    }
  }

  async update(input: AppSettings): Promise<AppSettings> {
    const next = normalizeSettings({ ...(await this.get()), ...input });
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
  }
}
