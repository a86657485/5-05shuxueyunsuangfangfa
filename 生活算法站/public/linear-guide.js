/* 操作完整性与主动法宝共用的纯规则；不填写作品、不提交、不判通关。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.LinearGuide = factory(root.LessonRules);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R) {
  'use strict';
  const item = (key, selector, done, text) => ({ key, selector, done: !!done, text });
  const action = (selector, text, explanation) => ({ target: { selector }, text, explanation });
  const pick = (id, value, text, explanation) => action(`#${id} [data-v="${value}"]`, text, explanation);
  const check = () => action('#check', '点击“检查”或本页的提交按钮。', '填写完成后，再交给原来的检查规则核对；提示本身不会替你提交。');
  const valid = (stage, part) => !!R.partOf(stage, part);
  const problemOf = (stage, draft) => stage === 'formula' ? draft.problem : stage;
  const rowsOf = (pid, draft) => Array.isArray(draft.rows) ? draft.rows : Array.from({ length: R.problems[pid].rows }, () => ({}));
  const validProblem = pid => typeof pid === 'string' && Object.prototype.hasOwnProperty.call(R.problems, pid);
  const validRows = (pid, rows) => rows.length <= 8 && rows.every(r => r && typeof r === 'object' && !Array.isArray(r)
    && ['verb', 'obj', 'method'].every(k => r[k] == null || typeof r[k] === 'string')
    && (!r.verb || R.verbs.some(v => v.id === r.verb))
    && (!r.obj || R.objectChoices(pid).some(o => o.id === r.obj)));
  const number = (value, fallback = 0) => (typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value)) ? Number(value) : fallback;

  function linearPlan(stage, part, draft = {}, ctx = {}) {
    if (!valid(stage, part)) return [];
    const d = draft || {}, key = stage + '.' + part;
    if (key === 'temp.chain') return [
      item('ask', '#qAsk', d.ask, '先选所求是什么'),
      item('known', '#qKnown', d.known, '再选题目已知条件'),
      item('how', '#qHow', d.how, '选择求解方法'),
      ...[['in', 'sIn', '输入'], ['proc', 'sProc', '处理'], ['out', 'sOut', '输出']].map(([k, id, text]) => item(k, '#' + id, d.slots?.[k], '对应' + text)),
      item('check', '#check', false, '填写完整，再检查')
    ];
    if (key === 'temp.order') return [
      item('ops', '#opsPool', d.ops?.length === 3, '逐张选择运算卡片'),
      item('calc', '#calc', d.shown, '按自己的顺序算一算'),
      item('reason', '#why', d.reason, '选择对小周做法的解释'),
      item('check', '#check', false, '填写完整，再检查')
    ];
    if (key === 'flow.paper') {
      const reviewed = Math.max(0, Math.min(4, number(d.reviewed)));
      return ['terminal', 'io', 'process', 'line'].map((v, i) => item('review-' + i,
        `#checks [data-v="${v}"]${i === reviewed ? ', #paperNext' : ''}`, i < reviewed,
        '对照学习单如实核对这一条，再继续')).concat(item('check', '#check', false, '本人确认纸面作品画好后提交'));
    }
    if (key === 'flow.fix') return R.flawedFlow.map(b => item('box-' + b.id,
      `.fbox[data-id="${b.id}"]${d.open === b.id ? ', .fault-pick' : ''}`, d.marks?.[b.id],
      d.open === b.id ? '为当前图框选择问题类别' : '按顺序点开图框检查')).concat(item('check', '#check', false, '逐框标记完成，再检查'));
    if (key === 'seeds.chain') return [
      item('ask', '#qAsk', Array.isArray(d.ask) && d.ask.length > 0, '多选所求'),
      item('ask-confirm', '#askConfirm', d.askConfirmed, '所求选好后确认'),
      item('known', '#qKnown', d.known, '选择已知条件'),
      item('how', '#qHow', d.how, '选择求解方法'),
      item('check', '#check', false, '填写完整，再检查')
    ];
    if (key === 'seeds.flow') return R.seedFlowBoxes.map(b => item('shape-' + b.id,
      `.sp[data-id="${b.id}"]`, d.shapes?.[b.id], '按顺序为当前图框选择形状'))
      .concat(item('check', '#check', false, '每个图框选好后检查'));
    if (key === 'signin.rule') return [
      item('a-adjust', '.mini-btn[data-k="a"]', d.aChanged || number(d.a, 1) === 3, '调整次数前的数'),
      item('a-confirm', '#aConfirm', d.aConfirmed, '数值调整后确认'),
      item('sign-change', '#sign', d.signTouched || d.sign === '-', '选择加减符号'),
      item('sign-confirm', '#signConfirm', d.signConfirmed, '符号调整后确认'),
      item('b-adjust', '.mini-btn[data-k="b"]', d.bChanged || number(d.b) === 2, '调整最后的数'),
      item('check', '#check', false, '举例验证')
    ];
    if (key === 'signin.reflect') return [
      item('was', '#was', d.was, '如实选择原来的想法'),
      item('now', '#now', d.now, '如实选择现在的想法'),
      item('free', '#free', true, '可以补充一句，也可以直接提交'),
      item('check', '#check', false, '可以补充一句，再提交出门条')
    ];
    if (part === 'steps') {
      if (stage === 'formula' && !d.problem) return [item('pick', '#pick', false, '自选一个熟悉的公式')];
      const pid = problemOf(stage, d);
      if (!validProblem(pid) || (stage === 'formula' && !R.formulaChoices.includes(pid))) return [];
      const rows = rowsOf(pid, d);
      if (!validRows(pid, rows)) return [];
      const methods = R.methodsFor(pid, ctx) || {}, plan = [];
      rows.forEach((r, i) => {
        r ||= {};
        const row = `.step-row[data-i="${i}"]`;
        plan.push(item('verb-' + i, row + ' .verbs', r.verb, `第${i + 1}步先选做什么`));
        if (r.verb === 'think') return;
        plan.push(item('obj-' + i, row + ' .objs', r.obj, `第${i + 1}步再选对象`));
        if (r.verb === 'calc' && r.obj && methods[r.obj]) plan.push(item('method-' + i, row + ' .methods', r.method, `第${i + 1}步选择怎么算`));
      });
      return plan.concat(item('run', '#run', false, '步骤写好后请同桌照着做'));
    }
    return [];
  }

  function nextAction(stage, part, draft = {}, ctx = {}) {
    if (!valid(stage, part) || !draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
    const d = draft, key = stage + '.' + part;
    if (key === 'temp.chain') {
      const fields = [
        ['ask', 'qAsk', 'C', '点击“摄氏温度”。', '题目要把华氏温度换成同学熟悉的摄氏温度，摄氏温度就是所求。'],
        ['known', 'qKnown', 'F', '点击“华氏温度 50℉”。', '题目已经给出的华氏温度是已知条件。'],
        ['how', 'qHow', 'formula', '点击“用已知的公式进行转换”。', '已知条件通过换算公式，才能得到所求。']
      ];
      for (const [field, id, value, text, why] of fields) if (d[field] !== value) return pick(id, value, text, why);
      for (const [field, id, value, name, why] of [
        ['in', 'sIn', 'known', '华氏温度 50℉', '已知数据先输入，后面的计算才有数据可用。'],
        ['proc', 'sProc', 'how', '换算公式', '处理就是按规则完成计算。'],
        ['out', 'sOut', 'ask', '摄氏温度', '输出把算出的所求交给使用者。']
      ]) if (d.slots?.[field] !== value) return pick(id, value, '在这一组点击“' + name + '”。', why);
      return check();
    }
    if (key === 'temp.order') {
      const ops = Array.isArray(d.ops) ? d.ops : [];
      if (ops.length && ops[0] !== 'sub32') return action('#opsClear', '点击“清空”，重新排列。', '括号中的华氏温度减32要先计算；清空也会撤掉这次排列的旧结果。');
      if (ops.length < 3) {
        const op = !ops.length ? 'sub32' : ['mul5', 'div9'].find(k => !ops.includes(k));
        if (!op) return null;
        return action(`#opsPool [data-k="${op}"]`, '点击“' + R.tempOps[op].text + '”。', !ops.length ? '括号表示先减32。' : '减32之后，乘5和除9可以交换先后；这里引导一种合法做法。');
      }
      if (!d.shown) return action('#calc', '点击“用 50℉ 算一算”。', '按自己排列的顺序执行，观察每一步如何改变数值。');
      if (d.reason !== 'order') return pick('why', 'order', '点击说明“括号表示要先减32”的理由。', '公式相同，运算先后不同也会得到不同结果；括号中的减法应先执行。');
      return check();
    }
    if (key === 'flow.paper') {
      const explanations = ['圆角矩形表示开始与结束。', '平行四边形表示输入与输出。', '直角矩形表示计算处理。', '带箭头的流程线表示执行的方向。'];
      const i = Math.max(0, Math.min(4, number(d.reviewed)));
      return i < 4 ? action('#paperNext', '对照这一条核对学习单，再点击“核对下一条”。', explanations[i] + '符合就勾选，不符合可以保留未勾；由你如实确认纸面作品。') : check();
    }
    if (key === 'flow.fix') {
      const box = R.flawedFlow.find(b => d.marks?.[b.id] !== (b.fault || 'none'));
      if (!box) return check();
      if (d.open !== box.id) return action(`.fbox[data-id="${box.id}"]`, '点击“' + (box.text || '最后的空位') + '”这个图框。', '先打开当前位置，再观察形状、先后和是否缺框；下一次操作再选择类别。');
      const fault = box.fault || 'none';
      const why = { none: '开始使用圆角矩形，当前位置没有问题。', shape: '输入应使用平行四边形，这个位置的形状不合适。', order: '必须先计算，再输出结果，这两步的先后应交换。', missing: '流程最后还需要结束框。' }[fault];
      return action(`.fault-pick [data-k="${fault}"]`, '点击“' + R.faultNames[fault] + '”。', why);
    }
    if (key === 'seeds.chain') {
      const ask = Array.isArray(d.ask) ? d.ask : [];
      if (ask.includes('g1')) return pick('qAsk', 'g1', '点击已选的“第1小组的种子数”，取消这一项。', '第1小组的种子数已经给出，题目要求第10组和总数。');
      if (!ask.includes('m10')) return pick('qAsk', 'm10', '点击“第10小组的种子数”。', '题目有两个所求，这一项是其中一个。');
      if (!ask.includes('sum')) return pick('qAsk', 'sum', '点击“一共分发的种子数”。', '还需要知道老师总共分发多少粒，不能只求第10组。');
      if (!d.askConfirmed) return action('#askConfirm', '点击“所求选好了”。', '多选可继续调整，确认后再分析已知条件。');
      if (d.known !== 'n-rule') return pick('qKnown', 'n-rule', '点击“组数n=10，每组比前一组多2粒”。', '组数和分发规律是题目给出的条件，答案需要计算得到。');
      if (d.how !== 'm-then-s') return pick('qHow', 'm-then-s', '点击“先算第10组，再算总数”的方法。', '总数公式中的s依赖m，要先求出m。');
      return check();
    }
    if (key === 'seeds.flow') {
      const box = R.seedFlowBoxes.find(b => d.shapes?.[b.id] !== b.shape);
      return box ? action(`.sp[data-id="${box.id}"][data-s="${box.shape}"]`, '为“' + box.text + '”点击“' + R.shapeNames[box.shape].split('（')[0] + '”。', R.shapeNames[box.shape] + '表示这一步的作用。') : check();
    }
    if (key === 'signin.rule') {
      const a = number(d.a, 1), b = number(d.b);
      if (a !== 3) return action(`.mini-btn[data-k="a"][data-d="${a < 3 ? '1' : '-1'}"]`, '把次数前的数向3调整一步。', '相邻积分1、4、7、10，每多签到一次都增加3分；用数字控制做出调整。');
      if (!d.aConfirmed) return action('#aConfirm', '点击“这个数调好了”。', '调整可以反复进行，确认后再选择加减符号。');
      if (d.sign !== '-') return action('#sign', '点击加减符号，切换为减号。', '签到1次时3×1得到3分，比表中的1分多，所以还要减去差额。');
      if (!d.signConfirmed) return action('#signConfirm', '点击“符号选好了”。', '符号确认后，再调整最后的数并用表格验证。');
      if (b !== 2) return action(`.mini-btn[data-k="b"][data-d="${b < 2 ? '1' : '-1'}"]`, '把最后的数向2调整一步。', '签到1次时，3×1与1分相差2，要减去2；还需验证其他几行。');
      return action('#check', '点击“举例验证”。', '把找到的规律代入表里的各行，检查是否都符合。');
    }
    if (key === 'signin.reflect') {
      if (!d.was) return action('#was', '在“我原来以为”这一组如实选一句。', '这里没有标准答案，请记录自己原来的想法。');
      if (!d.now) return action('#now', '在“现在我认为”这一组如实选一句。', '选择最能代表自己想法变化的一句，不由法宝代选。');
      return check();
    }
    if (part === 'steps') {
      if (stage === 'formula' && !d.problem) return action('#pick', '在这一组自选一个熟悉的公式。', '这几个公式都可以用来写算法，由你决定练习哪一个。');
      return stepsAction(stage, d, ctx);
    }
    return null;
  }

  function stepsAction(stage, d, ctx) {
    const pid = problemOf(stage, d);
    if (!validProblem(pid) || (stage === 'formula' && !R.formulaChoices.includes(pid)) || (pid === 'signin' && (!ctx.rule || !R.assessPart('signin', 'rule', ctx.rule).ok))) return null;
    const p = R.problems[pid];
    const rows = rowsOf(pid, d);
    if (!rows.length || !validRows(pid, rows)) return null;
    if (R.runSteps(pid, rows, ctx).ok) return action('#run', '点击“请同桌照着做”。', '让同桌按你的方法执行两个不同输入，检查方法能否复用。');
    const methods = R.methodsFor(pid, ctx) || {}, available = new Set(), output = new Set();
    const keysOf = obj => p.combos?.[obj]?.keys || (p.vars[obj] ? [obj] : []);
    const chooseObj = keys => Object.entries(p.combos || {}).find(([, c]) => c.keys.length > 1 && c.keys.every(k => keys.includes(k)))?.[0] || keys[0];
    const recommend = () => {
      const missingInput = Object.keys(p.vars).filter(k => p.vars[k].role === 'input' && !available.has(k));
      if (missingInput.length) return { verb: 'input', obj: chooseObj(missingInput) };
      const missingCalc = Object.keys(p.vars).find(k => p.vars[k].role !== 'input' && !available.has(k) && (methods[k] || []).some(m => m.fn && !m.tag && m.needs?.every(n => available.has(n))));
      if (missingCalc) return { verb: 'calc', obj: missingCalc };
      const missingOutput = p.outputs.filter(k => !output.has(k));
      return missingOutput.length ? { verb: 'output', obj: chooseObj(missingOutput) } : null;
    };
    const rowAction = (i, field, value, why) => {
      const label = field === 'v' ? R.verbs.find(v => v.id === value)?.text : field === 'o' ? R.objectChoices(pid).find(o => o.id === value)?.text : (methods[rows[i]?.obj] || []).find(m => m.id === value)?.text;
      return action(`.step-row[data-i="${i}"] .${field}[data-v="${value}"]`, `在第${i + 1}步点击“${label || value}”。`, why);
    };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {}, want = recommend();
      if (!want && (!r.verb || r.verb === 'think')) return action(`.step-row[data-i="${i}"] .del`, '删除这一条没有具体操作的步骤。', '当前方法已表达完整，多余空行或“想一想”会使同桌不知道接着做什么。');
      if (!r.verb || r.verb === 'think') return want ? rowAction(i, 'v', want.verb, '先说明具体动作，再补对象与必要的计算方法。') : null;
      const objKeys = keysOf(r.obj);
      const legalObjects = r.verb === 'input' ? Object.keys(p.vars).filter(k => p.vars[k].role === 'input')
        : r.verb === 'calc' ? Object.keys(p.vars).filter(k => (methods[k] || []).some(m => m.fn && !m.tag && m.needs?.every(n => available.has(n))))
          : Object.keys(p.vars).filter(k => available.has(k));
      if (!legalObjects.length) return want ? rowAction(i, 'v', want.verb, '这一步要使用前面已有的数据；先把所需数据准备好，再计算或输出。') : null;
      if (!objKeys.length || !objKeys.every(k => legalObjects.includes(k)) || (r.verb === 'calc' && objKeys.length !== 1)) {
        const needed = r.verb === 'input' ? legalObjects.filter(k => !available.has(k)) : r.verb === 'output' ? legalObjects.filter(k => !output.has(k)) : legalObjects.filter(k => !available.has(k));
        return rowAction(i, 'o', chooseObj(needed.length ? needed : legalObjects), r.verb === 'input' ? '输入的是题目给出的已知数据，所求需要后面计算。' : r.verb === 'calc' ? '选择可以用前面数据算出的量；有依赖的量要按先后计算。' : '输出已经算出的变量，换一个输入仍可以使用。');
      }
      if (r.verb === 'calc') {
        const method = (methods[r.obj] || []).find(m => m.id === r.method);
        if (!method?.fn || method.tag || (pid === 'signin' && method.id !== 'mine')) {
          const good = (methods[r.obj] || []).find(m => m.fn && !m.tag && (pid !== 'signin' || m.id === 'mine'));
          return good ? rowAction(i, 'm', good.id, pid === 'signin' ? '使用你已经通过表格验证的规律，不另写一个未验证的规律。' : '把怎么算写具体，运算顺序要符合题目公式。') : null;
        }
      }
      if (r.verb === 'output') objKeys.forEach(k => output.add(k));
      else objKeys.forEach(k => available.add(k));
    }
    const run = R.runSteps(pid, rows, ctx);
    if (run.ok) return action('#run', '点击“请同桌照着做”。', '让同桌按你的方法执行两个不同输入，检查方法能否复用。');
    if (rows.length < 6) return action('#addRow', '点击“再加一步”。', '当前方法还缺必要的计算或输出，保留已有合法步骤，再补一条。');
    return null;
  }

  return { linearPlan, nextAction };
});
