/* Zahra Matcha — واجهة العميل | تصميم وتطوير: نرجس العمري */
const API = (window.ZAHRA_CONFIG || {}).API_URL || '';
const LIVE = !!API;
let D = null; // {menu, options, zones, settings}
let cart = [], cur = null, myPhone = null, myStamps = null;
const LS = {
  get(k){ try { return JSON.parse(localStorage.getItem('zahra_' + k)); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem('zahra_' + k, JSON.stringify(v)); } catch(e){} }
};
myPhone = LS.get('phone');

const CAT_ICON = {'ماتشا':'🍵','مشروبات باردة':'🧊','مشروبات ساخنة':'☕','حلى ومخبوزات':'🍪','الإضافات':'➕'};
const PH_ICON = {'مشروبات ساخنة':'☕','حلى ومخبوزات':'🍓','الإضافات':'➕'};
const ID_ICON = {'x-cream':'🍦','x-icecream':'🍨','x-double':'🍵','x-ice':'🧊'};
const MOODS = [
 {e:'😴',n:'نعسان',pick:'classic',msg:'ماتشا كلاسيك مع دبل ماتشا ⚡ تصحيك على طول'},
 {e:'🥰',n:'رايق',pick:'rose',msg:'ماتشا الورد، ناعمة مثل يومك 🌸'},
 {e:'🔥',n:'حران',pick:'dragon',msg:'موهيتو دراغون فروت بارد يرد الروح 🧊'},
 {e:'📚',n:'عندي مذاكرة',pick:'pistachio',msg:'ماتشا البستاشيو تعطيك تركيز وطعم يونّس 📖'},
 {e:'🍰',n:'أبي شي حلو',pick:'brulee',msg:'ماتشا كريم بروليه، حلى ومشروب بكوب واحد ✨'},
 {e:'🎉',n:'عندي مناسبة',pick:'birthday',msg:'الماتشا الاحتفالية 🎂 تكمّل الفرحة'}
];
const GROUPS = {'ماتشا':['الحليب','الحلاوة','إضافات الماتشا'],'كوكيز':['خيارات الكوكيز'],'حار':['خيارات الحار']};
const REQUIRED = ['الحليب','الحلاوة'];
const STEPS = ['جديد','قيد التحضير','جاهز','تم التسليم'];

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const money = n => n + ' ر.س';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byId = id => D.menu.find(m => m.id === id);
const imgSrc = m => !m.img ? '' : /^https?:/.test(m.img) ? m.img : 'img/' + m.img;
function toast(m){ const t=$('toast'); t.textContent=m; t.classList.add('on'); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove('on'),2600); }
function closeOv(id){ $(id).classList.remove('on'); }
function openOv(id){ $(id).classList.add('on'); }
function picHTML(m, size){ const s=imgSrc(m); return s ? `<img src="${esc(s)}" alt="${esc(m.name)}" loading="lazy">` : `<div class="ph" ${size?`style="width:${size}px;height:${size}px;border-radius:14px;font-size:${size/2}px"`:''}>${ID_ICON[m.id]||PH_ICON[m.cat]||'🍵'}</div>`; }
const hm = s => { const [h,m] = String(s||'0:0').split(':').map(Number); return h + (m||0)/60; };
function fmtH(x){ const h=Math.floor(x), m=Math.round((x%1)*60); const hh=h>12?h-12:(h===0?12:h); return `${hh}:${String(m).padStart(2,'0')} ${h>=12?'م':'ص'}`; }
function nowH(){ const d=new Date(); return d.getHours()+d.getMinutes()/60; }
function normPhone(p){ let d=String(p||'').replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/\D/g,''); if(d.startsWith('966'))d='0'+d.slice(3); if(d.length===9&&d[0]==='5')d='0'+d; return d; }

async function apiGet(params){
  const r = await fetch(API + '?' + new URLSearchParams(params), {redirect:'follow'});
  const j = await r.json(); if (j.error) throw new Error(j.error); return j;
}
async function apiPost(body){
  const r = await fetch(API, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(body), redirect:'follow'});
  const j = await r.json(); if (j.error) throw new Error(j.error); return j;
}

/* ---------- intro ---------- */
(function intro(){
  for(let i=0;i<14;i++){ const p=document.createElement('span'); p.className='fall'; p.textContent=['🌸','🍵','🍃'][i%3]; p.style.left=Math.random()*100+'%'; p.style.animationDuration=(4+Math.random()*4)+'s'; p.style.animationDelay=(Math.random()*2)+'s'; $('intro').appendChild(p); }
  if (sessionStorage.getItem('zahra_intro')) { $('intro').style.display='none'; }
  else { setTimeout(closeIntro, 4600); try{sessionStorage.setItem('zahra_intro','1')}catch(e){} }
})();
function closeIntro(){ $('intro').classList.add('hide'); }

/* ---------- load ---------- */
async function load(){
  if (!LIVE) { D = window.FALLBACK_DATA; $('preview').hidden = false; render(); return; }
  const cached = LS.get('menu'); if (cached) { D = cached; render(); }
  try { D = await apiGet({action:'menu'}); LS.set('menu', D); render(); }
  catch(e){ if(!D){ D = window.FALLBACK_DATA; render(); } toast('تعذر تحديث المنيو، تأكد من الاتصال'); }
  const last = LS.get('lastOrder'); if (last && Date.now()-last.t < 6*3600e3) pollStatus(last, true);
}
function render(){ renderOpen(); renderZones(); renderCats(); renderMenu(); renderMoods(); renderLoyStrip(); secObs(); if(myPhone && LIVE) refreshLoyalty(); }

function hours(){ const s=D.settings; return {pickup:[hm(s.pickupFrom),hm(s.pickupTo)], delivery:[hm(s.deliveryFrom),hm(s.deliveryTo)]}; }
function renderOpen(){
  const s=D.settings, H=hours(), h=nowH();
  const pk=h>=H.pickup[0]&&h<H.pickup[1], dl=h>=H.delivery[0]&&h<H.delivery[1];
  const st = !s.open ? ['#ccc','الطلبات مقفلة حالياً'] : (pk||dl) ? ['#5aa13a','مفتوح الحين'] : h<H.pickup[0] ? ['#f0a020',`نفتح ${fmtH(H.pickup[0])} — تقدر تطلب مسبقاً`] : ['#ccc','مقفل — اطلب لبكرة'];
  $('openNow').innerHTML = `<span class="dot" style="background:${st[0]}"></span><b>${st[1]}</b><br>🏡 الاستلام: ${fmtH(H.pickup[0])} – ${fmtH(H.pickup[1])}<br>🛵 التوصيل: ${fmtH(H.delivery[0])} – ${fmtH(H.delivery[1])}`;
  if (s.notice) { $('notice').textContent = s.notice; $('notice').hidden = false; } else $('notice').hidden = true;
}
function renderZones(){ $('zonesBox').innerHTML = `🛵 <b>التوصيل مع مندوب</b><br>${D.zones.map(z=>`${esc(z.name)} ${z.fee} ر.س`).join(' • ')}${D.settings.pickupPlace?`<br>🏡 الاستلام من: ${esc(D.settings.pickupPlace)}`:''}`; }
function cats(){ const c=[]; D.menu.forEach(m=>{ if(!c.includes(m.cat)) c.push(m.cat); }); return c; }
function renderCats(){ $('cats').innerHTML = cats().map((c,i)=>`<button data-c="${i}" onclick="goCat(${i})">${CAT_ICON[c]||'•'} ${esc(c)}</button>`).join(''); }
function goCat(i){ const el=$('sec-'+i); if(el) window.scrollTo({top:el.getBoundingClientRect().top+scrollY-125, behavior:'smooth'}); }
function renderMenu(){
  $('menu').innerHTML = cats().map((c,i)=>{
    const items = D.menu.filter(m=>m.cat===c);
    return `<div id="sec-${i}"><div class="sec-t">${CAT_ICON[c]||''} ${esc(c)} <small>${items.length} صنف</small></div><div class="grid">${items.map(m=>{
      const out=!m.available;
      return `<div class="item ${out?'out':''}" onclick="openItem('${esc(m.id)}')"><div class="pic">${picHTML(m)}${m.badge?`<span class="badge">${esc(m.badge)}</span>`:''}${out?'<div class="soldout">نفدت الكمية 💔</div>':''}</div>
      <div class="body"><h4>${esc(m.name)}</h4><div class="desc">${esc(m.desc)}</div><div class="row"><span class="price">${money(m.price)}</span><button class="add" ${out?'disabled':''} aria-label="أضف">+</button></div></div></div>`;
    }).join('')}</div></div>`;
  }).join('');
}
function secObs(){ const bs=document.querySelectorAll('.cats button'); let a='0'; cats().forEach((c,i)=>{ const e=$('sec-'+i); if(e && e.getBoundingClientRect().top<160) a=String(i); }); bs.forEach(b=>b.classList.toggle('on', b.dataset.c===a)); }
addEventListener('scroll', ()=>D && secObs(), {passive:true});
function renderMoods(){ const ok=MOODS.filter(m=>{const it=byId(m.pick);return it&&it.available}); $('moods').innerHTML = ok.map(m=>`<button onclick="pickMood('${m.pick}',this)">${m.e} ${m.n}</button>`).join(''); $('moods').closest('.mood').hidden=!ok.length; }
function pickMood(id,b){ document.querySelectorAll('.moods button').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  const m=MOODS.find(x=>x.pick===id), it=byId(id);
  $('moodRes').innerHTML = `${imgSrc(it)?`<img src="${imgSrc(it)}">`:''}<span>${m.msg}</span><button onclick="openItem('${id}')">جربها ←</button>`; $('moodRes').classList.add('show'); }

/* ---------- item ---------- */
function optsFor(m, g){ return D.options.filter(o=>o.group===g && !o.exclude.includes(m.id)); }
function openItem(id){ const m=byId(id); if(!m||!m.available) return;
  cur = {m, sel:{}, flavor: m.flavors && m.flavors.length ? m.flavors[0] : null, qty:1};
  drawItem(); openOv('ovItem'); }
function toggleOpt(g, name){ const multi=!REQUIRED.includes(g); const s=cur.sel[g]||[];
  if (multi) cur.sel[g] = s.includes(name) ? s.filter(x=>x!==name) : [...s, name]; else cur.sel[g]=[name];
  drawItem(); }
function choices(){ return Object.values(cur.sel).flat(); }
function curPrice(){ const m=cur.m; let p=m.price; (GROUPS[m.opt]||[]).forEach(g=>optsFor(m,g).forEach(o=>{ if((cur.sel[g]||[]).includes(o.name)) p+=o.price; })); return p; }
function drawItem(){ const c=cur, m=c.m; let o='';
  if (m.flavors && m.flavors.length) o += `<div class="opt"><span class="t">النكهة</span><div class="chips">${m.flavors.map(f=>`<button class="${c.flavor===f?'on':''}" onclick="cur.flavor='${esc(f)}';drawItem()">${esc(f)}</button>`).join('')}</div></div>`;
  (GROUPS[m.opt]||[]).forEach(g=>{ const os=optsFor(m,g); if(!os.length) return;
    o += `<div class="opt"><span class="t">${esc(g)} ${REQUIRED.includes(g)?'<em>* إلزامي</em>':''}</span><div class="chips">${os.map(x=>`<button class="${(c.sel[g]||[]).includes(x.name)?'on':''}" onclick="toggleOpt('${esc(g)}','${esc(x.name)}')">${esc(x.name)} ${x.price?`<small>+${x.price}</small>`:''}</button>`).join('')}</div></div>`; });
  const missing = (GROUPS[m.opt]||[]).filter(g=>REQUIRED.includes(g) && optsFor(m,g).length && !(c.sel[g]||[]).length);
  const s = imgSrc(m);
  $('itemSheet').innerHTML = `<div class="sheet-h"><b>${o?'عدّل طلبك ✨':'أضف للسلة'}</b><button class="x" onclick="closeOv('ovItem')">×</button></div>
  <div class="ihead">${s?`<img src="${s}">`:`<div style="width:110px;height:110px;border-radius:18px;display:grid;place-items:center;font-size:50px;background:var(--pink-l)">${ID_ICON[m.id]||PH_ICON[m.cat]||'🍵'}</div>`}<div><h3>${esc(m.name)}</h3><p>${esc(m.desc)}</p><p class="price" style="margin-top:6px">${money(m.price)}</p>${m.pickupOnly?'<p style="color:var(--green);font-size:12px;margin-top:4px">🏡 متوفر للاستلام فقط</p>':''}</div></div>
  ${o}
  <div class="opt" style="display:flex;justify-content:space-between;align-items:center"><span class="t" style="margin:0">الكمية</span><div class="qty"><button onclick="cur.qty=Math.max(1,cur.qty-1);drawItem()">−</button><b>${c.qty}</b><button onclick="cur.qty=Math.min(20,cur.qty+1);drawItem()">+</button></div></div>
  <button class="big" ${missing.length?'disabled':''} onclick="addToCart()"><span>${missing.length?'اختر '+missing.join(' و'):'أضف للسلة'}</span><span>${money(curPrice()*c.qty)}</span></button>`; }
function addToCart(){ const c=cur, m=c.m, ch=choices(), opts=[c.flavor,...ch].filter(Boolean).join(' • ');
  const ex = cart.find(x=>x.id===m.id && x.opts===opts);
  if (ex) ex.qty += c.qty; else cart.push({id:m.id, name:m.name, opts, choices:ch, flavor:c.flavor, qty:c.qty, price:curPrice(), img:imgSrc(m), cat:m.cat, pickupOnly:!!m.pickupOnly});
  closeOv('ovItem'); updCart(); toast(`انضاف ${m.name} للسلة 🌸`);
  const b=$('cartBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
function updCart(){ $('cartN').textContent = cart.reduce((a,b)=>a+b.qty,0); }
const isDrink = c => D.settings.loyaltyCats.includes(c.cat);

/* ---------- checkout ---------- */
let co = {method:'pickup', zone:null, day:0, slot:null, receipt:null, receiptName:'', useReward:false, sending:false, err:''}, F = {};
function keepForm(){ ['fName','fPhone','fAddr','fNote'].forEach(i=>{ const e=$(i); if(e) F[i]=e.value; }); }
function restoreForm(){ Object.keys(F).forEach(i=>{ const e=$(i); if(e) e.value=F[i]; }); }
function openCart(){ const lo=LS.get('lastOrder'); if(!cart.length && lo && Date.now()-lo.t<6*3600e3 && !['تم التسليم','ملغي'].includes(lo.status)) drawTrack(lo); else drawCart(); openOv('ovCart'); }
function drawCart(){ keepForm(); _drawCart(); restoreForm(); }
function _drawCart(){
  const el=$('cartSheet');
  if (!cart.length){ el.innerHTML = `<div class="sheet-h"><b>السلة</b><button class="x" onclick="closeOv('ovCart')">×</button></div><div class="empty" style="font-size:14px">سلتك فاضية 🌸<br>اختر مشروبك من المنيو</div>`; return; }
  if (!co.zone && D.zones[0]) co.zone = D.zones[0].name;
  const s=D.settings, sub=cart.reduce((a,b)=>a+b.price*b.qty,0), zone=D.zones.find(z=>z.name===co.zone), del=co.method==='delivery'&&zone?zone.fee:0;
  const goal=s.loyaltyGoal, stamps = myStamps ?? 0, drinkItems=cart.filter(isDrink), canReward = LIVE && stamps>=goal && drinkItems.length;
  if (!canReward) co.useReward=false;
  const disc = co.useReward ? Math.min(...drinkItems.map(c=>c.price)) : 0, total=sub+del-disc;
  const [a,b]=hours()[co.method], h=nowH(); let slots='', any=false;
  for (let x=Math.ceil(a*2)/2; x<b-0.01; x+=.5){ const dis = co.day===0 && x<=h+.5; if(!dis) any=true; const l=fmtH(x); if(dis && co.slot===l) co.slot=null; slots += `<button ${dis?'disabled':''} class="${co.slot===l?'on':''}" onclick="co.slot='${l}';drawCart()">${l}</button>`; }
  const drinksN = drinkItems.reduce((a,b)=>a+b.qty,0);
  const pOnly = co.method==='delivery' ? cart.filter(c=>c.pickupOnly) : [];
  el.innerHTML = `<div class="sheet-h"><b>سلتك 🛍️</b><button class="x" onclick="closeOv('ovCart')">×</button></div>
  ${cart.map((c,i)=>`<div class="cline">${c.img?`<img src="${c.img}">`:`<div style="width:48px;height:48px;border-radius:12px;display:grid;place-items:center;font-size:24px;background:var(--pink-l)">${ID_ICON[c.id]||PH_ICON[c.cat]||'🍵'}</div>`}<div class="d"><b>${esc(c.name)}</b> ×${c.qty}<small>${esc(c.opts)}</small></div><b style="font-size:13px">${money(c.price*c.qty)}</b><button class="x" style="width:28px;height:28px;font-size:14px" onclick="cart.splice(${i},1);updCart();drawCart()">×</button></div>`).join('')}
  <div class="opt" style="margin-top:14px"><span class="t">طريقة الاستلام</span><div class="chips">
    <button class="${co.method==='pickup'?'on':''}" onclick="co.method='pickup';co.slot=null;drawCart()">🏡 استلام</button>
    <button class="${co.method==='delivery'?'on':''}" onclick="co.method='delivery';co.slot=null;drawCart()">🛵 توصيل مع مندوب</button></div></div>
  ${co.method==='delivery'?`<div class="opt"><span class="t">منطقة التوصيل</span><div class="chips">${D.zones.map(z=>`<button class="${co.zone===z.name?'on':''}" onclick="co.zone='${esc(z.name)}';drawCart()">${esc(z.name)} <small>${z.fee} ر.س</small></button>`).join('')}</div></div>`:(s.pickupPlace?`<p style="font-size:12px;color:var(--muted);margin:-6px 0 12px">📍 الاستلام من: ${esc(s.pickupPlace)}</p>`:'')}
  <div class="opt"><span class="t">اليوم</span><div class="chips"><button class="${co.day===0?'on':''}" onclick="co.day=0;co.slot=null;drawCart()">اليوم</button><button class="${co.day===1?'on':''}" onclick="co.day=1;co.slot=null;drawCart()">بكرة</button></div></div>
  <span class="t" style="font-size:13px;font-weight:600;display:block;margin-bottom:8px">الوقت</span>
  <div class="slots">${any?slots:'<span style="grid-column:1/-1;font-size:12px;color:var(--muted)">انتهت أوقات اليوم — اختر بكرة</span>'}</div>
  <input class="fld" id="fName" placeholder="الاسم" autocomplete="name">
  <input class="fld" id="fPhone" placeholder="رقم الجوال 05xxxxxxxx" inputmode="tel" autocomplete="tel" value="${esc(myPhone||'')}" onchange="phoneChanged(this.value)">
  ${co.method==='delivery'?'<input class="fld" id="fAddr" placeholder="الحي + رابط الموقع">':''}
  <textarea class="fld" id="fNote" rows="2" placeholder="ملاحظة (اختياري)"></textarea>
  ${canReward?`<label class="reward"><input type="checkbox" ${co.useReward?'checked':''} onchange="co.useReward=this.checked;drawCart()"> 🎁 عندك مشروب مجاني من بطاقة الولاء! استخدمه الحين</label>`:(LIVE&&myPhone&&drinksN?`<div class="reward">🎟️ عندك ${stamps} من ${goal} أختام — هالطلب يضيف ${drinksN}</div>`:'')}
  <div class="sum"><div><span>المجموع</span><span>${money(sub)}</span></div>${del?`<div><span>التوصيل (${esc(co.zone)})</span><span>${money(del)}</span></div>`:''}${disc?`<div class="disc"><span>🎁 مشروب مجاني</span><span>−${money(disc)}</span></div>`:''}<div class="tot"><span>الإجمالي</span><span>${money(total)}</span></div></div>
  <div class="bank">💳 <b>الدفع بالتحويل البنكي</b><br>${s.bank?`البنك: ${esc(s.bank)}<br>`:''}${s.holder?`باسم: ${esc(s.holder)}<br>`:''}${s.iban?`الآيبان: <b dir="ltr" style="user-select:all">${esc(s.iban)}</b> <button onclick="copyIban()" style="background:#fff;border-radius:8px;padding:2px 8px;font-size:11px">نسخ</button><br>`:''}حوّل المبلغ وارفع صورة الإيصال 👇</div>
  <label class="upload ${co.receipt?'ok':''}">${co.receipt?'✅ تم إرفاق الإيصال — '+esc(co.receiptName):'📎 ارفع صورة إيصال التحويل'}<input type="file" accept="image/*,application/pdf" hidden onchange="pickReceipt(this.files[0])"></label>
  ${pOnly.length?`<div class="err">🏡 ${pOnly.map(c=>esc(c.name)).join('، ')} متوفر للاستلام فقط — اختر استلام أو احذفه من السلة</div>`:''}
  ${co.err?`<div class="err">${esc(co.err)}</div>`:''}
  <button class="big" ${!co.slot||!co.receipt||co.sending||!s.open||pOnly.length?'disabled':''} onclick="placeOrder()"><span>${co.sending?'<span class="spin"></span> جاري الإرسال…':!s.open?'الطلبات مقفلة':!co.slot?'اختر الوقت':!co.receipt?'ارفع الإيصال':'أكّد الطلب'}</span><span>${money(total)}</span></button>`;
}
function copyIban(){ try{ navigator.clipboard.writeText(D.settings.iban); toast('تم نسخ الآيبان ✓'); }catch(e){} }
function phoneChanged(v){ const p=normPhone(v); if(p.length===10 && p!==myPhone){ myPhone=p; LS.set('phone',p); myStamps=null; refreshLoyalty().then(()=>drawCart()); } }
async function pickReceipt(file){ if(!file) return;
  try {
    if (file.type === 'application/pdf') { if (file.size > 4e6) { toast('الملف كبير، ارفع صورة بدالها'); return; } co.receipt = await readAs(file); }
    else co.receipt = await shrink(file, 1400, .82);
    co.receiptName = file.name.slice(0,24); co.err=''; drawCart();
  } catch(e){ toast('تعذر قراءة الملف'); } }
const readAs = f => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });
function shrink(file, max, q){ return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>{ const k=Math.min(1,max/Math.max(img.width,img.height)), c=document.createElement('canvas'); c.width=img.width*k; c.height=img.height*k; c.getContext('2d').drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg',q)); }; img.onerror=rej; img.src=URL.createObjectURL(file); }); }

async function placeOrder(){
  keepForm(); co.err='';
  const name=(F.fName||'').trim(), phone=normPhone(F.fPhone);
  if (!name) { co.err='اكتب اسمك'; return drawCart(); }
  if (phone.length!==10 || phone[1]!=='5') { co.err='اكتب رقم جوال صحيح يبدأ بـ 05'; return drawCart(); }
  if (co.method==='delivery' && !(F.fAddr||'').trim()) { co.err='اكتب الحي أو رابط الموقع'; return drawCart(); }
  if (!LIVE) { toast('هذي نسخة عرض — الطلبات تشتغل بعد ربط النظام'); return; }
  co.sending=true; drawCart();
  try {
    const r = await apiPost({action:'order', name, phone, method:co.method, zone:co.method==='delivery'?co.zone:'', address:F.fAddr||'', slot:(co.day?'بكرة ':'اليوم ')+co.slot, note:F.fNote||'', useReward:co.useReward,
      items: cart.map(c=>({id:c.id, qty:c.qty, choices:c.choices, flavor:c.flavor})), receipt: co.receipt});
    myPhone=phone; LS.set('phone',phone); myStamps=r.stamps; LS.set('stamps',{p:phone,s:r.stamps});
    const order = {no:r.no, phone, t:Date.now(), name, slot:(co.day?'بكرة ':'اليوم ')+co.slot, method:co.method, zone:co.zone, total:r.total, added:r.added, status:'جديد'};
    LS.set('lastOrder', order);
    cart=[]; updCart(); F={}; co={method:'pickup', zone:null, day:0, slot:null, receipt:null, receiptName:'', useReward:false, sending:false, err:''};
    renderLoyStrip(); drawTrack(order); pollStatus(order);
  } catch(e){ co.sending=false; co.err = e.message || 'صار خطأ، حاول مرة ثانية'; drawCart(); }
}
function drawTrack(o){
  const idx = Math.max(0, STEPS.indexOf(o.status)), cancelled = o.status==='ملغي';
  const L=[['📥','استلمنا طلبك'],['🍵','نحضّره'],['🌸','جاهز'],[o.method==='delivery'?'🛵':'🤍',o.method==='delivery'?'وصل':'تم الاستلام']];
  $('cartSheet').innerHTML = `<div class="sheet-h"><b>طلبك 💌</b><button class="x" onclick="closeOv('ovCart')">×</button></div>
  <div class="track"><div style="font-size:46px">${cancelled?'⚠️':'🌸'}</div><p style="color:var(--muted);font-size:13px">رقم الطلب</p><div class="num">#${o.no}</div>
  <p style="font-size:14px;margin-top:6px">شكراً ${esc(o.name)}! موعدك <b>${esc(o.slot)}</b> — ${o.method==='delivery'?'توصيل '+esc(o.zone):'استلام'}</p>
  ${o.added?`<p style="font-size:13px;margin-top:8px;color:var(--green)">🎟️ انضاف لك ${o.added} ختم في بطاقة الولاء</p>`:''}
  ${cancelled?`<p class="err" style="margin-top:14px">تم إلغاء الطلب — تواصل معنا للاستفسار</p>`:`<div class="steps">${L.map((s,i)=>`<div class="step ${i<=idx?'done':''} ${i===idx?'now':''}"><i>${s[0]}</i>${s[1]}</div>`).join('')}</div>
  <p style="font-size:12px;color:var(--muted)">الحالة تتحدث تلقائياً</p>`}
  <button class="big" style="margin-top:16px;justify-content:center" onclick="LS.set('lastOrder',null);closeOv('ovCart');drawCart()">طلب جديد</button></div>`;
}
let pollT=null;
function pollStatus(o, silent){
  clearTimeout(pollT);
  const tick = async () => {
    try { const r = await apiGet({action:'status', no:o.no, phone:o.phone});
      if (r.status && r.status!==o.status){ o.status=r.status; LS.set('lastOrder',o); toast(`طلب #${o.no}: ${r.status}`); }
      if ($('ovCart').classList.contains('on') && !cart.length) drawTrack(o);
    } catch(e){}
    if (!['تم التسليم','ملغي'].includes(o.status)) pollT = setTimeout(tick, 25000);
  };
  tick();
}

/* ---------- loyalty ---------- */
async function refreshLoyalty(){
  if (!LIVE || !myPhone) return;
  const c = LS.get('stamps'); if (c && c.p===myPhone) myStamps=c.s;
  try { const r = await apiGet({action:'loyalty', phone:myPhone}); myStamps=r.stamps; LS.set('stamps',{p:myPhone,s:r.stamps}); } catch(e){}
  renderLoyStrip();
}
function renderLoyStrip(){ if(!D) return; const goal=D.settings.loyaltyGoal, st=myStamps??0, n=Math.min(st,goal);
  $('loyStrip').innerHTML = Array.from({length:goal+1},(_,i)=>i<goal?`<span class="stamp ${i<n?'on':''}">${i<n?'🌸':''}</span>`:`<span class="stamp gift">🎁</span>`).join('');
  $('loyTxt').textContent = !myPhone||myStamps==null ? `كل ${goal} مشروبات، اللي بعدها علينا 🌸` : st>=goal ? '🎁 عندك مشروب مجاني! استخدمه بطلبك الجاي' : `باقي لك ${goal-st} وتاخذ مشروب مجاني`; }
function openLoyalty(){ drawLoy(); openOv('ovLoy'); }
function drawLoy(loading){ const goal=D.settings.loyaltyGoal, st=myStamps??0, n=Math.min(st,goal);
  $('loySheet').innerHTML = `<div class="sheet-h"><b>بطاقة الولاء 🎟️</b><button class="x" onclick="closeOv('ovLoy')">×</button></div>
  <div class="lcard"><div class="top"><div><h3>بطاقة زهرة</h3><small>${myPhone?'📱 '+esc(myPhone):'سجّل برقم جوالك'}</small></div><img src="img/logo.jpg"></div>
  <div class="grid8">${Array.from({length:goal},(_,i)=>`<div class="s ${i<n?'on':''}">${i<n?'🌸':''}</div>`).join('')}<div class="s g">🎁<br>مجاني</div></div>
  <small>${loading?'جاري التحميل…':myStamps==null?'اكتب رقمك تحت وشوف أختامك':st>=goal?'مبروك! 🎉 مشروبك المجاني جاهز — فعّله من السلة':`${n} من ${goal} — باقي ${goal-n}`}</small></div>
  <div style="background:#fff;border-radius:18px;padding:14px;font-size:13px;line-height:1.9;margin-bottom:12px">
  <b>كيف تشتغل؟</b><br>🌸 كل مشروب تطلبه = ختم<br>🎁 تجمع ${goal} أختام = المشروب اللي بعدها مجاناً<br>📱 البطاقة مربوطة برقم جوالك، ما تحتاج تسجيل</div>
  <input class="fld" id="lPhone" placeholder="رقم جوالك 05xxxxxxxx" inputmode="tel" value="${esc(myPhone||'')}">
  <button class="big" style="justify-content:center" onclick="showCard()">اعرض بطاقتي</button>
  ${!LIVE?'<p style="font-size:11px;color:var(--muted);text-align:center;margin-top:10px">تشتغل بعد ربط النظام</p>':''}`; }
async function showCard(){ const p=normPhone($('lPhone').value); if(p.length!==10){ toast('اكتب رقم صحيح'); return; }
  myPhone=p; LS.set('phone',p); if(!LIVE){ myStamps=0; drawLoy(); return; } drawLoy(true); await refreshLoyalty(); drawLoy(); }

load();
setInterval(()=>D && renderOpen(), 60000);
