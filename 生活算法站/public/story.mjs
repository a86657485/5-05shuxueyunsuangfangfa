export const STORY = {
  intro: {
    title: '校园开放日，接待任务开始',
    speaker: '小笛 · 校园接待员',
    text: ['友好学校的伙伴要来参加校园开放日。我们想送给他们一份能照着做的校园体验指南。', '沿着校园走一圈：整理气象角的介绍，写清活动流程，准备分组材料，再说明阅读站的规则。每一站都需要你把事情讲明白。'],
    task: '完成四站任务，让来访伙伴拿着校园体验指南就能参加活动。',
    image: './assets/story/campus-intro.png',
    imageAlt: '校园开放日，接待员和同学在校园里准备体验指南。',
    action: '开始接待任务'
  },
  temp: {
    title: '第一站 · 气象角的介绍板报',
    speaker: '小笛 · 校园接待员',
    text: ['气象角正在布置友好学校的介绍板报。资料写着：当地2月平均气温是50℉。', '同学们更熟悉摄氏单位。把温度资料整理进指南时，还要让负责板报的同伴知道该怎样换算。'],
    task: '把50℉换算成摄氏温度，并写出同伴能够照着执行的方法。',
    image: './assets/story/weather-observation.png',
    imageAlt: '同学在气象角查看友好学校的温度介绍板报。',
    action: '整理温度资料',
    outcome: '气温介绍整理好了，接下来去黑板前写清活动流程。'
  },
  flow: {
    title: '第二站 · 黑板前检查流程',
    speaker: '小笛 · 校园接待员',
    text: ['指南里的温度换算方法要交给接待组使用。大家来到黑板前，准备把方法写成清楚的流程。', '请一位同伴照着流程试做：哪里看不明白，哪里不能接着做，就需要重新检查。'],
    task: '写清活动流程，再检查现有流程图，让同伴能够独立照着做。',
    image: './assets/story/experiment-procedure.png',
    imageAlt: '同学在黑板前讨论并检查校园体验指南中的流程。',
    action: '检查接待流程',
    outcome: '方法已经写清楚，接下来去实验室准备分组活动材料。'
  },
  seeds: {
    title: '第三站 · 实验室准备材料',
    speaker: '小笛 · 校园接待员',
    text: ['实验室要为来访伙伴准备大豆活动材料：第1组3粒、第2组5粒，后面的组继续按这个规则领取。', '接待组需要提前分装，也要知道一共准备多少粒。请把材料安排写进指南，方便同伴核对。'],
    task: '求第10组需要的大豆粒数，以及前10组所需的总数，并说明你的计算方法。',
    image: './assets/story/soybean-laboratory.png',
    imageAlt: '校园实验室里，同学为来访伙伴分装大豆活动材料。',
    action: '安排活动材料',
    outcome: '材料分配方案可以照着执行了，接下来去阅读站补充活动说明。'
  },
  signin: {
    title: '第四站 · 阅读站的积分规则',
    speaker: '小笛 · 校园接待员',
    text: ['来到阅读站，伙伴们想了解学校原有的阅读签到积分换购图书规则：1次1分、2次4分、3次7分、4次10分……', '指南要把这项规则说明白。请利用已有记录找规律，再检查自己的方法是否符合这些记录。'],
    task: '求阅读签到15次时的积分，并写出能够按签到次数计算积分的方法。',
    image: './assets/story/observation-journal.png',
    imageAlt: '阅读站里，同学查看阅读签到记录和图书换购规则。',
    action: '说明阅读积分',
    outcome: '阅读规则解释清楚了，校园体验指南已经齐了，接下来完成基础检测；还有余时可以自选挑战。'
  },
  formula: {
    title: '指南加页 · 自选一个公式',
    speaker: '小笛 · 校园接待员',
    text: ['校园体验指南还可以加上一页你熟悉的计算方法。你可以选择一道公式任务，练习把自己的方法交给别人使用。', '想一想：来访伙伴需要知道哪些资料，照着哪些步骤，最后能够得到什么。'],
    task: '选做一个公式任务，把方法写成别人能够执行的步骤。',
    image: './assets/story/experiment-procedure.png',
    imageAlt: '黑板旁，同学为校园体验指南补充自选计算方法。',
    action: '选择公式任务'
  },
  quiz: {
    title: '出发前 · 接待员独立检查',
    speaker: '小笛 · 校园接待员',
    text: ['校园体验指南需要经得起检查。四个必做站完成后，基础检测就会开放；基础完成后，可以自选挑战。', '遇到新的问题时，试试自己判断要解决什么、有哪些条件、怎样把方法说明白。'],
    task: '先完成基础检测，看看能否把方法用在新任务里；挑战自选，不影响基础达标。',
    image: './assets/story/campus-intro.png',
    imageAlt: '校园接待员准备带着体验指南迎接来访伙伴。',
    action: '开始独立检查'
  },
  complete: {
    title: '校园体验指南，准备就绪',
    speaker: '小笛 · 校园接待员',
    text: ['温度资料、活动流程、材料安排和阅读规则，已经连成一次校园接待任务。', '再和同伴交流：哪一处说明最容易照着做，哪一处还可以写得更清楚？好的方法能够让别人接着完成任务。'],
    task: '回顾你的方法，向同伴介绍一处你检查过、改清楚的步骤。',
    image: './assets/story/campus-intro.png',
    imageAlt: '同学拿着校园体验指南，迎接友好学校的来访伙伴。',
    action: '回到校园'
  }
};

export function storySessionKey(student, round, chapter) {
  const identity = typeof student === 'object' && student !== null ? student : { id: student };
  return 'life-algo-story:v1:' + JSON.stringify([String(identity.classId ?? ''), String(identity.id ?? identity.name ?? 'guest'), String(round ?? ''), String(chapter ?? '')]);
}

const seen = new Set();
let dialog = null, active = null;

function hasSeen(key) {
  if (seen.has(key)) return true;
  try { return globalThis.sessionStorage?.getItem(key) === 'seen'; }
  catch { return false; }
}

function finishStory(viewed = true) {
  if (!active) return;
  const session = active;
  active = null;
  document.body.classList.remove('story-open');
  if (viewed) {
    seen.add(session.key);
    try { globalThis.sessionStorage?.setItem(session.key, 'seen'); } catch {}
  }
  const trigger = session.trigger;
  if (trigger?.isConnected && !trigger.closest('[hidden]') && trigger.getClientRects().length && getComputedStyle(trigger).visibility !== 'hidden') trigger.focus();
  session.resolve();
}

function createDialog() {
  const element = (tag, className, text = '') => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  dialog = element('dialog', 'story-dialog');
  dialog.id = 'story-dialog';
  dialog.setAttribute('aria-labelledby', 'story-title');
  dialog.setAttribute('aria-describedby', 'story-task');
  const layout = element('div', 'story-layout');
  const figure = element('figure', 'story-figure');
  const image = element('img', 'story-image');
  image.decoding = 'async';
  image.addEventListener('error', () => {
    image.hidden = true;
    figure.hidden = true;
    dialog.classList.add('story-without-image');
  });
  figure.append(image);
  const copy = element('div', 'story-copy');
  const speaker = element('p', 'story-speaker');
  const title = element('h2', 'story-title'); title.id = 'story-title';
  const text = element('div', 'story-text');
  const task = element('p', 'story-task'); task.id = 'story-task';
  copy.append(speaker, title, text, task);
  layout.append(figure, copy);
  const actions = element('footer', 'story-actions');
  const skip = element('button', 'story-skip', '跳过剧情');
  const next = element('button', 'story-continue');
  for (const button of [skip, next]) {
    button.type = 'button';
    button.addEventListener('click', () => dialog.close());
  }
  actions.append(skip, next);
  dialog.append(layout, actions);
  for (const type of ['keydown', 'keyup']) dialog.addEventListener(type, event => event.stopPropagation());
  dialog.addEventListener('close', () => finishStory());
  document.body.append(dialog);
}

export function openStory(chapter, { student, round, once = false } = {}) {
  if (active) return active.promise;
  const entry = STORY[chapter];
  if (!entry || typeof document === 'undefined') return Promise.resolve();
  const key = storySessionKey(student, round, chapter);
  if (once && hasSeen(key)) return Promise.resolve();
  if (!dialog) createDialog();
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  active = { key, promise, resolve, trigger: document.activeElement };
  dialog.className = 'story-dialog';
  dialog.querySelector('.story-speaker').textContent = entry.speaker;
  dialog.querySelector('.story-title').textContent = entry.title;
  const text = dialog.querySelector('.story-text');
  text.replaceChildren(...(Array.isArray(entry.text) ? entry.text : [entry.text]).map(line => {
    const paragraph = document.createElement('p'); paragraph.textContent = line; return paragraph;
  }));
  dialog.querySelector('.story-task').textContent = '本次任务：' + entry.task;
  const image = dialog.querySelector('.story-image');
  image.hidden = false;
  dialog.querySelector('.story-figure').hidden = false;
  image.alt = entry.imageAlt;
  image.src = entry.image;
  const next = dialog.querySelector('.story-continue');
  next.textContent = entry.action;
  document.body.classList.add('story-open');
  try {
    dialog.showModal();
    next.focus();
  } catch {
    finishStory(false);
  }
  return promise;
}
