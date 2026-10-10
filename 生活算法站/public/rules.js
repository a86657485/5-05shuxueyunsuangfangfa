/* 第5课《数学运算讲方法》共享规则（浏览器与服务端同一份判定）。
 * 逆向设计改版：每个证据点（part）都标明指向的教材目标/重难点。
 *   G1 目标1：了解算法在数学解题中的作用，认识算法的顺序结构
 *   G2 目标2：从算法视角看待计算问题，知道算法是解决问题的方法描述
 *   K1 重难点1：用自然语言描述数学运算中的算法
 *   K2 重难点2：把简单计算题的解题过程，用明确有序的步骤表示（含流程图）
 * 核心证据引擎：stepRunner——“同桌照着做”，逐字执行学生组装的自然语言步骤，
 * 含糊、顺序错、写死答案、缺输入输出都会在执行中暴露。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LessonRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const targets = {
    G1: '目标1 顺序结构与算法作用',
    G2: '目标2 算法是方法描述',
    K1: '重难点1 自然语言描述算法',
    K2: '重难点2 明确有序的步骤/流程图'
  };

  /* 站与证据点。required=主线；optional=选做，不阻挡主线和检测 */
  const stages = [
    { id: 'temp', name: '气象角：华氏换摄氏', short: '温度换算', points: 10, aim: 'A→M',
      parts: [
        { id: 'chain', name: '问题三问与输入—处理—输出', targets: ['G1', 'G2'] },
        { id: 'order', name: '计算顺序会影响结果', targets: ['G1'] },
        { id: 'steps', name: '写出三步，请同桌照着做', targets: ['K1', 'K2', 'G2'] }
      ] },
    { id: 'flow', name: '黑板前：流程图', short: '流程图', points: 10, aim: 'A→M',
      parts: [
        { id: 'paper', name: '跟老师在学习单上画（自查）', targets: ['K2'], selfCheck: true },
        { id: 'fix', name: '帮同学改流程图', targets: ['K2'] }
      ] },
    { id: 'seeds', name: '科学实验室：大豆种子', short: '分种子', points: 10, aim: 'M（支架减半）',
      parts: [
        { id: 'chain', name: '自己分析：所求、已知、怎么求', targets: ['G1'] },
        { id: 'steps', name: '写出四步，请同桌照着做', targets: ['K1', 'K2', 'G1'] },
        { id: 'flow', name: '把步骤画成流程图', targets: ['K2'] }
      ] },
    { id: 'signin', name: '阅读小站：签到积分', short: '签到积分', points: 10, aim: 'T（独立迁移）',
      parts: [
        { id: 'rule', name: '找规律并举例验证', targets: ['G1'] },
        { id: 'steps', name: '写方法卡：任何次数都能算', targets: ['K1', 'K2', 'G2'] },
        { id: 'reflect', name: '出门条：我原来以为……现在我认为……', targets: ['G2'], selfCheck: true }
      ] },
    { id: 'formula', name: '选做：我身边的公式', short: '选做公式', points: 5, optional: true, aim: 'T（选做）',
      parts: [{ id: 'steps', name: '选一个公式写成算法', targets: ['K1', 'G2'] }] }
  ];
  const stageIds = stages.map(s => s.id);
  const requiredIds = stages.filter(s => !s.optional).map(s => s.id);
  const stageOf = id => stages.find(s => s.id === id);
  const partOf = (stage, part) => (stageOf(stage)?.parts || []).find(p => p.id === part);

  const misconceptions = {
    'algo-is-answer': '把答案当成算法（写死答案/只要结果）',
    'no-method': '不用方法，靠估或直接找答案',
    'op-order': '计算顺序无所谓（先乘除再减32）',
    'dep-order': '步骤先后无所谓（还没算出m就算s）',
    'output-early': '还没算就先输出',
    'vague-step': '步骤含糊（“想一想”“算一下”）',
    'missing-input': '缺少输入，不知道用哪个数',
    'missing-output': '算完了却没有输出',
    'ipo-swap': '把已知和所求（输入和输出）搞反',
    'shape-mix': '流程图图框混用',
    'flow-order': '流程图执行顺序错',
    'flow-missing': '流程图缺开始/结束框',
    'no-verify': '找到规律没有举例验证'
  };

  const r2 = x => Math.round(x * 100) / 100;

  /* ---------- 题目规格：变量、可选“怎么算”、检验用例 ---------- */
  function signinMethods(rule) {
    const a = Number(rule && rule.a), b = Number(rule && rule.b), sign = rule && rule.sign === '+' ? '+' : '-';
    const ok = Number.isFinite(a) && Number.isFinite(b);
    return {
      p: [
        { id: 'mine', text: ok ? `用我找到的规律：积分 = ${a} × 签到次数 ${sign === '+' ? '+' : '−'} ${b}` : '用我找到的规律（先完成上一步）',
          needs: ['k'], fn: v => ok ? (sign === '+' ? a * v.k + b : a * v.k - b) : NaN },
        { id: 'times3', text: '用 签到次数 × 3', needs: ['k'], fn: v => v.k * 3, tag: 'no-verify' },
        { id: 'none', text: '算一下（不写怎么算）' }
      ]
    };
  }
  const problems = {
    temp: {
      title: '把华氏温度换算成摄氏温度',
      vars: { F: { name: '华氏温度的值', role: 'input', unit: '℉' }, C: { name: '摄氏温度的值', role: 'output', unit: '℃' } },
      outputs: ['C'], rows: 3,
      answerObj: { text: '答案“10℃”', value: { C: 10 } },
      methods: {
        C: [
          { id: 'ok', text: '用华氏温度减32，乘5，再除以9', needs: ['F'], fn: v => 5 * (v.F - 32) / 9 },
          { id: 'bad', text: '用华氏温度乘5，除以9，再减32', needs: ['F'], fn: v => v.F * 5 / 9 - 32, tag: 'op-order' },
          { id: 'none', text: '算一下（不写怎么算）' }
        ]
      },
      tests: [{ F: 50 }, { F: 86 }]
    },
    seeds: {
      title: '求第 n 小组的种子数和一共分发的种子数',
      vars: { n: { name: '组数 n', role: 'input', unit: '' }, m: { name: '第 n 小组的种子数 m', role: 'output', unit: '粒' }, s: { name: '一共分发的种子数 s', role: 'output', unit: '粒' } },
      outputs: ['m', 's'], rows: 4, combos: { ms: { name: 'm 和 s 的值', keys: ['m', 's'] } },
      answerObj: { text: '答案“21粒和120粒”', value: { m: 21, s: 120 } },
      methods: {
        m: [
          { id: 'ok', text: '用公式 m = n×2+1', needs: ['n'], fn: v => v.n * 2 + 1 },
          { id: 'none', text: '算一下（不写怎么算）' }
        ],
        s: [
          { id: 'ok', text: '用公式 s = n×(3+m)÷2', needs: ['n', 'm'], fn: v => v.n * (3 + v.m) / 2 },
          { id: 'none', text: '算一下（不写怎么算）' }
        ]
      },
      tests: [{ n: 10 }, { n: 6 }]
    },
    signin: {
      title: '求签到任意次数时的积分',
      vars: { k: { name: '签到次数', role: 'input', unit: '次' }, p: { name: '积分', role: 'output', unit: '分' } },
      outputs: ['p'], rows: 3,
      answerObj: { text: '答案“43分”', value: { p: 43 } },
      methods: null, // 由学生找到的规律生成
      tests: [{ k: 15 }, { k: 4 }]
    },
    rect: {
      title: '求长方形花坛的周长', pick: '数学：长方形周长',
      vars: { a: { name: '长', role: 'input', unit: '米' }, b: { name: '宽', role: 'input', unit: '米' }, c: { name: '周长', role: 'output', unit: '米' } },
      outputs: ['c'], rows: 3, combos: { ab: { name: '长和宽', keys: ['a', 'b'] } },
      answerObj: { text: '答案“20米”', value: { c: 20 } },
      methods: { c: [
        { id: 'ok', text: '用（长+宽）×2', needs: ['a', 'b'], fn: v => (v.a + v.b) * 2 },
        { id: 'bad', text: '用 长+宽×2', needs: ['a', 'b'], fn: v => v.a + v.b * 2, tag: 'op-order' },
        { id: 'none', text: '算一下（不写怎么算）' }
      ] },
      tests: [{ a: 6, b: 4 }, { a: 9, b: 3 }]
    },
    trip: {
      title: '求骑车去图书馆的路程', pick: '数学：路程 = 速度 × 时间',
      vars: { v: { name: '速度', role: 'input', unit: '米/分' }, t: { name: '时间', role: 'input', unit: '分' }, d: { name: '路程', role: 'output', unit: '米' } },
      outputs: ['d'], rows: 3, combos: { vt: { name: '速度和时间', keys: ['v', 't'] } },
      answerObj: { text: '答案“1200米”', value: { d: 1200 } },
      methods: { d: [
        { id: 'ok', text: '用 速度 × 时间', needs: ['v', 't'], fn: x => x.v * x.t },
        { id: 'bad', text: '用 速度 + 时间', needs: ['v', 't'], fn: x => x.v + x.t, tag: 'no-method' },
        { id: 'none', text: '算一下（不写怎么算）' }
      ] },
      tests: [{ v: 200, t: 6 }, { v: 150, t: 10 }]
    },
    avg: {
      title: '求小组跳绳的平均个数', pick: '数学：平均数 = 总数 ÷ 人数',
      vars: { sum: { name: '跳绳总个数', role: 'input', unit: '个' }, n: { name: '人数', role: 'input', unit: '人' }, a: { name: '平均个数', role: 'output', unit: '个' } },
      outputs: ['a'], rows: 3, combos: { sn: { name: '总个数和人数', keys: ['sum', 'n'] } },
      answerObj: { text: '答案“120个”', value: { a: 120 } },
      methods: { a: [
        { id: 'ok', text: '用 总个数 ÷ 人数', needs: ['sum', 'n'], fn: x => x.sum / x.n },
        { id: 'bad', text: '用 总个数 × 人数', needs: ['sum', 'n'], fn: x => x.sum * x.n, tag: 'no-method' },
        { id: 'none', text: '算一下（不写怎么算）' }
      ] },
      tests: [{ sum: 480, n: 4 }, { sum: 750, n: 5 }]
    }
  };
  const formulaChoices = ['rect', 'trip', 'avg'];

  function methodsFor(problemId, ctx) {
    if (problemId === 'signin') return signinMethods(ctx && ctx.rule);
    return problems[problemId].methods;
  }
  const verbs = [
    { id: 'input', text: '输入' },
    { id: 'calc', text: '计算' },
    { id: 'output', text: '输出' },
    { id: 'think', text: '想一想' }
  ];
  function objectChoices(problemId) {
    const p = problems[problemId];
    return Object.entries(p.vars).map(([id, v]) => ({ id, text: v.name }))
      .concat(Object.entries(p.combos || {}).map(([id, c]) => ({ id, text: c.name })))
      .concat([{ id: 'ANS', text: p.answerObj.text }]);
  }
  function rowText(problemId, row, ctx) {
    if (!row || !row.verb) return '（还没写）';
    const p = problems[problemId];
    const verb = (verbs.find(v => v.id === row.verb) || {}).text || '';
    const obj = row.obj === 'ANS' ? p.answerObj.text : p.vars[row.obj] ? p.vars[row.obj].name : (p.combos && p.combos[row.obj]) ? p.combos[row.obj].name : '……';
    if (row.verb === 'think') return '想一想' + (row.obj ? obj : '');
    let s = verb + (row.obj ? obj : '……');
    if (row.verb === 'calc') {
      const list = (methodsFor(problemId, ctx) || {})[row.obj] || [];
      const m = list.find(x => x.id === row.method);
      if (m) s += '：' + m.text;
    }
    return s;
  }

  /* ---------- 同桌照着做：逐字执行 ---------- */
  function runOnce(problemId, rows, test, ctx) {
    const p = problems[problemId], methods = methodsFor(problemId, ctx) || {};
    const env = {}, outs = {}, trace = [];
    let usedAnswer = false, usedTag = null;
    const name = k => p.vars[k] ? p.vars[k].name : k;
    const fmt = (k, v) => `${name(k)} = ${r2(v)}${p.vars[k] ? p.vars[k].unit : ''}`;
    const stop = (i, tag, msg) => ({ ok: false, row: i, tag, msg, trace, outs });
    if (!Array.isArray(rows) || !rows.length) return stop(0, 'missing-input', '还没有写任何步骤。');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      if (!row.verb) return stop(i, 'vague-step', `第${i + 1}步是空的，同桌不知道做什么。`);
      if (row.verb === 'think') return stop(i, 'vague-step', `第${i + 1}步“想一想”——想什么？同桌照着做时卡住了。`);
      if (!row.obj) return stop(i, 'vague-step', `第${i + 1}步只写了“${(verbs.find(v => v.id === row.verb) || {}).text}”，没写对什么做。`);
      const combo = p.combos && p.combos[row.obj];
      if (combo) {
        if (row.verb === 'calc') return stop(i, 'vague-step', `第${i + 1}步一次要算“${combo.name}”？分开写，每步说清怎么算。`);
        if (row.verb === 'input') {
          const notIn = combo.keys.find(k => p.vars[k].role !== 'input');
          if (notIn) return stop(i, 'ipo-swap', `第${i + 1}步：“${name(notIn)}”是要求出来的，题目没有给，没法输入。`);
          combo.keys.forEach(k => { env[k] = test[k]; });
          trace.push({ row: i, text: '输入 ' + combo.keys.map(k => fmt(k, test[k])).join('，') });
        } else {
          const lack = combo.keys.find(k => !(k in env));
          if (lack) return stop(i, p.vars[lack].role === 'input' ? 'missing-input' : 'output-early', `第${i + 1}步：“${name(lack)}”还没有${p.vars[lack].role === 'input' ? '输入' : '算出来'}，没法输出。`);
          combo.keys.forEach(k => { outs[k] = env[k]; });
          trace.push({ row: i, text: '输出 ' + combo.keys.map(k => fmt(k, env[k])).join('，') });
        }
        continue;
      }
      const v = p.vars[row.obj];
      if (!v && row.obj !== 'ANS') return stop(i, 'vague-step', `第${i + 1}步写的内容同桌看不懂。`);
      if (row.verb === 'input') {
        if (row.obj === 'ANS') return stop(i, 'algo-is-answer', `第${i + 1}步直接输入答案？答案要靠计算得到，不能事先知道。`);
        if (v.role !== 'input') return stop(i, 'ipo-swap', `第${i + 1}步：“${v.name}”是要求出来的，题目没有给，没法输入。`);
        env[row.obj] = test[row.obj];
        trace.push({ row: i, text: '输入 ' + fmt(row.obj, test[row.obj]) });
      } else if (row.verb === 'calc') {
        if (row.obj === 'ANS') return stop(i, 'algo-is-answer', `第${i + 1}步“计算答案”太笼统，而且答案不该写死在步骤里。`);
        if (v.role === 'input') return stop(i, 'ipo-swap', `第${i + 1}步：“${v.name}”是已知的，应该输入，不用计算。`);
        const list = methods[row.obj] || [];
        const m = list.find(x => x.id === row.method);
        if (!m || m.id === 'none' || !m.fn) return stop(i, 'vague-step', `第${i + 1}步“计算${v.name}”——怎么算？没写方法，同桌不会算。`);
        const lack = m.needs.find(k => !(k in env));
        if (lack) {
          if (p.vars[lack].role === 'input') return stop(i, 'missing-input', `第${i + 1}步要用“${name(lack)}”，可前面没有输入它，同桌不知道是多少。`);
          return stop(i, 'dep-order', `第${i + 1}步要用“${name(lack)}”，可它还没算出来——要先算它。`);
        }
        const val = m.fn(env);
        if (!Number.isFinite(val)) return stop(i, 'vague-step', `第${i + 1}步的方法还不完整，算不出结果。`);
        if (m.tag) usedTag = m.tag;
        env[row.obj] = r2(val);
        trace.push({ row: i, text: '计算 ' + fmt(row.obj, val) });
      } else if (row.verb === 'output') {
        if (row.obj === 'ANS') {
          usedAnswer = true;
          Object.assign(outs, p.answerObj.value);
          trace.push({ row: i, text: '输出 ' + p.answerObj.text });
          continue;
        }
        if (!(row.obj in env)) {
          if (v.role === 'input') return stop(i, 'missing-input', `第${i + 1}步要输出“${v.name}”，可还没有输入它。`);
          return stop(i, 'output-early', `第${i + 1}步：“${v.name}”还没算出来，没法输出——先算后输出。`);
        }
        outs[row.obj] = env[row.obj];
        trace.push({ row: i, text: '输出 ' + fmt(row.obj, env[row.obj]) });
      }
    }
    const missing = p.outputs.filter(k => !(k in outs));
    if (missing.length) return { ok: false, row: rows.length - 1, tag: 'missing-output', msg: `同桌算完了，可是没有输出“${missing.map(name).join('、')}”，别人看不到结果。`, trace, outs };
    const exp = expected(problemId, test, ctx);
    const wrong = p.outputs.filter(k => Math.abs(Number(outs[k]) - exp[k]) > 0.01);
    if (wrong.length) {
      const testText = Object.entries(test).map(([k, x]) => `${name(k)}=${x}`).join('，');
      if (usedAnswer) return { ok: false, row: rows.findIndex(r => r && r.obj === 'ANS'), tag: 'algo-is-answer', msg: `换成 ${testText}，你的步骤还是输出${p.answerObj.text}——写死了答案，不是方法。`, trace, outs };
      if (usedTag) return { ok: false, row: rows.findIndex(r => r && r.verb === 'calc'), tag: usedTag, msg: `${testText} 时算出 ${wrong.map(k => fmt(k, outs[k])).join('，')}，应该是 ${wrong.map(k => fmt(k, exp[k])).join('，')}。检查“怎么算”里的先后。`, trace, outs };
      return { ok: false, row: rows.length - 1, tag: problemId === 'signin' ? 'no-verify' : 'op-order', msg: `${testText} 时结果不对，应该是 ${wrong.map(k => fmt(k, exp[k])).join('，')}。`, trace, outs };
    }
    return { ok: true, trace, outs, usedAnswer };
  }
  function expected(problemId, test, ctx) {
    const p = problems[problemId];
    if (problemId === 'signin') return { p: 3 * test.k - 2 };
    const env = { ...test };
    // 按正确方法依次计算（变量声明顺序即依赖顺序）
    for (const k of Object.keys(p.vars)) {
      if (p.vars[k].role === 'input') continue;
      const m = (p.methods[k] || []).find(x => x.id === 'ok');
      env[k] = r2(m.fn(env));
    }
    return env;
  }
  function runSteps(problemId, rows, ctx) {
    const p = problems[problemId];
    if (!p) return { ok: false, results: [], tag: null, msg: '未知题目' };
    const results = [];
    for (const t of p.tests) {
      const r = runOnce(problemId, rows, t, ctx);
      results.push({ test: t, ...r });
      if (!r.ok) return { ok: false, results, tag: r.tag, row: r.row, msg: r.msg };
    }
    return { ok: true, results, msg: '同桌照着你的步骤，两个不同的数都算对了！' };
  }

  /* ---------- 各证据点判定 ---------- */
  const tempChainKey = { ask: 'C', known: 'F', how: 'formula', slots: { in: 'known', proc: 'how', out: 'ask' } };
  const tempOps = { sub32: { text: '减 32', fn: x => x - 32 }, mul5: { text: '乘 5', fn: x => x * 5 }, div9: { text: '除以 9', fn: x => x / 9 } };
  function runOps(ops, f) {
    let x = f; const trace = [f];
    for (const o of ops || []) { if (!tempOps[o]) return null; x = tempOps[o].fn(x); trace.push(r2(x)); }
    return { value: r2(x), trace };
  }
  /* 流程图找错：同学画的温度流程图 */
  const flawedFlow = [
    { id: 'b0', text: '开始', shape: 'terminal', fault: null },
    { id: 'b1', text: '输入华氏温度值', shape: 'process', fault: 'shape' },
    { id: 'b2', text: '输出摄氏温度值', shape: 'io', fault: 'order' },
    { id: 'b3', text: '计算摄氏温度值', shape: 'process', fault: 'order' },
    { id: 'b4', text: '', shape: 'empty', fault: 'missing' }
  ];
  const faultNames = { shape: '图框形状不对', order: '执行顺序不对', missing: '缺少图框', none: '这里没问题' };
  const seedFlowBoxes = [
    { id: 'f0', text: '开始', shape: 'terminal' },
    { id: 'f1', text: '输入组数 n', shape: 'io' },
    { id: 'f2', text: '计算第 n 小组种子数 m', shape: 'process' },
    { id: 'f3', text: '计算种子总数 s', shape: 'process' },
    { id: 'f4', text: '输出 m 和 s', shape: 'io' },
    { id: 'f5', text: '结束', shape: 'terminal' }
  ];
  const shapeNames = { terminal: '圆角矩形（开始/结束）', process: '直角矩形（处理）', io: '平行四边形（输入/输出）' };
  const signinTable = [[1, 1], [2, 4], [3, 7], [4, 10]];
  function ruleValue(rule, k) {
    const a = Number(rule && rule.a), b = Number(rule && rule.b);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
    return rule.sign === '+' ? a * k + b : a * k - b;
  }

  function assessPart(stage, part, r) {
    r = r && typeof r === 'object' ? r : {};
    const tags = [];
    const out = (ok, feedback, evidence = {}) => ({ ok: !!ok, tags: [...new Set(tags)], feedback, evidence });
    const key = stage + '.' + part;
    switch (key) {
      case 'temp.chain': {
        const k = tempChainKey, s = r.slots || {};
        if (r.ask === 'F' || r.known === 'C') tags.push('ipo-swap');
        if (r.how === 'guess' || r.how === 'search') tags.push('no-method');
        const chainOk = r.ask === k.ask && r.known === k.known && r.how === k.how;
        const slotOk = s.in === 'known' && s.proc === 'how' && s.out === 'ask';
        if (s.in === 'ask' || s.out === 'known') tags.push('ipo-swap');
        return out(chainOk && slotOk,
          chainOk && slotOk ? '对！已知的华氏温度是输入，公式是处理，所求的摄氏温度是输出。'
            : !chainOk ? '再读题：要求出来的是什么？题目已经告诉我们什么？靠什么求？'
              : '三问答对了。再想想：哪个先“放进去”，哪个是“算出来”的？', { chainOk, slotOk });
      }
      case 'temp.order': {
        const ops = Array.isArray(r.ops) ? r.ops : [];
        const full = ops.length === 3 && new Set(ops).size === 3 && ops.every(o => tempOps[o]);
        const res = full ? runOps(ops, 50) : null;
        const orderOk = full && ops[0] === 'sub32';
        if (full && !orderOk) tags.push('op-order');
        if (r.reason && r.reason !== 'order') tags.push('op-order');
        if (Array.isArray(r.tries) && Array.isArray(r.tries[0]) && r.tries[0][0] !== 'sub32') tags.push('op-order'); // 首次尝试的顺序也是证据
        const reasonOk = r.reason === 'order';
        return out(orderOk && reasonOk,
          !full ? '把三张运算卡都排进去，再算一算。'
            : !orderOk ? `按你的顺序，50℉ 变成了 ${res.value}℃。2月份 50℉ 是凉爽天气，这个结果合理吗？换个顺序试试。`
              : !reasonOk ? '你的顺序算对了。再判断小周错在哪里。'
                : '先减32，才能得到10℃。计算的步骤和顺序会直接影响结果。', { orderOk, reasonOk, value: res && res.value });
      }
      case 'temp.steps': case 'seeds.steps': case 'signin.steps': case 'formula.steps': {
        const pid = stage === 'formula' ? r.problem : stage;
        if (stage === 'formula' && !formulaChoices.includes(pid)) return out(false, '先选一个公式。');
        const run = runSteps(pid, r.rows, { rule: r.rule });
        if (!run.ok && run.tag) tags.push(run.tag);
        if (run.ok && run.results.some(x => x.usedAnswer)) tags.push('algo-is-answer');
        let handOk = null;
        if (stage === 'seeds' && r.hand) handOk = Number(r.hand.m) === 21 && Number(r.hand.s) === 120;
        if (stage === 'signin' && r.hand) handOk = Number(r.hand.p) === 43;
        return out(run.ok, run.msg, { row: run.row, handOk, trace: run.results.map(x => ({ test: x.test, outs: x.outs, ok: x.ok })) });
      }
      case 'flow.paper': {
        const items = Array.isArray(r.checks) ? r.checks : [];
        return out(r.done === true, r.done === true ? '已记录你的自查。学习单请交给老师看。' : '画好后对照四条自查，再点“我画好了”。', { checks: items, selfCheck: true });
      }
      case 'flow.fix': {
        const marks = r.marks || {};
        let ok = true, wrongMarks = 0;
        for (const b of flawedFlow) {
          const m = marks[b.id];
          const want = b.fault || 'none';
          if (b.fault === 'order') { if (m !== 'order') ok = false; }
          else if ((m || 'none') !== want) ok = false;
          if (m && m !== want) {
            wrongMarks++;
            if (b.fault === 'shape' || (m === 'shape' && !b.fault)) tags.push('shape-mix');
            if (b.fault === 'order') tags.push('flow-order');
            if (b.fault === 'missing') tags.push('flow-missing');
          }
          if (!m && b.fault) {
            if (b.fault === 'shape') tags.push('shape-mix');
            if (b.fault === 'order') tags.push('flow-order');
            if (b.fault === 'missing') tags.push('flow-missing');
          }
        }
        return out(ok, ok ? '三处都改对了：输入用平行四边形，先计算再输出，最后要有“结束”。' : '还有地方没找对。逐个图框问自己：形状对吗？先后对吗？缺什么吗？', { wrongMarks });
      }
      case 'seeds.chain': {
        const ask = Array.isArray(r.ask) ? r.ask : [];
        const askOk = ask.includes('m10') && ask.includes('sum') && !ask.includes('g1');
        if (ask.includes('g1')) tags.push('ipo-swap');
        const knownOk = r.known === 'n-rule';
        if (r.known === 'answer') tags.push('ipo-swap');
        const howOk = r.how === 'm-then-s';
        if (r.how === 's-then-m') tags.push('dep-order');
        if (r.how === 'guess') tags.push('no-method');
        return out(askOk && knownOk && howOk,
          askOk && knownOk && howOk ? '分析清楚了：要求两个数，已知组数和规律；s 要用到 m，所以先算 m。'
            : !askOk ? '题目一共问了几个问题？把要求出的都选上。'
              : !knownOk ? '题目给了我们哪些条件？' : '看看公式 s = n×(3+m)÷2——它要用到谁？', { askOk, knownOk, howOk });
      }
      case 'seeds.flow': {
        const shapes = r.shapes || {};
        let ok = true;
        for (const b of seedFlowBoxes) if (shapes[b.id] !== b.shape) { ok = false; if (shapes[b.id]) tags.push('shape-mix'); }
        if (!ok && !tags.length) tags.push('shape-mix');
        return out(ok, ok ? '流程图画对了：一眼就能看出先输入、再算m、再算s、最后输出。' : '有图框选错了：开始/结束用圆角，处理用直角，输入/输出用平行四边形。');
      }
      case 'signin.rule': {
        const checks = signinTable.map(([k, p]) => ruleValue(r, k) === p);
        const ok = checks.every(Boolean);
        if (!ok && checks[0]) tags.push('no-verify');
        return out(ok, ok ? '4 组数据都验证通过！这条规律可以放心用了。' : `举例验证：有 ${checks.filter(x => !x).length} 组对不上。看看每多签到1次，积分多几分？`, { checks });
      }
      case 'signin.reflect': {
        const ok = !!(r.was && r.now);
        return out(ok, ok ? '出门条已记录。' : '选好“原来”和“现在”两句。', { was: r.was, now: r.now, selfCheck: true });
      }
      default: return out(false, '未知证据点');
    }
  }

  /* 星级：按证据点最终通过比例 + 首答质量。通关门槛 = ≥2 星。
   * 0：未过半；1：过半但未全过；2：全部最终通过（通关）；3：全过且计分点首答大多也对。 */
  const PASS_STARS = 2;
  function starGlyphs(n) {
    const s = Math.max(0, Math.min(3, Number(n) || 0));
    return '★'.repeat(s) + '☆'.repeat(3 - s);
  }
  function computeStars(list, meta) {
    const total = list.length;
    const done = list.filter(p => p.lastOk).length;
    const graded = (meta.parts || []).filter(p => !p.selfCheck);
    const gradedIds = new Set(graded.map(p => p.id));
    const firstOkCount = list.filter(p => p.firstOk && gradedIds.has(p.id)).length;
    const gradedCount = graded.length;
    const finalRatio = total ? done / total : 0;
    let stars = 0;
    if (finalRatio >= 0.5) stars = 1;
    if (total > 0 && done === total) stars = 2;
    if (stars === 2) {
      if (gradedCount === 0) stars = 3;
      else if (firstOkCount >= Math.ceil(gradedCount * 2 / 3)) stars = 3;
    }
    return {
      stars,
      cleared: stars >= PASS_STARS,
      finalRatio,
      firstOkCount,
      gradedCount,
      partsDone: done,
      partsTotal: total,
      missing: list.filter(p => !p.lastOk).map(p => p.id)
    };
  }

  /* 汇总：一站的首答/最终、误解标签、星级 */
  function stageSummary(stageId, st, awarded) {
    const meta = stageOf(stageId);
    const parts = (st && st.parts) || {};
    const list = meta.parts.map(p => {
      const x = parts[p.id] || {};
      return {
        id: p.id, attempts: x.attempts || 0, hintMax: x.hintMax || 0,
        firstOk: !!(x.first && x.first.assessment && x.first.assessment.ok),
        lastOk: !!(x.last && x.last.assessment && x.last.assessment.ok),
        firstTags: (x.first && x.first.assessment && x.first.assessment.tags) || [],
        lastTags: (x.last && x.last.assessment && x.last.assessment.tags) || [],
        started: !!x.first
      };
    });
    const firstTags = [...new Set(list.flatMap(p => p.firstTags))];
    const lingeringTags = [...new Set(list.filter(p => !p.lastOk).flatMap(p => p.lastTags))];
    const done = list.filter(p => p.lastOk).length;
    const star = computeStars(list, meta);
    return {
      awarded: !!awarded,
      pass: list.every(p => p.lastOk),
      stars: star.stars,
      cleared: star.cleared,
      starGlyphs: starGlyphs(star.stars),
      missing: star.missing,
      visits: Math.max(0, Number(st && st.visits) || 0),
      parts: list,
      partsDone: done,
      partsTotal: list.length,
      currentPart: (list.find(p => !p.lastOk) || {}).id || null,
      firstOkCount: list.filter(p => p.firstOk && !(meta.parts.find(q => q.id === p.id) || {}).selfCheck).length,
      gradedCount: meta.parts.filter(p => !p.selfCheck).length,
      firstTags,
      lingeringTags,
      correctedTags: firstTags.filter(t => !lingeringTags.includes(t)),
      hintMax: Math.max(0, ...list.map(p => p.hintMax)),
      started: list.some(p => p.started)
    };
  }

  return {
    targets, stages, stageIds, requiredIds, stageOf, partOf, misconceptions,
    problems, formulaChoices, verbs, objectChoices, methodsFor, rowText,
    runSteps, runOnce, expected, tempChainKey, tempOps, runOps, flawedFlow, faultNames,
    seedFlowBoxes, shapeNames, signinTable, ruleValue, assessPart, stageSummary,
    PASS_STARS, starGlyphs, computeStars
  };
});
