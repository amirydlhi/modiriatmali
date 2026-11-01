import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Keep Chart.js canvas text on the same locally bundled Pinar family as the interface.
if (window.Chart) {
  Chart.defaults.font.family = "Pinar, Tahoma, sans-serif";
  Chart.defaults.font.weight = "400";
}

window.__TARAZ_APP_STARTED = true;
document.querySelector('#bootFallback')?.remove();

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const TABLES = { income: 'income_records', expense: 'expense_records', reserved: 'reserved_funds', saving: 'savings_records' };
const TYPES = {
  income: { title: 'ثبت حقوق و درآمد', table: TABLES.income, date: 'received_on', label: 'حقوق', icon: '＋' },
  expense: { title: 'ثبت هزینه ماهانه', table: TABLES.expense, date: 'spent_on', label: 'هزینه', icon: '−' },
  fixed: { title: 'ثبت هزینه ثابت', table: TABLES.expense, date: 'spent_on', label: 'هزینه ثابت', icon: '▤', expenseType: 'fixed' },
  reserved: { title: 'ثبت مبلغ کنارگذاشته‌شده', table: TABLES.reserved, date: 'reserved_on', label: 'کنارگذاری', icon: '◷' },
  saving: { title: 'ثبت پس‌انداز', table: TABLES.saving, date: 'saved_on', label: 'پس‌انداز', icon: '↗' }
};
const CATEGORIES = ['خوراک و خرید روزانه','حمل‌ونقل','قبوض و خدمات','مسکن','درمان و سلامت','تفریح','آموزش','خرید','سایر'];
const faNumber = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
const faDigits = (value) => String(value).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const latinDigits = (value) => String(value).replace(/[۰-۹٠-٩]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d) >= 0 ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(d) : '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const money = (n) => faNumber.format(Math.round(Number(n) || 0));
const persianCalendarFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
const iranClockFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
const getDateParts = (formatter, date) => Object.fromEntries(formatter.formatToParts(date).filter(p => ['year','month','day'].includes(p.type)).map(p => [p.type, p.value]));
const iranTodayParts = () => getDateParts(iranClockFormatter, new Date());
const todayJalali = () => { const p = iranTodayParts(); return faDigits(`${p.year}/${p.month}/${p.day}`); };
const currentMonth = () => { const p = iranTodayParts(); return faDigits(`${p.year}/${p.month}`); };
const formatJalaliDate = (isoDate) => {
  if (!isoDate) return '—';
  const date = new Date(`${String(isoDate).slice(0,10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(isoDate);
  const p = getDateParts(persianCalendarFormatter, date);
  return faDigits(`${p.year}/${p.month}/${p.day}`);
};
const JALALI_BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const div = (a, b) => Math.trunc(a / b);
const mod = (a, b) => a - Math.trunc(a / b) * b;
function jalaliCalendar(year) {
  let gy = year + 621, leapJ = -14, jp = JALALI_BREAKS[0], jm, jump;
  if (year < jp || year >= JALALI_BREAKS[JALALI_BREAKS.length - 1]) throw new Error('سال شمسی خارج از محدوده معتبر است.');
  for (let i = 1; i < JALALI_BREAKS.length; i++) {
    jm = JALALI_BREAKS[i]; jump = jm - jp;
    if (year < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  const n = year - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ++;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { gy, march, leap };
}
function jalaliToGregorian(year, month, day) {
  const info = jalaliCalendar(year);
  const maxDay = month <= 6 ? 31 : month <= 11 ? 30 : (info.leap === 0 ? 30 : 29);
  if (month < 1 || month > 12 || day < 1 || day > maxDay) throw new Error('تاریخ شمسی معتبر نیست.');
  const dayOffset = month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30;
  const d = new Date(Date.UTC(info.gy, 2, info.march + dayOffset + day - 1));
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function parseJalaliMonth(value) {
  const raw = latinDigits(value).trim().replace(/[.-]/g, '/');
  const match = raw.match(/^(\d{4})\/(\d{1,2})$/);
  if (!match) throw new Error('ماه را به شکل ۱۴۰۵/۰۸ وارد کنید.');
  const year = Number(match[1]), month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error('شماره ماه باید بین ۱ تا ۱۲ باشد.');
  const start = jalaliToGregorian(year, month, 1);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = jalaliToGregorian(nextYear, nextMonth, 1);
  return { year, month, key: `${year}-${String(month).padStart(2,'0')}`, start, end, input: faDigits(`${year}/${String(month).padStart(2,'0')}`) };
}
function parseJalaliDate(value) {
  const raw = latinDigits(value).trim().replace(/[.-]/g, '/');
  const match = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) throw new Error('تاریخ را به شکل ۱۴۰۵/۰۸/۰۹ وارد کنید.');
  return jalaliToGregorian(Number(match[1]), Number(match[2]), Number(match[3]));
}
function jalaliMonthLabel(monthInput) {
  try {
    const m = parseJalaliMonth(monthInput);
    const date = new Date(`${m.start}T12:00:00Z`);
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(date);
  } catch { return 'ماه شمسی نامعتبر'; }
}
function updateMonthCaption() {
  const label = $('#monthLabel');
  if (label) label.textContent = `ماه انتخاب‌شده: ${jalaliMonthLabel($('#monthPicker').value)}`;
}
function parseAmount(value) {
  const normalized = latinDigits(value).replace(/[\s٬,،]/g, '').replace('٫', '.');
  return Number(normalized);
}
let supabase = null;
let user = null;
let records = { income: [], expense: [], reserved: [], saving: [] };
let activeTab = 'all';
let editing = null;
let expenseChart = null;
let allocationChart = null;
let isSignup = false;
let toastTimer;

function configValues() {
  const saved = JSON.parse(localStorage.getItem('taraz_supabase_config') || '{}');
  return {
    url: (saved.url || window.APP_CONFIG?.supabaseUrl || '').trim(),
    key: (saved.key || window.APP_CONFIG?.supabaseAnonKey || '').trim()
  };
}
function showView(name) {
  ['configView','authView','dashboardView'].forEach(id => $(`#${id}`).classList.toggle('hidden', id !== name));
}
function setStatus(label, state='') {
  const el = $('#connectionStatus'); el.className = `status-pill ${state}`; el.innerHTML = `<i></i> ${label}`;
}
function notify(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
function setSyncText() { $('#syncText').textContent = `همگام‌سازی به وقت ایران: ${new Date().toLocaleTimeString('fa-IR',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit'})}`; }
function initSupabase() {
  const {url,key} = configValues();
  if (!url || !key) { supabase = null; showView('configView'); setStatus('نیاز به تنظیم اتصال','offline'); return false; }
  try {
    supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    setStatus('اتصال آماده است','online');
    return true;
  } catch (e) { showView('configView'); setStatus('تنظیم اتصال نامعتبر','offline'); notify('آدرس یا کلید Supabase معتبر نیست.'); return false; }
}
async function startApp() {
  if (!initSupabase()) return;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    user = data.session?.user || null;
    if (user) await enterDashboard(); else showView('authView');
    supabase.auth.onAuthStateChange((_event, session) => {
      user = session?.user || null;
      if (user) { enterDashboard(); } else { showView('authView'); $('#logoutBtn').classList.add('hidden'); }
    });
  } catch (e) { console.error(e); showView('authView'); notify('بررسی نشست ورود انجام نشد. دوباره تلاش کنید.'); }
}
async function enterDashboard() {
  $('#logoutBtn').classList.remove('hidden');
  $('#accountEmail').textContent = user?.email || 'حساب متصل';
  loadBluSmsDeviceStatus();
  $('#welcomeText').textContent = user?.email ? `خوش آمدید؛ ${user.email} · تقویم شمسی · مبالغ به تومان` : 'درآمد، هزینه و پس‌انداز خود را یک‌جا مدیریت کنید. تاریخ‌ها شمسی و همه مبالغ به تومان هستند.';
  $('#monthPicker').value ||= currentMonth();
  updateMonthCaption();
  showView('dashboardView');
  await loadRecords();
}
async function loadRecords() {
  const month = parseJalaliMonth($('#monthPicker').value || currentMonth());
  setStatus('در حال همگام‌سازی');
  const dateColumns = { income: 'received_on', expense: 'spent_on', reserved: 'reserved_on', saving: 'saved_on' };
  const keys = Object.keys(TABLES);
  const results = await Promise.all(keys.map(async key => {
    const dateColumn = dateColumns[key];
    // Date-range filtering follows the Jalali month boundary (which may cross Gregorian months).
    // This also keeps earlier records visible even if their old month key was Gregorian.
    const { data, error } = await supabase.from(TABLES[key]).select('*').gte(dateColumn, month.start).lt(dateColumn, month.end).order(dateColumn, { ascending: false });
    if (error) throw error;
    return [key, data || []];
  }));
  records = Object.fromEntries(results);
  await loadBluSmsPending();
  renderDashboard(); setStatus('همگام‌سازی شد','online'); setSyncText(); updateMonthCaption();
}
function totals() {
  const sum = arr => arr.reduce((s,r) => s + Number(r.amount || 0), 0);
  const income = sum(records.income), expense = sum(records.expense), reserved = sum(records.reserved), saving = sum(records.saving);
  return { income, expense, reserved, saving, balance: income - expense - reserved - saving };
}
function renderDashboard() {
  const t = totals();
  $('#incomeTotal').textContent = money(t.income);
  $('#expenseTotal').textContent = money(t.expense);
  $('#reservedTotal').textContent = money(t.reserved);
  $('#savingsTotal').textContent = money(t.saving);
  $('#balanceTotal').textContent = money(t.balance);
  $('#balanceTotal').style.color = t.balance < 0 ? '#ffd4d4' : '#fff';
  renderRecords(); renderCharts();
}
function allRecords() {
  return [
    ...records.income.map(r => ({...r, kind:'income', date:r.received_on})),
    ...records.expense.map(r => ({...r, kind:r.expense_type === 'fixed' ? 'fixed' : 'expense', date:r.spent_on})),
    ...records.reserved.map(r => ({...r, kind:'reserved', date:r.reserved_on})),
    ...records.saving.map(r => ({...r, kind:'saving', date:r.saved_on}))
  ].sort((a,b) => String(b.date).localeCompare(String(a.date)));
}
function kindTitle(r) {
  if (r.kind === 'income') return 'حقوق و درآمد';
  if (r.kind === 'fixed') return 'هزینه ثابت';
  if (r.kind === 'expense') return r.category || 'هزینه ماهانه';
  if (r.kind === 'reserved') return 'مبلغ کنارگذاشته‌شده';
  return 'پس‌انداز';
}
function renderRecords() {
  const host = $('#recordsList');
  const list = allRecords().filter(r => activeTab === 'all' || (activeTab === 'expense' ? ['expense','fixed'].includes(r.kind) : r.kind === activeTab));
  if (!list.length) { host.innerHTML = '<div class="empty-state"><strong>هنوز موردی ثبت نشده است</strong>از دکمه‌های بالا برای ثبت اولین اطلاعات این ماه استفاده کنید.</div>'; return; }
  host.innerHTML = list.map(r => {
    const type = r.kind === 'fixed' ? 'fixed' : r.kind;
    const cfg = TYPES[type];
    const subtitle = `${kindTitle(r)}${r.note ? ' · ' + escapeHTML(r.note) : ''}`;
    const amountColor = r.kind === 'income' ? '#047da9' : r.kind === 'saving' ? '#172B4D' : '#344D70';
    return `<div class="record-row">
      <div class="record-main"><span class="record-icon">${cfg?.icon || '•'}</span><div style="min-width:0"><div class="record-name">${escapeHTML(r.title || cfg?.label || '')}</div><div class="record-sub">${subtitle}</div></div></div>
      <div class="record-amount" style="color:${amountColor}">${money(r.amount)} تومان</div>
      <div class="record-date">${escapeHTML(formatJalaliDate(r.date))}</div>
      <div class="record-actions"><button class="mini-btn" type="button" title="ویرایش" data-edit="${r.kind}" data-id="${r.id}">✎</button><button class="mini-btn" type="button" title="حذف" data-delete="${r.kind}" data-id="${r.id}">×</button></div>
    </div>`;
  }).join('');
}
function renderCharts() {
  const ctx1 = $('#expenseChart').getContext('2d');
  const categoryTotals = {};
  records.expense.forEach(r => { const c = r.category || 'سایر'; categoryTotals[c] = (categoryTotals[c] || 0) + Number(r.amount); });
  const labels = Object.keys(categoryTotals);
  const values = Object.values(categoryTotals);
  const palette = ['#0593C6','#172B4D','#30b7d7','#36577F','#08749f','#7F9AB8','#5eacd0','#0C1B35','#9fd9e9'];
  if (expenseChart) expenseChart.destroy();
  expenseChart = new Chart(ctx1, { type:'doughnut', data:{ labels: labels.length ? labels : ['بدون هزینه'], datasets:[{data:values.length ? values : [1], backgroundColor:labels.length ? palette.slice(0,labels.length) : ['#edf0f1'], borderWidth:0, hoverOffset:4}]}, options:{ responsive:true, maintainAspectRatio:false, cutout:'69%', plugins:{legend:{display:false},tooltip:{callbacks:{label:(c)=>`${c.label}: ${money(c.raw)} تومان`}}}} });
  $('#expenseLegend').innerHTML = labels.length ? labels.map((l,i)=>`<span class="legend-item"><i class="legend-dot" style="background:${palette[i%palette.length]}"></i>${escapeHTML(l)} · ${money(values[i])} تومان</span>`).join('') : '<span class="legend-item">هنوز هزینه‌ای ثبت نشده است</span>';
  const t = totals();
  const ctx2 = $('#allocationChart').getContext('2d');
  if (allocationChart) allocationChart.destroy();
  allocationChart = new Chart(ctx2, {type:'bar',data:{labels:['هزینه‌ها','کنارگذاری','پس‌انداز','باقی‌مانده'],datasets:[{data:[t.expense,t.reserved,t.saving,t.balance],backgroundColor:['#172B4D','#0593C6','#36577F',t.balance<0?'#9b4f5b':'#27b2d2'],borderRadius:7,maxBarThickness:42}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${money(c.raw)} تومان`}}},scales:{x:{beginAtZero:true,grid:{color:'rgba(5,147,198,.10)'},ticks:{font:{family:'Pinar',size:10},callback:v=>faNumber.format(v)}},y:{grid:{display:false},ticks:{font:{family:'Pinar',size:11}}}}}});
}
function escapeHTML(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function field(label,name,kind='text',value='',wide=false,extra={}) {
  const cls = wide ? 'wide' : '';
  if (kind === 'select') return `<label class="${cls}">${label}<select name="${name}" ${extra.required?'required':''}>${extra.options.map(o=>`<option value="${escapeHTML(o)}" ${o===value?'selected':''}>${escapeHTML(o)}</option>`).join('')}</select></label>`;
  if (kind === 'textarea') return `<label class="${cls}">${label}<textarea name="${name}" rows="2" placeholder="اختیاری">${escapeHTML(value)}</textarea></label>`;
  const isNumber = kind === 'number';
  const isJalali = kind === 'month' || kind === 'date';
  const inputType = (isNumber || isJalali) ? 'text' : kind;
  const attrs = isNumber ? 'inputmode="decimal" dir="ltr"' : isJalali ? `inputmode="numeric" dir="ltr" class="jalali-input" autocomplete="off"` : '';
  const placeholder = extra.placeholder || (kind === 'month' ? '۱۴۰۵/۰۸' : kind === 'date' ? '۱۴۰۵/۰۸/۰۹' : isNumber ? 'مثلاً ۱۵۰۰۰۰۰' : '');
  return `<label class="${cls}">${label}<input name="${name}" type="${inputType}" value="${escapeHTML(value)}" ${attrs} ${extra.required===false?'':'required'} ${placeholder?`placeholder="${escapeHTML(placeholder)}"`:''}></label>`;
}
function openRecordModal(type, row=null) {
  editing = row ? {type, id:row.id, kind:row.kind} : null;
  const formType = type === 'fixed' ? 'fixed' : type;
  $('#modalTitle').textContent = row ? 'ویرایش اطلاعات' : TYPES[formType].title;
  $('#modalEyebrow').textContent = row ? 'اصلاح اطلاعات ثبت‌شده' : 'ثبت مورد جدید';
  $('#formError').textContent = '';
  const month = row?.date ? formatJalaliDate(row.date).slice(0,7) : ($('#monthPicker').value || currentMonth());
  let dateField = row?.date ? formatJalaliDate(row.date) : todayJalali();
  if (!row) {
    const selected = parseJalaliMonth(month);
    const today = parseJalaliDate(dateField);
    if (today < selected.start || today >= selected.end) dateField = formatJalaliDate(selected.start);
  }
  const title = row?.title || (formType==='income' ? 'حقوق ماهانه' : formType==='saving' ? 'پس‌انداز' : '');
  let html = field('عنوان','title','text',title,false,{placeholder:'مثلاً حقوق آبان، اجاره، خرید'});
  html += field('مبلغ (تومان)','amount','number',row?.amount || '',false);
  html += field('ماه شمسی','month','month',month,false,{placeholder:'۱۴۰۵/۰۸'});
  const dateLabel = formType==='income'?'تاریخ دریافت':formType==='expense'||formType==='fixed'?'تاریخ پرداخت':'تاریخ ثبت';
  html += field(`${dateLabel} (شمسی)`,'record_date','date',dateField,false,{placeholder:'۱۴۰۵/۰۸/۰۹'});
  if (formType==='expense' || formType==='fixed') {
    html += field('دسته‌بندی','category','select',row?.category || CATEGORIES[0],false,{options:CATEGORIES});
    html += field('نوع هزینه','expense_type','select',formType==='fixed'?'fixed':(row?.expense_type || 'monthly'),false,{options:['monthly','fixed']});
  }
  html += field('توضیحات','note','textarea',row?.note || '',true);
  $('#modalFields').innerHTML = html;
  const select = $('#modalFields select[name="expense_type"]');
  if (select) { [...select.options].forEach(o => { if (o.value==='monthly') o.textContent='هزینه ماهانه'; if(o.value==='fixed') o.textContent='هزینه ثابت'; }); }
  $('#recordDialog').showModal();
}
function readForm(form) {
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}
async function saveRecord(e) {
  e.preventDefault();
  const data = readForm(e.currentTarget);
  const amount = parseAmount(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) { $('#formError').textContent = 'مبلغ باید عددی بزرگ‌تر از صفر و به تومان باشد.'; return; }
  let selectedMonth, date;
  try {
    selectedMonth = parseJalaliMonth(data.month);
    date = parseJalaliDate(data.record_date || todayJalali());
    if (date < selectedMonth.start || date >= selectedMonth.end) throw new Error('تاریخ ثبت باید در همان ماه شمسی انتخاب‌شده باشد.');
  } catch (validationError) { $('#formError').textContent = validationError.message; return; }
  const baseType = editing?.type || $('#modalTitle').textContent;
  let type = editing ? editing.type : Object.keys(TYPES).find(k => TYPES[k].title === baseType) || 'expense';
  if (type==='fixed') type='expense';
  const cfg = TYPES[type];
  const payload = { user_id:user.id, month:selectedMonth.key, title:data.title.trim(), amount, note:(data.note||'').trim(), [cfg.date]:date };
  if (type==='expense') { payload.category=data.category || 'سایر'; payload.expense_type=data.expense_type || 'monthly'; }
  try {
    $('#saveRecordBtn').disabled = true;
    let query = supabase.from(cfg.table);
    const kind = editing?.kind;
    if (editing) {
      query = query.update(payload).eq('id',editing.id).eq('user_id',user.id);
    } else {
      query = query.insert(payload);
    }
    const {error} = await query;
    if(error) throw error;
    $('#recordDialog').close(); $('#recordForm').reset();
    $('#monthPicker').value = selectedMonth.input;
    updateMonthCaption();
    await loadRecords(); notify(editing?'اطلاعات ویرایش شد.':'اطلاعات ثبت شد.');
    editing = null;
  } catch(err) { console.error(err); $('#formError').textContent = friendlyError(err); }
  finally { $('#saveRecordBtn').disabled = false; }
}
function friendlyError(err) {
  if (err?.code==='23505') return 'این مورد قبلاً ثبت شده است.';
  if (err?.message?.includes('Failed to fetch')) return 'اتصال اینترنت یا Supabase را بررسی کنید.';
  return `ذخیره انجام نشد: ${err?.message || 'خطای ناشناخته'}`;
}
async function editRecord(kind,id) {
  const key = kind==='fixed' ? 'expense' : kind;
  const row = records[key].find(r=>r.id===id);
  if (!row) return;
  const normalized = {...row,kind:kind==='fixed'?'fixed':kind,date:row[TYPES[key].date]};
  openRecordModal(kind,normalized);
}
async function deleteRecord(kind,id) {
  const key = kind==='fixed' ? 'expense' : kind;
  const cfg = TYPES[key];
  if (!confirm('این مورد حذف شود؟ این کار قابل بازگشت نیست.')) return;
  const {error} = await supabase.from(cfg.table).delete().eq('id',id).eq('user_id',user.id);
  if (error) { notify(friendlyError(error)); return; }
  await loadRecords(); notify('مورد انتخاب‌شده حذف شد.');
}

$('#configForm').addEventListener('submit', async e => {
  e.preventDefault();
  const url=$('#supabaseUrl').value.trim(), key=$('#supabaseKey').value.trim();
  if (!/^https:\/\//.test(url) || key.length<20) { notify('آدرس یا کلید واردشده معتبر نیست.'); return; }
  localStorage.setItem('taraz_supabase_config',JSON.stringify({url,key}));
  await startApp();
});
$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email=$('#authEmail').value.trim(), password=$('#authPassword').value;
  $('#authSubmit').disabled=true;
  try {
    const result = isSignup ? await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.href.split('#')[0]}}) : await supabase.auth.signInWithPassword({email,password});
    if(result.error) throw result.error;
    if(isSignup && !result.data.session) notify('حساب ساخته شد؛ ایمیل خود را برای تأیید بررسی کنید.');
    else if(result.data.user) { user=result.data.user; await enterDashboard(); notify('با موفقیت وارد شدید.'); }
  } catch(err) { notify(err.message || 'ورود انجام نشد.'); }
  finally { $('#authSubmit').disabled=false; }
});
$('#authModeBtn').addEventListener('click',()=>{
  isSignup=!isSignup; $('#authTitle').textContent=isSignup?'ایجاد حساب تراز':'ورود به تراز'; $('#authSubmit').textContent=isSignup?'ایجاد حساب':'ورود'; $('#authModeBtn').textContent=isSignup?'قبلاً حساب ساخته‌اید؟ ورود':'حساب ندارید؟ ایجاد حساب'; $('#authPassword').autocomplete=isSignup?'new-password':'current-password';
});
$('#logoutBtn').addEventListener('click',async()=>{const {error}=await supabase.auth.signOut();if(error)notify(error.message);else{records={income:[],expense:[],reserved:[],saving:[]};showView('authView');notify('از حساب خارج شدید.');}});
$('#monthPicker').addEventListener('change',async()=>{try{parseJalaliMonth($('#monthPicker').value);updateMonthCaption();await loadRecords();}catch(e){notify(e.message || friendlyError(e));setStatus('ماه یا اتصال نامعتبر','offline');}});
$$('[data-add]').forEach(btn=>btn.addEventListener('click',()=>openRecordModal(btn.dataset.add)));
$$('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{activeTab=btn.dataset.tab;$$('[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));renderRecords();}));
$('#recordsList').addEventListener('click',e=>{const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(edit)editRecord(edit.dataset.edit,edit.dataset.id);if(del)deleteRecord(del.dataset.delete,del.dataset.id);});
$('#recordForm').addEventListener('submit',saveRecord);
$('#closeModal').addEventListener('click',()=>$('#recordDialog').close());
$('#cancelModal').addEventListener('click',()=>$('#recordDialog').close());
$('#settingsBtn').addEventListener('click',()=>$('#settingsDialog').showModal());
$$('[data-close-settings]').forEach(b=>b.addEventListener('click',()=>$('#settingsDialog').close()));
$('#changeConfigBtn').addEventListener('click',()=>{
  const c=configValues(); $('#supabaseUrl').value=c.url; $('#supabaseKey').value=c.key; $('#settingsDialog').close(); showView('configView');
});


/* TARAZ_BLU_SMS_UI_V1: per-device token + pending bank SMS review */
async function loadBluSmsPending() {
  const host = document.querySelector('#bluPendingList');
  const section = document.querySelector('#bluPendingSection');
  if (!host || !section || !supabase || !user) return;
  const { data, error } = await supabase.from('bank_sms_pending')
    .select('id,direction,amount_toman,transaction_date,occurred_at,counterparty,status')
    .eq('status','pending').order('occurred_at',{ascending:false}).limit(40);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || /bank_sms_pending|schema cache/i.test(error.message || '')) {
      section.classList.add('hidden');
      const state = document.querySelector('#bluSmsDeviceStatus');
      if (state) state.textContent = 'جدول پیامک بلو هنوز نصب نشده است. فایل bank-sms-schema.sql را در SQL Editor اجرا کن.';
      return;
    }
    console.warn('Blu pending SMS load failed:', error);
    return;
  }
  const items = data || [];
  section.classList.toggle('hidden', items.length === 0);
  document.querySelector('#bluPendingCount').textContent = `${faNumber.format(items.length)} مورد`;
  const cats = typeof CATEGORIES !== 'undefined' ? CATEGORIES : ['خوراک و خرید روزانه','حمل‌ونقل','قبوض و خدمات','مسکن','درمان و سلامت','تفریح','آموزش','خرید','سایر'];
  host.innerHTML = items.map(item => {
    const credit = item.direction === 'credit';
    const date = typeof formatJalaliDate === 'function' ? formatJalaliDate(item.transaction_date) : item.transaction_date;
    const time = item.occurred_at ? new Date(item.occurred_at).toLocaleTimeString('fa-IR',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit'}) : '';
    const title = credit ? 'واریزی بلو' : (item.counterparty ? `خرید از ${escapeHTML(item.counterparty)}` : 'برداشت بلو');
    const options = cats.map(c => `<option value="${escapeHTML(c)}" ${c==='سایر'?'selected':''}>${escapeHTML(c)}</option>`).join('');
    return `<article class="pending-card" data-blu-card="${item.id}" data-iso-date="${item.transaction_date}">
      <div class="pending-card-head"><div class="pending-heading-main"><span class="pending-icon ${credit?'credit':'debit'}">${credit?'↓':'↑'}</span><div><strong>${credit?'واریز بانکی':'برداشت بانکی'}</strong><small>بلو بانک · ${escapeHTML(date)} ${escapeHTML(time)}${item.counterparty?' · '+escapeHTML(item.counterparty):''}</small></div></div><strong class="pending-amount" style="color:${credit?'#047da9':'#172B4D'}">${money(item.amount_toman)} <small>تومان</small></strong></div>
      <div class="pending-edit-grid"><label>عنوان تراکنش<input type="text" data-blu-title="${item.id}" value="${escapeHTML(title)}" maxlength="80"></label>${credit?'':`<label>دسته‌بندی هزینه<select data-blu-category="${item.id}">${options}</select></label>`}<label class="pending-note-field">توضیح (اختیاری)<input type="text" data-blu-note="${item.id}" placeholder="مثلاً خرید روزانه، تاکسی، حقوق..." maxlength="180"></label></div>
      <div class="pending-actions"><button type="button" class="primary-btn" data-blu-confirm="${item.id}">تأیید و ثبت ${credit?'واریزی':'هزینه'}</button><button type="button" class="secondary-btn" data-blu-ignore="${item.id}">نادیده گرفتن</button></div>
    </article>`;
  }).join('');
}
async function loadBluSmsDeviceStatus() {
  const state = document.querySelector('#bluSmsDeviceStatus');
  if (!state || !supabase || !user) return;
  const {data,error} = await supabase.from('bank_sms_devices').select('id').eq('user_id',user.id).is('revoked_at',null).limit(1);
  if (error) { state.textContent = 'ابتدا bank-sms-schema.sql را در SQL Editor اجرا کن.'; return; }
  state.textContent = data?.length ? 'یک کلید اتصال فعال است. با ساخت کلید جدید، کلید قبلی لغو می‌شود.' : 'هنوز آیفونی متصل نشده است. برای ساخت کلید، دکمه بالا را بزن.';
}
async function createBluSmsDeviceToken() {
  const btn = document.querySelector("#createBluSmsDeviceBtn");
  const status = document.querySelector("#bluSmsDeviceStatus");
  const tokenField = document.querySelector("#bluSmsTokenValue");
  const tokenDialog = document.querySelector("#bluSmsTokenDialog");
  const copyStatus = document.querySelector("#bluSmsTokenCopyStatus");
  const showStatus = (message) => { if (status) status.textContent = message; };

  if (!btn) {
    window.alert("دکمه اتصال بلو در صفحه پیدا نشد. پوشه درست تراز را اجرا کن.");
    return;
  }
  if (btn.dataset.tarazBusy === "1") return;
  btn.dataset.tarazBusy = "1";
  btn.disabled = true;
  const oldLabel = btn.textContent;
  btn.textContent = "در حال ساخت کلید...";
  showStatus("در حال بررسی نشست ورود و دسترسی دیتابیس...");

  try {
    if (!supabase) throw new Error("اتصال Supabase آماده نیست. صفحه را تازه‌سازی کن و دوباره وارد حساب شو.");
    if (!window.crypto?.subtle || !window.crypto?.getRandomValues) throw new Error("مرورگر امکان ساخت کلید امن را ندارد؛ برنامه را با localhost یا HTTPS باز کن.");

    const authResult = await supabase.auth.getUser();
    if (authResult.error) throw new Error("نشست ورود معتبر نیست: " + authResult.error.message);
    const signedInUser = authResult.data?.user;
    if (!signedInUser?.id) throw new Error("وارد حساب تراز نیستی. از حساب خارج شو و دوباره وارد شو.");
    user = signedInUser;

    showStatus("در حال بررسی جدول اتصال آیفون در Supabase...");
    const probe = await supabase.from("bank_sms_devices").select("id").eq("user_id", signedInUser.id).limit(1);
    if (probe.error) {
      if (probe.error.code === "42P01" || probe.error.code === "PGRST205" || /bank_sms_devices|schema cache/i.test(probe.error.message || "")) {
        throw new Error("جدول bank_sms_devices پیدا نشد. فایل bank-sms-schema.sql را در SQL Editor اجرا کن.");
      }
      if (probe.error.code === "42501") throw new Error("دسترسی جدول محدود شده است. Policy و مجوزهای RLS فایل bank-sms-schema.sql را بررسی کن.");
      throw new Error("بررسی دیتابیس ناموفق بود: " + (probe.error.message || probe.error.code));
    }

    showStatus("جدول آماده است؛ در حال ساخت کلید خصوصی...");
    const randomBytes = new Uint8Array(32);
    window.crypto.getRandomValues(randomBytes);
    const token = "taraz_" + [...randomBytes].map(b => b.toString(16).padStart(2, "0")).join("");
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");

    const revokeResult = await supabase.from("bank_sms_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", signedInUser.id).is("revoked_at", null);
    if (revokeResult.error) throw new Error("لغو کلید قبلی انجام نشد: " + revokeResult.error.message);

    const insertResult = await supabase.from("bank_sms_devices")
      .insert({ user_id: signedInUser.id, token_hash: tokenHash });
    if (insertResult.error) {
      if (insertResult.error.code === "42501") throw new Error("مجوز ثبت کلید در جدول رد شد. Policy و مجوز INSERT جدول bank_sms_devices را بررسی کن.");
      throw new Error("ثبت کلید در Supabase ناموفق بود: " + insertResult.error.message);
    }

    if (!tokenField || !tokenDialog || !copyStatus) {
      showStatus("کلید ساخته شد، اما پنجره نمایش کلید در HTML پیدا نشد. از پشتیبانی فایل‌های رابط کاربری را بررسی کن.");
      window.alert("کلید در دیتابیس ساخته شد، اما پنجره نمایش کلید در صفحه پیدا نشد. برای امنیت، از ساخت کلید جدید خودداری کن تا رابط اصلاح شود.");
      return;
    }

    tokenField.value = token;
    copyStatus.textContent = "کلید ساخته شد. آن را کپی کن و فقط در اتوماسیون Shortcuts آیفون خودت قرار بده.";
    tokenDialog.showModal();
    showStatus("اتصال آیفون ساخته شد. کلید را از پنجره بازشده کپی کن.");
    if (typeof loadBluSmsDeviceStatus === "function") await loadBluSmsDeviceStatus();
  } catch (err) {
    const message = err?.message || String(err) || "خطای ناشناخته";
    showStatus("خطا در ساخت کلید: " + message);
    console.error("Taraz Blu key creation failed:", err);
    window.alert("ساخت کلید آیفون انجام نشد:\n" + message);
  } finally {
    btn.disabled = false;
    btn.textContent = oldLabel;
    delete btn.dataset.tarazBusy;
  }
}
async function confirmBluPending(id, button) {
  const card = button.closest('[data-blu-card]'); if (!card) return;
  const title = card.querySelector(`[data-blu-title="${id}"]`)?.value.trim() || 'تراکنش بلو';
  const category = card.querySelector(`[data-blu-category="${id}"]`)?.value || 'سایر';
  const note = card.querySelector(`[data-blu-note="${id}"]`)?.value.trim() || '';
  const itemDate = card.querySelector('.pending-heading-main small')?.textContent || '';
  const isoDate = (card.dataset.isoDate || '');
  const dateForMonth = isoDate || '';
  if (!dateForMonth) { notify('تاریخ تراکنش پیدا نشد. صفحه را تازه‌سازی کن.'); return; }
  let month;
  try {
    const jalali = formatJalaliDate(dateForMonth).slice(0,7);
    month = parseJalaliMonth(jalali).key;
  } catch (err) { notify(err.message || 'تاریخ تراکنش معتبر نیست.'); return; }
  button.disabled = true;
  try {
    const {error} = await supabase.rpc('confirm_saman_sms_transaction',{p_pending_id:id,p_month:month,p_title:title,p_category:category,p_note:note});
    if (error) throw error;
    document.querySelector('#monthPicker').value = formatJalaliDate(dateForMonth).slice(0,7);
    if (typeof updateMonthCaption === 'function') updateMonthCaption();
    await loadRecords(); notify('تراکنش بلو با موفقیت ثبت شد.');
  } catch(err) { console.error(err); notify(err.message || 'ثبت تراکنش انجام نشد.'); button.disabled = false; }
}
async function ignoreBluPending(id, button) {
  if (!confirm('این پیامک از فهرست انتظار حذف شود؟')) return;
  button.disabled = true;
  try {
    const {error} = await supabase.rpc('ignore_saman_sms_transaction',{p_pending_id:id});
    if (error) throw error;
    await loadBluSmsPending(); notify('پیامک نادیده گرفته شد.');
  } catch(err) { console.error(err); notify(err.message || 'عملیات انجام نشد.'); button.disabled = false; }
}
document.querySelector('#closeBluSmsTokenDialog')?.addEventListener('click',()=>document.querySelector('#bluSmsTokenDialog').close());
document.querySelector('#copyBluSmsTokenBtn')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.querySelector('#bluSmsTokenValue').value);document.querySelector('#bluSmsTokenCopyStatus').textContent='کلید کپی شد.';}catch{document.querySelector('#bluSmsTokenCopyStatus').textContent='متن کلید را انتخاب و کپی کن.';}});
document.querySelector('#bluPendingList')?.addEventListener('click',e=>{const c=e.target.closest('[data-blu-confirm]'),i=e.target.closest('[data-blu-ignore]');if(c)confirmBluPending(c.dataset.bluConfirm,c);if(i)ignoreBluPending(i.dataset.bluIgnore,i);});
// TARAZ_BLU_BUTTON_V4: robust delegated handler and visible Supabase diagnostics.
if (!window.__tarazBluButtonV4Bound) {
  window.__tarazBluButtonV4Bound = true;
  document.addEventListener("click", function (event) {
    const target = event.target instanceof Element ? event.target.closest("#createBluSmsDeviceBtn") : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    createBluSmsDeviceToken();
  }, true);
}
// Initial configuration: values in config.js survive browser cache/site-data cleanup.
const initialConfig=configValues();
if(initialConfig.url && initialConfig.key) { startApp(); }
else { showView('configView'); setStatus('نیاز به تنظیم اتصال','offline'); }
updateMonthCaption();
