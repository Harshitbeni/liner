import { describe, expect, test } from 'bun:test';
import {
  isManagedEngineEnabled,
  startManagedEngine,
  applyEngineEnv,
} from '../engine/supervisor';

describe('Cursor SDK engine supervisor', () => {
  test('managed engine is disabled (no separate process)', () => {
    expect(isManagedEngineEnabled()).toBe(false);
  });

  test('startManagedEngine returns dev cursor-sdk state', async () => {
    const result = await startManagedEngine();
    expect(result.state).toBe('dev');
    expect(result.reason).toBe('cursor-sdk');
  });

  test('applyEngineEnv sets cursor-sdk engine name', () => {
    const prev = process.env.LINER_ENGINE_NAME;
    applyEngineEnv({
      state: 'dev',
      error: null,
      version: null,
      source: 'dev',
      started: false,
    });
    expect(process.env.LINER_ENGINE_NAME).toBe('cursor-sdk');
    if (prev !== undefined) process.env.LINER_ENGINE_NAME = prev;
    else delete process.env.LINER_ENGINE_NAME;
  });
});
