import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { resolveOpencodeEngineRoot } from '../engine/paths';
import { isManagedEngineEnabled } from '../engine/supervisor';

describe('isManagedEngineEnabled', () => {
  test('enabled by default', () => {
    const prevManaged = process.env.LINER_MANAGED_ENGINE;
    const prevRpc = process.env.LINER_RPC_MODE;
    delete process.env.LINER_MANAGED_ENGINE;
    delete process.env.LINER_RPC_MODE;
    expect(isManagedEngineEnabled()).toBe(true);
    if (prevManaged !== undefined) process.env.LINER_MANAGED_ENGINE = prevManaged;
    if (prevRpc !== undefined) process.env.LINER_RPC_MODE = prevRpc;
  });

  test('disabled when LINER_MANAGED_ENGINE=0', () => {
    const prev = process.env.LINER_MANAGED_ENGINE;
    process.env.LINER_MANAGED_ENGINE = '0';
    expect(isManagedEngineEnabled()).toBe(false);
    if (prev !== undefined) process.env.LINER_MANAGED_ENGINE = prev;
    else delete process.env.LINER_MANAGED_ENGINE;
  });

  test('disabled when LINER_RPC_MODE=mock', () => {
    const prev = process.env.LINER_RPC_MODE;
    process.env.LINER_RPC_MODE = 'mock';
    expect(isManagedEngineEnabled()).toBe(false);
    if (prev !== undefined) process.env.LINER_RPC_MODE = prev;
    else delete process.env.LINER_RPC_MODE;
  });
});

describe('resolveOpencodeEngineRoot', () => {
  test('dev uses build/opencode under repo', () => {
    const repo = join(import.meta.dir, '..', '..', '..', '..');
    const { root, source } = resolveOpencodeEngineRoot({
      isPackaged: false,
      repoRoot: repo,
    });
    expect(source).toBe('dev');
    expect(root).toEndWith('apps/liner-electron/build/opencode');
  });

  test('packaged uses opencode-engine under resources', () => {
    const { root, source } = resolveOpencodeEngineRoot({
      isPackaged: true,
      resourcesPath: '/tmp/Liner.app/Contents/Resources',
    });
    expect(source).toBe('bundled');
    expect(root).toBe(
      '/tmp/Liner.app/Contents/Resources/opencode-engine',
    );
  });
});
