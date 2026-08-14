import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBatchCargoPageSizes,
  paginateBatchCargoItems,
} from '../src/lib/batchCargoPagination.ts';

test('la primera hoja no supera 10, las intermedias 16 y la final 15', () => {
  for (let total = 0; total <= 100; total++) {
    const sizes = getBatchCargoPageSizes(total);
    assert.equal(sizes.reduce((sum, size) => sum + size, 0), total);
    assert.ok(sizes[0] <= 10);
    assert.ok(sizes.at(-1) <= 15);
    assert.ok(sizes.slice(1, -1).every((size) => size <= 16));
    assert.ok(sizes.every((size) => size >= 0));
  }
});

test('redistribuye los remanentes de 16 sin crear una última hoja sobrecargada', () => {
  assert.deepEqual(getBatchCargoPageSizes(26), [10, 8, 8]);
  assert.deepEqual(getBatchCargoPageSizes(42), [10, 11, 11, 10]);
  assert.deepEqual(getBatchCargoPageSizes(58), [10, 12, 12, 12, 12]);
});

test('paginateBatchCargoItems conserva orden y correspondencia uno a uno', () => {
  const students = Array.from({ length: 42 }, (_, index) => `student-${index}`);
  const pages = paginateBatchCargoItems(students);
  assert.deepEqual(pages.map((page) => page.length), [10, 11, 11, 10]);
  assert.deepEqual(pages.flat(), students);
});
