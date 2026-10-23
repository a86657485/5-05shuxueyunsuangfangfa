import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import R from '../public/rules.js';
import { tierAttempts, scorePair } from '../public/teacher-metrics.mjs';

test('existing teacher help column renders actual round talisman usage after reset and for legacy students', () => {
  const source = readFileSync(new URL('../public/teacher.mjs', import.meta.url), 'utf8');
  const rowSource = source.slice(source.indexOf('function row(s) {'), source.lastIndexOf('\nload();'));
  const context = { R, tierAttempts, scorePair, esc: String, starsOf: () => 0 };
  vm.createContext(context);
  vm.runInContext(rowSource + '\nglobalThis.renderRow = row;', context);
  const student = { student: { name: '演示同学' }, records: {}, magic: { used: 2, remaining: 1, limit: 3 } };
  assert.match(context.renderRow(student), /法宝 2\/3/);
  assert.match(context.renderRow({ ...student, magic: undefined }), /法宝 0\/3/);
});
