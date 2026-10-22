export function moveItem(items,index,direction) {
 const next=items.slice(),to=index+direction;
 if(index>=0&&to>=0&&index<next.length&&to<next.length) [next[index],next[to]]=[next[to],next[index]];
 return next;
}
export function assignPair(answer,left,right) {
 const next=Object.fromEntries(Object.entries(answer||{}).filter(([l,r])=>l!==left&&r!==right));
 next[left]=right;return next;
}
export function answerComplete(q,value) {
 if (!q.type || q.type==='choice') return Number.isInteger(value);
 const interaction=q.interaction||{};
 if(q.type==='order') return Array.isArray(value)&&value.length===interaction.items.length&&new Set(value).size===value.length&&value.every(id=>interaction.items.some(x=>x.id===id));
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===interaction.leftItems.length&&new Set(Object.values(value)).size===interaction.leftItems.length&&interaction.leftItems.every(x=>interaction.rightItems.some(y=>y.id===value[x.id]));
}
/** Selection-only controls: no answer key, no correctness feedback before submission. */
export function mountQuestion(host,q,answers,onChange) {
 const el=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=text;node.className=cls||'';return node;};
 let selected=null;
 const draw=()=>{
 host.replaceChildren();
 if(!q.type||q.type==='choice') {
  q.options.forEach((text,i)=>{const b=el('button',text,'opt');b.type='button';b.setAttribute('aria-pressed',String(answers[q.id]===i));b.onclick=()=>{answers[q.id]=i;draw();onChange();host.querySelectorAll('button')[i]?.focus();};host.append(b);});return;
 }
 if(q.type==='order') {
  const order=answers[q.id] || (q.interaction.initialOrder||q.interaction.items.map(x=>x.id)).slice();
  const list=el('ol','','quiz-order');
  order.forEach((id,index)=>{const row=el('li',''),text=el('span',q.interaction.items.find(x=>x.id===id)?.text||id);row.append(text);
   [-1,1].forEach(direction=>{const b=el('button',direction<0?'上移':'下移','ghost-btn');b.type='button';b.disabled=direction<0?index===0:index===order.length-1;b.setAttribute('aria-label',`${text.textContent}，${b.textContent}`);b.onclick=()=>{answers[q.id]=moveItem(order,index,direction);draw();onChange();const rowButtons=host.querySelectorAll('.quiz-order li')[index+direction]?.querySelectorAll('button');const preferred=rowButtons?.[direction<0?0:1];(preferred&&!preferred.disabled?preferred:[...(rowButtons||[])].find(button=>!button.disabled))?.focus();};row.append(b);});list.append(row);});host.append(list);
  const confirm=el('button',answers[q.id]?'已记录当前顺序':'确认当前顺序','ghost-btn');confirm.type='button';confirm.onclick=()=>{answers[q.id]=order.slice();draw();onChange();host.lastElementChild?.focus();};host.append(confirm);return;
 }
 const mapping=answers[q.id]||{}, left=el('div','','quiz-pair-left'),right=el('div','','quiz-pair-right');
 const layout=el('div','','quiz-pair');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('class','quiz-links');svg.setAttribute('aria-hidden','true');
 q.interaction.leftItems.forEach(x=>{const b=el('button',x.text,'opt');b.type='button';b.dataset.left=x.id;b.setAttribute('aria-pressed',String(selected===x.id));b.onclick=()=>{selected=x.id;draw();onChange();host.querySelector('.quiz-pair-right button')?.focus();};left.append(b);});
 q.interaction.rightItems.forEach(x=>{const b=el('button',x.text,'opt quiz-shape '+(x.shape||''));b.type='button';b.dataset.right=x.id;b.disabled=!selected;b.onclick=()=>{answers[q.id]=assignPair(mapping,selected,x.id);selected=null;draw();onChange();const next=q.interaction.leftItems.findIndex(item=>!answers[q.id][item.id]);host.querySelectorAll('.quiz-pair-left button')[Math.max(0,next)]?.focus();};right.append(b);});
 layout.append(svg,left,right);host.append(layout,el('p',selected?'再点右侧，完成这一对。':'先点左侧内容，再点右侧含义，配好会连一条线。','note'));
 requestAnimationFrame(()=>drawMatchLinks(layout,svg,mapping,q.answer));
};
 draw();
}

const SVG_NS='http://www.w3.org/2000/svg';
/**
 * 在配对容器里画连线。
 * 有标准答案时（提交后的回看）：配对成功=绿色，配错=红色；
 * 答题过程中（q.answer 未下发）用虚线，不泄露对错。
 */
export function drawMatchLinks(pair,svg,mapping,answer) {
 if(!pair||!svg) return;
 const box=pair.getBoundingClientRect();
 if(!box.width||!box.height) return;
 svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
 svg.setAttribute('width',String(box.width));
 svg.setAttribute('height',String(box.height));
 svg.replaceChildren();
 for(const [leftId,rightId] of Object.entries(mapping||{})){
  const a=pair.querySelector(`[data-left="${leftId}"]`),b=pair.querySelector(`[data-right="${rightId}"]`);
  if(!a||!b) continue;
  const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();
  const line=document.createElementNS(SVG_NS,'line');
  line.setAttribute('x1',String(ra.right-box.left));
  line.setAttribute('y1',String(ra.top+ra.height/2-box.top));
  line.setAttribute('x2',String(rb.left-box.left));
  line.setAttribute('y2',String(rb.top+rb.height/2-box.top));
  let cls='quiz-link pending';
  if(answer) cls=answer[leftId]===rightId?'quiz-link ok':'quiz-link bad';
  line.setAttribute('class',cls);
  if(answer) line.setAttribute('aria-label',answer[leftId]===rightId?'配对成功':'配对错误');
  svg.append(line);
 }
}

/** 提交后的只读回看：绿线=配对成功，红线=配对错误 */
export function mountMatchReview(host,q,chosen) {
 if(!host||!q||q.type!=='match'||!q.interaction) return;
 host.replaceChildren();
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;n.className=cls||'';return n;};
 const layout=el('div','','quiz-pair');
 const svg=document.createElementNS(SVG_NS,'svg');
 svg.setAttribute('class','quiz-links');
 svg.setAttribute('aria-hidden','true');
 const left=el('div','','quiz-pair-left'),right=el('div','','quiz-pair-right');
 for(const x of q.interaction.leftItems){const b=el('button',x.text,'opt');b.type='button';b.disabled=true;b.dataset.left=x.id;left.append(b);}
 for(const x of q.interaction.rightItems){const b=el('button',x.text,'opt quiz-shape '+(x.shape||''));b.type='button';b.disabled=true;b.dataset.right=x.id;right.append(b);}
 layout.append(svg,left,right);
 host.append(layout);
 requestAnimationFrame(()=>drawMatchLinks(layout,svg,chosen||{},q.answer));
}
