import { describe, it, expect, beforeEach } from 'vitest';
import worker, { type Env } from './worker';

interface MockResponse {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

function createKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const value = store.get(key);
      if (!value) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete() {},
    async list() { return { keys: [], list_complete: true, cursor: '' }; },
  } as unknown as KVNamespace;
}

function mockFetch(responses: Record<string, MockResponse>) {
  const calls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    calls.push(url);
    const config = responses[url];
    if (!config) {
      return new Response('not found', { status: 404 });
    }
    return new Response(config.body ?? '', {
      status: config.status ?? 200,
      headers: config.headers,
    });
  };
  return calls;
}

function baseEnv(): Env {
  return {
    TUNER_KV: createKV(),
    GITHUB_ORG: 'TestOrg',
    DOMAIN_SUFFIX: 'example.com',
    VESSEL_LIST: 'alpha,bravo',
    PRIORITY_VESSEL_LIST: 'alpha',
  };
}

describe('vessel-tuner', () => {
  beforeEach(() => {
    // Reset global fetch to a safe no-op between tests.
    globalThis.fetch = async () => new Response('not found', { status: 404 });
  });

  it('returns health status', async () => {
    const env = baseEnv();
    const req = new Request('https://tuner.example.com/health');
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(200);
    const data = (await resp.json()) as Record<string, unknown>;
    expect(data.status).toBe('ok');
    expect(data.vessel).toBe('vessel-tuner');
  });

  it('returns vessel.json metadata', async () => {
    const env = baseEnv();
    const req = new Request('https://tuner.example.com/vessel.json');
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(200);
    const data = (await resp.json()) as Record<string, unknown>;
    expect(data.name).toBe('vessel-tuner');
    expect(data.capabilities).toBeInstanceOf(Array);
  });

  it('uses the configured GitHub org and domain suffix', async () => {
    const env = baseEnv();
    const calls = mockFetch({
      'https://raw.githubusercontent.com/TestOrg/alpha/master/src/worker.ts': { status: 200, body: '// ok' },
      'https://raw.githubusercontent.com/TestOrg/alpha/master/vessel.json': { status: 200, body: '{"name":"alpha","capabilities":[]}' },
      'https://raw.githubusercontent.com/TestOrg/bravo/master/src/worker.ts': { status: 200, body: '// ok' },
      'https://raw.githubusercontent.com/TestOrg/bravo/master/vessel.json': { status: 200, body: '{"name":"bravo","capabilities":[]}' },
    });

    const req = new Request('https://tuner.example.com/api/scan');
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(200);
    const data = (await resp.json()) as Record<string, unknown>;
    const vessels = data.vessels as Array<{ name: string; url: string }>;
    expect(vessels.map(v => v.name)).toEqual(['alpha', 'bravo']);
    expect(vessels[0].url).toBe('https://alpha.example.com');
    expect(calls).toContain('https://raw.githubusercontent.com/TestOrg/alpha/master/src/worker.ts');
  });

  it('falls back from master to main branch when master fails', async () => {
    const env = baseEnv();
    const calls = mockFetch({
      'https://raw.githubusercontent.com/TestOrg/alpha/master/src/worker.ts': { status: 404 },
      'https://raw.githubusercontent.com/TestOrg/alpha/main/src/worker.ts': { status: 200, body: '// main branch' },
      'https://raw.githubusercontent.com/TestOrg/alpha/master/vessel.json': { status: 404 },
      'https://raw.githubusercontent.com/TestOrg/alpha/main/vessel.json': { status: 200, body: '{"name":"alpha","capabilities":[]}' },
    });

    const req = new Request('https://tuner.example.com/api/vessel?name=alpha');
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(200);
    const data = (await resp.json()) as Record<string, unknown>;
    expect(data.health).toBe(200);
    expect(data.name).toBe('alpha');
    expect(calls).toContain('https://raw.githubusercontent.com/TestOrg/alpha/main/src/worker.ts');
  });

  it('respects the priority flag', async () => {
    const env = baseEnv();
    mockFetch({
      'https://raw.githubusercontent.com/TestOrg/alpha/master/src/worker.ts': { status: 200, body: '// ok' },
      'https://raw.githubusercontent.com/TestOrg/alpha/master/vessel.json': { status: 200, body: '{"name":"alpha","capabilities":[]}' },
    });

    const req = new Request('https://tuner.example.com/api/scan?priority=true');
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(200);
    const data = (await resp.json()) as Record<string, unknown>;
    const vessels = data.vessels as Array<{ name: string }>;
    expect(vessels.map(v => v.name)).toEqual(['alpha']);
  });

  it('stores and retrieves the latest scan', async () => {
    const env = baseEnv();
    mockFetch({
      'https://raw.githubusercontent.com/TestOrg/alpha/master/src/worker.ts': { status: 200, body: '// ok' },
      'https://raw.githubusercontent.com/TestOrg/alpha/master/vessel.json': { status: 200, body: '{"name":"alpha","capabilities":[]}' },
      'https://raw.githubusercontent.com/TestOrg/bravo/master/src/worker.ts': { status: 200, body: '// ok' },
      'https://raw.githubusercontent.com/TestOrg/bravo/master/vessel.json': { status: 200, body: '{"name":"bravo","capabilities":[]}' },
    });

    const scanReq = new Request('https://tuner.example.com/api/scan');
    const scanResp = await worker.fetch(scanReq, env);
    const scanData = (await scanResp.json()) as Record<string, unknown>;

    const latestReq = new Request('https://tuner.example.com/api/scan/latest');
    const latestResp = await worker.fetch(latestReq, env);
    expect(latestResp.status).toBe(200);
    const latestData = (await latestResp.json()) as Record<string, unknown>;
    expect(latestData.id).toBe(scanData.id);
  });
});
