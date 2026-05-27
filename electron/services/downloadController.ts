import type { DownloadRecord } from '../../src/types';

export type DownloadStartInput = {
  profileId: string;
  tabId?: string;
  url: string;
  filename: string;
  savePath: string;
  totalBytes?: number;
  cancel: () => void;
};

export class DownloadController {
  private readonly records = new Map<string, DownloadRecord>();
  private readonly cancelCallbacks = new Map<string, () => void>();
  private nextId = 1;

  start(input: DownloadStartInput): string {
    const id = `download-${this.nextId++}`;
    this.records.set(id, {
      id,
      profileId: input.profileId,
      tabId: input.tabId,
      url: input.url,
      filename: input.filename,
      savePath: input.savePath,
      status: 'progressing',
      receivedBytes: 0,
      totalBytes: input.totalBytes,
    });
    this.cancelCallbacks.set(id, input.cancel);
    return id;
  }

  updateProgress(id: string, progress: { receivedBytes: number; totalBytes?: number }): void {
    const record = this.records.get(id);
    if (!record || record.status !== 'progressing') {
      return;
    }
    this.records.set(id, {
      ...record,
      receivedBytes: progress.receivedBytes,
      totalBytes: progress.totalBytes ?? record.totalBytes,
    });
  }

  finish(id: string, status: DownloadRecord['status'], error?: string): void {
    const record = this.records.get(id);
    if (!record) {
      return;
    }
    this.records.set(id, {
      ...record,
      status,
      error,
    });
    this.cancelCallbacks.delete(id);
  }

  cancel(id: string): boolean {
    const cancel = this.cancelCallbacks.get(id);
    const record = this.records.get(id);
    if (!cancel || !record) {
      return false;
    }
    cancel();
    this.records.set(id, {
      ...record,
      status: 'cancelled',
    });
    this.cancelCallbacks.delete(id);
    return true;
  }

  list(profileId?: string): DownloadRecord[] {
    const records = [...this.records.values()];
    return profileId ? records.filter((record) => record.profileId === profileId) : records;
  }
}
