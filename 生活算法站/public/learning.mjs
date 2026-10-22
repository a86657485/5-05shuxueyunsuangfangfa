/* 先学卡：要点逐条打字机出现，且至少停留 5 秒才可关闭 */
import { typeLines, holdButtons, canAnimate, isHeld, dwellFor, CPS_CARD } from './typewriter.mjs';

export const MATERIAL_VERSION = "v20261021";
export const CARDS = {
  "temp": {
    "title": "先学一学：把计算说清楚",
    "bookPage": 31,
    "image": "temp-textbook-p31.png",
    "explain": [
      "先问自己：要算什么？已经知道什么？准备用哪条规则？",
      "输入是拿到的数，处理是按规则计算，输出是给出的结果。",
      "同一个计算方法，换一个输入也应该能照着做。",
      "温度换算先算括号里的“华氏温度减32”，再把结果乘5、除以9。"
    ],
    "exampleTitle": "跟着做：把68℉换成摄氏温度（示例数据）",
    "exampleSteps": [
      "输入：华氏温度68。",
      "先算括号：68－32＝36。",
      "把36乘5，得到180；再除以9，得到20。",
      "输出：摄氏温度20℃。把方法写成“输入华氏温度→按公式计算→输出摄氏温度”，换数还可以用。"
    ],
    "next": "现在用教材里的50℉自己分析三问、安排计算顺序、写三步方法，再换一个输入检验。"
  },
  "flow": {
    "title": "先学一学：流程图怎样表示步骤",
    "bookPage": 32,
    "image": "flow-textbook-p32.png",
    "explain": [
      "流程图把每一步写进图框，用箭头告诉别人按什么方向做。",
      "圆角矩形表示开始或结束，直角矩形表示计算和处理。",
      "平行四边形表示输入或输出。",
      "顺序结构沿箭头一步一步执行：先拿到数，再计算，最后给结果。"
    ],
    "exampleTitle": "跟着看：原有4张贴纸，再得到3张（类似问题）",
    "exampleSteps": [
      "开始（圆角矩形）。",
      "输入原有贴纸数4（平行四边形）。",
      "计算贴纸总数：4＋3＝7（直角矩形）。",
      "输出总数7（平行四边形），然后结束（圆角矩形）。",
      "用箭头依次连接；若先输出再计算，执行者还拿不到结果。"
    ],
    "next": "现在查看同学的温度流程图，逐框检查“这一步做什么、图框是否合适、顺序是否能执行”，自己找错并修改。"
  },
  "seeds": {
    "title": "先学一学：两个结果，按顺序求",
    "bookPage": 33,
    "image": "seeds-textbook-p33.png",
    "explain": [
      "n是要分到第几组，也表示一共有多少组；m是第n组的种子数，s是前n组的种子总数。",
      "题目要两个结果：第n组分几粒，以及前n组一共分几粒。",
      "先用n算出m，再把m放进总数公式算s；后一步需要前一步的结果。",
      "可以写成四步：输入n、计算m、计算s、输出m和s。",
      "学习怎样使用公式和安排步骤即可，暂时不需要自己推导总数公式。"
    ],
    "exampleTitle": "跟着做：先看4组的情况（示例数据）",
    "exampleSteps": [
      "输入组数n＝4。",
      "先求第4组：m＝4×2＋1＝9（粒）。",
      "再求总数：s＝4×（3＋9）÷2＝24（粒）。",
      "输出m＝9粒、s＝24粒。用3＋5＋7＋9＝24再检查一次。"
    ],
    "next": "现在保留教材“第1组3粒、第2组5粒、第3组7粒……”的条件，自己求10组的两个结果，再写步骤、检查流程图并换组数验证。"
  },
  "signin": {
    "title": "先学一学：找规律，还要验证",
    "bookPage": 34,
    "image": "signin-textbook-p34.png",
    "explain": [
      "遇到一串积分，先比较相邻两次：每次增加多少？",
      "再看第1次已经有多少；从第1次到第k次，一共增加了k－1次。",
      "写出规律后，把前几次的数放回去算，看看是否都对得上。",
      "方法卡要写“怎样根据次数求积分”，换一个次数也要能照着算。"
    ],
    "exampleTitle": "跟着做：另一种奖励规则2、6、10、14……（不同规则示例）",
    "exampleSteps": [
      "观察：第一次有2枚，以后每次增加4枚。",
      "求第5次：从第1次到第5次，增加5－1＝4次。",
      "计算：2＋4×4＝18（枚）。这条示例规律也可写成“奖励数＝4×次数－2”。",
      "代回检查：1次得2，2次得6，3次得10，和示例表一致。"
    ],
    "next": "现在回到教材的1、4、7、10……，自己找这条规律并举例验证，再做“签到15次”和“换次数”都能用的方法卡。"
  },
  "formula": {
    "title": "选做前看一眼：公式也能写成算法",
    "bookPage": 34,
    "image": "formula-textbook-p34.png",
    "explain": [
      "先选一个自己学过的公式。",
      "写清需要输入哪些数、用什么公式计算、最后输出什么。",
      "同一方法换一组数还能算对，才说明没有把某次答案写死。"
    ],
    "exampleTitle": "例：求长方形周长，长5米、宽2米（示例数据）",
    "exampleSteps": [
      "输入长5和宽2。",
      "先算5＋2＝7，再算7×2＝14。",
      "输出周长14米；方法仍写“（长＋宽）×2”，不要只写14。"
    ],
    "next": "现在自选现有公式任务，写出自己的三步方法并换数验证；可随时退出选做。"
  }
};
export const learningKey = (student, round, stage) => 'lesson5-learning:' + JSON.stringify([MATERIAL_VERSION, student?.classId || '', student?.id || '', round, stage]);
const viewed = new Set();
let active = null;
export function openLearning(stage, { student, round, once = false } = {}) {
 const card = CARDS[stage];
 if (!card || active) return active || Promise.resolve();
 const key = learningKey(student,round,stage);
 try { if (once && (viewed.has(key) || localStorage.getItem(key))) return Promise.resolve(); } catch {}
 const trigger = document.activeElement;
 const dialog = document.createElement('dialog');
 dialog.className='learning-dialog'; dialog.setAttribute('aria-labelledby','learning-title');
 const make=(tag, text, cls)=> {const e=document.createElement(tag);e.textContent=text;e.className=cls||'';return e;};
 const head=make('header','','learning-head');
 head.append(make('h2',card.title,'learning-title')); head.querySelector('h2').id='learning-title';
 const close=make('button','关闭，回到当前任务','ghost-btn');close.type='button';close.onclick=()=>dialog.close();head.append(close);
 const body=make('div','','learning-grid'), figure=make('figure','','learning-figure');
 const image=make('img',''); image.src='./assets/learning/'+card.image;image.alt='教材第'+card.bookPage+'页相关学习内容';
 const fail=make('p','教材图暂时没有加载出来。右侧的知识讲解和例子仍可学习，完成后开始探究。','note');fail.hidden=true;
 image.onerror=()=>{image.hidden=true;fail.hidden=false;};
 const zoom=make('button','放大教材图','ghost-btn');zoom.type='button';zoom.onclick=()=>{const on=dialog.classList.toggle('learning-zoom');zoom.textContent=on?'还原教材图':'放大教材图';zoom.setAttribute('aria-pressed',String(on));};
 figure.append(image,fail,make('figcaption','教材第'+card.bookPage+'页'),zoom);
 const copy=make('div','','learning-copy');
 copy.append(make('h3','抓住这几个要点'));
 const list=make('ul','');const items=card.explain.map(()=>{const li=make('li','');list.append(li);return li;});copy.append(list);
 const exampleHead=make('h3',card.exampleTitle);
 const steps=make('ol','');card.exampleSteps.forEach(s=>steps.append(make('li',s)));
 const nextNote=make('p',card.next,'learning-next');
 copy.append(exampleHead,steps,nextNote);
 body.append(figure,copy);const foot=make('footer','','learning-actions'),go=make('button','开始探究','go-btn');go.type='button';go.onclick=()=>dialog.close();foot.append(go);dialog.append(head,body,foot);
 document.body.append(dialog);
 // 要点逐条打字，例子在要点讲完后才出现
 if (canAnimate()) {
   exampleHead.hidden=steps.hidden=nextNote.hidden=true;
   typeLines(items.map((li,i)=>[li,card.explain[i]]),{cps:CPS_CARD}).then(()=>{exampleHead.hidden=steps.hidden=nextNote.hidden=false;});
 } else {
   items.forEach((li,i)=>{li.textContent=card.explain[i];});
 }
 // 讲解窗口至少停留 5 秒：关闭与「开始探究」在此期间不可用
 holdButtons([close,go],dwellFor(items.map((li,i)=>[li,card.explain[i]]),{cps:CPS_CARD}),{countdown:go});
 active=new Promise(resolve=>{dialog.addEventListener('close',()=>{viewed.add(key);try{localStorage.setItem(key,'seen');}catch{} dialog.remove();active=null;if(trigger?.isConnected) trigger.focus();resolve();},{once:true});});
 ['keydown','keyup'].forEach(type=>dialog.addEventListener(type,e=>e.stopPropagation()));
 // 保护期内不允许按 ESC 提前关闭
 dialog.addEventListener('cancel',e=>{if(isHeld())e.preventDefault();});
 dialog.showModal();if(!go.disabled)go.focus();return active;
}
