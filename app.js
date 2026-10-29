const showErr=m=>{document.getElementById('app').innerHTML='<main style="padding:16px;font-family:sans-serif"><h3>TYB Mess Manager</h3><p style="color:#b91c1c">'+m+'</p></main>'};
if(typeof supabase==='undefined')throw showErr('Could not load the Supabase library. Check your internet connection and reopen the app.');
if(!/^https?:\/\//.test(CFG.url)||/YOUR_/.test(CFG.key))throw showErr('Not configured: set your Supabase URL and anon key in www/config.js (or the SUPABASE_URL / SUPABASE_ANON_KEY GitHub secrets for the APK).');
const sb=supabase.createClient(CFG.url,CFG.key);
const $=s=>document.querySelector(s),app=$('#app');
let S={user:null,profile:null,settings:{},members:[],tab:'dashboard',recovery:false};
const lang=()=>(S.profile&&S.profile.lang)||localStorage.lang||'en';
const t=k=>(I18N[lang()]&&I18N[lang()][k])||I18N.en[k]||k;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const staff=()=>S.profile&&['admin','manager'].includes(S.profile.role),admin=()=>S.profile&&S.profile.role==='admin';
const LS=(k,v)=>{try{if(v===undefined)return JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}};
const Qd=()=>LS('tyb_q')||[];
if(!LS('tyb_dev'))LS('tyb_dev',Math.random().toString(36).slice(2,8));const dev=LS('tyb_dev');
let hasLock=false,lockedBy=null,syncMsg='';
const mname=id=>(S.members.find(m=>m.id===id)||{}).name||'?';
const num=v=>Number(v)||0,money=v=>(S.settings.currency||'')+num(v).toFixed(2);
function theme(){const th=(S.profile&&S.profile.theme)||{mode:'light',accent:'#0f766e'};
 document.documentElement.dataset.mode=th.mode;document.documentElement.style.setProperty('--ac',th.accent||'#0f766e');}
const ENT={
 members:{cols:[['name','text'],['phone','text']],order:'name'},
 meals:{cols:[['member_id','member'],['day','date'],['count','number']],order:'day'},
 payments:{cols:[['member_id','member'],['amount','number'],['paid_on','date'],['note','text']],order:'paid_on'},
 expenses:{cols:[['category','text'],['amount','number'],['spent_on','date'],['note','text']],order:'spent_on'},
 refunds:{cols:[['member_id','member'],['amount','number'],['refunded_on','date'],['note','text']],order:'refunded_on'}};
const TABS=['dashboard',...Object.keys(ENT),'settlement','ledger','audit','settings'];
async function all(tb,o){const r=await sb.from(tb).select('*').order(o||'id',{ascending:false});if(r.error||!r.data)return LS('c_'+tb)||[];LS('c_'+tb,r.data);return r.data}
async function loadMembers(){const r=await sb.from('members').select('*').order('name');S.members=r.data||LS('c_mem')||[];if(r.data)LS('c_mem',r.data)}
async function boot(){
 const {data:{session}}=await sb.auth.getSession();S.user=session&&session.user;
 if(S.user){const pr=await sb.from('profiles').select('*').eq('id',S.user.id).single();S.profile=pr.data||LS('c_prof');if(pr.data)LS('c_prof',pr.data);
  if(!S.profile)return showErr('Offline: open the app once with internet first.');
  const st=await sb.from('settings').select('*').single();S.settings=st.data||LS('c_set')||{};if(st.data)LS('c_set',st.data);await loadMembers();}
 theme();render();sync();}
async function claim(force){const r=await sb.rpc('claim_writer',{p_device:dev,p_force:!!force});
 if(r.error||!r.data){syncMsg=r.error?r.error.message:'';hasLock=false;return false}
 hasLock=!!r.data.ok;lockedBy=hasLock?null:r.data.holder_name;return hasLock}
async function ensureLock(){if(!navigator.onLine){alert('You are offline.');return false}if(await claim())return true;alert('Another admin is writing: '+(lockedBy||'?'));paint();return false}
async function sync(force){if(!S.user||!staff()||!navigator.onLine)return paint();
 if(!(await claim(force)))return paint();
 let q=Qd();const n=q.length;syncMsg='';
 while(q.length){const r=await sb.from(q[0].tb).insert(q[0].data);if(r.error&&!(r.error.message||'').includes('_pkey')){syncMsg=r.error.message;break}q.shift();LS('tyb_q',q)}
 if(n){await loadMembers();render()}else paint()}
function paint(){const el=$('#st');if(!el||!staff())return;const n=Qd().length;
 el.innerHTML=(navigator.onLine?'':'📴 Offline · ')+(n?`⏳ ${n} waiting to upload · `:'✓ Synced · ')+(hasLock?'You are the writer <button id="rel" class="ghost">Release</button>':lockedBy?`🔒 ${esc(lockedBy)} is writing <button id="tk" class="ghost">Take over</button>`:'No writer lock yet')+(syncMsg?` <span class="err">${esc(syncMsg)}</span>`:'');
 const r=$('#rel');if(r)r.onclick=async()=>{await sb.rpc('release_writer');hasLock=false;paint()};
 const k=$('#tk');if(k)k.onclick=()=>{if(confirm('Take over writing from '+lockedBy+'?'))sync(true)}}
addEventListener('online',()=>sync());addEventListener('offline',paint);
setInterval(()=>{if(S.user&&staff()&&navigator.onLine&&(hasLock||Qd().length))sync()},30000);
sb.auth.onAuthStateChange(e=>{if(e==='PASSWORD_RECOVERY'){S.recovery=true;render()}});
const mail=u=>u.trim().toLowerCase()+'@'+(CFG.domain||'tyb-mess.app');
const okUser=u=>/^[a-z0-9._-]{3,20}$/.test(u),isPin=v=>/^\d{4}$/.test(v);
async function authView(){const ex=await sb.rpc('admin_exists');const setup=ex.data===false;
 app.innerHTML=`<main><div class="card"><h2>${t('app')}</h2>${setup?`<p>${t('setup_admin')}</p>`:''}<div id="m"></div>
 <input id="u" placeholder="${t('username')}" autocapitalize="none" autocomplete="username"><br><input id="p" type="password" placeholder="${setup?t('password')+' (8+)':t('password_pin')}" autocomplete="current-password"><br>
 ${setup?`<input id="n" placeholder="${t('name')}"><br><button id="su">${t('create_admin')}</button>`:`<button id="li">${t('login')}</button>`}</div></main>`;
 const msg=x=>$('#m').innerHTML=`<p class="err">${esc(x)}</p>`;
 if(setup)$('#su').onclick=async()=>{const u=$('#u').value.trim().toLowerCase(),p=$('#p').value;
  if(!okUser(u))return msg(t('bad_user'));if(p.length<8||isPin(p))return msg(t('bad_pass'));
  const r=await sb.auth.signUp({email:mail(u),password:p,options:{data:{full_name:$('#n').value||u,username:u}}});if(r.error)return msg(r.error.message);
  const l=await sb.auth.signInWithPassword({email:mail(u),password:p});l.error?msg(l.error.message):boot()};
 else $('#li').onclick=async()=>{const u=$('#u').value.trim().toLowerCase(),v=$('#p').value;
  const {error}=await sb.auth.signInWithPassword({email:mail(u),password:isPin(v)?'pin'+v:v});error?msg(t('wrong')):boot()}}
function recoveryView(){app.innerHTML=`<main><div class="card"><h2>${t('new_password')}</h2><div id="m"></div><input id="p" type="password"><br><button id="b">${t('set_password')}</button></div></main>`;
 $('#b').onclick=async()=>{const {error}=await sb.auth.updateUser({password:$('#p').value});if(error)$('#m').innerHTML=`<p class="err">${esc(error.message)}</p>`;else{S.recovery=false;boot()}}}
function render(){
 if(S.recovery)return recoveryView();if(!S.user)return authView();
 if(!S.profile.approved)return app.innerHTML=`<main><div class="card"><p>${t('waiting')}</p><button onclick="sb.auth.signOut().then(()=>location.reload())">${t('logout')}</button></div></main>`;
 app.innerHTML=`<header><b>${esc(S.settings.org_name||'TYB')}</b><span>${esc(S.profile.full_name)} · ${S.profile.role}</span></header>
 <nav>${TABS.filter(x=>x!=='audit'||staff()).map(x=>`<button class="ghost ${x===S.tab?'on':''}" data-t="${x}">${t(x)}</button>`).join('')}<button class="ghost" id="lo">${t('logout')}</button></nav>${staff()?'<div id="st" class="card noprint" style="margin:8px"></div>':''}<main id="v"></main>`;
 document.querySelectorAll('nav [data-t]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.t;render()});
 $('#lo').onclick=async()=>{if(hasLock&&navigator.onLine)await sb.rpc('release_writer');hasLock=false;await sb.auth.signOut();S.user=S.profile=null;render()};
 const v=S.tab;paint();(ENT[v]?()=>entity(v):({dashboard,settlement,ledger,audit,settings}[v]))();}
const lbl=k=>t(k==='member_id'?'member':(k==='day'||k.endsWith('_on'))?'date':k);
function field([k,ty]){
 if(ty==='member')return `<select name="${k}">${S.members.filter(m=>m.active).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>`;
 return `<input name="${k}" type="${ty}" ${ty==='number'?'step="any"':''} placeholder="${lbl(k)}" ${ty==='date'?`value="${new Date().toISOString().slice(0,10)}"`:''}>`}
const dl=(n,c,ty)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([c],{type:ty}));a.download=n;a.click()};
const csv=(rows,name)=>{if(!rows.length)return;const h=Object.keys(rows[0]);const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
 dl(name+'.csv','\ufeff'+[h.map(q).join(','),...rows.map(r=>h.map(k=>q(r[k])).join(','))].join('\n'),'text/csv')};
async function entity(tb){const E=ENT[tb],srv=await all(tb,E.order),rows=[...Qd().filter(x=>x.tb===tb).map(x=>({...x.data,_p:1})),...srv];
 const cell=(c,r)=>c[1]==='member'?esc(mname(r[c[0]])):esc(r[c[0]]);
 $('#v').innerHTML=`${staff()?`<form class="card noprint" id="f">${E.cols.map(field).join(' ')}<button>${t('add')}</button></form>`:`<p>${t('readonly')}</p>`}
 <div class="card"><div class="row noprint"><button class="ghost" id="c">${t('csv')}</button><button class="ghost" onclick="print()">${t('pdf')}</button></div>
 <div class="scroll"><table><tr>${E.cols.map(c=>`<th>${lbl(c[0])}</th>`).join('')}${staff()?'<th></th>':''}</tr>
 ${rows.map(r=>`<tr>${E.cols.map(c=>`<td>${cell(c,r)}</td>`).join('')}${staff()?`<td>${r._p?`<button class="del" data-q="${r.id}">×</button> ⏳`:`<button class="del" data-d="${r.id}">×</button>`}</td>`:''}</tr>`).join('')}</table></div></div>`;
 $('#c').onclick=()=>csv(rows,tb);
 document.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{LS('tyb_q',Qd().filter(x=>x.data.id!==b.dataset.q));render()});
 if(staff()){$('#f').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));
   E.cols.forEach(c=>{if(c[1]==='number')o[c[0]]=num(o[c[0]]);if(o[c[0]]==='')delete o[c[0]]});
   o.id=crypto.randomUUID();LS('tyb_q',[...Qd(),{tb,data:o}]);if(tb==='members')S.members.push({active:true,...o});render();sync()};
  document.querySelectorAll('[data-d]').forEach(b=>b.onclick=async()=>{if(!confirm(t('delete')+'?')||!(await ensureLock()))return;
   const {error}=await sb.from(tb).delete().eq('id',b.dataset.d);if(error)return alert(error.message);if(tb==='members')await loadMembers();render()})}}
async function calc(){const [m,p,e,r]=await Promise.all(['meals','payments','expenses','refunds'].map(x=>all(x)));
 const te=e.reduce((a,x)=>a+num(x.amount),0),tm=m.reduce((a,x)=>a+num(x.count),0);
 const rate=S.settings.rate_mode==='fixed'?num(S.settings.fixed_rate):(tm?te/tm:0);
 const sum=(a,id,k)=>a.filter(y=>y.member_id===id).reduce((s,y)=>s+num(y[k]),0);
 const rowsL=S.members.map(x=>{const meals=sum(m,x.id,'count'),paid=sum(p,x.id,'amount'),ref=sum(r,x.id,'amount');
  return {member:x.name,meals,paid,refunded:ref,cost:+(meals*rate).toFixed(2),balance:+(paid-ref-meals*rate).toFixed(2)}});
 return {te,tm,rate,rowsL}}
async function dashboard(){const c=await calc();
 $('#v').innerHTML=`<div class="card"><h3>${t('dashboard')}</h3><p>${t('total_expense')}: <b>${money(c.te)}</b></p><p>${t('total_meals')}: <b>${c.tm}</b></p><p>${t('meal_rate')}: <b>${money(c.rate)}</b></p></div>`}
async function ledger(){const c=await calc();
 $('#v').innerHTML=`<div class="card"><div class="row noprint"><button class="ghost" id="c">${t('csv')}</button><button class="ghost" onclick="print()">${t('pdf')}</button></div><p>${t('meal_rate')}: ${money(c.rate)}</p><div class="scroll"><table><tr><th>${t('member')}</th><th>${t('count')}</th><th>${t('paid')}</th><th>${t('refunded')}</th><th>${t('cost')}</th><th>${t('balance')}</th></tr>
 ${c.rowsL.map(r=>`<tr><td>${esc(r.member)}</td><td>${r.meals}</td><td>${money(r.paid)}</td><td>${money(r.refunded)}</td><td>${money(r.cost)}</td><td>${money(r.balance)}</td></tr>`).join('')}</table></div></div>`;
 $('#c').onclick=()=>csv(c.rowsL,'ledger')}
async function settlement(){const c=await calc(),hist=await all('settlements','created_at');
 $('#v').innerHTML=`${staff()?`<div class="card noprint"><input id="per" placeholder="${t('period')} (2026-10)"><button id="sv">${t('save_settlement')}</button></div>`:''}
 <div class="card"><div class="scroll"><table><tr><th>${t('period')}</th><th>${t('meal_rate')}</th><th>${t('total_expense')}</th><th>${t('total_meals')}</th></tr>${hist.map(h=>`<tr><td>${esc(h.period)}</td><td>${money(h.meal_rate)}</td><td>${money(h.total_expense)}</td><td>${h.total_meals}</td></tr>`).join('')}</table></div></div>`;
 if(staff())$('#sv').onclick=async()=>{if(!(await ensureLock()))return;const {error}=await sb.from('settlements').insert({period:$('#per').value||new Date().toISOString().slice(0,7),meal_rate:c.rate,total_expense:c.te,total_meals:c.tm,details:c.rowsL});error?alert(error.message):settlement()}}
async function audit(){if(!staff())return;const r=(await sb.from('audit_log').select('*').order('id',{ascending:false}).limit(200)).data||[];
 $('#v').innerHTML=`<div class="card scroll"><table><tr><th>${t('when')}</th><th>${t('table')}</th><th>${t('action')}</th></tr>${r.map(x=>`<tr><td>${new Date(x.at).toLocaleString()}</td><td>${esc(x.tbl)}</td><td>${esc(x.action)}</td></tr>`).join('')}</table></div>`}
async function savePref(p){const {error}=await sb.from('profiles').update(p).eq('id',S.user.id);if(error)return alert(error.message);Object.assign(S.profile,p);theme();render()}
async function settings(){const th=S.profile.theme||{};let users=[];if(admin())users=(await sb.from('profiles').select('*')).data||[];
 $('#v').innerHTML=`<div class="card"><h3>${t('theme')}</h3><select id="md"><option value="light">${t('light')}</option><option value="dark">${t('dark')}</option></select>
 <input id="ac" type="color" value="${th.accent||'#0f766e'}"> <h3>${t('language')}</h3><select id="lg">${Object.keys(I18N).map(l=>`<option ${l===lang()?'selected':''}>${l}</option>`).join('')}</select> <button id="sp">${t('save')}</button></div>
 ${admin()?`<div class="card"><h3>${t('org')}</h3><input id="on" value="${esc(S.settings.org_name)}"><input id="ct" placeholder="${t('contact')}" value="${esc(S.settings.contact)}"><input id="cu" value="${esc(S.settings.currency)}" size="3">
 <select id="rm"><option value="auto">${t('auto')}</option><option value="fixed">${t('fixed')}</option></select><input id="fr" type="number" step="any" value="${num(S.settings.fixed_rate)}"><button id="ss">${t('save')}</button></div>
 <div class="card"><h3>${t('employees')}</h3><div id="em"></div><input id="eu" placeholder="${t('username')}" autocapitalize="none"> <input id="en" placeholder="${t('name')}"> <input id="ep" inputmode="numeric" maxlength="4" placeholder="PIN (4)"> <button id="ea">${t('add_employee')}</button>
 ${users.filter(u=>u.id!==S.user.id).map(u=>`<div style="margin-top:8px">${esc(u.full_name)} (${esc(u.username||'')}) ${u.approved?'':'⛔'} <button class="ghost" data-pin="${u.id}">${t('reset_pin')}</button> <button class="ghost" data-tg="${u.id}" data-ap="${u.approved?1:0}">${u.approved?t('disable'):t('enable')}</button></div>`).join('')}</div>
 <div class="card"><button id="bk">${t('backup')}</button></div>`:''}`;
 $('#md').value=th.mode||'light';
 $('#sp').onclick=()=>{const l=$('#lg').value;localStorage.lang=l;savePref({lang:l,theme:{mode:$('#md').value,accent:$('#ac').value}})};
 if(admin()){$('#ss').onclick=async()=>{if(!(await ensureLock()))return;const {error}=await sb.from('settings').update({org_name:$('#on').value,contact:$('#ct').value,currency:$('#cu').value,rate_mode:$('#rm').value,fixed_rate:num($('#fr').value)}).eq('id',1);error?alert(error.message):boot()};
  $('#rm').value=S.settings.rate_mode||'auto';
  $('#ea').onclick=async()=>{const u=$('#eu').value.trim().toLowerCase(),p=$('#ep').value,m=$('#em');
   if(!okUser(u)||!isPin(p))return m.innerHTML=`<p class="err">${t('bad_emp')}</p>`;
   const c2=supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:false,autoRefreshToken:false}});
   const r=await c2.auth.signUp({email:mail(u),password:'pin'+p,options:{data:{full_name:$('#en').value||u,username:u}}});
   if(r.error||!r.data||!r.data.user)return m.innerHTML=`<p class="err">${esc(r.error?r.error.message:'Failed')}</p>`;
   const e=await sb.from('profiles').update({approved:true}).eq('id',r.data.user.id);e.error?alert(e.error.message):settings()};
  document.querySelectorAll('[data-pin]').forEach(b=>b.onclick=async()=>{const p=prompt('New 4-digit PIN');if(!isPin(p||''))return;const r=await sb.rpc('admin_set_pin',{p_user:b.dataset.pin,p_pw:'pin'+p});alert(r.error?r.error.message:t('saved'))});
  document.querySelectorAll('[data-tg]').forEach(b=>b.onclick=async()=>{const e=await sb.from('profiles').update({approved:b.dataset.ap!=='1'}).eq('id',b.dataset.tg);e.error?alert(e.error.message):settings()});
  $('#bk').onclick=async()=>{const o={};for(const x of ['members','meals','payments','expenses','refunds','settlements','audit_log'])o[x]=(await sb.from(x).select('*')).data;dl('tyb-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(o,null,1),'application/json')}}}
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js');
boot().catch(e=>showErr('Startup error: '+e.message));
