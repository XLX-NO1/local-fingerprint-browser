import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppSettings } from '../../src/types';

export class SettingsStore {
  private readonly filePath: string;

  constructor(private readonly dataDir: string) {
    this.filePath = join(dataDir, 'settings.json');
  }

  async get(): Promise<AppSettings> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as AppSettings;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { chromiumPath: undefined, detectedChromiumPath: undefined };
      }
      throw error;
    }
  }

  async update(input: AppSettings): Promise<AppSettings> {
    const next = { ...(await this.get()), ...input };
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
  }
}
