'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isTeacherAddress, parseAllowList } = require('../teacher-access.cjs');
const ifaces = () => ({ eth0: [{ address: '192.168.1.10', family: 'IPv4' }] });
describe('teacher access', () => {
  it('localhost 允许', () => {
    assert.equal(isTeacherAddress('127.0.0.1', ifaces(), []), true);
  });
  it('学生地址默认拒绝', () => {
    assert.equal(isTeacherAddress('192.168.1.50', ifaces(), []), false);
  });
  it('TEACHER_ALLOW 网段', () => {
    const allow = parseAllowList('192.168.1.0/24');
    assert.equal(isTeacherAddress('192.168.1.50', ifaces(), allow), true);
  });
});
