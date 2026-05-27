import { describe, expect, it, vi } from 'vitest';
import { DownloadController } from '../electron/services/downloadController';

describe('DownloadController', () => {
  it('tracks profile scoped download progress and completion', () => {
    const controller = new DownloadController();
    const id = controller.start({
      profileId: 'profile-a',
      tabId: 'tab-a',
      url: 'https://example.com/file.zip',
      filename: 'file.zip',
      savePath: '/tmp/file.zip',
      totalBytes: 100,
      cancel: vi.fn(),
    });

    controller.updateProgress(id, { receivedBytes: 40, totalBytes: 100 });
    controller.finish(id, 'completed');

    expect(controller.list('profile-a')).toEqual([{
      id,
      profileId: 'profile-a',
      tabId: 'tab-a',
      url: 'https://example.com/file.zip',
      filename: 'file.zip',
      savePath: '/tmp/file.zip',
      status: 'completed',
      receivedBytes: 40,
      totalBytes: 100,
    }]);
    expect(controller.list('profile-b')).toEqual([]);
  });

  it('cancels active downloads through their cancellation callback', () => {
    const cancel = vi.fn();
    const controller = new DownloadController();
    const id = controller.start({
      profileId: 'profile-a',
      url: 'https://example.com/file.zip',
      filename: 'file.zip',
      savePath: '/tmp/file.zip',
      cancel,
    });

    const cancelled = controller.cancel(id);

    expect(cancelled).toBe(true);
    expect(cancel).toHaveBeenCalled();
    expect(controller.list('profile-a')[0]).toMatchObject({ status: 'cancelled' });
  });

  it('only exposes a folder reveal path after a download is no longer progressing', () => {
    const controller = new DownloadController();
    const id = controller.start({
      profileId: 'profile-a',
      url: 'https://example.com/file.zip',
      filename: 'file.zip',
      savePath: '/tmp/file.zip',
      cancel: vi.fn(),
    });

    expect(controller.showInFolderPath(id)).toBeUndefined();

    controller.finish(id, 'completed');

    expect(controller.showInFolderPath(id)).toBe('/tmp/file.zip');
    expect(controller.showInFolderPath('missing-download')).toBeUndefined();
  });
});
