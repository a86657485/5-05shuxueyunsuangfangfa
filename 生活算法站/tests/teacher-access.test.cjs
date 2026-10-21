'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isTeacherAddress, parseAllowList } = require('../teacher-access.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Writable } = require('node:stream');
const { createService } = require('../server.cjs');
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

it('学生地址不能通过demo或test网址绕过正式奖励门槛', async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5-preview-access-'));
  const svc = createService({ runtimeDir, roster: [], networkInterfaces: ifaces });
  try {
    for (const url of ['/demo', '/demo?game=1', '/test', '/test?game=1']) {
      const result = await new Promise(resolve => {
        let text = '';
        const res = new Writable({ write(chunk, encoding, done) { text += chunk.toString(); done(); } });
        res.setHeader = () => {};
        res.writeHead = status => { res.statusCode = status; };
        res.on('finish', () => resolve({ status: res.statusCode, text }));
        svc.server.emit('request', { method: 'GET', url, headers: {}, socket: { remoteAddress: '192.168.1.50' } }, res);
      });
      assert.equal(result.status, 403, url);
      assert.match(JSON.parse(result.text).error, /教师入口仅限教师设备/);
    }
  } finally { svc.close(); fs.rmSync(runtimeDir, { recursive: true, force: true }); }
});
