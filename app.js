'use strict';
/* =====================================================================
   Finanze — webapp statica, nessun backend. Dati in localStorage + backup JSON.
   ===================================================================== */

/* ---------- utilità ---------- */
const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
const r2 = n => Math.round((+n + Number.EPSILON) * 100) / 100;
const p2 = n => String(n).padStart(2, '0');
const toISO = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const today = () => toISO(new Date());
const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dim = (y, m) => new Date(y, m + 1, 0).getDate(); // m: 0-11
const addM = (iso, n) => {
  const d = pd(iso), day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day, dim(t.getFullYear(), t.getMonth())));
  return toISO(t);
};
const addD = (iso, n) => { const d = pd(iso); d.setDate(d.getDate() + n); return toISO(d); };
const daysTo = iso => Math.round((pd(iso) - pd(today())) / 864e5);
const fdate = iso => iso ? pd(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const ymLabel = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }); };
const curYM = () => today().slice(0, 7);

/* ---------- costanti ---------- */
const CYCLES = {
  weekly: ['Settimanale', 52 / 12], monthly: ['Mensile', 1], bimonthly: ['Bimestrale', 1 / 2],
  quarterly: ['Trimestrale', 1 / 3], semiannual: ['Semestrale', 1 / 6], yearly: ['Annuale', 1 / 12]
};
const MONTHS_OF = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12 };
const nextDate = (iso, c) => c === 'weekly' ? addD(iso, 7) : addM(iso, MONTHS_OF[c]);
const REPEATS = [['none', 'Non si ripete'], ...Object.entries(CYCLES).map(([k, v]) => [k, v[0]])];
const TYPES = { bank: 'Conto corrente', prepaid: 'Carta conto / prepagata', credit: 'Carta di credito', savings: 'Risparmio / deposito', cash: 'Contanti' };
const COLORS = { blu: ['Blu', '#2f6fed'], verde: ['Verde', '#16a34a'], ambra: ['Ambra', '#d97706'], rosso: ['Rosso', '#dc2626'], viola: ['Viola', '#7c3aed'], teal: ['Teal', '#0d9488'], grigio: ['Grigio', '#475569'], rosa: ['Rosa', '#db2777'] };
const GROUPS = {
  scadenza: { label: 'Scadenza', dir: -1, cat: 'Scadenze', done: 'Pagata' },
  fornitore: { label: 'Fornitore', dir: -1, cat: 'Fornitori', done: 'Pagato' },
  stipendio: { label: 'Stipendio', dir: -1, cat: 'Stipendi', done: 'Pagato' },
  compenso: { label: 'Compenso amministratore', dir: -1, cat: 'Compensi amministratori', done: 'Pagato' },
  incasso: { label: 'Fattura da incassare', dir: 1, cat: 'Fatture incassate', done: 'Incassata' }
};
const SCAD_CATS = ['Assicurazione', 'Bolletta', 'Affitto', 'Mutuo / finanziamento', 'Tasse e imposte', 'Abbonamento annuale', 'Altro'];
const FRINGE_KINDS = ['Buoni spesa', 'Buoni carburante', 'Altro'];

/* ---------- stato ---------- */
const KEY = 'finanze.v1';
const blank = () => ({
  v: 1, business: false, settings: { kmRate: 0.4, fringeLimit: 1000, mealValue: 8 },
  accounts: [], tx: [], subs: [], items: [], people: [], km: [], meals: [], fringe: [], lastBackup: null
});
function norm(x) {
  const b = blank();
  const o = { ...b, ...x, settings: { ...b.settings, ...(x.settings || {}) } };
  for (const k of ['accounts', 'tx', 'subs', 'items', 'people', 'km', 'meals', 'fringe']) if (!Array.isArray(o[k])) o[k] = [];
  return o;
}
let S = (() => { try { const x = JSON.parse(localStorage.getItem(KEY)); return x ? norm(x) : blank(); } catch (e) { return blank(); } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Impossibile salvare: spazio esaurito'); } };
const ui = { scope: 'personal', tab: 'home', sub: 'fringe', pay: 'all', year: String(new Date().getFullYear()), fa: '', fm: '' };
try { Object.assign(ui, JSON.parse(localStorage.getItem('finanze.ui') || '{}')); } catch (e) { }
const saveUI = () => { try { localStorage.setItem('finanze.ui', JSON.stringify(ui)); } catch (e) { } };

const acct = id => S.accounts.find(a => a.id === id);
const accts = () => S.accounts.filter(a => a.scope === ui.scope);
const inScope = t => { const a = acct(t.accountId); return !!a && a.scope === ui.scope; };
const pname = id => (S.people.find(p => p.id === id) || {}).name || '—';
const accColor = a => (a && COLORS[a.color] ? COLORS[a.color][1] : COLORS.blu[1]);
const isAutoCard = t => (t.auto || '').startsWith('card:');

function balance(a) {
  let b = +a.opening || 0;
  for (const t of S.tx) {
    if (t.accountId === a.id) b += t.kind === 'in' ? t.amount : -t.amount;
    if (t.kind === 'transfer' && t.toId === a.id) b += t.amount;
  }
  return r2(b);
}
function usage(c, ym) {
  let u = 0;
  for (const t of S.tx) if (t.accountId === c.id && t.date.startsWith(ym)) u += t.kind === 'in' ? -t.amount : t.amount;
  return r2(Math.max(0, u));
}
const settleDate = (ym, day) => {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(y, m, 1); // primo del mese successivo
  t.setDate(Math.min(day, dim(t.getFullYear(), t.getMonth())));
  return toISO(t);
};
function cardMonths(c) { return [...new Set(S.tx.filter(t => t.accountId === c.id).map(t => t.date.slice(0, 7)))].sort(); }
function cardPending(c) { return r2(cardMonths(c).filter(ym => !(c.settled || {})[ym]).reduce((s, ym) => s + usage(c, ym), 0)); }
function nextSettle(c) {
  const m = cardMonths(c).filter(ym => !(c.settled || {})[ym]);
  return m.length ? settleDate(m[0], c.billingDay || 10) : settleDate(curYM(), c.billingDay || 10);
}
function stampPeriods(a) {
  const from = a.stampFrom || today(), fy = +from.slice(0, 4), ty = new Date().getFullYear(), out = [];
  for (let y = fy; y <= ty; y++) {
    if (a.stampFreq === 'quarterly') [[3, 31], [6, 30], [9, 30], [12, 31]].forEach(([m, d], i) => out.push([`${y}-Q${i + 1}`, `${y}-${p2(m)}-${p2(d)}`]));
    else out.push([`${y}`, `${y}-12-31`]);
  }
  return out.filter(([, end]) => end >= from);
}

/* ---------- automazioni (abbonamenti, addebito carte, imposta di bollo) ---------- */
function runAuto() {
  const t0 = today(); let ch = false;
  for (const s of S.subs) {
    if (!s.active) continue;
    let g = 0;
    while (s.next <= t0 && g++ < 120) {
      if (s.auto && s.accountId && acct(s.accountId))
        S.tx.push({ id: uid(), accountId: s.accountId, kind: 'out', amount: s.amount, date: s.next, category: 'Abbonamenti', note: s.name, auto: 'sub:' + s.id });
      s.next = nextDate(s.next, s.cycle); ch = true;
    }
  }
  for (const c of S.accounts.filter(a => a.type === 'credit')) {
    c.settled = c.settled || {};
    const linked = acct(c.linkedId);
    if (!linked) continue;
    for (const ym of cardMonths(c)) {
      if (c.settled[ym]) continue;
      const due = settleDate(ym, c.billingDay || 10);
      if (due > t0) continue;
      const used = usage(c, ym);
      c.settled[ym] = true; ch = true;
      if (used > 0) S.tx.push({ id: uid(), accountId: linked.id, kind: 'out', amount: used, date: due, category: 'Addebito carta', note: `Estratto ${c.name} · ${ymLabel(ym)}`, auto: `card:${c.id}:${ym}` });
    }
  }
  for (const a of S.accounts) {
    if (!a.stampOn || a.type === 'credit') continue;
    a.stampDone = a.stampDone || {};
    for (const [key, end] of stampPeriods(a)) {
      if (end > t0 || a.stampDone[key]) continue;
      a.stampDone[key] = true; ch = true;
      if (+a.stampAmount > 0) S.tx.push({ id: uid(), accountId: a.id, kind: 'out', amount: r2(a.stampAmount), date: end, category: 'Imposta di bollo', note: `Imposta di bollo ${key}`, auto: `stamp:${a.id}:${key}` });
    }
  }
  if (ch) save();
}
const commit = () => { runAuto(); save(); render(); };

/* ---------- toast ---------- */
let tt;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2600); }

/* ---------- form modale generico ---------- */
function form({ title, fields, values = {}, onSave, onDelete, extra = '', saveLabel = 'Salva' }) {
  const dlg = document.createElement('dialog');
  document.body.appendChild(dlg);
  const v = { ...values };
  let shown = [];
  const field = f => {
    const val = v[f.name] ?? '';
    const lab = typeof f.label === 'function' ? f.label(v) : f.label;
    if (f.type === 'checkbox')
      return `<label class="chk full"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}><span>${lab}${f.hint ? `<small>${f.hint}</small>` : ''}</span></label>`;
    let inp;
    if (f.type === 'select')
      inp = `<select name="${f.name}">${f.options.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else if (f.type === 'textarea')
      inp = `<textarea name="${f.name}" rows="2">${esc(val)}</textarea>`;
    else
      inp = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" ${f.step ? `step="${f.step}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.list ? `list="${f.list}"` : ''} ${f.required ? 'required' : ''} ${f.type === 'number' ? 'inputmode="decimal"' : ''} autocomplete="off">`;
    return `<label class="${f.wide ? 'full' : ''}"><span>${lab}</span>${inp}${f.hint ? `<small>${f.hint}</small>` : ''}</label>`;
  };
  const draw = () => {
    shown = fields.filter(f => !f.when || f.when(v));
    dlg.innerHTML = `<form class="f"><h3>${title}</h3><div class="grid">${shown.map(field).join('')}</div>${extra}
      <div class="btns">${onDelete ? '<button type="button" class="btn danger" data-del>Elimina</button>' : ''}<span class="sp"></span>
      <button type="button" class="btn" data-cancel>Annulla</button><button class="btn primary">${saveLabel}</button></div></form>`;
  };
  const read = () => {
    const fd = new FormData(dlg.querySelector('form'));
    for (const f of shown) {
      if (f.type === 'checkbox') { v[f.name] = fd.has(f.name); continue; }
      let x = fd.get(f.name);
      if (x === null) continue;
      if (f.type === 'number') x = x === '' ? '' : parseFloat(x);
      v[f.name] = x;
    }
  };
  draw();
  dlg.addEventListener('change', e => {
    if (!fields.some(f => f.when)) return;
    if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') { read(); draw(); }
  });
  dlg.addEventListener('submit', e => { e.preventDefault(); read(); if (onSave(v) !== false) dlg.close(); });
  dlg.addEventListener('click', e => {
    if (e.target.closest('[data-cancel]')) dlg.close();
    if (e.target.closest('[data-del]') && confirm('Eliminare definitivamente?')) { dlg.close(); onDelete(); }
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  return dlg;
}
const accOptions = (list, blankLabel) => [...(blankLabel ? [['', blankLabel]] : []), ...list.map(a => [a.id, a.name])];
const personOptions = () => S.people.map(p => [p.id, p.name]);

/* ---------- viste ---------- */
const empty = (title, msg, btn) => `<div class="card empty"><b>${title}</b>${msg || ''}${btn || ''}</div>`;

function vHome() {
  const A = accts();
  if (!A.length) {
    return empty('Benvenuto 👋', 'Inizia creando il tuo primo portafoglio: un conto corrente, una carta o i contanti.',
      '<br><button class="btn primary" data-act="acc-new">+ Crea portafoglio</button>') +
      (S.business ? '' : '<p class="note" style="text-align:center">Hai un\'azienda? <a href="#" data-act="settings">Attiva la sezione Business</a>.</p>');
  }
  const total = r2(A.filter(a => a.type !== 'credit').reduce((s, a) => s + balance(a), 0));
  const ym = curYM(); let inc = 0, out = 0;
  for (const t of S.tx) {
    if (!inScope(t) || t.kind === 'transfer' || isAutoCard(t) || !t.date.startsWith(ym)) continue;
    t.kind === 'in' ? inc += t.amount : out += t.amount;
  }
  const subs = S.subs.filter(s => s.scope === ui.scope && s.active);
  const subM = r2(subs.reduce((s, x) => s + x.amount * CYCLES[x.cycle][1], 0));
  const cards = A.filter(a => a.type === 'credit');

  const up = [];
  for (const i of S.items) if (i.scope === ui.scope && !i.done && daysTo(i.due) <= 30) up.push({ d: i.due, t: i.title, s: GROUPS[i.group].label, a: i.amount, dir: GROUPS[i.group].dir, id: i.id });
  for (const s of subs) if (daysTo(s.next) <= 14) up.push({ d: s.next, t: s.name, s: 'Abbonamento', a: s.amount, dir: -1 });
  for (const c of cards) { const p = cardPending(c); if (p > 0 && daysTo(nextSettle(c)) <= 30) up.push({ d: nextSettle(c), t: 'Addebito ' + c.name, s: 'Carta di credito', a: p, dir: -1 }); }
  up.sort((a, b) => a.d.localeCompare(b.d));

  let biz = '';
  if (ui.scope === 'business') {
    const toCollect = r2(S.items.filter(i => i.scope === 'business' && !i.done && i.group === 'incasso').reduce((s, i) => s + (i.amount || 0), 0));
    const toPay = r2(S.items.filter(i => i.scope === 'business' && !i.done && i.group !== 'incasso').reduce((s, i) => s + (i.amount || 0), 0));
    biz = `<div class="card stat"><small>Da incassare</small><b class="pos">${eur(toCollect)}</b></div><div class="card stat"><small>Da pagare</small><b class="neg">${eur(toPay)}</b></div>`;
  }
  const stale = !S.lastBackup || daysTo(S.lastBackup) < -30;

  return `${stale ? `<div class="banner"><span>${S.lastBackup ? 'Non fai un backup da più di 30 giorni.' : 'Non hai ancora fatto nessun backup.'} I dati vivono solo in questo browser.</span><button class="btn sm" data-act="backup-export">Scarica backup</button></div>` : ''}
  <div class="stats">
    <div class="card stat"><small>Saldo totale</small><b>${eur(total)}</b></div>
    <div class="card stat"><small>Entrate del mese</small><b class="pos">${eur(inc)}</b></div>
    <div class="card stat"><small>Uscite del mese</small><b class="neg">${eur(out)}</b></div>
    <div class="card stat"><small>Abbonamenti / mese</small><b>${eur(subM)}</b></div>
    ${biz}
  </div>
  ${cards.length ? `<h2>Carte di credito</h2><div class="two">${cards.map(c => {
    const u = usage(c, ym), lim = +c.limit || 0, pct = lim ? Math.min(100, u / lim * 100) : 0;
    return `<div class="card"><div class="t" style="display:flex;justify-content:space-between"><b>${esc(c.name)}</b><span>${eur(u)} <small>/ ${eur(lim)}</small></span></div>
      <div class="meter"><i class="${pct > 90 ? 'hot' : ''}" style="width:${pct}%"></i></div>
      <small>Disponibile ${eur(Math.max(0, lim - u))} · da addebitare ${eur(cardPending(c))} il ${fdate(nextSettle(c))}</small></div>`;
  }).join('')}</div>` : ''}
  <h2>In arrivo</h2>
  ${up.length ? `<div class="list">${up.map(u => `<div class="item"><div class="main" ${u.id ? `data-act="item-edit" data-id="${u.id}"` : ''}><b>${esc(u.t)}</b><small>${u.s}</small></div><div class="amt ${u.dir > 0 ? 'pos' : ''}">${u.a ? eur(u.a) : '—'}<small>${dueBadge(u.d)}</small></div></div>`).join('')}</div>` : '<div class="card empty">Nessuna scadenza nei prossimi 30 giorni.</div>'}
  <h2>Ultimi 6 mesi</h2><div class="card">${chart()}</div>
  ${ui.scope === 'business' ? fringeSummary() : ''}
  ${S.business ? '' : '<p class="note">Hai un\'azienda? <a href="#" data-act="settings">Attiva la sezione Business</a> per fornitori, stipendi, rimborsi km, buoni pasto e fringe benefit.</p>'}`;
}

function dueBadge(d) {
  const n = daysTo(d);
  if (n < 0) return `<span class="badge red">Scaduta da ${-n} g</span>`;
  if (n === 0) return '<span class="badge amber">Oggi</span>';
  if (n <= 7) return `<span class="badge amber">Tra ${n} g · ${fdate(d)}</span>`;
  return `<span class="badge">${fdate(d)}</span>`;
}

function chart() {
  const months = [], d = new Date();
  for (let i = 5; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); months.push(x.getFullYear() + '-' + p2(x.getMonth() + 1)); }
  const data = months.map(m => {
    let i = 0, o = 0;
    for (const t of S.tx) { if (!inScope(t) || t.kind === 'transfer' || isAutoCard(t) || !t.date.startsWith(m)) continue; t.kind === 'in' ? i += t.amount : o += t.amount; }
    return { m, i, o };
  });
  const max = Math.max(1, ...data.flatMap(x => [x.i, x.o]));
  const W = 600, H = 170, cw = (W - 20) / 6, bw = 22, base = H - 24, mh = H - 44;
  const bars = data.map((x, k) => {
    const x0 = 10 + k * cw + cw / 2, hi = x.i / max * mh, ho = x.o / max * mh;
    const lab = new Date(+x.m.slice(0, 4), +x.m.slice(5) - 1, 1).toLocaleDateString('it-IT', { month: 'short' });
    return `<rect x="${x0 - bw - 2}" y="${base - hi}" width="${bw}" height="${Math.max(hi, 0)}" rx="4" fill="var(--pos)"><title>Entrate ${eur(x.i)}</title></rect>
      <rect x="${x0 + 2}" y="${base - ho}" width="${bw}" height="${Math.max(ho, 0)}" rx="4" fill="var(--neg)"><title>Uscite ${eur(x.o)}</title></rect>
      <text x="${x0}" y="${H - 6}" text-anchor="middle">${lab}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Entrate e uscite degli ultimi 6 mesi"><line x1="10" x2="${W - 10}" y1="${base}" y2="${base}" stroke="var(--line)"/>${bars}</svg>
    <div class="legend"><span><i style="background:var(--pos)"></i>Entrate</span><span><i style="background:var(--neg)"></i>Uscite</span></div>`;
}

function accTile(a) {
  const col = accColor(a);
  let body;
  if (a.type === 'credit') {
    const u = usage(a, curYM()), lim = +a.limit || 0, pct = lim ? Math.min(100, u / lim * 100) : 0, lk = acct(a.linkedId);
    body = `<div class="bal">${eur(Math.max(0, lim - u))} <small>disponibili</small></div>
      <div class="meter"><i class="${pct > 90 ? 'hot' : ''}" style="width:${pct}%"></i></div>
      <small>Usato ${eur(u)} di ${eur(lim)} questo mese · da addebitare ${eur(cardPending(a))}</small>
      <small>Addebito il ${a.billingDay || 10} del mese dopo su ${lk ? '<b>' + esc(lk.name) + '</b>' : '<span class="neg">— scegli un conto —</span>'}</small>`;
  } else {
    const b = balance(a);
    body = `<div class="bal ${b < 0 ? 'neg' : ''}">${eur(b)}</div>${a.stampOn ? `<small>Imposta di bollo: ${eur(a.stampAmount)} ${a.stampFreq === 'quarterly' ? 'a trimestre' : 'all\'anno'}</small>` : ''}`;
  }
  return `<div class="card tile" style="--c:${col}"><div class="t"><b>${esc(a.name)}</b><span class="badge">${TYPES[a.type]}</span></div>
    ${a.bank ? `<small>${esc(a.bank)}</small>` : ''}${body}
    <div class="foot"><button class="btn sm" data-act="tx-new" data-id="${a.id}">+ Movimento</button><button class="btn sm" data-act="acc-edit" data-id="${a.id}">Modifica</button></div></div>`;
}
function vWallets() {
  const A = accts();
  return `<div class="actions"><button class="btn primary" data-act="acc-new">+ Portafoglio</button><button class="btn" data-act="transfer">⇄ Giroconto</button></div>
    ${A.length ? `<div class="tiles">${A.map(accTile).join('')}</div>` : empty('Nessun portafoglio', 'Crea conti correnti, carte conto, carte di credito o contanti.')}`;
}

function vTx() {
  const A = accts();
  let L = S.tx.filter(inScope);
  if (ui.fa) L = L.filter(t => t.accountId === ui.fa || t.toId === ui.fa);
  if (ui.fm) L = L.filter(t => t.date.startsWith(ui.fm));
  L.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const row = t => {
    const a = acct(t.accountId);
    if (t.kind === 'transfer') {
      const b = acct(t.toId);
      return `<div class="item"><span class="dot" style="--c:var(--mute)"></span><div class="main" data-act="tx-edit" data-id="${t.id}"><b>${esc(t.note || 'Giroconto')}</b><small>${fdate(t.date)} · ${esc(a?.name)} → ${esc(b?.name)}</small></div><div class="amt">${eur(t.amount)}</div></div>`;
    }
    return `<div class="item"><span class="dot" style="--c:${accColor(a)}"></span><div class="main" data-act="tx-edit" data-id="${t.id}"><b>${esc(t.note || t.category || 'Movimento')}</b><small>${fdate(t.date)} · ${esc(t.category || '—')} · ${esc(a?.name)}${t.auto ? ' · automatico' : ''}</small></div><div class="amt ${t.kind === 'in' ? 'pos' : ''}">${t.kind === 'in' ? '+' : '−'}${eur(t.amount)}</div></div>`;
  };
  return `<div class="actions"><button class="btn primary" data-act="tx-new">+ Movimento</button><button class="btn" data-act="transfer">⇄ Giroconto</button></div>
    <div class="filters"><select data-bind="fa"><option value="">Tutti i portafogli</option>${A.map(a => `<option value="${a.id}" ${ui.fa === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
    <input type="month" data-bind="fm" value="${esc(ui.fm)}" aria-label="Mese"></div>
    ${L.length ? `<div class="list">${L.slice(0, 300).map(row).join('')}</div>${L.length > 300 ? `<p class="note">Mostrati i 300 più recenti su ${L.length}. Usa i filtri per restringere.</p>` : ''}` : empty('Nessun movimento', 'Registra entrate e uscite, oppure fai un giroconto.')}`;
}

function vSubs() {
  const L = S.subs.filter(s => s.scope === ui.scope).sort((a, b) => (b.active - a.active) || a.next.localeCompare(b.next));
  const act = L.filter(s => s.active), m = r2(act.reduce((s, x) => s + x.amount * CYCLES[x.cycle][1], 0));
  return `<div class="actions"><button class="btn primary" data-act="sub-new">+ Abbonamento</button><span class="sp"></span><small>${act.length} attivi · <b>${eur(m)}</b>/mese · ${eur(m * 12)}/anno</small></div>
    ${L.length ? `<div class="list" style="margin-top:12px">${L.map(s => {
    const a = acct(s.accountId);
    return `<div class="item" style="${s.active ? '' : 'opacity:.55'}"><span class="dot" style="--c:${accColor(a)}"></span><div class="main" data-act="sub-edit" data-id="${s.id}"><b>${esc(s.name)}</b><small>${CYCLES[s.cycle][0]} · ${s.active ? 'prossimo ' + fdate(s.next) : 'in pausa'}${a ? ' · ' + esc(a.name) : ''}${s.auto && a ? ' · addebito automatico' : ''}</small></div><div class="amt">${eur(s.amount)}</div><button class="btn sm" data-act="sub-toggle" data-id="${s.id}">${s.active ? 'Pausa' : 'Riattiva'}</button></div>`;
  }).join('')}</div>` : empty('Nessun abbonamento', 'Aggiungi Netflix, iCloud, palestra… e tieni sotto controllo quanto spendi ogni mese.')}`;
}

function vItems(groups, o) {
  const L = S.items.filter(i => i.scope === ui.scope && groups.includes(i.group));
  const pend = L.filter(i => !i.done).sort((a, b) => a.due.localeCompare(b.due));
  const done = L.filter(i => i.done).sort((a, b) => (b.doneOn || '').localeCompare(a.doneOn || '')).slice(0, 30);
  const tot = r2(pend.reduce((s, i) => s + (i.amount || 0), 0));
  const row = i => {
    const g = GROUPS[i.group];
    const meta = [i.group === 'scadenza' ? i.cat : (o.multi ? g.label : ''), i.party, i.ref ? 'Fatt. ' + i.ref : '', i.repeat && i.repeat !== 'none' ? '↻ ' + CYCLES[i.repeat][0].toLowerCase() : '', acct(i.accountId)?.name].filter(Boolean).map(esc).join(' · ');
    return `<div class="item"><button class="check" data-act="item-done" data-id="${i.id}" title="Segna come ${g.done.toLowerCase()}" aria-label="Segna come ${g.done.toLowerCase()}"></button>
      <div class="main" data-act="item-edit" data-id="${i.id}"><b>${esc(i.title)}</b><small>${meta || '&nbsp;'}</small></div>
      <div class="amt ${g.dir > 0 ? 'pos' : ''}">${i.amount ? eur(i.amount) : '—'}<small>${dueBadge(i.due)}</small></div></div>`;
  };
  return `${o.chips || ''}<div class="actions"><button class="btn primary" data-act="item-new" data-g="${o.def}">+ ${o.add}</button><span class="sp"></span><small>${pend.length} in sospeso · <b>${eur(tot)}</b></small></div>
    ${pend.length ? `<div class="list" style="margin-top:12px">${pend.map(row).join('')}</div>` : empty(o.empty, o.hint)}
    ${done.length ? `<details class="done"><summary>${o.doneLabel} (${done.length})</summary><div class="list">${done.map(i => `<div class="item" style="opacity:.7"><div class="main" data-act="item-edit" data-id="${i.id}"><b>${esc(i.title)}</b><small>${esc(GROUPS[i.group].done)} il ${fdate(i.doneOn)}</small></div><div class="amt">${i.amount ? eur(i.amount) : ''}</div><button class="btn sm" data-act="item-reopen" data-id="${i.id}">Riapri</button></div>`).join('')}</div></details>` : ''}`;
}
const vDue = () => vItems(['scadenza'], { def: 'scadenza', add: 'Scadenza', empty: 'Nessuna scadenza', hint: 'Assicurazioni, bollette, affitto, bollo auto… rinominabili come preferisci. Ti mostro cosa sta per scadere.', doneLabel: 'Completate' });
const vInc = () => vItems(['incasso'], { def: 'incasso', add: 'Fattura da incassare', empty: 'Nessuna fattura in attesa', hint: 'Registra le fatture emesse e segnale come incassate quando arriva il pagamento.', doneLabel: 'Incassate' });
function vPay() {
  const chips = [['all', 'Tutti'], ['fornitore', 'Fornitori'], ['stipendio', 'Stipendi'], ['compenso', 'Compensi amministratori']];
  const groups = ui.pay === 'all' ? ['fornitore', 'stipendio', 'compenso'] : [ui.pay];
  return vItems(groups, {
    multi: true, def: ui.pay === 'all' ? 'fornitore' : ui.pay, add: 'Pagamento', empty: 'Nessun pagamento in sospeso', doneLabel: 'Pagati',
    hint: 'Fornitori, stipendi e compensi degli amministratori: puoi renderli ricorrenti (es. stipendi mensili).',
    chips: `<div class="chips">${chips.map(([k, l]) => `<button class="chip ${ui.pay === k ? 'on' : ''}" data-act="pay" data-v="${k}">${l}</button>`).join('')}</div>`
  });
}

/* ---- team & benefit ---- */
function vTeam() {
  const chips = [['fringe', 'Fringe benefit'], ['km', 'Rimborsi km'], ['meals', 'Buoni pasto'], ['people', 'Persone']];
  const body = { fringe: vFringe, km: vKm, meals: vMeals, people: vPeople }[ui.sub]();
  return `<div class="chips">${chips.map(([k, l]) => `<button class="chip ${ui.sub === k ? 'on' : ''}" data-act="sub" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
}
const needPeople = () => empty('Aggiungi prima le persone', 'Dipendenti e collaboratori a cui assegni benefit e rimborsi.', '<br><button class="btn primary" data-act="person-new">+ Persona</button>');
const plimit = p => (p.limit !== '' && p.limit != null && +p.limit > 0) ? +p.limit : S.settings.fringeLimit;
function fringeUsed(pid, year, skipId) { return r2(S.fringe.filter(f => f.personId === pid && f.date.startsWith(String(year)) && f.id !== skipId).reduce((s, f) => s + f.amount, 0)); }
function fringeSummary() {
  if (!S.people.length) return '';
  const y = String(new Date().getFullYear());
  return `<h2>Fringe benefit ${y}</h2><div class="two">${S.people.map(p => {
    const u = fringeUsed(p.id, y), l = plimit(p), pct = Math.min(100, u / l * 100);
    return `<div class="card"><div style="display:flex;justify-content:space-between"><b>${esc(p.name)}</b><span>${eur(u)} <small>/ ${eur(l)}</small></span></div><div class="meter"><i class="${pct > 90 ? 'hot' : ''}" style="width:${pct}%"></i></div></div>`;
  }).join('')}</div>`;
}
function vFringe() {
  if (!S.people.length) return needPeople();
  const ys = [...new Set([String(new Date().getFullYear()), ...S.fringe.map(f => f.date.slice(0, 4))])].sort().reverse();
  if (!ys.includes(String(ui.year))) ui.year = ys[0];
  const E = S.fringe.filter(f => f.date.startsWith(String(ui.year))).sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="actions"><button class="btn primary" data-act="fringe-new">+ Benefit</button><span class="sp"></span>
    <select data-bind="year" class="btn">${ys.map(y => `<option ${y === String(ui.year) ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
    <div class="two" style="margin-top:12px">${S.people.map(p => {
    const u = fringeUsed(p.id, ui.year), l = plimit(p), pct = Math.min(100, u / l * 100), res = r2(l - u);
    return `<div class="card"><div style="display:flex;justify-content:space-between"><b>${esc(p.name)}</b><span>${eur(u)} <small>/ ${eur(l)}</small></span></div>
        <div class="meter"><i class="${pct > 90 ? 'hot' : ''}" style="width:${pct}%"></i></div>
        <small>${res >= 0 ? `Residuo ${eur(res)}` : `<span class="neg">Superato di ${eur(-res)}</span>`}</small></div>`;
  }).join('')}</div>
    <h2>Movimenti ${ui.year}</h2>
    ${E.length ? `<div class="list">${E.map(f => `<div class="item"><div class="main" data-act="fringe-edit" data-id="${f.id}"><b>${esc(pname(f.personId))} · ${esc(f.kind)}</b><small>${fdate(f.date)}${f.note ? ' · ' + esc(f.note) : ''}</small></div><div class="amt">${eur(f.amount)}</div></div>`).join('')}</div>` : '<div class="card empty">Nessun benefit registrato quest\'anno.</div>'}
    <p class="note">Il limite annuo è modificabile per ogni persona (scheda “Persone”) e di default vale ${eur(S.settings.fringeLimit)}. Verifica con il tuo commercialista i limiti di esenzione in vigore.</p>`;
}
function vKm() {
  if (!S.people.length) return needPeople();
  const L = S.km.slice().sort((a, b) => b.date.localeCompare(a.date));
  const due = r2(L.filter(k => !k.paid).reduce((s, k) => s + k.km * k.rate, 0));
  return `<div class="actions"><button class="btn primary" data-act="km-new">+ Rimborso km</button><span class="sp"></span><small>Da rimborsare <b>${eur(due)}</b></small></div>
    ${L.length ? `<div class="list" style="margin-top:12px">${L.map(k => `<div class="item"><div class="main" data-act="km-edit" data-id="${k.id}"><b>${esc(pname(k.personId))}${k.route ? ' · ' + esc(k.route) : ''}</b><small>${fdate(k.date)} · ${k.km} km × ${eur(k.rate)}</small></div>
      <div class="amt">${eur(r2(k.km * k.rate))}<small>${k.paid ? '<span class="badge green">Rimborsato</span>' : ''}</small></div>${k.paid ? '' : `<button class="btn sm" data-act="km-pay" data-id="${k.id}">Rimborsa</button>`}</div>`).join('')}</div>` : empty('Nessun rimborso chilometrico', 'Registra le trasferte con km percorsi e tariffa.')}`;
}
function vMeals() {
  if (!S.people.length) return needPeople();
  const L = S.meals.slice().sort((a, b) => b.date.localeCompare(a.date));
  const byM = {};
  L.forEach(m => (byM[m.date.slice(0, 7)] = byM[m.date.slice(0, 7)] || []).push(m));
  return `<div class="actions"><button class="btn primary" data-act="meal-new">+ Buoni pasto</button></div>
    ${L.length ? Object.entries(byM).map(([ym, arr]) => `<h2>${ymLabel(ym)} · ${eur(r2(arr.reduce((s, m) => s + m.qty * m.unit, 0)))}</h2><div class="list">${arr.map(m => `<div class="item"><div class="main" data-act="meal-edit" data-id="${m.id}"><b>${esc(pname(m.personId))}</b><small>${fdate(m.date)} · ${m.qty} buoni × ${eur(m.unit)}${m.note ? ' · ' + esc(m.note) : ''}</small></div><div class="amt">${eur(r2(m.qty * m.unit))}</div></div>`).join('')}</div>`).join('') : empty('Nessun buono pasto', 'Registra i buoni assegnati a ogni persona, per mese.')}`;
}
function vPeople() {
  return `<div class="actions"><button class="btn primary" data-act="person-new">+ Persona</button></div>
    ${S.people.length ? `<div class="list" style="margin-top:12px">${S.people.map(p => `<div class="item"><div class="main" data-act="person-edit" data-id="${p.id}"><b>${esc(p.name)}</b><small>${esc(p.role || '')}${p.role ? ' · ' : ''}limite fringe ${eur(plimit(p))}/anno</small></div></div>`).join('')}</div>` : empty('Nessuna persona', 'Dipendenti, collaboratori, amministratori.')}`;
}

/* ---------- render ---------- */
function render() {
  if (ui.scope === 'business' && !S.business) ui.scope = 'personal';
  const tabs = [['home', 'Panoramica'], ['wallets', 'Portafogli'], ['tx', 'Movimenti'], ['subs', 'Abbonamenti'], ['due', 'Scadenze']];
  if (ui.scope === 'business') tabs.push(['inc', 'Incassi'], ['pay', 'Pagamenti'], ['team', 'Team & benefit']);
  if (!tabs.some(t => t[0] === ui.tab)) ui.tab = 'home';
  const views = { home: vHome, wallets: vWallets, tx: vTx, subs: vSubs, due: vDue, inc: vInc, pay: vPay, team: vTeam };
  $('#people').innerHTML = S.people.map(p => `<option value="${esc(p.name)}">`).join('');
  $('#app').innerHTML = `<div class="shell">
    <header class="top"><div class="brand"><i></i>Finanze</div>
      ${S.business ? `<div class="seg"><button class="${ui.scope === 'personal' ? 'on' : ''}" data-act="scope" data-v="personal">Personale</button><button class="${ui.scope === 'business' ? 'on' : ''}" data-act="scope" data-v="business">Business</button></div>` : ''}
      <button class="icon" data-act="settings" aria-label="Impostazioni">⚙︎</button></header>
    <nav class="tabs">${tabs.map(([k, l]) => `<button class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`).join('')}</nav>
    <main>${views[ui.tab]()}</main></div>`;
  saveUI();
}

/* ---------- form: portafogli ---------- */
function accForm(a) {
  const isNew = !a, credit = x => x.type === 'credit';
  const v = a ? { ...a } : { type: 'bank', color: 'blu', opening: 0, limit: '', billingDay: 10, stampAmount: 34.2, stampFreq: 'annual' };
  form({
    title: isNew ? 'Nuovo portafoglio' : 'Modifica portafoglio', values: v,
    fields: [
      { name: 'name', label: 'Nome', required: true, wide: true },
      { name: 'type', label: 'Tipo', type: 'select', options: Object.entries(TYPES) },
      { name: 'bank', label: 'Banca / istituto' },
      { name: 'opening', label: 'Saldo iniziale (€)', type: 'number', step: '0.01', when: x => !credit(x) },
      { name: 'limit', label: 'Plafond mensile (€)', type: 'number', step: '0.01', min: '0', required: true, when: credit },
      { name: 'billingDay', label: 'Giorno di addebito', type: 'number', min: 1, max: 31, when: credit, hint: 'Del mese successivo' },
      { name: 'linkedId', label: 'Conto su cui viene addebitata', type: 'select', wide: true, when: credit, options: accOptions(accts().filter(x => x.type !== 'credit' && x.id !== (a && a.id)), '— scegli un conto —'), hint: 'A inizio del mese successivo l\'importo speso viene scalato in automatico da questo conto.' },
      { name: 'color', label: 'Colore', type: 'select', options: Object.entries(COLORS).map(([k, c]) => [k, c[0]]) },
      { name: 'stampOn', type: 'checkbox', label: 'Soggetto a imposta di bollo', when: x => !credit(x), hint: 'Registro in automatico l\'addebito a fine periodo. Per i conti dei privati sono 34,20 €/anno (se la giacenza media supera 5.000 €).' },
      { name: 'stampAmount', label: 'Importo per addebito (€)', type: 'number', step: '0.01', min: '0', when: x => !credit(x) && x.stampOn },
      { name: 'stampFreq', label: 'Frequenza', type: 'select', options: [['annual', 'Annuale (31/12)'], ['quarterly', 'Trimestrale']], when: x => !credit(x) && x.stampOn }
    ],
    onSave(f) {
      const o = { ...(a || { id: uid(), scope: ui.scope, settled: {}, stampDone: {} }), ...f };
      if (o.type === 'credit') { o.opening = 0; o.stampOn = false; } else { o.limit = 0; o.linkedId = ''; }
      o.opening = +o.opening || 0; o.limit = +o.limit || 0; o.stampAmount = +o.stampAmount || 0;
      o.billingDay = Math.min(31, Math.max(1, +o.billingDay || 10));
      o.stampFrom = o.stampOn ? (o.stampFrom || today()) : null;
      if (isNew) S.accounts.push(o); else S.accounts[S.accounts.indexOf(a)] = o;
      commit();
    },
    onDelete: a && (() => {
      S.accounts = S.accounts.filter(x => x !== a);
      S.tx = S.tx.filter(t => t.accountId !== a.id && t.toId !== a.id);
      S.accounts.forEach(x => { if (x.linkedId === a.id) x.linkedId = ''; });
      S.subs.forEach(x => { if (x.accountId === a.id) x.accountId = ''; });
      S.items.forEach(x => { if (x.accountId === a.id) x.accountId = ''; });
      commit();
    })
  });
}

/* ---------- form: movimenti e giroconti ---------- */
function txForm(t, accId) {
  const A = accts();
  if (!A.length) return toast('Crea prima un portafoglio');
  if (t && t.kind === 'transfer') return transferForm(t);
  const v = t ? { ...t } : { kind: 'out', date: today(), accountId: accId || ui.fa || A[0].id };
  form({
    title: t ? 'Modifica movimento' : 'Nuovo movimento', values: v,
    fields: [
      { name: 'kind', label: 'Tipo', type: 'select', options: [['out', 'Uscita'], ['in', 'Entrata']] },
      { name: 'accountId', label: 'Portafoglio', type: 'select', options: accOptions(A) },
      { name: 'amount', label: 'Importo (€)', type: 'number', step: '0.01', min: '0.01', required: true },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'category', label: 'Categoria', list: 'cats', wide: true },
      { name: 'note', label: 'Descrizione', wide: true }
    ],
    onSave(f) {
      const o = t || { id: uid() };
      Object.assign(o, { kind: f.kind, accountId: f.accountId, amount: r2(f.amount), date: f.date, category: f.category || '', note: f.note || '' });
      if (!t) S.tx.push(o);
      commit();
    },
    onDelete: t && (() => { S.tx = S.tx.filter(x => x !== t); commit(); })
  });
}
function transferForm(t) {
  const A = accts().filter(a => a.type !== 'credit');
  if (A.length < 2) return toast('Servono almeno due portafogli (carte di credito escluse)');
  const v = t ? { ...t } : { date: today(), accountId: A[0].id, toId: A[1].id };
  form({
    title: t ? 'Modifica giroconto' : 'Nuovo giroconto', values: v,
    fields: [
      { name: 'accountId', label: 'Da', type: 'select', options: accOptions(A) },
      { name: 'toId', label: 'A', type: 'select', options: accOptions(A) },
      { name: 'amount', label: 'Importo (€)', type: 'number', step: '0.01', min: '0.01', required: true },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'note', label: 'Descrizione', wide: true }
    ],
    onSave(f) {
      if (f.accountId === f.toId) { toast('Scegli due portafogli diversi'); return false; }
      const o = t || { id: uid() };
      Object.assign(o, { kind: 'transfer', accountId: f.accountId, toId: f.toId, amount: r2(f.amount), date: f.date, category: 'Giroconto', note: f.note || '' });
      if (!t) S.tx.push(o);
      commit();
    },
    onDelete: t && (() => { S.tx = S.tx.filter(x => x !== t); commit(); })
  });
}

/* ---------- form: abbonamenti ---------- */
function subForm(s) {
  const v = s ? { ...s } : { cycle: 'monthly', next: today(), auto: true, active: true };
  form({
    title: s ? 'Modifica abbonamento' : 'Nuovo abbonamento', values: v,
    fields: [
      { name: 'name', label: 'Nome', required: true, wide: true },
      { name: 'amount', label: 'Importo (€)', type: 'number', step: '0.01', min: '0.01', required: true },
      { name: 'cycle', label: 'Ciclo', type: 'select', options: Object.entries(CYCLES).map(([k, c]) => [k, c[0]]) },
      { name: 'next', label: 'Prossimo rinnovo', type: 'date', required: true },
      { name: 'accountId', label: 'Pagato con', type: 'select', options: accOptions(accts(), '— nessuno —') },
      { name: 'auto', type: 'checkbox', label: 'Registra l\'addebito in automatico', hint: 'Alla data di rinnovo creo il movimento sul portafoglio scelto (se è una carta di credito conta sul plafond).' },
      { name: 'active', type: 'checkbox', label: 'Abbonamento attivo' }
    ],
    onSave(f) {
      const o = s || { id: uid(), scope: ui.scope };
      Object.assign(o, { name: f.name, amount: r2(f.amount), cycle: f.cycle, next: f.next, accountId: f.accountId || '', auto: !!f.auto, active: !!f.active });
      let g = 0; while (o.next < today() && g++ < 600) o.next = nextDate(o.next, o.cycle); // niente addebiti retroattivi
      if (!s) S.subs.push(o);
      commit();
    },
    onDelete: s && (() => { S.subs = S.subs.filter(x => x !== s); commit(); })
  });
}

/* ---------- form: scadenze, incassi, pagamenti ---------- */
function itemForm(i, g) {
  const multi = !i && ui.tab === 'pay' || (i && ['fornitore', 'stipendio', 'compenso'].includes(i.group));
  const v = i ? { ...i } : { group: g, due: today(), repeat: 'none', cat: SCAD_CATS[0] };
  const grp = x => x.group;
  form({
    title: i ? 'Modifica' : 'Nuova voce', values: v,
    fields: [
      ...(multi ? [{ name: 'group', label: 'Tipo', type: 'select', wide: true, options: [['fornitore', 'Fornitore'], ['stipendio', 'Stipendio'], ['compenso', 'Compenso amministratore']] }] : []),
      { name: 'cat', label: 'Categoria', type: 'select', options: SCAD_CATS.map(c => [c, c]), when: x => grp(x) === 'scadenza', wide: true },
      { name: 'title', label: x => grp(x) === 'incasso' ? 'Cliente' : grp(x) === 'scadenza' ? 'Nome (es. Assicurazione auto)' : grp(x) === 'fornitore' ? 'Fornitore' : 'Beneficiario', required: true, wide: true, list: (g === 'stipendio' || g === 'compenso' || (i && (i.group === 'stipendio' || i.group === 'compenso'))) ? 'people' : undefined },
      { name: 'ref', label: x => grp(x) === 'incasso' ? 'N. fattura' : 'N. fattura / riferimento', when: x => ['incasso', 'fornitore'].includes(grp(x)) },
      { name: 'amount', label: 'Importo (€)', type: 'number', step: '0.01', min: '0', required: g !== 'scadenza', hint: g === 'scadenza' ? 'Facoltativo se non lo conosci ancora' : '' },
      { name: 'due', label: x => grp(x) === 'incasso' ? 'Data di incasso prevista' : 'Scadenza', type: 'date', required: true },
      { name: 'repeat', label: 'Ripetizione', type: 'select', options: REPEATS },
      { name: 'accountId', label: x => grp(x) === 'incasso' ? 'Conto di accredito' : 'Pagamento da', type: 'select', options: accOptions(accts(), '— non specificato —'), wide: true },
      { name: 'notes', label: 'Note', type: 'textarea', wide: true }
    ],
    onSave(f) {
      const o = i || { id: uid(), scope: ui.scope, done: false };
      Object.assign(o, { group: f.group || g, title: f.title, amount: f.amount === '' ? 0 : r2(f.amount), due: f.due, repeat: f.repeat, accountId: f.accountId || '', notes: f.notes || '', ref: f.ref || '', cat: f.cat || '' });
      if (!i) S.items.push(o);
      commit();
    },
    onDelete: i && (() => { S.items = S.items.filter(x => x !== i); commit(); })
  });
}
function itemDone(i) {
  const g = GROUPS[i.group];
  form({
    title: `${g.done}: ${esc(i.title)}`, saveLabel: 'Conferma',
    values: { accountId: i.accountId || '', date: today(), amount: i.amount || '' },
    fields: [
      { name: 'amount', label: 'Importo (€)', type: 'number', step: '0.01', min: '0.01', required: true },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'accountId', label: g.dir > 0 ? 'Accredita su' : 'Addebita su', type: 'select', wide: true, options: accOptions(accts(), '— non registrare un movimento —') }
    ],
    onSave(f) {
      if (f.accountId) S.tx.push({ id: uid(), accountId: f.accountId, kind: g.dir > 0 ? 'in' : 'out', amount: r2(f.amount), date: f.date, category: i.group === 'scadenza' ? (i.cat || g.cat) : g.cat, note: i.title + (i.ref ? ` (${i.ref})` : ''), item: i.id });
      if (i.repeat && i.repeat !== 'none') i.due = nextDate(i.due, i.repeat);
      else { i.done = true; i.doneOn = f.date; }
      commit(); toast(i.done ? 'Completata ✓' : 'Registrata, prossima scadenza ' + fdate(i.due));
    }
  });
}

/* ---------- form: team ---------- */
function personForm(p) {
  form({
    title: p ? 'Modifica persona' : 'Nuova persona', values: p ? { ...p } : { limit: '' },
    fields: [
      { name: 'name', label: 'Nome e cognome', required: true, wide: true },
      { name: 'role', label: 'Ruolo (dipendente, amministratore…)', wide: true },
      { name: 'limit', label: 'Limite annuo fringe benefit (€)', type: 'number', step: '1', min: '0', wide: true, hint: `Vuoto = limite predefinito (${eur(S.settings.fringeLimit)}). Es. diverso per chi ha figli a carico.` }
    ],
    onSave(f) {
      const o = p || { id: uid() };
      Object.assign(o, { name: f.name, role: f.role || '', limit: f.limit === '' ? '' : +f.limit });
      if (!p) S.people.push(o);
      commit();
    },
    onDelete: p && (() => {
      if (!confirm('Verranno eliminati anche benefit, rimborsi e buoni pasto di questa persona. Continuare?')) return;
      S.people = S.people.filter(x => x !== p);
      for (const k of ['fringe', 'km', 'meals']) S[k] = S[k].filter(x => x.personId !== p.id);
      commit();
    })
  });
}
function fringeForm(e) {
  if (!S.people.length) return toast('Aggiungi prima una persona');
  const v = e ? { ...e } : { date: today(), kind: FRINGE_KINDS[0], personId: S.people[0].id };
  form({
    title: e ? 'Modifica benefit' : 'Nuovo fringe benefit', values: v,
    fields: [
      { name: 'personId', label: 'Persona', type: 'select', options: personOptions() },
      { name: 'kind', label: 'Tipo', type: 'select', options: FRINGE_KINDS.map(k => [k, k]) },
      { name: 'amount', label: 'Importo (€)', type: 'number', step: '0.01', min: '0.01', required: true },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'note', label: 'Note', wide: true }
    ],
    onSave(f) {
      const p = S.people.find(x => x.id === f.personId), lim = plimit(p), used = fringeUsed(p.id, f.date.slice(0, 4), e && e.id);
      if (used + f.amount > lim && !confirm(`Con questo importo ${p.name} supera il limite annuo di ${eur(lim)} (totale ${eur(r2(used + f.amount))}). Registrare comunque?`)) return false;
      const o = e || { id: uid() };
      Object.assign(o, { personId: f.personId, kind: f.kind, amount: r2(f.amount), date: f.date, note: f.note || '' });
      if (!e) S.fringe.push(o);
      commit();
    },
    onDelete: e && (() => { S.fringe = S.fringe.filter(x => x !== e); commit(); })
  });
}
function kmForm(k) {
  if (!S.people.length) return toast('Aggiungi prima una persona');
  const v = k ? { ...k } : { date: today(), personId: S.people[0].id, rate: S.settings.kmRate };
  form({
    title: k ? 'Modifica rimborso km' : 'Nuovo rimborso chilometrico', values: v,
    fields: [
      { name: 'personId', label: 'Persona', type: 'select', options: personOptions() },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'route', label: 'Percorso / motivo', wide: true },
      { name: 'km', label: 'Chilometri', type: 'number', step: '0.1', min: '0.1', required: true },
      { name: 'rate', label: 'Tariffa (€/km)', type: 'number', step: '0.001', min: '0', required: true }
    ],
    onSave(f) {
      const o = k || { id: uid(), paid: false };
      Object.assign(o, { personId: f.personId, date: f.date, route: f.route || '', km: +f.km, rate: +f.rate });
      if (!k) S.km.push(o);
      commit();
    },
    onDelete: k && (() => { S.km = S.km.filter(x => x !== k); commit(); })
  });
}
function kmPay(k) {
  form({
    title: `Rimborsa ${esc(pname(k.personId))}`, saveLabel: 'Conferma',
    values: { accountId: '', date: today(), amount: r2(k.km * k.rate) },
    fields: [
      { name: 'amount', label: 'Importo (€)', type: 'number', step: '0.01', min: '0.01', required: true },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'accountId', label: 'Addebita su', type: 'select', wide: true, options: accOptions(accts(), '— non registrare un movimento —') }
    ],
    onSave(f) {
      if (f.accountId) S.tx.push({ id: uid(), accountId: f.accountId, kind: 'out', amount: r2(f.amount), date: f.date, category: 'Rimborsi chilometrici', note: `${pname(k.personId)}${k.route ? ' · ' + k.route : ''}` });
      k.paid = true; k.paidOn = f.date;
      commit();
    }
  });
}
function mealForm(m) {
  if (!S.people.length) return toast('Aggiungi prima una persona');
  const v = m ? { ...m } : { date: today(), personId: S.people[0].id, qty: '', unit: S.settings.mealValue };
  form({
    title: m ? 'Modifica buoni pasto' : 'Nuovi buoni pasto', values: v,
    fields: [
      { name: 'personId', label: 'Persona', type: 'select', options: personOptions() },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'qty', label: 'N. buoni', type: 'number', step: '1', min: '1', required: true },
      { name: 'unit', label: 'Valore unitario (€)', type: 'number', step: '0.01', min: '0', required: true },
      { name: 'note', label: 'Note', wide: true }
    ],
    onSave(f) {
      const o = m || { id: uid() };
      Object.assign(o, { personId: f.personId, date: f.date, qty: +f.qty, unit: +f.unit, note: f.note || '' });
      if (!m) S.meals.push(o);
      commit();
    },
    onDelete: m && (() => { S.meals = S.meals.filter(x => x !== m); commit(); })
  });
}

/* ---------- impostazioni e backup ---------- */
function openSettings() {
  const bk = S.lastBackup ? `Ultimo backup: ${fdate(S.lastBackup)}` : 'Nessun backup ancora';
  form({
    title: 'Impostazioni', saveLabel: 'Salva',
    values: { business: S.business, kmRate: S.settings.kmRate, fringeLimit: S.settings.fringeLimit, mealValue: S.settings.mealValue },
    fields: [
      { name: 'business', type: 'checkbox', label: 'Sono titolare di un\'azienda', hint: 'Attiva la sezione Business: conti aziendali, fornitori, stipendi, rimborsi km, buoni pasto, fringe benefit.' },
      { name: 'kmRate', label: 'Tariffa km predefinita (€)', type: 'number', step: '0.001', min: '0' },
      { name: 'fringeLimit', label: 'Limite fringe annuo (€)', type: 'number', step: '1', min: '0' },
      { name: 'mealValue', label: 'Valore buono pasto (€)', type: 'number', step: '0.01', min: '0' }
    ],
    extra: `<div class="sect"><h4>Backup dei dati</h4><div class="row">
      <button type="button" class="btn" data-act="backup-export">⬇ Esporta backup JSON</button>
      <button type="button" class="btn" data-act="backup-import">⬆ Importa backup</button></div>
      <p class="note">${bk}. I dati sono salvati solo su questo dispositivo: scarica un backup ogni tanto e prima di cambiare telefono o browser.</p></div>
      <div class="sect"><h4>Zona pericolosa</h4><button type="button" class="btn danger" data-act="wipe">Cancella tutti i dati</button></div>`,
    onSave(f) {
      S.business = !!f.business;
      S.settings = { kmRate: +f.kmRate || 0, fringeLimit: +f.fringeLimit || 0, mealValue: +f.mealValue || 0 };
      if (!S.business) ui.scope = 'personal';
      commit();
    }
  });
}
function exportBackup() {
  S.lastBackup = today(); save();
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `finanze-backup-${today()}.json`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast('Backup scaricato'); render();
}

/* ---------- eventi ---------- */
const findIn = (list, id) => list.find(x => x.id === id);
const ACTS = {
  scope: d => { ui.scope = d.v; ui.tab = 'home'; ui.fa = ''; render(); },
  tab: d => { ui.tab = d.v; render(); window.scrollTo(0, 0); },
  sub: d => { ui.sub = d.v; render(); },
  pay: d => { ui.pay = d.v; render(); },
  settings: () => openSettings(),
  'backup-export': exportBackup,
  'backup-import': () => $('#file').click(),
  wipe: () => { if (confirm('Cancellare TUTTI i dati? Non si può annullare. Hai scaricato un backup?')) { S = blank(); ui.scope = 'personal'; ui.tab = 'home'; $$('dialog').forEach(d => d.close()); commit(); toast('Dati cancellati'); } },
  'acc-new': () => accForm(),
  'acc-edit': d => accForm(findIn(S.accounts, d.id)),
  'tx-new': d => txForm(null, d.id),
  'tx-edit': d => txForm(findIn(S.tx, d.id)),
  transfer: () => transferForm(),
  'sub-new': () => subForm(),
  'sub-edit': d => subForm(findIn(S.subs, d.id)),
  'sub-toggle': d => { const s = findIn(S.subs, d.id); s.active = !s.active; if (s.active) { let g = 0; while (s.next < today() && g++ < 600) s.next = nextDate(s.next, s.cycle); } commit(); },
  'item-new': d => itemForm(null, d.g),
  'item-edit': d => itemForm(findIn(S.items, d.id), findIn(S.items, d.id).group),
  'item-done': d => itemDone(findIn(S.items, d.id)),
  'item-reopen': d => { const i = findIn(S.items, d.id); i.done = false; delete i.doneOn; commit(); },
  'person-new': () => personForm(),
  'person-edit': d => personForm(findIn(S.people, d.id)),
  'fringe-new': () => fringeForm(),
  'fringe-edit': d => fringeForm(findIn(S.fringe, d.id)),
  'km-new': () => kmForm(),
  'km-edit': d => kmForm(findIn(S.km, d.id)),
  'km-pay': d => kmPay(findIn(S.km, d.id)),
  'meal-new': () => mealForm(),
  'meal-edit': d => mealForm(findIn(S.meals, d.id))
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || !ACTS[el.dataset.act]) return;
  e.preventDefault();
  ACTS[el.dataset.act](el.dataset, el);
});
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.bind;
  if (k) { ui[k] = e.target.value; render(); }
});
$('#file').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const x = JSON.parse(r.result);
      if (!x || !Array.isArray(x.accounts)) throw new Error('formato');
      if (!confirm('Importare il backup sostituirà tutti i dati attuali. Continuare?')) return;
      S = norm(x); $$('dialog').forEach(d => d.close()); commit(); toast('Backup importato');
    } catch (err) { toast('File non valido'); }
  };
  r.readAsText(f);
  e.target.value = '';
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('dialog[open]')) { runAuto(); render(); } });

/* ---------- avvio ---------- */
runAuto();
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
