import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as logoStudio from '../src/lib/logoStudio.mjs';

const source = await readFile(new URL('../src/app/api/logo-studio/route.js', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function harness() {
  const calls = { access: 0, single: 0, batch: 0, database: 0 };
  const inputs = [];
  const project = { id: randomUUID(), name: 'Lettering test', canvas_data: { revision: 0, jobs: [] } };
  const service = {
    accessibleLogoProject: async () => { calls.access++; return { project, access: 'owner' }; },
    startLogoOperation: async (_userId, _project, input) => { calls.single++; inputs.push(input); return project; },
    startLogoTextBatch: async (_userId, _project, input) => { calls.batch++; inputs.push(input); return project; },
  };
  const dependencies = {
    'next/server': { NextResponse: Response },
    '@/lib/supabase': { adminSupabase: { from() { calls.database++; throw new Error('Unexpected database call'); } } },
    '@/lib/projectAccess': { authenticateRequest: async () => ({ user: { id: 'owner' } }), PROJECT_ACCESS: { EDIT: 'edit' } },
    '@/lib/rateLimit': { enforceRateLimit: async () => ({ success: true }) },
    '@/lib/logoStudio.mjs': logoStudio,
    '@/lib/logoStudioServer': service,
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, module, URL,
    require(name) {
      if (!Object.hasOwn(dependencies, name)) throw new Error(`Unmocked dependency: ${name}`);
      return dependencies[name];
    },
  });
  return {
    calls, inputs,
    run: body => module.exports.POST(new Request('https://app.test/api/logo-studio', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: project.id, requestId: randomUUID(), operation: 'generate', mode: 'text',
        style: 'streetwear-lettering', brand: 'NORTHBOUND', prompt: '', count: 1, ...body }),
    })),
  };
}

test('single and batch routes reject Streetwear reference creation before starting any reservation or paid operation', async () => {
  for (const action of ['generate', 'generate-text-batch']) {
    for (const mode of ['image', 'sketch']) {
      const h = harness();
      const response = await h.run({ action, mode, sourceUrl: 'https://storage.test/source.png' });
      assert.equal(response.status, 400, `${action}/${mode}`);
      assert.match((await response.json()).error, /Text to Logo/i);
      assert.deepEqual(h.calls, { access: 0, single: 0, batch: 0, database: 0 });
    }
  }
});

test('both creation routes require exact Streetwear text before accessing the project or starting a paid operation', async () => {
  for (const action of ['generate', 'generate-text-batch']) {
    const h = harness();
    const response = await h.run({ action, brand: '   ', prompt: 'Gold Gothic letters' });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /exact brand name/i);
    assert.deepEqual(h.calls, { access: 0, single: 0, batch: 0, database: 0 });
  }
});

test('valid Streetwear text reaches the intended creation service without a separate description', async () => {
  for (const action of ['generate', 'generate-text-batch']) {
    const h = harness();
    const response = await h.run({ action, brand: '  NORTHBOUND  ', prompt: '' });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.equal(h.calls.access, 1);
    assert.equal(h.calls.single, action === 'generate' ? 1 : 0);
    assert.equal(h.calls.batch, action === 'generate-text-batch' ? 1 : 0);
    assert.equal(h.inputs[0].brand, 'NORTHBOUND');
    assert.equal(h.inputs[0].prompt, '');
    assert.equal(h.inputs[0].mode, 'text');
  }
});
