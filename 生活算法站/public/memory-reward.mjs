/**
 * Algorithm partner memory game. Adapted from Tania Rascia's memory,
 * commit 4c991ddb6b7db2f72945b09d9c8e82af6356482b (MIT).
 * Original matching/reset/selection mechanism: /vendor/memory/script.original.js.
 * License: /licenses/memory-MIT.txt. Original character images are not used.
 */
const PAIRS = [
 ['input','输入','已知数'], ['process','处理','按规则计算'], ['output','输出','给出结果'],
 ['terminal','开始／结束','圆角矩形'], ['io','输入／输出','平行四边形'], ['calculation','计算处理','直角矩形']
];
export function memoryDeck(rng=Math.random) {
 const cards=PAIRS.flatMap(([pairId,...labels])=>labels.map((text,side)=>({id:pairId+'-'+side,pairId,text})));
 for(let i=cards.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}
 return cards;
}
export function openMemoryReward(root,{onExit=()=>{}}={}) {
 root.innerHTML='<div class="memory-wrap"><button type="button" class="ghost-btn memory-exit">← 返回校园</button><h1>算法搭档配对</h1><p>翻开两张意思相配的卡，把算法伙伴找齐。可以慢慢试。</p><p class="memory-status" role="status"></p><div class="memory-grid"></div><div class="memory-actions"></div><p class="note">玩法改编自 Tania Rascia 的 Memory · <a href="/licenses/memory-MIT.txt" target="_blank" rel="noopener">MIT 许可</a></p></div>';
 const grid=root.querySelector('.memory-grid'),status=root.querySelector('.memory-status'),actions=root.querySelector('.memory-actions');
 root.querySelector('.memory-exit').onclick=onExit;
 let firstGuess='',secondGuess='',count=0,previousTarget=null,matched=0;
 const selected=()=>[...grid.querySelectorAll('.selected')];
 const resetGuesses=()=>{firstGuess='';secondGuess='';count=0;previousTarget=null;selected().forEach(card=>{card.classList.remove('selected');if(!card.classList.contains('match')){card.textContent='翻开';card.setAttribute('aria-label','翻开第'+card.dataset.position+'张卡');card.setAttribute('aria-pressed','false');}});actions.replaceChildren();};
 const play=()=>{
 grid.replaceChildren();actions.replaceChildren();firstGuess='';secondGuess='';count=0;previousTarget=null;matched=0;status.textContent='已找到 0 / '+PAIRS.length+' 对。点任意卡开始。';
 memoryDeck().forEach((item,i)=>{const card=document.createElement('button');card.type='button';card.className='memory-card';card.dataset.pairId=item.pairId;card.dataset.text=item.text;card.dataset.position=i+1;card.textContent='翻开';card.setAttribute('aria-label','翻开第'+(i+1)+'张卡');card.setAttribute('aria-pressed','false');
  card.onclick=()=>{
   if(card===previousTarget||card.classList.contains('selected')||card.classList.contains('match')||count>=2)return;
   count++;card.classList.add('selected');card.textContent=item.text;card.setAttribute('aria-label',item.text);card.setAttribute('aria-pressed','true');
   if(count===1){firstGuess=item.pairId;status.textContent='你翻开了“'+item.text+'”。再翻一张，找它的搭档。';}
   else {secondGuess=item.pairId;if(firstGuess===secondGuess){selected().forEach(c=>{c.classList.add('match');c.disabled=true;});matched++;status.textContent='这两张意思相配！已找到 '+matched+' / '+PAIRS.length+' 对。';resetGuesses();if(matched===PAIRS.length){status.textContent='算法伙伴找齐啦！输入已知数，按规则处理，再输出结果；流程图框也各有作用。';const again=document.createElement('button');again.type='button';again.className='go-btn';again.textContent='重新配一局';again.onclick=play;actions.append(again);again.focus();}else grid.querySelector('button:not(:disabled)')?.focus();}
    else {status.textContent='“'+selected().map(c=>c.dataset.text).join('”和“')+'”还不是这一组搭档。记住它们的位置，再试试。';const next=document.createElement('button');next.type='button';next.className='go-btn';next.textContent='记住了，继续翻牌';next.onclick=()=>{resetGuesses();status.textContent='已找到 '+matched+' / '+PAIRS.length+' 对。继续找搭档。';grid.querySelector('button:not(:disabled)')?.focus();};actions.append(next);next.focus();}}
   previousTarget=card;
  };grid.append(card);
 });
 };
 play();
}
