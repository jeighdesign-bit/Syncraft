import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../src/app/api/extraction-models/route.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');

async function capabilities({ enabled = true, key = 'private-test-key', validModel = true } = {}) {
  const context = vm.createContext({ Response,
    isLocalOpenAiRequest: () => enabled,
    readLocalOpenAiKey: async () => key,
    localOpenAiModel: () => { if (!validModel) throw new Error('private-model'); return 'private-model'; },
  });
  return vm.runInContext(`${source}\nGET`, context)(new Request('https://syncraftech.com/api/extraction-models'));
}

test('model discovery exposes capabilities without keys or real provider model identifiers', async () => {
  const response = await capabilities();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { enabled: true, configured: true, resolutions: ['1K', '2K', '4K'] });
});

test('disabled environments, missing keys and invalid models never advertise configured Vela', async () => {
  for (const options of [{ enabled: false }, { key: '' }, { validModel: false }]) {
    const response = await capabilities(options);
    const body = await response.json();
    assert.equal(body.configured, false);
    assert.equal(body.enabled, options.enabled !== false);
  }
});
