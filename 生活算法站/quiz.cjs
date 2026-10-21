'use strict';
/* 课堂检测（20题）：每题标注指向的教材目标/重难点。
 * G1 目标1 顺序结构与算法作用 · G2 目标2 算法是方法描述 · K1 重难点1 自然语言描述 · K2 重难点2 明确有序步骤/流程图
 * 每个目标各抽5题（题库各8题）。题型侧重：判断执行结果、找出步骤毛病、在新情境中写/排步骤，少考背诵。
 * 层级：A 习得 · M 意义 · T 迁移（新情境）。选项在服务端打乱。 */
const crypto = require('node:crypto');
const groups = [
  ['G1', '目标1 顺序结构与算法作用', [
    ['A', '温度换算按“输入华氏温度→计算摄氏温度→输出摄氏温度”一步接一步执行。这种结构叫什么？', ['顺序结构', '随便结构', '同时结构', '答案结构'], 0, '按顺序依次执行各个步骤的结构叫顺序结构，是最基本的结构。'],
    ['M', '小周算 50℉ 时，先乘5、再除以9、最后减32，得到约 −4.2℃。这说明什么？', ['计算的步骤和顺序会直接影响结果', '公式里的数字写错了', '50℉ 本来就是零下', '顺序不重要，只是计算器出错'], 0, '同样的三个运算，换了先后，结果就不同；要先减32。'],
    ['M', '种子题里，为什么必须先算第 n 组的种子数 m，再算总数 s？', ['因为算 s 的公式要用到 m', '因为 m 的数字比较小', '因为老师规定的', '其实先算谁都可以'], 0, 's = n×(3+m)÷2 用到 m，前一步的结果是后一步的材料。'],
    ['M', '教材说“没有计算方法的指导，很难进行计算，也就得不到答案”。这说明算法在解题中的作用是？', ['告诉我们一步步怎么算', '直接给出答案', '让题目更难', '代替所有数学知识'], 0, '算法就是计算的方法，指导我们得到答案。'],
    ['T', '做蛋炒饭：①打蛋 ②炒蛋 ③放米饭翻炒 ④装盘。如果把④放到第一步，会怎样？', ['还没炒就装盘，做不成，顺序结构被打乱', '没有影响', '会更快做好', '只是写法不同'], 0, '生活中的顺序结构同样要求先后正确。'],
    ['A', '用流程线把图框自上而下连接起来，A 框在 B 框上面。执行时？', ['执行完 A 框的操作后，才执行 B 框', '先执行 B 框', 'A、B 同时执行', '随便挑一个执行'], 0, '顺序结构：前一个框做完，才做下一个框。'],
    ['T', '阅读签到：签到1次1分，2次4分，3次7分，4次10分……。小林找到规律“积分=3×次数−2”。在用它算15次之前，最好先做什么？', ['用1～4次的数据代进去举例验证', '直接算，不用检查', '把15次改成10次', '去问别人答案'], 0, '先举例验证规律，再按步骤计算：3×15−2=43。'],
    ['M', '下面哪种情况最能说明“顺序结构”的特点？', ['后一步要用到前一步的结果', '每一步都可以单独先做', '步骤越多越好', '只要有输出就行'], 0, '顺序结构中步骤依次执行，后面常依赖前面的结果。']
  ]],
  ['G2', '目标2 算法是方法描述', [
    ['A', '“50℉ 换算成摄氏温度”这件事里，算法是指什么？', ['把任意华氏温度换算成摄氏温度的明确步骤', '10℃ 这个答案', '温度计', '友好学校的名字'], 0, '算法是解决问题的方法描述，不是某一个答案。'],
    ['M', '小安的步骤：第1步输入华氏温度；第2步输出“10℃”。输入 50℉ 时对了。为什么说它不是好算法？', ['换成 86℉ 还输出 10℃，它写死了答案，不是方法', '步骤太少', '没有用流程图', '它完全正确'], 0, '好算法换一个输入也能照着算对。'],
    ['M', '为什么说“摄氏温度=5×(华氏温度−32)÷9”这个公式也是一种简单的算法？', ['给定输入，按它计算就能得到输出', '因为它很长', '因为它有括号', '因为老师说的'], 0, '公式建立了转换规则：输入—处理—输出。'],
    ['A', '分析温度问题时，“所求是什么、已知是什么、怎么求解”分别对应？', ['输出、输入、处理', '输入、输出、处理', '处理、输入、输出', '三者没有关系'], 0, '已知→输入，怎么求→处理，所求→输出。'],
    ['T', '下面哪一项是“方法描述”，而不是“答案”？', ['输入长和宽，计算（长+宽）×2，输出周长', '周长是20米', '大约二十米吧', '花坛很漂亮'], 0, '方法描述说清怎么做，换数据也能用。'],
    ['M', '“算法就是计算的方法，根据问题解决的要求，通过计算获得问题的答案。”下面哪句理解正确？', ['先有方法，按方法计算才得到答案', '先有答案，再编方法', '方法和答案是一回事', '有答案就不需要方法'], 0, '方法在前，答案是执行方法的结果。'],
    ['T', '路程=速度×时间。从算法视角看，“速度”和“时间”是？', ['输入', '输出', '处理', '结束'], 0, '已知的数据是输入，路程是输出。'],
    ['M', '同一个算法，换不同的输入数据，会怎样？', ['按同样的步骤，得到对应的不同结果', '结果永远一样', '步骤要全部重写', '就不能用了'], 0, '算法描述的是方法，适用于同一类问题的不同数据。']
  ]],
  ['K1', '重难点1 自然语言描述算法', [
    ['A', '用自然语言写温度换算算法，正确的是？', ['第1步输入华氏温度；第2步用华氏温度减32，乘5，再除以9，算出摄氏温度；第3步输出摄氏温度', '第1步输出摄氏温度；第2步输入华氏温度；第3步计算', '第1步想一想；第2步算一下；第3步写答案', '第1步写出10℃'], 0, '每步说清做什么、对哪个数据、怎么算，先后正确。'],
    ['M', '小周写：“第2步：算一下。”同桌照着做时会卡住，因为？', ['没写怎么算、算什么，步骤不明确', '字太少不好看', '应该写成第3步', '没有问题'], 0, '算法步骤要明确、可执行。'],
    ['M', '种子题的步骤，哪一组顺序是对的？', ['输入组数n → 用m=n×2+1算m → 用s=n×(3+m)÷2算s → 输出m和s', '输入n → 算s → 算m → 输出', '输出m和s → 输入n → 算m → 算s', '算m → 算s → 输入n → 输出'], 0, 's 要用到 m，所以先算 m。'],
    ['T', '为小组跳绳求平均个数写步骤，缺了哪一步？“第1步：输入跳绳总个数和人数；第2步：用总个数÷人数算出平均个数。”', ['输出平均个数', '输入平均个数', '想一想', '计算人数'], 0, '完整的算法要有输入、处理、输出。'],
    ['A', '自然语言描述算法时，“明确”指的是？', ['每一步写清做什么、用哪个数据、怎么算', '句子越优美越好', '步骤越短越好', '只写最后结果'], 0, '明确=别人照着做不会产生疑问。'],
    ['M', '小林写：“第1步：计算摄氏温度；第2步：输入华氏温度；第3步：输出。”问题出在哪？', ['还没输入华氏温度就计算，顺序错了', '没有问题', '应该先输出', '少写了答案'], 0, '计算要用到的数据必须先输入。'],
    ['T', '签到积分的方法卡，哪一份写得最好？', ['第1步输入签到次数；第2步用3×签到次数−2算出积分；第3步输出积分', '第1步：签到15次是43分', '第1步算一下积分；第2步输出', '第1步输出积分；第2步输入签到次数'], 0, '明确、有序、完整，任何次数都能算。'],
    ['A', '“第2步：用华氏温度减32，乘5，再除以9，算出摄氏温度。”这一步属于？', ['处理（计算）', '输入', '输出', '开始'], 0, '按公式计算是处理步骤。']
  ]],
  ['K2', '重难点2 明确有序的步骤/流程图', [
    ['A', '流程图中，圆角矩形表示？', ['算法的开始或结束', '过程的执行与处理', '数据的输入或输出', '流程线'], 0, '圆角矩形：表示算法的开始或结束。'],
    ['A', '流程图中，平行四边形表示？', ['数据的输入或输出', '开始或结束', '处理与计算', '注释'], 0, '平行四边形：表示数据的输入或输出。'],
    ['A', '流程图中，“计算摄氏温度值”应该画在哪种图框里？', ['直角矩形', '圆角矩形', '平行四边形', '不用画框'], 0, '直角矩形表示过程的执行与处理。'],
    ['M', '带箭头的流程线有什么作用？', ['连接图框，表示执行的先后顺序和方向', '让图更好看', '表示温度高低', '可以省略'], 0, '流程线表示执行方向，顺序一目了然。'],
    ['M', '同学画的温度流程图：开始→输入华氏温度值→输出摄氏温度值→计算摄氏温度值→结束。错在哪？', ['还没计算就输出，计算和输出顺序反了', '开始框画错了', '没有错', '少了一个输入框'], 0, '先计算，后输出。'],
    ['T', '画“长方形周长”的流程图，正确的图框顺序是？', ['开始→输入长和宽→计算（长+宽）×2→输出周长→结束', '开始→计算→输入→输出→结束', '输入→开始→计算→结束', '开始→输出周长→结束'], 0, '顺序结构：开始、输入、处理、输出、结束。'],
    ['M', '自然语言步骤和流程图有什么关系？', ['是描述同一个算法的两种方式，流程图更直观', '流程图是另一种算法', '两者没有关系', '有了流程图就不需要步骤'], 0, '同一算法可以用自然语言或流程图描述。'],
    ['T', '流程图里“输出m和s”画成了直角矩形。应该怎么改？', ['改成平行四边形', '改成圆角矩形', '删掉这个框', '不用改'], 0, '输出用平行四边形。']
  ]]
];
const legacyQuestions = groups.flatMap(([code, goal, items]) => items.map(([level, prompt, options, answer, explanation], i) => ({
  id: `${code}-${i + 1}`, target: code, goal, level, prompt, options, answer, explanation
})));
const metadata = {
  "G1-1": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：识别顺序执行"
  },
  "G1-2": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：比较运算顺序与结果"
  },
  "G1-3": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：分析前后步骤的数据依赖"
  },
  "G1-4": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：理解算法在求解中的作用"
  },
  "G1-5": {
    "tier": "challenge",
    "type": "choice",
    "literacy": "计算思维：在生活情境推演步骤后果"
  },
  "G1-6": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：沿流程方向执行"
  },
  "G1-7": {
    "tier": "challenge",
    "type": "choice",
    "literacy": "计算思维：用实例验证规律"
  },
  "G1-8": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：辨认顺序结构中的前后联系"
  },
  "G2-1": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：区分求解方法与一次答案"
  },
  "G2-2": {
    "tier": "challenge",
    "type": "choice",
    "literacy": "计算思维：用变化输入检验方法的适用性"
  },
  "G2-3": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：建立输入规则输出关系"
  },
  "G2-4": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：对应所求已知与求解过程"
  },
  "G2-5": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：在熟悉数学情境辨认通用方法"
  },
  "G2-6": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：解释方法与计算结果的关系"
  },
  "G2-7": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：识别新计算任务的输入"
  },
  "G2-8": {
    "tier": "challenge",
    "type": "choice",
    "literacy": "计算思维：概括同一方法对变化输入的作用",
    "excludedFromNewDraw": true
  },
  "K1-1": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：辨认明确完整的自然语言步骤"
  },
  "K1-2": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：诊断含糊不可执行的步骤"
  },
  "K1-3": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：按数据依赖排列算法步骤"
  },
  "K1-4": {
    "tier": "challenge",
    "type": "choice",
    "literacy": "计算思维：检查新情境算法的完整性"
  },
  "K1-5": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：判断步骤表达是否明确"
  },
  "K1-6": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：发现先计算后输入的错误"
  },
  "K1-7": {
    "tier": "challenge",
    "type": "choice",
    "literacy": "计算思维：评价变化情境中的方法卡"
  },
  "K1-8": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：辨认步骤的处理功能"
  },
  "K2-1": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：使用流程图表示开始结束"
  },
  "K2-2": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：使用流程图表示输入输出"
  },
  "K2-3": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：按操作内容选择处理图框"
  },
  "K2-4": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：读取流程线的执行方向"
  },
  "K2-5": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：诊断流程中的提前输出"
  },
  "K2-6": {
    "tier": "challenge",
    "type": "choice",
    "literacy": "计算思维：在新公式情境组织完整流程"
  },
  "K2-7": {
    "tier": "challenge",
    "type": "choice",
    "literacy": "计算思维：联系自然语言与流程图两种表达"
  },
  "K2-8": {
    "tier": "base",
    "type": "choice",
    "literacy": "计算思维：按输出功能修正图框"
  }
};
const interactiveQuestions = [
  {
    "id": "G1-I1",
    "target": "G1",
    "goal": "目标1 顺序结构与算法作用",
    "tier": "base",
    "type": "order",
    "level": "M",
    "literacy": "计算思维：把计算步骤按执行顺序组织",
    "prompt": "买同样的笔，总价＝单价×数量。把三步排好。",
    "instruction": "点卡片的“上移”或“下移”，排好后检查。",
    "interaction": {
      "items": [
        {
          "id": "calc_total",
          "text": "用单价×数量计算总价"
        },
        {
          "id": "show_total",
          "text": "输出总价"
        },
        {
          "id": "read_data",
          "text": "输入单价和数量"
        }
      ],
      "initialOrder": [
        "calc_total",
        "show_total",
        "read_data"
      ],
      "controls": [
        "moveUp",
        "moveDown"
      ],
      "dragRequired": false
    },
    "answer": [
      "read_data",
      "calc_total",
      "show_total"
    ],
    "explanation": "先输入已知的单价和数量，再计算总价，最后输出结果。计算需要先获得数据，输出需要先算出结果。"
  },
  {
    "id": "G2-I1",
    "target": "G2",
    "goal": "目标2 算法是方法描述",
    "tier": "base",
    "type": "match",
    "level": "M",
    "literacy": "计算思维：区分通用方法、输入和一次结果",
    "prompt": "每盒彩笔6元。把三张卡片与它的含义配对。",
    "instruction": "先点左侧卡片，再点右侧含义；可以重新配对。",
    "interaction": {
      "leftItems": [
        {
          "id": "method_card",
          "text": "输入盒数→盒数×6→输出总价"
        },
        {
          "id": "result_card",
          "text": "18元"
        },
        {
          "id": "input_card",
          "text": "买3盒"
        }
      ],
      "rightItems": [
        {
          "id": "one_result",
          "text": "一次购买的结果"
        },
        {
          "id": "known_input",
          "text": "输入数据"
        },
        {
          "id": "general_method",
          "text": "适用于不同盒数的方法"
        }
      ],
      "selectionMode": "click_pair",
      "oneToOne": true,
      "dragRequired": false
    },
    "answer": {
      "method_card": "general_method",
      "result_card": "one_result",
      "input_card": "known_input"
    },
    "explanation": "“输入盒数→盒数×6→输出总价”描述怎样算，换盒数仍可使用；18元是一次计算的结果；买3盒是这次给定的输入。"
  },
  {
    "id": "K1-I1",
    "target": "K1",
    "goal": "重难点1 自然语言描述算法",
    "tier": "base",
    "type": "order",
    "level": "M",
    "literacy": "计算思维：按数据依赖组织自然语言算法",
    "prompt": "每盒彩笔6元，买2盒，共优惠2元。把求应付金额的四步排好。",
    "instruction": "点卡片的“上移”或“下移”，排好后检查。",
    "interaction": {
      "items": [
        {
          "id": "show_pay",
          "text": "输出应付金额"
        },
        {
          "id": "calc_pay",
          "text": "用原价－2计算应付金额"
        },
        {
          "id": "read_boxes",
          "text": "输入购买盒数"
        },
        {
          "id": "calc_price",
          "text": "用购买盒数×6计算原价"
        }
      ],
      "initialOrder": [
        "show_pay",
        "calc_pay",
        "read_boxes",
        "calc_price"
      ],
      "controls": [
        "moveUp",
        "moveDown"
      ],
      "dragRequired": false
    },
    "answer": [
      "read_boxes",
      "calc_price",
      "calc_pay",
      "show_pay"
    ],
    "explanation": "先输入盒数，再求原价，才能用原价减优惠求应付金额，最后输出。正确执行时原价12元，应付10元；这些数值不是作答时的提示。"
  },
  {
    "id": "K2-I1",
    "target": "K2",
    "goal": "重难点2 明确有序的步骤/流程图",
    "tier": "base",
    "type": "flow",
    "level": "M",
    "literacy": "计算思维：把操作功能对应到流程图符号",
    "prompt": "求购物总价。给三个内容配上合适的图框。",
    "instruction": "先点左侧内容，再点右侧图框；可以重新配对。",
    "interaction": {
      "leftItems": [
        {
          "id": "begin",
          "text": "开始"
        },
        {
          "id": "calculate",
          "text": "计算总价＝单价×数量"
        },
        {
          "id": "output",
          "text": "输出总价"
        }
      ],
      "rightItems": [
        {
          "id": "parallelogram",
          "text": "平行四边形",
          "shape": "parallelogram"
        },
        {
          "id": "rounded_rectangle",
          "text": "圆角矩形",
          "shape": "rounded_rectangle"
        },
        {
          "id": "rectangle",
          "text": "直角矩形",
          "shape": "rectangle"
        }
      ],
      "selectionMode": "click_pair",
      "oneToOne": true,
      "dragRequired": false
    },
    "answer": {
      "begin": "rounded_rectangle",
      "calculate": "rectangle",
      "output": "parallelogram"
    },
    "explanation": "开始或结束用圆角矩形；计算处理用直角矩形；输入或输出用平行四边形。根据每个内容在算法中的作用选框。"
  }
];
const questions = [...legacyQuestions.map(q => ({ ...q, ...metadata[q.id] })), ...interactiveQuestions];
const BANK_VERSION = 'lesson5-bank-v20261021';
const PAPER_VERSION = 'lesson5-paper-v20261021';
const paperConfig = { base: { count: 16, perTarget: 4, interactivePerTarget: 1, choicePerTarget: 3 }, challenge: { count: 4, perTarget: 1, choicePerTarget: 1 }, passPercent: 80 };
const randomize = list => list.map(value => ({ value, n: crypto.randomInt(0, 1e9) })).sort((a, b) => a.n - b.n).map(x => x.value);
// Historical 20-question sampling remains available for old tooling; new examinations use pickPaper.
const PER_GOAL = [5, 5, 5, 5];
function pickQuestions() { return groups.flatMap(([code], index) => randomize(legacyQuestions.filter(q => q.target === code)).slice(0, PER_GOAL[index])); }
function pickPaper(tier = 'base') {
  const config = paperConfig[tier];
  if (!config || !['base', 'challenge'].includes(tier)) throw new Error('未知检测层级');
  return groups.flatMap(([code]) => {
    const pool = questions.filter(q => q.target === code && q.tier === tier && !q.excludedFromNewDraw);
    const fixed = tier === 'base' ? pool.filter(q => q.type !== 'choice') : [];
    return randomize([...fixed, ...randomize(pool.filter(q => q.type === 'choice')).slice(0, config.choicePerTarget)]);
  });
}
function publicQuestion(q) {
  return Object.fromEntries(['id', 'target', 'goal', 'level', 'tier', 'type', 'literacy', 'prompt', 'options', 'instruction', 'interaction'].filter(k => q[k] !== undefined).map(k => [k, q[k]]));
}
function gradeAnswer(q, answer) {
  if (!q.type || q.type === 'choice') return Number.isInteger(answer) && answer === q.answer;
  if (q.type === 'order') return Array.isArray(answer) && answer.length === q.answer.length && answer.every((value, i) => value === q.answer[i]);
  if (q.type === 'match' || q.type === 'flow') {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;
    const keys = Object.keys(q.answer), given = Object.keys(answer);
    return given.length === keys.length && new Set(Object.values(answer)).size === keys.length && keys.every(key => Object.hasOwn(answer, key) && answer[key] === q.answer[key]);
  }
  return false;
}
module.exports = { questions, groups: groups.map(([, goal]) => goal), codes: groups.map(([c]) => c), pickQuestions, pickPaper, publicQuestion, gradeAnswer, paperConfig, BANK_VERSION, PAPER_VERSION, PER_GOAL };
