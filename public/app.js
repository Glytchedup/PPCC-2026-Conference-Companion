(()=>{'use strict';
const D=window.PPCC_DATA,STORAGE='ppcc2026.events.v1',CONFIG='ppcc2026.config.v1';
const CLOUDFLARE_DEPLOY='https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FGlytchedup%2FPPCC-2026-Conference-Companion';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=s=>{let [h,m]=s.split(':').map(Number);return (h%12||12)+':'+String(m).padStart(2,'0')+(h>=12?' PM':' AM')};
const shortDay={'2026-10-27':'Tue 27','2026-10-28':'Wed 28','2026-10-29':'Thu 29'};
const tryJson=(s,def)=>{try{return JSON.parse(s)||def}catch{return def}};
const uid=()=>{const b=new Uint8Array(12);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')};
let events=tryJson(localStorage.getItem(STORAGE),[]),config=Object.assign({url:'',room:''},tryJson(localStorage.getItem(CONFIG),{}));
if(!config.url)config.url=location.hostname.endsWith('.workers.dev')?location.origin:'https://ppcc-2026-companion.trip-recommendation-prototype.workers.dev';
let knownRemote=new Set();
let page='agenda',person=(localStorage.getItem('ppcc2026.person')||'David'),day='2026-10-27',altOpen='',contactsFilter='All',notesFilter='All',onView=false,lastSynced='',syncBusy=false,findQuery='',findTime='all',findGuide=false,findLimit=20;
const save=()=>localStorage.setItem(STORAGE,JSON.stringify(events));const saveCfg=()=>localStorage.setItem(CONFIG,JSON.stringify(config));

const INVITE_PREFIX='#ppcc-sync=';
const PUBLIC_APP='https://glytchedup.github.io/PPCC-2026-Conference-Companion/';
function validateWorkerUrl(raw){
 try{
  const u=new URL(String(raw||'').trim());
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('invalid');
  return u.origin+(u.pathname==='/'?'':u.pathname.replace(/\/$/,''));
 }catch{return '';}
}
function acceptInvite(){
 if(!location.hash.startsWith(INVITE_PREFIX))return;
 let parsed;
 try{
  parsed=JSON.parse(decodeURIComponent(location.hash.slice(INVITE_PREFIX.length)));
  const url=validateWorkerUrl(parsed.url),room=String(parsed.room||'');
  if(!url||room.length<24||room.length>512)throw Error('Invalid invite');
  if(url===config.url&&room===config.room){toast('Shared schedule already linked');return;}
  if(!confirm('Join the shared conference schedule at '+new URL(url).hostname+'? Your locally saved schedule and notes will be uploaded to this room. Only accept invites from David or Peter.'))return;
  config.url=url;config.room=room;knownRemote.clear();saveCfg();
  toast('Shared room linked. Connecting…');
 }catch{toast('Invalid shared schedule invite');}
 finally{history.replaceState(null,'',location.pathname+location.search);}
}
async function copyInvite(){
 if(!config.url||config.room.length<24){toast('Save the Worker URL and room key first');return;}
 const link=PUBLIC_APP+INVITE_PREFIX+encodeURIComponent(JSON.stringify({url:config.url,room:config.room}));
 try{await navigator.clipboard.writeText(link);toast('Private invitation link copied');}
 catch{prompt('Copy this private invitation link for Peter:',link);}
}

const snapshot=()=>{const s={choices:{},status:{},ratings:{},contacts:{},goals:{},checks:{},plans:{},hidden:{},notes:[],meetings:[]};for(const e of [...events].sort((a,b)=>(a.ts||'').localeCompare(b.ts||'')||a.id.localeCompare(b.id))){let p=e.payload||{};switch(e.type){case'choice':s.choices[p.key]=p.value;break;case'status':s.status[p.key]=p.value;break;case'rating':s.ratings[p.key]=p.value;break;case'contact':s.contacts[p.key]=p.value;break;case'goal':s.goals[p.key]=p.value;break;case'check':s.checks[p.key]=p.value;break;case'plan':s.plans[p.key]=p.value;break;case'hide':s.hidden[p.key]=p.value;break;case'note':s.notes.push({...p,eventId:e.id,ts:e.ts});break;case'meeting':s.meetings.push({...p,eventId:e.id});break;case'delete-note':s.notes=s.notes.filter(z=>z.eventId!==p.id);break;case'delete-meeting':s.meetings=s.meetings.filter(z=>z.eventId!==p.id);break;}}return s};
function record(type,payload){const e={id:uid(),ts:new Date().toISOString(),type,payload};events.push(e);save();render();if(config.url&&config.room)postEvent(e).catch(x=>{setSync('Offline changes saved');});return e;}
function setSync(msg,online=false){const p=$('#sync-pill');p.textContent=msg;p.classList.toggle('online',online)}
function toast(msg){document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2800)}
function pLabel(who){return `<span class="chip ${who.toLowerCase()}">${esc(who)}</span>`}
function key(id,who){return id+'::'+who}
function peopleFor(s){return s.who==='Both'?['David','Peter']:[s.who]}
const attendees=D.sessions.flatMap(s=>peopleFor(s).map(who=>({...s,who})));
const overlaps=(a,b)=>a.day===b.day&&a.start<b.end&&b.start<a.end;
const normalized=t=>String(t||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const dates=['2026-10-27','2026-10-28','2026-10-29'];
const sessionPool=[...D.sessions,...D.alternatives,...(D.catalog||[])];
const indexById=new Map(sessionPool.map(s=>[s.id,s]));
const sessionKey=(item,who)=>key(item.id,who);
function whoEdit(){return person==='Peter'?'Peter':'David'}
function timeBadge(a){return fmt(a.start)+'–'+fmt(a.end)}
function dayTabs(){return `<div class="days" role="group" aria-label="Conference day">${dates.map(d=>`<button data-day="${d}" class="${d===day?'active':''}" aria-pressed="${d===day}">${shortDay[d]}</button>`).join('')}</div>`}
function selectedEntries(who,s){
 const own=attendees.filter(a=>a.who===who&&!s.hidden[key(a.id,who)]).map(a=>({...a,__added:false,__current:activeItem(a,s)}));
 for(const [k,enabled] of Object.entries(s.plans)){if(!enabled||!k.endsWith('::'+who))continue;const id=k.slice(0,-(who.length+2));const a=indexById.get(id);if(a)own.push({...a,who,priority:'P2',__added:true,__current:a});}
 const uniq=new Set();
 return own.filter(a=>{const selected=a.__current||a,tag=selected.day+':'+selected.start+':'+normalized(selected.title);if(uniq.has(tag))return false;uniq.add(tag);return true;});
}
function allScheduled(s,filter=person){return (filter==='Both'?['David','Peter']:[filter]).flatMap(w=>selectedEntries(w,s)).sort((a,b)=>a.day.localeCompare(b.day)||a.__current.start.localeCompare(b.__current.start)||a.who.localeCompare(b.who));}
function catalogForDay(d){
 const candidates=[...D.sessions,...D.alternatives,...(D.catalog||[])].filter(a=>a.day===d&&a.start&&a.end&&a.available!==false&&a.kind!=='hold').map(a=>({...a,sourceType:D.sessions.includes(a)?'Plan':D.alternatives.includes(a)?'Suggested':'Agenda'}));
 const result=[],pos=new Map();
 for(const a of candidates){const k=a.day+':'+a.start+':'+normalized(a.title).replace(/ overlap$/,'');const index=pos.get(k);if(index===undefined){pos.set(k,result.length);result.push(a);}else{const old=result[index];if((old.room||'').toLowerCase().includes('not specified')&&!String(a.room||'').toLowerCase().includes('not specified'))result[index]={...a,sourceType:old.sourceType==='Suggested'?'Suggested':a.sourceType};}}
 return result.sort((a,b)=>a.start.localeCompare(b.start)||(a.sourceType==='Suggested'?-1:0)-(b.sourceType==='Suggested'?-1:0)||a.title.localeCompare(b.title));
}
function saveBatch(changes,msg){const created=changes.map(([type,payload])=>({id:uid(),ts:new Date().toISOString(),type,payload}));events.push(...created);save();render();if(config.url&&config.room)Promise.all(created.map(postEvent)).catch(()=>setSync('Offline changes saved'));if(msg)toast(msg);}
function removeSlot(it){return [it.__added?'plan':'hide',{key:key(it.id,it.who),value:it.__added?false:true}]}
function addToSchedule(id,who){
 if(!['David','Peter'].includes(who))return;
 const candidate=indexById.get(id);if(!candidate)return;
 const s=snapshot(),scheduled=selectedEntries(who,s);
 const existing=scheduled.find(it=>normalized(it.__current.title)===normalized(candidate.title)&&it.day===candidate.day&&it.__current.start===candidate.start);
 if(existing){toast('Already on '+who+'’s schedule');return;}
 const conflicts=scheduled.filter(it=>overlaps(it.__current,candidate));
 if(conflicts.length){
   const desc=conflicts.map(it=>it.__current.title).join(' / ');
   if(!confirm('Replace '+desc+' with '+candidate.title+' for '+who+'?'))return;
   const first=conflicts.find(it=>!it.__added);
   const changes=[];
   if(first){changes.push(['choice',{key:key(first.id,who),value:id}]);}
   for(const it of conflicts){if(it===first)continue;changes.push(removeSlot(it));}
   if(!first)changes.push(['plan',{key:key(id,who),value:true}]);
   saveBatch(changes,'Session replaced');return;
 }
 const hiddenBase=attendees.find(a=>a.who===who&&a.day===candidate.day&&a.start===candidate.start&&normalized(a.title)===normalized(candidate.title)&&s.hidden[key(a.id,who)]);
 if(hiddenBase)saveBatch([['hide',{key:key(hiddenBase.id,who),value:false}]],'Added to schedule');
 else saveBatch([['plan',{key:key(id,who),value:true}]],'Added to schedule');
}
function removeFromSchedule(id,who){const s=snapshot(),it=selectedEntries(who,s).find(a=>a.id===id);if(!it)return;saveBatch([removeSlot(it)],'Removed from schedule');}
function agendaDayEntries(s){const scheduled=allScheduled(s).filter(i=>i.day===day);
 const meetings=s.meetings.filter(m=>m.day===day&&(person==='Both'||m.who===person||m.who==='Both')).map(m=>({...m,id:m.eventId,who:m.who||'Both',priority:'P2',kind:'meeting',purpose:m.detail||'',room:m.room||'TBD',__current:m,start:m.start,end:m.end}));
 return [...scheduled,...meetings].sort((a,b)=>a.__current.start.localeCompare(b.__current.start)||a.who.localeCompare(b.who));
}

function optionsFor(it){
 const candidates=[...D.alternatives.filter(a=>overlaps(a,it)).map(a=>({...a,recommendation:a.replaces===it.id?'Field guide recommendation':'Field guide alternative'})),
 ...D.sessions.filter(a=>a.id!==it.id&&overlaps(a,it)).map(a=>({...a,recommendation:a.who==='Both'?'Shared keynote':'Other attendee’s planned session'})),
 ...(D.catalog||[]).filter(a=>overlaps(a,it)).map(a=>({...a,recommendation:'Official schedule'}))];
 const seen=new Set([normalized(it.title)]),out=[];
 for(const a of candidates){if(a.available===false||a.kind==='hold')continue;const n=normalized(a.title);if(seen.has(n))continue;seen.add(n);out.push(a)}
 return out;
}
// A replacement may move through overlapping windows beyond the original slot.
function activeItem(it,s){const id=s.choices[key(it.id,it.who)];return [...D.alternatives,...D.sessions,...(D.catalog||[])].find(a=>a.id===id&&a.day===it.day)||it;}
function sessionStateKey(it,s){return key(activeItem(it,s).id,it.who);}
function render(){
 const s=snapshot();
 const switcher=$('#person-switch');
 if(switcher)switcher.innerHTML=['David','Peter','Both'].map(w=>`<button data-person="${w}" class="${w===person?'active':''}" aria-pressed="${w===person}">${w==='Both'?'Both':w}</button>`).join('');
 $('#nav').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.page===page||b.dataset.page==='more'&&['goals','settings'].includes(page)));
 const view={agenda:renderAgenda,find:renderFind,targets:renderTargets,goals:renderGoals,notes:renderNotes,settings:renderSettings,more:renderMore};
 (view[page]||renderAgenda)(s);
 const clock=$('#clock');if(clock)clock.textContent=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit'}).format(new Date());
 $('#sync-pill').classList.toggle('online',!!lastSynced);
}

function itemCard(it,s){
 const actual=it.__current||activeItem(it,s),stateKey=key(actual.id,it.who),status=s.status[stateKey]||'planned',isAlt=actual.id!==it.id,other=allScheduled(s,it.who==='David'?'Peter':'David').find(a=>a.day===actual.day&&normalized(a.__current.title)===normalized(actual.title));
 const badges=person==='Both'?pLabel(it.who):'';
 const details=actual.purpose||actual.why;
 const official=actual.url?`<a href="${esc(actual.url)}" target="_blank" rel="noopener">Session info ↗</a>`:'';
 return `<article class="item schedule-card ${status==='attended'?'is-attended':''}"><div class="item-top"><div class="chips">${badges}${it.priority==='P1'?'<span class="chip p1">P1</span>':''}${isAlt?'<span class="chip changed">SWAPPED</span>':''}${it.__added?'<span class="chip changed">ADDED</span>':''}</div>${status==='attended'?'<span class="attended-tag">✓ Attended</span>':''}</div><h3>${esc(actual.title)}</h3><div class="session-meta"><span>⌖ ${esc(actual.room||'Room TBC')}</span>${it.__added?`<span>${timeBadge(actual)}</span>`:''}</div>${other?`<div class="together-hint">${esc(other.who)} is going too</div>`:''}<div class="session-actions"><button class="btn swap-button" data-action="swap" data-id="${it.id}" data-who="${it.who}">⇄ Swap</button><button class="outline" data-action="attend" data-id="${actual.id}" data-who="${it.who}">${status==='attended'?'✓ Done':'✓ Check in'}</button><button class="ghost mini-more" data-action="card-options" data-id="${it.id}" data-who="${it.who}" aria-label="More options">···</button></div><div class="session-extras" id="extra-${it.who}-${it.id}" hidden><div class="actions"><button class="ghost" data-action="note" data-id="${actual.id}" data-who="${it.who}">Add note</button><button class="ghost" data-action="rating" data-id="${actual.id}" data-who="${it.who}">Rate</button><button class="ghost" data-action="remove-session" data-id="${it.id}" data-who="${it.who}">Remove</button>${official}</div>${details?`<p>${esc(details)}</p>`:''}</div></article>`;
}

function swapModal(id,who){
 const s=snapshot(),it=selectedEntries(who,s).find(a=>a.id===id);if(!it)return;
 const current=it.__current||activeItem(it,s),options=optionsFor(current).filter(a=>it.__added||normalized(a.title)!==normalized(it.title));
 const seen=new Set(),filtered=options.filter(o=>{const k=normalized(o.title)+o.start;if(seen.has(k))return false;seen.add(k);return true;});
 const root=$('#dialog-root');
 const renderOption=a=>`<div class="swap-option" data-swap-search="${esc(normalized(a.title+' '+a.room))}"><div class="swap-option-info"><strong>${esc(a.title)}</strong><div class="meta">${timeBadge(a)} · ${esc(a.room||'Room TBC')}</div>${a.recommendation?.includes('Field guide')?'<span class="recommendation">Suggested in field guide</span>':''}</div><button class="${current.id===a.id?'outline':'btn'}" data-action="choose" data-id="${it.id}" data-who="${who}" data-alt="${a.id}" ${current.id===a.id?'disabled':''}>${current.id===a.id?'Current':'Select'}</button></div>`;
 root.innerHTML=`<dialog class="dialog swap-dialog"><div class="swap-heading"><div><div class="eyebrow">${esc(who)} · ${shortDay[it.day]} · ${timeBadge(current)}</div><h2>Swap session</h2></div><button class="ghost" data-action="close" aria-label="Close">✕</button></div><div class="selected-session">Current: <strong>${esc(current.title)}</strong></div><input id="swap-search" class="input" type="search" placeholder="Search by title or room" aria-label="Search concurrent sessions"><div class="swap-results">${!it.__added?`<div class="swap-option original-option" data-swap-search="${esc(normalized(it.title))}"><div class="swap-option-info"><strong>${esc(it.title)}</strong><div class="meta">${timeBadge(it)} · ${esc(it.room)}</div></div><button class="${current.id===it.id?'outline':'btn'}" data-action="choose" data-id="${it.id}" data-who="${who}" data-alt="" ${current.id===it.id?'disabled':''}>${current.id===it.id?'Current':'Restore'}</button></div>`:''}${filtered.map(renderOption).join('')}<p id="swap-no-results" class="small subdued" hidden>No matches.</p></div><div class="swap-footer">${filtered.length} options · <a href="${esc(D.catalogSourceUrl)}" target="_blank" rel="noopener">Full agenda ↗</a></div></dialog>`;
 root.querySelector('dialog').showModal();root.querySelector('#swap-search').focus();
}

function renderAgenda(s){
 const rows=agendaDayEntries(s),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),now=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
 const upcoming=rows.find(i=>i.day===today&&i.__current.end>now);
 const nowCard=today===day&&upcoming?`<div class="upcoming"><span>${upcoming.__current.start<=now?'HAPPENING NOW':'UP NEXT'}</span><strong>${esc(upcoming.__current.title)}</strong><small>${timeBadge(upcoming.__current)} · ${esc(upcoming.__current.room||'Room TBC')}</small></div>`:'';
 const groups={};for(const item of rows)(groups[item.__current.start+'–'+item.__current.end]??=[]).push(item);
 $('#view').innerHTML=`<div class="schedule-heading"><div><h1>My schedule</h1><p>${person==='Both'?'David + Peter':person} · ${rows.length} ${rows.length===1?'event':'events'}</p></div><button class="btn find-cta" data-page="find">⌕ Find sessions</button></div>${dayTabs()}${nowCard}<div class="timeline">${Object.values(groups).map(items=>`<section class="slot"><div class="time-head">${timeBadge(items[0].__current)}</div><div class="cards">${items.map(i=>i.kind==='meeting'?meetingCard(i):itemCard(i,s)).join('')}</div></section>`).join('')||'<div class="empty">Nothing planned yet. Find a session to add.</div>'}</div><button class="add-meeting" data-action="new-meeting">+ Add a meeting or reminder</button>`;
}
function findResults(s){
 const who=whoEdit(),query=normalized(findQuery),choices=catalogForDay(day);
 let rows=choices.filter(a=>(!query||normalized(a.title+' '+a.room+' '+(a.people||'')).includes(query))&&(findTime==='all'||choices.some(slot=>slot.start===findTime&&overlaps(a,slot)))&&(!findGuide||a.sourceType!=='Agenda'));
 const scheduled=selectedEntries(who,s);
 rows.sort((a,b)=>{
  const as=scheduled.some(it=>normalized(it.__current.title)===normalized(a.title)&&it.day===a.day)?-1:0;
  const bs=scheduled.some(it=>normalized(it.__current.title)===normalized(b.title)&&it.day===b.day)?-1:0;
  return as-bs||a.start.localeCompare(b.start)||a.title.localeCompare(b.title)
 });
 const box=$('#find-results');if(!box)return;const total=rows.length;rows=rows.slice(0,findLimit);
 box.innerHTML=`<div class="result-count">${total} sessions · ${esc(who)}'s schedule</div>${rows.map(a=>{
  const mine=scheduled.some(it=>it.day===a.day&&normalized(it.__current.title)===normalized(a.title)&&it.__current.start===a.start);
  const conflict=scheduled.some(it=>overlaps(it.__current,a));
  return `<article class="search-card"><div class="search-card-body"><span class="result-time">${timeBadge(a)}${a.sourceType==='Suggested'?' · <b>Suggested</b>':''}</span><h3>${esc(a.title)}</h3><div class="search-room">⌖ ${esc(a.room||'Room TBC')}</div></div><button class="${mine?'in-plan':'btn'}" data-action="add-session" data-id="${a.id}" data-who="${who}" ${mine?'disabled':''}>${mine?'✓ Added':conflict?'Replace':'+ Add'}</button></article>`;
 }).join('')||'<div class="empty">No sessions found. Try another search or time.</div>'}${total>findLimit?`<button class="load-more" data-action="load-more">Show more (${total-findLimit} remaining)</button>`:''}`;
}
function renderFind(s){
 const options=[...new Set(catalogForDay(day).map(a=>a.start))];
 $('#view').innerHTML=`<div class="schedule-heading find-heading"><div><h1>Find sessions</h1><p>Add sessions or replace conflicts</p></div></div>${dayTabs()}<div class="find-controls"><label class="sr-only" for="find-query">Search sessions</label><input id="find-query" class="input" type="search" placeholder="Search topics, titles or rooms" value="${esc(findQuery)}" autocomplete="off"><div class="find-filters"><label class="sr-only" for="find-time">Time</label><select id="find-time" class="input"><option value="all">All times</option>${options.map(t=>`<option value="${t}" ${findTime===t?'selected':''}>${fmt(t)}</option>`).join('')}</select><button class="outline ${findGuide?'filter-active':''}" data-action="filter-guide" aria-pressed="${findGuide}">★ Field guide</button></div><div class="edit-who">Adding to <button data-person="David" class="${whoEdit()==='David'?'active':''}">David</button><button data-person="Peter" class="${whoEdit()==='Peter'?'active':''}">Peter</button></div></div><div id="find-results" class="find-results"></div>`;
 findResults(s);
}
function renderMore(s){
 $('#view').innerHTML=`<div class="page-intro"><h2>More</h2></div><div class="more-links"><button class="more-link" data-page="goals"><strong>Objectives</strong><span>Conference priorities and evidence</span><b>›</b></button><button class="more-link" data-page="settings"><strong>Settings & sync</strong><span>Share, back up or lock this device</span><b>›</b></button><button class="more-link" data-action="new-meeting"><strong>Add meeting</strong><span>Block time on your schedule</span><b>+</b></button></div>`;
}

function meetingCard(m){return `<article class="item"><div class="chips">${pLabel(m.who)}<span class="chip">CUSTOM MEETING</span></div><h3>${esc(m.title)}</h3><div class="meta">⌖ ${esc(m.room)} · ${fmt(m.start)}–${fmt(m.end)}</div><p>${esc(m.purpose||'')}</p><div class="actions"><button class="outline" data-action="note" data-id="${m.id}" data-who="${m.who}">+ Meeting note</button><button class="ghost" data-action="delete-meeting" data-id="${m.id}">Remove</button></div></article>`}
function renderTargets(s){
 const filtered=D.contacts.filter(c=>contactsFilter==='All'||c.lead===contactsFilter);
 $('#view').innerHTML=`<div class="page-intro"><h2>People to meet</h2><p>Find a product owner and save the follow-up.</p></div><input class="input people-query" id="people-query" type="search" placeholder="Search a person or topic"><div class="filters"><select id="contacts-filter" class="input">${['All','David','Peter','Both'].map(x=>`<option ${x===contactsFilter?'selected':''}>${x}</option>`).join('')}</select></div><div class="contacts-list">${filtered.map(c=>{
 const st=s.contacts[c.id]||'Not approached';return `<article class="contact compact-contact" data-person-search="${esc(normalized(c.people+' '+c.topic+' '+c.ask))}"><div class="item-top"><div class="chips">${pLabel(c.lead)}<span class="chip">${esc(st)}</span></div></div><h3>${esc(c.topic)}</h3><div class="people">${esc(c.people)}</div><div class="actions"><button class="btn" data-action="contact" data-id="${c.id}">Update</button><button class="outline" data-action="meeting-contact" data-id="${c.id}">+ Meeting</button><button class="ghost" data-action="note" data-id="${c.id}" data-who="${c.lead}">+ Note</button></div><details class="person-detail"><summary>Talking points</summary><p><strong>Ask:</strong> ${esc(c.ask)}</p><p><strong>Request:</strong> ${esc(c.request)}</p>${c.bring?`<p><strong>Bring:</strong> ${esc(c.bring)}</p>`:''}</details></article>`;
 }).join('')}</div>`;
}
function renderGoals(s){const done=D.goals.filter(g=>s.goals[g.id]).length, checked=D.evidence.filter(e=>s.checks[e.id]).length;
$('#view').innerHTML=`<div class="page-intro"><h2>Outcomes & prep</h2><p>Capture concrete Microsoft-reviewed answers, not just attendance. Objectives are shared; checklist items track what to bring.</p></div><div class="grid-2"><section><div class="section-heading"><div><h2>Conference objectives</h2><p>${done} of ${D.goals.length} progressed</p></div></div><div class="progress"><span style="width:${done/D.goals.length*100}%"></span></div><div class="goals-list">${D.goals.map(g=>`<article class="goal ${s.goals[g.id]?'done':''}"><div class="goal-head"><button data-action="goal" data-id="${g.id}" aria-label="Toggle objective">${s.goals[g.id]?'☑':'☐'}</button><div><div class="chips">${pLabel(g.lead)}</div><h3>${esc(g.title)}</h3><p>${esc(g.detail)}</p></div></div></article>`).join('')}</div></section><section><div class="section-heading"><div><h2>Evidence pack</h2><p>${checked} of ${D.evidence.length} ready</p></div></div><div class="panel"><p>Use sanitized examples only; do not share internal data or credentials.</p>${D.evidence.map(e=>`<label class="check"><input type="checkbox" data-action="check" data-id="${e.id}" ${s.checks[e.id]?'checked':''}><span>${esc(e.title)}</span></label>`).join('')}</div><div class="panel"><h3>After each significant discussion</h3><p>Record issue and owner; supported today versus gap; exact feature status and prerequisites; agreed next action and evidence; follow-up contact and target date.</p><button class="btn" data-action="note" data-id="Joint outcome" data-who="Both">+ Record a decision</button></div></section></div>`;}
function renderNotes(s){let n=s.notes.filter(x=>notesFilter==='All'||x.who===notesFilter||x.who==='Both'&&notesFilter==='Both');if(person!=='Both')n=n.filter(x=>x.who===person||x.who==='Both');n.reverse();
$('#view').innerHTML=`<div class="page-intro"><h2>Field notes & next steps</h2><p>Record what matters and the next action.</p></div><div class="filters"><select class="input" id="notes-filter">${['All','David','Peter','Both'].map(x=>`<option ${notesFilter===x?'selected':''}>${x}</option>`).join('')}</select><button class="btn" data-action="note" data-id="General meeting" data-who="${person}">+ New note</button><button class="outline" data-action="export-csv">Export follow-ups CSV</button></div><div class="notes-list">${n.map(z=>`<article class="note-card"><div class="item-top"><div class="chips">${pLabel(z.who||'Both')}<span class="chip">${esc(z.category||'Unclassified')}</span></div><span class="note-date">${new Date(z.ts).toLocaleString()}</span></div><h3>${esc(z.title||'Untitled')}</h3><p>${esc(z.summary||'')}</p><div class="field-list">${[['Microsoft contact',z.contact],['Feature status',z.feature],['Prerequisites',z.prereq],['Next action',z.nextAction],['Evidence to send',z.evidence],['Target date',z.due]].filter(x=>x[1]).map(([k,v])=>`<div class="field-row"><strong>${esc(k)}</strong><span>${esc(v)}</span></div>`).join('')}</div><div class="actions"><button class="ghost" data-action="delete-note" data-id="${z.eventId}">Remove note</button></div></article>`).join('')||'<div class="empty">No field notes yet. Capture a session insight or product-team conversation as it happens.</div>'}</div>`;}
function renderSettings(s){
 const connected=!!(config.url&&config.room);
 $('#view').innerHTML=`<div class="page-intro"><h2>Share the schedule</h2><p>${connected?'Your shared room is configured. Copy an invite for the other phone.':'Connect the Cloudflare Worker to share both schedules and notes.'}</p></div>
 <div class="panel"><h3>${connected?'Shared room':'Connect Cloudflare'}</h3>
 ${connected?'<p class="small">Changes to David and Peter’s schedules sync across both phones while each schedule stays independent.</p>':'<p class="small">Cloudflare setup must finish before sync is available.</p>'}
 <a class="outline" href="${CLOUDFLARE_DEPLOY}" rel="noopener" target="_blank">${connected?'Cloudflare deployment':'Deploy on Cloudflare'} ↗</a>
 <form id="settings-form" class="note-fields" style="margin-top:14px">
 <div class="form-field"><label for="sync-url">Worker URL</label><input class="input" name="url" id="sync-url" type="url" placeholder="https://your-worker.workers.dev" value="${esc(config.url)}" autocomplete="url"></div>
 <div class="form-field"><label for="sync-room">Private room key</label><input class="input" name="room" id="sync-room" type="password" placeholder="Generate or paste shared key" value="${esc(config.room)}" autocomplete="off"></div>
 <div class="footer-actions"><button type="button" class="outline" data-action="new-key">Generate key</button><button class="btn" type="submit">Save & sync</button></div>
 </form>
 ${connected?'<div class="footer-actions" style="margin-top:14px"><button class="btn" data-action="copy-invite">Copy private invite link</button><button class="outline" data-action="sync">Sync now</button></div>':''}
 <p class="small">Sync: ${esc(lastSynced?'Last checked '+lastSynced:'Not verified yet')}. Share the private invite directly with Peter; anyone holding it can access the shared notes.</p>
 </div>
 <details class="panel"><summary>Backups & device access</summary><div class="footer-actions" style="margin-top:14px"><button class="outline" data-action="export-json">Export backup</button><button class="outline" data-action="import">Import backup</button><button class="outline" data-action="export-csv">Export follow-ups</button><button class="ghost" data-action="lock-device">Lock this device</button></div></details>
 <p class="small subdued">Only sanitized conference notes. The access-code screen does not protect files hosted on public GitHub Pages.</p>`;
}
function modal(title,sub,fields,submitLabel='Save'){const root=$('#dialog-root');root.innerHTML=`<dialog class="dialog"><h2>${esc(title)}</h2><p class="dialog-sub">${esc(sub)}</p><form method="dialog" id="modal-form" class="note-fields">${fields}<div class="dialog-buttons"><button type="button" class="ghost" data-action="close">Cancel</button><button class="btn" value="save" type="submit">${esc(submitLabel)}</button></div></form></dialog>`;root.querySelector('dialog').showModal();return root.querySelector('#modal-form');}
function f(name,label,kind='text',value='',options=[]){if(kind==='select')return `<div class="form-field"><label>${label}</label><select name="${name}" class="input">${options.map(opt=>`<option ${opt===value?'selected':''}>${esc(opt)}</option>`).join('')}</select></div>`;if(kind==='textarea')return `<div class="form-field"><label>${label}</label><textarea name="${name}" class="input">${esc(value)}</textarea></div>`;return `<div class="form-field"><label>${label}</label><input class="input" type="${kind}" name="${name}" value="${esc(value)}"></div>`;}
function close(){const d=$('#dialog-root dialog');if(d)d.close();$('#dialog-root').innerHTML='';}
function noteModal(id,who){const item=[...D.sessions,...D.alternatives,...(D.catalog||[]),...D.contacts].find(x=>x.id===id);const title=item?.title||item?.topic||id;const form=modal('Capture a field note','Record the answer, prerequisites, evidence and accountable next action.',f('title','Topic / session', 'text',title)+`<div class="form-row">${f('who','Recorder / owner','select',who==='Both'?'Both':who,['David','Peter','Both'])}${f('category','Decision category','select','Unclassified',['Unclassified','Supported design','Tenant configuration','Product defect','Roadmap gap','Open question'])}</div>`+f('contact','Microsoft contact / owner')+f('summary','What did you learn?','textarea')+f('feature','Current feature status and licensing')+f('prereq','Policy / environment prerequisites','textarea')+f('nextAction','Agreed next action')+f('evidence','Evidence to send')+f('due','Follow-up target date','date'),'Save note');form.addEventListener('submit',e=>{e.preventDefault();const p=Object.fromEntries(new FormData(form).entries());record('note',p);close();toast('Field note saved');});}
function contactModal(id){const c=D.contacts.find(x=>x.id===id);const st=snapshot().contacts[id]||'Not approached';const form=modal('Contact status',c.topic+' · '+c.people,f('status','Outreach status','select',st,['Not approached','Located','Conversation held','Follow-up planned','Closed']),'Save status');form.addEventListener('submit',e=>{e.preventDefault();record('contact',{key:id,value:new FormData(form).get('status')});close();});}
function meetingModal(contactId){const contact=D.contacts.find(x=>x.id===contactId);const form=modal('Add a meeting','Confirmed appointments and holds appear next to the published schedule.',`<div class="form-row">${f('who','Attendee','select',person==='Both'?'Both':person,['David','Peter','Both'])}${f('day','Date','select',day,['2026-10-27','2026-10-28','2026-10-29'])}</div>`+f('title','Meeting or hold title','text',contact?'Follow up: '+contact.topic:'')+`<div class="form-row">${f('start','Start','time','13:00')}${f('end','End','time','13:30')}</div>`+f('room','Location')+f('detail','Objective / context','textarea',contact?.ask||''),'Add to agenda');form.addEventListener('submit',e=>{e.preventDefault();const p=Object.fromEntries(new FormData(form).entries());if(!p.title.trim()||p.end<=p.start){toast('Enter a title and valid time window');return}record('meeting',p);close();});}
function ratingModal(id,who){const form=modal('Session usefulness','Rate the content for sharing with the other attendee.',f('rating','Usefulness','select','4',['1','2','3','4','5']),'Save rating');form.addEventListener('submit',e=>{e.preventDefault();record('rating',{key:key(id,who),value:new FormData(form).get('rating')});close();});}
function fileSave(name,text,type){const a=document.createElement('a'),blob=new Blob([text],{type});a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function exportCsv(){const n=snapshot().notes;const columns=['who','title','contact','category','summary','feature','prereq','nextAction','evidence','due','ts'];const csv=[columns.join(','),...n.map(x=>columns.map(c=>'"'+String(x[c]||'').replace(/"/g,'""')+'"').join(','))].join('\r\n');fileSave('ppcc-2026-follow-ups.csv','\ufeff'+csv,'text/csv;charset=utf-8');}
function toggleDay(){const t=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(['2026-10-27','2026-10-28','2026-10-29'].includes(t))day=t;}
function handleAction(a,el){const id=el.dataset.id,who=el.dataset.who;switch(a){case'swap':swapModal(id,who);break;case'add-session':addToSchedule(id,who);break;case'remove-session':removeFromSchedule(id,who);break;case'card-options':{const extra=document.getElementById('extra-'+who+'-'+id);if(extra)extra.hidden=!extra.hidden;break;}case'filter-guide':findGuide=!findGuide;findLimit=20;render();break;case'load-more':findLimit+=20;findResults(snapshot());break;case'choose':{const option=el.dataset.alt||'';const base=selectedEntries(who,snapshot()).find(i=>i.id===id);const chosen=indexById.get(option);if(!base||chosen&&!overlaps(base.__current,chosen)){toast('Option is outside this time slot');break;}if(base.__added){if(!chosen){close();break;}saveBatch([['plan',{key:key(base.id,who),value:false}],['plan',{key:key(option,who),value:true}]],'Session replaced');}else{saveBatch([['choice',{key:key(id,who),value:option}]],'Session swapped');}close();break;}case'attend':record('status',{key:key(id,who),value:snapshot().status[key(id,who)]==='attended'?'planned':'attended'});break;case'skip':record('status',{key:key(id,who),value:snapshot().status[key(id,who)]==='skipped'?'planned':'skipped'});break;case'note':noteModal(id,who||person);break;case'contact':contactModal(id);break;case'new-meeting':meetingModal();break;case'meeting-contact':meetingModal(id);break;case'rating':ratingModal(id,who);break;case'goal':record('goal',{key:id,value:!snapshot().goals[id]});break;case'check':record('check',{key:id,value:el.checked});break;case'close':close();break;case'delete-note':if(confirm('Remove this note?'))record('delete-note',{id});break;case'delete-meeting':if(confirm('Remove this meeting?'))record('delete-meeting',{id});break;case'export-json':fileSave('ppcc-2026-backup.json',JSON.stringify({app:'PPCC-2026',version:1,exported:new Date().toISOString(),events},null,2),'application/json');break;case'import':$('#file-input').click();break;case'export-csv':exportCsv();break;case'copy-invite':copyInvite();break;case'new-key':{const b=new Uint8Array(24);crypto.getRandomValues(b);$('#sync-room').value=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');toast('Copy this key to Peter’s device');break}case'lock-device':if(confirm('Lock the companion on this device?'))window.PPCCAccess?.lock();break;case'sync':sync().then(()=>render());break;}}
document.addEventListener('click',e=>{const button=e.target.closest('[data-action],[data-page],[data-person],[data-day]');if(!button)return;if(button.dataset.action){if(button.dataset.action==='check')return;e.preventDefault();handleAction(button.dataset.action,button)}else if(button.dataset.page){page=button.dataset.page;altOpen='';render();window.scrollTo({top:0,behavior:'instant'})}else if(button.dataset.person){person=button.dataset.person;localStorage.setItem('ppcc2026.person',person);render()}else if(button.dataset.day){day=button.dataset.day;findTime='all';findQuery='';findLimit=20;render()}});
document.addEventListener('input',e=>{if(e.target.id==='find-query'){findQuery=e.target.value;findLimit=20;findResults(snapshot());}if(e.target.id==='people-query'){const q=normalized(e.target.value);document.querySelectorAll('.contact[data-person-search]').forEach(el=>{el.hidden=!el.dataset.personSearch.includes(q);});}if(e.target.id==='swap-search'){const q=normalized(e.target.value);let count=0;document.querySelectorAll('.swap-option').forEach(row=>{const visible=!q||row.textContent.toLowerCase().includes(q)||row.dataset.swapSearch?.includes(q);row.hidden=!visible;if(visible)count++;});const none=$('#swap-no-results');if(none)none.hidden=count>0;}});
document.addEventListener('change',e=>{if(e.target.id==='find-time'){findTime=e.target.value;findLimit=20;findResults(snapshot());}if(e.target.id==='contacts-filter'){contactsFilter=e.target.value;render()}if(e.target.id==='notes-filter'){notesFilter=e.target.value;render()}if(e.target.dataset.action==='check')handleAction('check',e.target)});
document.addEventListener('submit',e=>{if(e.target.id!=='settings-form')return;e.preventDefault();const p=Object.fromEntries(new FormData(e.target).entries());knownRemote.clear();config.url=validateWorkerUrl(p.url);config.room=p.room.trim();if(p.url.trim()&&!config.url){toast('Enter a valid HTTPS Worker URL');return}if(config.url&&config.room.length<24){toast('Shared key needs at least 24 characters');return}saveCfg();sync().then(()=>render());});
$('#file-input').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.app!=='PPCC-2026'||!Array.isArray(data.events))throw Error('Not a PPCC backup');const before=events.length,known=new Set(events.map(x=>x.id));for(const ev of data.events){if(typeof ev.id!=='string'||!ev.type||!ev.payload||!ev.ts||known.has(ev.id))continue;events.push(ev);known.add(ev.id)}save();render();toast(`Imported ${events.length-before} new updates`);if(config.url&&config.room){for(const event of events.slice(before))await postEvent(event)}}catch(err){toast('Import failed: '+err.message)}e.target.value='';});
async function postEvent(ev){if(!config.url||!config.room||knownRemote.has(ev.id))return;const r=await fetch(config.url+'/api/events',{method:'POST',headers:{'Content-Type':'application/json','X-Room-Key':config.room},body:JSON.stringify(ev)});if(!r.ok)throw Error('Upload failed: '+r.status);knownRemote.add(ev.id);}
async function pullEvents(){let cursor='',merged=0;do{const r=await fetch(config.url+'/api/events'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{headers:{'X-Room-Key':config.room}});if(!r.ok)throw Error('Sync HTTP '+r.status);const data=await r.json();const known=new Set(events.map(e=>e.id));for(const ev of data.events||[]){knownRemote.add(ev.id);if(!known.has(ev.id)){events.push(ev);known.add(ev.id);merged++}}cursor=data.cursor||'';}while(cursor);if(merged)save();return merged;}
async function sync(){if(!config.url||!config.room){setSync('Local only');toast('Add a Worker URL and shared key in Settings for live sync');return}if(syncBusy)return;syncBusy=true;setSync('Syncing…');try{const merged=await pullEvents();for(const e of events)await postEvent(e);const again=await pullEvents();lastSynced=new Date().toLocaleTimeString();setSync('Synced',true);if(merged+again)toast(`${merged+again} shared updates received`);render()}catch(e){setSync('Offline changes saved');toast(e.message)}finally{syncBusy=false}}
const setup=()=>{toggleDay();acceptInvite();render();if(config.url&&config.room)sync();setInterval(()=>{const time=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date());$('#clock').textContent=`Las Vegas · ${time}`;if(config.url&&config.room)sync();},30000);if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./service-worker.js').catch(()=>{});};
window.addEventListener('hashchange',()=>{if(!location.hash.startsWith(INVITE_PREFIX))return;acceptInvite();render();if(config.url&&config.room)sync();});
setup();
})();