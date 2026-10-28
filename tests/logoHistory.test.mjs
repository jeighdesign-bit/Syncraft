import test from 'node:test';
import assert from 'node:assert/strict';
import { groupLogoHistory } from '../src/lib/logoStudio.mjs';

test('original, vector and chained edit stay together beside a separate original', () => {
  const jobs = [
    { id: 'wildbrew', operation: 'generate' },
    { id: 'vector', operation: 'vectorize', sourceId: 'wildbrew' },
    { id: 'edit', operation: 'edit', sourceId: 'vector' },
    { id: 'branding', operation: 'generate' },
  ];
  assert.deepEqual(groupLogoHistory(jobs).map(group => group.jobs.map(job => job.id)), [['branding'], ['edit', 'vector', 'wildbrew']]);
  assert.equal(jobs[0].id, 'wildbrew');
});

test('later edits regroup with their original, while variations form their own logo group', () => {
  const jobs = [
    { id: 'first', operation: 'generate' },
    { id: 'second', operation: 'generate' },
    { id: 'variation', operation: 'variations', sourceId: 'first' },
    { id: 'edit', operation: 'edit', sourceId: 'first' },
  ];
  assert.deepEqual(groupLogoHistory(jobs).map(group => group.jobs.map(job => job.id)), [['edit', 'first'], ['variation'], ['second']]);
});

test('missing ancestors and cyclic historical references cannot hang or drop entries', () => {
  const jobs = [{ id: 'a', operation: 'edit', sourceId: 'b' }, { id: 'b', operation: 'edit', sourceId: 'a' }, { id: 'orphan', operation: 'vectorize', sourceId: 'missing' }];
  const result = groupLogoHistory(jobs).flatMap(group => group.jobs);
  assert.equal(result.length, jobs.length);
  assert.equal(new Set(result.map(job => job.id)).size, jobs.length);
});
