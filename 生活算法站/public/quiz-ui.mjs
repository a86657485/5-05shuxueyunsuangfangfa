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
 q.interaction.leftItems.forEach(x=>{const partner=q.interaction.rightItems.find(y=>y.id===mapping[x.id]);const b=el('button',x.text+(partner?' → '+partner.text:''),'opt');b.type='button';b.setAttribute('aria-pressed',String(selected===x.id));b.onclick=()=>{selected=x.id;draw();onChange();host.querySelector('.quiz-pair-right button')?.focus();};left.append(b);});
 q.interaction.rightItems.forEach(x=>{const b=el('button',x.text,'opt quiz-shape '+(x.shape||''));b.type='button';b.disabled=!selected;b.onclick=()=>{answers[q.id]=assignPair(mapping,selected,x.id);selected=null;draw();onChange();const next=q.interaction.leftItems.findIndex(item=>!answers[q.id][item.id]);host.querySelectorAll('.quiz-pair-left button')[Math.max(0,next)]?.focus();};right.append(b);});
 layout.append(left,right);host.append(layout,el('p',selected?'再点右侧，完成这一对。':'先点左侧内容，再点右侧含义。已经配好也能重新选择。','note'));
 };
 draw();
}
