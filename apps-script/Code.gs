/**
 * Zahra Matcha — نظام الطلبات (Google Sheets + Apps Script)
 * تصميم وتطوير: نرجس العمري
 *
 * طريقة التشغيل (مرة وحدة):
 * 1) افتح Google Sheet جديد على حساب زهرة ماتشا ← Extensions ← Apps Script
 * 2) الصق هذا الملف كامل مكان الكود الموجود واحفظ
 * 3) شغّل الدالة setup مرة وحدة (ووافق على الصلاحيات)
 * 4) Deploy ← New deployment ← Web app
 *      Execute as: Me   |   Who has access: Anyone
 * 5) انسخ رابط الـ Web app وحطه في config.js في الموقع (API_URL)
 * أي تعديل لاحق على الكود يحتاج: Deploy ← Manage deployments ← Edit ← New version
 */

const SH = {
  MENU: 'المنيو', OPTIONS: 'الخيارات', ZONES: 'مناطق التوصيل',
  SETTINGS: 'الإعدادات', ORDERS: 'الطلبات', LOYALTY: 'بطاقة الولاء'
};
const STATUS = ['جديد', 'قيد التحضير', 'جاهز', 'تم التسليم', 'ملغي'];
const RECEIPTS_FOLDER = 'إيصالات زهرة ماتشا';

/* ====================== API ====================== */
function doGet(e) {
  const p = e.parameter || {};
  try {
    switch (p.action) {
      case 'menu':    return out(getMenuData());
      case 'loyalty': return out(getLoyalty(p.phone));
      case 'status':  return out(getStatus(p.no, p.phone));
      case 'orders':  checkPin(p.pin); return out(getOrders());
      default:        return out({ ok: true, name: 'Zahra Matcha API' });
    }
  } catch (err) { return out({ error: String(err.message || err) }); }
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (x) { return out({ error: 'bad json' }); }
  try {
    switch (body.action) {
      case 'order':     return out(placeOrder(body));
      case 'setStatus': checkPin(body.pin); return out(setStatus(body.no, body.status));
      case 'setAvail':  checkPin(body.pin); return out(setAvail(body.id, body.available));
      default:          return out({ error: 'unknown action' });
    }
  } catch (err) { return out({ error: String(err.message || err) }); }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ====================== READ ====================== */
function sheet(name) { return SpreadsheetApp.getActive().getSheetByName(name); }
function rows(name) {
  const v = sheet(name).getDataRange().getValues();
  v.shift();
  return v.filter(r => String(r[0]).trim() !== '');
}
function yes(v) { return v === true || ['نعم', 'yes', 'true', '1', '✓'].includes(String(v).trim().toLowerCase()); }

function getSettings() {
  const s = {};
  rows(SH.SETTINGS).forEach(r => s[String(r[0]).trim()] = r[1]);
  return s;
}

function getMenuData() {
  const menu = rows(SH.MENU).map(r => ({
    id: String(r[0]).trim(), cat: String(r[1]).trim(), name: r[2], price: Number(r[3]) || 0,
    desc: r[4], img: String(r[5] || '').trim(), available: yes(r[6]),
    opt: String(r[7] || '').trim(), badge: r[8] || '', flavors: String(r[9] || '').split(/[,،]/).map(x => x.trim()).filter(Boolean),
    pickupOnly: yes(r[10])
  }));
  const options = rows(SH.OPTIONS).map(r => ({
    group: String(r[0]).trim(), name: String(r[1]).trim(), price: Number(r[2]) || 0,
    exclude: String(r[3] || '').split(/[,،]/).map(x => x.trim()).filter(Boolean)
  }));
  const zones = rows(SH.ZONES).map(r => ({ name: String(r[0]).trim(), fee: Number(r[1]) || 0 }));
  const s = getSettings();
  return {
    menu, options, zones,
    settings: {
      open: yes(s['استقبال الطلبات']),
      pickupFrom: timeStr(s['بداية الاستلام']), pickupTo: timeStr(s['نهاية الاستلام']),
      deliveryFrom: timeStr(s['بداية التوصيل']), deliveryTo: timeStr(s['نهاية التوصيل']),
      bank: s['اسم البنك'] || '', iban: s['الآيبان'] || '', holder: s['اسم صاحب الحساب'] || '',
      pickupPlace: s['مكان الاستلام'] || '', loyaltyGoal: Number(s['أختام بطاقة الولاء']) || 7,
      loyaltyCats: String(s['أقسام الولاء'] || 'ماتشا,مشروبات باردة,مشروبات ساخنة').split(/[,،]/).map(x => x.trim()),
      notice: s['تنبيه أعلى الصفحة'] || ''
    }
  };
}

function timeStr(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  return String(v || '').trim();
}

/* ====================== LOYALTY ====================== */
function normPhone(p) {
  let d = String(p || '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/\D/g, '');
  if (d.startsWith('966')) d = '0' + d.slice(3);
  if (d.length === 9 && d[0] === '5') d = '0' + d;
  return d;
}
function loyaltyRow(phone) {
  const sh = sheet(SH.LOYALTY), v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (normPhone(v[i][0]) === phone) return { row: i + 1, stamps: Number(v[i][1]) || 0, total: Number(v[i][2]) || 0 };
  return null;
}
function getLoyalty(phone) {
  phone = normPhone(phone);
  if (phone.length !== 10) return { error: 'رقم غير صحيح' };
  const r = loyaltyRow(phone), goal = getMenuData().settings.loyaltyGoal;
  return { phone, stamps: r ? r.stamps : 0, goal };
}

/* ====================== ORDERS ====================== */
function placeOrder(b) {
  const data = getMenuData(), st = data.settings;
  if (!st.open) throw new Error('الطلبات مقفلة حالياً');
  const name = String(b.name || '').trim(), phone = normPhone(b.phone);
  if (!name || phone.length !== 10) throw new Error('الاسم أو رقم الجوال غير صحيح');
  if (!Array.isArray(b.items) || !b.items.length) throw new Error('السلة فاضية');
  if (!b.receipt) throw new Error('إيصال التحويل مطلوب');

  const byId = {}; data.menu.forEach(m => byId[m.id] = m);
  const lines = [], drinkPrices = [];
  let sub = 0, drinks = 0;
  b.items.forEach(it => {
    const m = byId[it.id];
    if (!m) throw new Error('صنف غير موجود');
    if (!m.available) throw new Error(m.name + ' نفدت الكمية');
    const qty = Math.max(1, Math.min(50, parseInt(it.qty, 10) || 1));
    const choices = Array.isArray(it.choices) ? it.choices.map(String) : [];
    const groups = { 'ماتشا': ['الحليب', 'الحلاوة', 'إضافات الماتشا'], 'كوكيز': ['خيارات الكوكيز'], 'حار': ['خيارات الحار'] }[m.opt] || [];
    if (b.method === 'delivery' && m.pickupOnly) throw new Error(m.name + ' متوفر للاستلام فقط');
    let price = m.price; const picked = [];
    groups.forEach(g => {
      const opts = data.options.filter(o => o.group === g && !o.exclude.includes(m.id));
      const chosen = opts.filter(o => choices.includes(o.name));
      if ((g === 'الحليب' || g === 'الحلاوة') && chosen.length !== 1) throw new Error('اختر ' + g + ' لـ ' + m.name);
      chosen.forEach(o => { price += o.price; picked.push(o.name); });
    });
    if (m.flavors.length) {
      const f = String(it.flavor || '');
      if (!m.flavors.includes(f)) throw new Error('اختر النكهة لـ ' + m.name);
      picked.unshift(f);
    }
    sub += price * qty;
    lines.push(qty + '× ' + m.name + (picked.length ? ' (' + picked.join(' • ') + ')' : '') + ' = ' + price * qty);
    if (st.loyaltyCats.includes(m.cat)) { drinks += qty; drinkPrices.push(price); }
  });

  let fee = 0, zone = '';
  if (b.method === 'delivery') {
    const z = data.zones.find(z => z.name === b.zone);
    if (!z) throw new Error('اختر منطقة التوصيل');
    fee = z.fee; zone = z.name;
    if (!String(b.address || '').trim()) throw new Error('اكتب العنوان');
  }

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    // loyalty
    const lr = loyaltyRow(phone); let stamps = lr ? lr.stamps : 0, disc = 0;
    if (b.useReward && stamps >= st.loyaltyGoal && drinkPrices.length) { disc = Math.min.apply(null, drinkPrices); stamps -= st.loyaltyGoal; }
    stamps += drinks;
    const lsh = sheet(SH.LOYALTY), now = new Date();
    if (lr) lsh.getRange(lr.row, 2, 1, 3).setValues([[stamps, lr.total + drinks, now]]);
    else lsh.appendRow(["'" + phone, stamps, drinks, now]);

    const receiptUrl = saveReceipt(b.receipt, phone);
    const osh = sheet(SH.ORDERS), no = Math.max(1000, (Number(osh.getRange(Math.max(2, osh.getLastRow()), 1).getValue()) || 1000)) + 1;
    const total = sub + fee - disc;
    osh.appendRow([no, now, name, "'" + phone, b.method === 'delivery' ? 'توصيل' : 'استلام', zone,
      String(b.address || ''), String(b.slot || ''), lines.join('\n'), sub, fee, disc, total,
      receiptUrl, String(b.note || ''), 'جديد', disc ? 'نعم' : '']);
    return { ok: true, no, total, sub, fee, disc, stamps, goal: st.loyaltyGoal, added: drinks };
  } finally { lock.releaseLock(); }
}

function saveReceipt(dataUrl, phone) {
  const m = String(dataUrl).match(/^data:(.+?);base64,(.+)$/);
  if (!m) throw new Error('إيصال غير صالح');
  const it = DriveApp.getFoldersByName(RECEIPTS_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(RECEIPTS_FOLDER);
  const ext = m[1].includes('pdf') ? 'pdf' : 'jpg';
  const f = folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], phone + '_' + Date.now() + '.' + ext));
  return f.getUrl();
}

function getStatus(no, phone) {
  const v = sheet(SH.ORDERS).getDataRange().getValues();
  for (let i = v.length - 1; i > 0; i--)
    if (String(v[i][0]) === String(no) && normPhone(v[i][3]) === normPhone(phone)) return { no: v[i][0], status: v[i][15] };
  return { error: 'not found' };
}

function getOrders() {
  const v = sheet(SH.ORDERS).getDataRange().getValues(); v.shift();
  const since = Date.now() - 2 * 86400000;
  return { orders: v.filter(r => r[0] && new Date(r[1]).getTime() > since && r[15] !== 'تم التسليم' && r[15] !== 'ملغي').map(r => ({
    no: r[0], time: r[1], name: r[2], phone: String(r[3]), method: r[4], zone: r[5], address: r[6], slot: r[7],
    items: r[8], total: r[12], receipt: r[13], note: r[14], status: r[15], reward: r[16]
  })), menu: getMenuData().menu };
}

function setStatus(no, status) {
  if (!STATUS.includes(status)) throw new Error('حالة غير معروفة');
  const sh = sheet(SH.ORDERS), v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === String(no)) { sh.getRange(i + 1, 16).setValue(status); return { ok: true }; }
  throw new Error('الطلب غير موجود');
}

function setAvail(id, available) {
  const sh = sheet(SH.MENU), v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]).trim() === id) { sh.getRange(i + 1, 7).setValue(available ? 'نعم' : 'لا'); return { ok: true }; }
  throw new Error('الصنف غير موجود');
}

function checkPin(pin) {
  if (String(pin) !== String(getSettings()['رمز شاشة التحضير'])) throw new Error('رمز غير صحيح');
}

/* ====================== SETUP (مرة وحدة) ====================== */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const make = (name, headers, data, widths) => {
    let sh = ss.getSheetByName(name);
    if (sh) return sh; // لا نمسح أي بيانات موجودة
    sh = ss.insertSheet(name);
    sh.setRightToLeft(true);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#fde3ec');
    sh.setFrozenRows(1);
    if (data && data.length) sh.getRange(2, 1, data.length, headers.length).setValues(data);
    (widths || []).forEach((w, i) => sh.setColumnWidth(i + 1, w));
    return sh;
  };

  const M = [
    ['classic','ماتشا','ماتشا كلاسيك',20,'ماتشا كلاسيكية ممزوجة بالحليب، بطعمها المتوازن والمنعش.','classic.jpg','نعم','ماتشا','','',''],
    ['straw','ماتشا','ماتشا الفراولة',25,'ماتشا بالحليب مع صوص الفراولة بطعمه الفاكهي المنعش.','straw.jpg','نعم','ماتشا','الأكثر طلباً','',''],
    ['mango','ماتشا','ماتشا مانجو',25,'ماتشا بالحليب مع صوص المانجو بطعمه الاستوائي الحلو.','mango.jpg','نعم','ماتشا','','',''],
    ['blackberry','ماتشا','ماتشا التوت الأسود',28,'ماتشا غنية ممزوجة بالحليب وطبقة من صوص التوت الأسود.','blackberry.jpg','نعم','ماتشا','','',''],
    ['oreo','ماتشا','ماتشا الأوريو',28,'مزيج الماتشا والحليب مع قطع الأوريو ونكهة الشوكولاتة.','oreo.jpg','نعم','ماتشا','','',''],
    ['pistachio','ماتشا','ماتشا البستاشيو',28,'ماتشا كريمية بالحليب مع نكهة الفستق الغنية.','pistachio.jpg','نعم','ماتشا','','',''],
    ['lotus','ماتشا','ماتشا اللوتس',28,'ماتشا بالحليب مع صوص اللوتس بنكهة البسكويت والكراميل.','lotus.jpg','نعم','ماتشا','','',''],
    ['rose','ماتشا','ماتشا الورد',28,'ماتشا بالحليب تعلوها كريمة الورد مع لمسات من بتلات الورد.','rose.jpg','نعم','ماتشا','توقيع زهرة 🌸','',''],
    ['rafaello','ماتشا','ماتشا الرافيلو',28,'ماتشا بالحليب مع نكهة الرافيلو ولمسة من جوز الهند.','rafaello.jpg','نعم','ماتشا','','',''],
    ['dates','ماتشا','ماتشا سعودية بالتمر',29,'ماتشا بالحليب مع نكهة التمر بطابع سعودي مميز.','dates.jpg','نعم','ماتشا','','',''],
    ['brulee','ماتشا','ماتشا كريم بروليه',30,'ماتشا كريمية تعلوها طبقة ناعمة بنكهة الكريم بروليه.','brulee.jpg','نعم','ماتشا','','',''],
    ['cheesecake','ماتشا','ماتشا تشيز كيك التوت الأحمر',31,'ماتشا كريمية مع طبقة تشيز كيك وصوص التوت الأحمر.','cheesecake.jpg','نعم','ماتشا','','',''],
    ['mahmoos','ماتشا','ماتشا الحليب المحموس',34,'ماتشا بالحليب مع نكهة الحليب المحموس الغنية ولمسة كريمية.','mahmoos.jpg','نعم','ماتشا','','',''],
    ['birthday','ماتشا','الماتشا الاحتفالية',34,'ماتشا باردة مزينة بكريمة وردية ورشات احتفالية ملونة.','birthday.jpg','نعم','ماتشا','للمناسبات 🎂','',''],
    ['diy','ماتشا','ماتشا اصنعها بنفسك',30,'مجموعة لتحضير الماتشا بطريقتك، مع المكونات والإضافات المرفقة.','kit.jpg','نعم','','','',''],
    ['blue','مشروبات باردة','ماتشا زرقاء',24,'مشروب حليبي بارد بلون أزرق مميز وقوام كريمي.','blue.jpg','نعم','ماتشا','','',''],
    ['taro','مشروبات باردة','مشروب التارو',24,'مشروب تارو بارد بالحليب، بقوام كريمي ونكهة مميزة.','taro.jpg','نعم','ماتشا','','',''],
    ['vimto','مشروبات باردة','موهيتو الفيمتو (سفن آب)',26,'مشروب غازي منعش بنكهة الفيمتو مع الليمون والنعناع والثلج.','mojito.jpg','نعم','','','',''],
    ['dragon','مشروبات باردة','موهيتو دراغون فروت (سفن آب)',23,'موهيتو غازي منعش بنكهة فاكهة التنين مع الليمون والنعناع.','mojito.jpg','نعم','','','',''],
    ['hibiscus','مشروبات باردة','آيس كركديه',23,'كركديه بارد منعش يقدم مع الثلج والليمون.','hibiscus.jpg','نعم','','','',''],
    ['hotmatcha','مشروبات ساخنة','هوت ماتشا',20,'ماتشا حارة بالحليب تعلوها رغوة ناعمة ورشة ماتشا.','hotmatcha.jpg','نعم','حار','استلام فقط 🏡','','نعم'],
    ['hotchoc','مشروبات ساخنة','هوت شوكلت',18,'شوكولاتة حارة غنية مع كريمة ومارشملو محمّص.','hotchoc.jpg','نعم','حار','استلام فقط 🏡','','نعم'],
    ['cookies','حلى ومخبوزات','كوكيز',12,'كوكيز طرية بنكهات مختلفة، تقدر تطلبها حارة 🔥','cookies.jpg','نعم','كوكيز','','دبل شوكولاتة, ريد فيلفت, كوكيز التوت, شوكولاتة داكنة',''],
    ['berrydessert','حلى ومخبوزات','حلى التوت البارد',18,'حلى بارد بطبقات الكيك والكريمة وصوص التوت، تعلوه طبقة شوكولاتة.','berrydessert.jpg','نعم','','','',''],
    ['x-cream','الإضافات','كريمة',2,'كريمة إضافية مع طلبك.','','نعم','','','',''],
    ['x-icecream','الإضافات','آيس كريم',3,'سكوب آيس كريم مع طلبك.','','نعم','','','',''],
    ['x-double','الإضافات','دبل ماتشا',5,'شوت ماتشا إضافي.','','نعم','','','',''],
    ['x-ice','الإضافات','ثلج خارجي',2,'كوب ثلج منفصل.','','نعم','','','','']
  ];
  make(SH.MENU, ['المعرّف (لا تغيّره)','القسم','الاسم','السعر','الوصف','الصورة','متوفر','الخيارات','شارة','النكهات','استلام فقط'], M, [130,120,200,60,320,110,60,80,110,240,80]);

  const O = [
    ['الحليب','حليب عادي',0,''],['الحليب','خالي من اللاكتوز',3,''],['الحليب','حليب فانيلا',3,''],
    ['الحليب','جوز الهند',3,''],['الحليب','شوفان',3,''],['الحليب','لوز',3,''],
    ['الحلاوة','حالي',0,''],['الحلاوة','موزون',0,''],['الحلاوة','بدون حلى',0,''],
    ['إضافات الماتشا','كريمة',2,'rose, brulee'],['إضافات الماتشا','آيس كريم',3,'mahmoos'],
    ['إضافات الماتشا','دبل ماتشا',5,''],['إضافات الماتشا','ثلج خارجي',2,''],
    ['خيارات الكوكيز','تسخين',0,''],['خيارات الكوكيز','آيس كريم',3,''],
    ['خيارات الحار','كريمة',2,'']
  ];
  make(SH.OPTIONS, ['المجموعة','الخيار','السعر','لا يظهر مع (معرّفات)'], O, [140,160,60,220]);
  make(SH.ZONES, ['المنطقة','رسوم التوصيل'], [['القطيف',15],['سيهات',25]], [140,110]);
  make(SH.SETTINGS, ['الإعداد','القيمة'], [
    ['استقبال الطلبات','نعم'],['بداية الاستلام',"'15:30"],['نهاية الاستلام',"'20:30"],
    ['بداية التوصيل',"'15:30"],['نهاية التوصيل',"'23:00"],['مكان الاستلام','القطيف'],
    ['اسم البنك',''],['الآيبان',''],['اسم صاحب الحساب',''],
    ['أختام بطاقة الولاء',7],['أقسام الولاء','ماتشا,مشروبات باردة,مشروبات ساخنة'],
    ['رمز شاشة التحضير',String(Math.floor(1000 + Math.random() * 9000))],['تنبيه أعلى الصفحة','']
  ], [170,300]);
  const osh = make(SH.ORDERS, ['رقم الطلب','التاريخ','الاسم','الجوال','الطريقة','المنطقة','العنوان','الموعد','الأصناف','المجموع','التوصيل','خصم الولاء','الإجمالي','الإيصال','ملاحظة','الحالة','مكافأة ولاء'], [],
    [80,140,110,110,70,80,180,100,320,70,60,70,70,160,160,100,80]);
  osh.getRange('P2:P').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUS, true).build());
  osh.getRange('B2:B').setNumberFormat('yyyy-mm-dd hh:mm');
  osh.getRange('I2:I').setWrap(true);
  make(SH.LOYALTY, ['الجوال','الأختام الحالية','إجمالي المشروبات','آخر طلب'], [], [120,110,120,150]);
  ss.getSheetByName(SH.MENU).getRange('G2:G').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['نعم','لا'], true).build());
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('ورقة1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  Logger.log('تم التجهيز ✓ رمز شاشة التحضير: ' + getSettings()['رمز شاشة التحضير']);
}
