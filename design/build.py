#!/usr/bin/env python3
"""Builds the two design-direction pages for the C5 Project Scheduler from the live-view snapshot."""
import json, pathlib
HERE = pathlib.Path(__file__).parent
DATA = (HERE.parent / 'import' / 'snapshot.json').read_text()

STAGES = [("QUOTE","Quote"),("DESIGN_DRAWINGS","Design drawings"),("PROD_DRAWINGS","Prod drawings"),
          ("PRODUCTION","Production"),("INSTALLATION","Installation"),("SNAGGING","Snagging"),("COMPLETED","Completed")]
SIDE = [("SITE_ON_HOLD","Site on hold"),("LOST","Lost")]

MONO = '''<svg class="mono" viewBox="0 0 40 40" aria-label="Concept 5"><rect x="1" y="1" width="38" height="38" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M24 12.5a8 8 0 1 0 0 15" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M29 12h-7l-.9 7.2a5 5 0 1 1-1.6 6.4" fill="none" stroke="var(--bronze)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'''

JS = r'''
const DATA = __DATA__;
const STAGES = __STAGES__; const SIDE = __SIDE__;
const LABEL = Object.fromEntries([...STAGES,...SIDE]);
const ORDER = Object.fromEntries([...STAGES,...SIDE].map(([k],i)=>[k,i]));
const aed = v => 'AED ' + Math.round(v).toLocaleString('en-GB');
const aedS = v => v>=1e6 ? (v/1e6).toFixed(2)+'M' : v>=1e3 ? Math.round(v/1e3)+'k' : String(Math.round(v));
const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '—';
const ini = n => n ? n.split(/[\s\/]+/).map(s=>s[0]).join('').slice(0,2) : '—';
const title = s => s ? s.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()) : '—';
const done = p => p.status==='COMPLETED';
function delayClass(p){ if(done(p)) return 'done'; if(p.delay==null) return 'none'; if(p.delay>30) return 'crit'; if(p.delay>0) return 'warn'; if(p.delay>-14) return 'soon'; return 'ok'; }
function delayText(p){ if(p.delay==null) return done(p)?'Done':'No target'; if(done(p)) return p.delay>0?`Done ${p.delay}d late`:p.delay<0?`Done ${-p.delay}d early`:'Done on target'; if(p.delay>0) return `${p.delay}d late`; if(p.delay===0) return 'Due today'; return `${-p.delay}d left`; }

const state = { view: 'board', pm: '', q: '' };
const $ = s => document.querySelector(s);

function filtered(){
  return DATA.filter(p => (!state.pm || p.pm===state.pm || p.pm2===state.pm) &&
    (!state.q || (p.name+' '+(p.client||'')+' '+(p.enq||'')).toLowerCase().includes(state.q)));
}

function card(p){
  const dc = delayClass(p);
  return `<article class="card ${dc}" data-id="${p.id}" tabindex="0">
    <div class="card-top"><span class="enq">${p.enq||'—'}</span><span class="pill ${dc}">${delayText(p)}</span></div>
    <h3>${title(p.name)}</h3>
    <div class="client">${title(p.client)}${p.contractor?` · ${p.contractor}`:''}</div>
    <div class="card-foot">
      <span class="who"><b class="av">${ini(p.pm)}</b>${p.pm?title(p.pm):'No PM'}${p.pm2?` + ${title(p.pm2)}`:''}</span>
      <span class="val">${p.value?aedS(p.value):'—'}</span>
    </div>
    <div class="dates"><span>Start ${fmtD(p.start)}</span><span>Target ${fmtD(p.target)}</span></div>
  </article>`;
}

function renderBoard(){
  const rows = filtered();
  const cols = [...STAGES, ...SIDE].map(([k,l]) => {
    const items = rows.filter(p=>p.status===k).sort((a,b)=>(b.delay??-9e9)-(a.delay??-9e9));
    const val = items.reduce((s,p)=>s+(p.value||0),0);
    return `<section class="col ${k==='SITE_ON_HOLD'||k==='LOST'?'side':''}" data-stage="${k}">
      <header><h2>${l}</h2><span class="count">${items.length}</span><span class="colval">${val?aedS(val):''}</span></header>
      <div class="cards">${items.map(card).join('')||'<div class="empty">Nothing here</div>'}</div></section>`;
  });
  $('#board').innerHTML = cols.join('');
}

function renderList(){
  const rows = filtered().sort((a,b)=>ORDER[a.status]-ORDER[b.status] || (b.delay??-9e9)-(a.delay??-9e9));
  $('#list').innerHTML = `<div class="tablewrap"><table>
   <thead><tr><th>Enq</th><th>Project</th><th>Client</th><th>Status</th><th>PM</th><th>Designer</th><th class="num">Start</th><th class="num">Target</th><th class="num">Delay</th><th class="num">Value</th></tr></thead>
   <tbody>${rows.map(p=>`<tr class="${delayClass(p)}" data-id="${p.id}">
     <td class="enq">${p.enq||'—'}</td><td class="name">${title(p.name)}</td><td>${title(p.client)}</td>
     <td><span class="status s-${p.status}">${LABEL[p.status]}</span></td>
     <td>${p.pm?title(p.pm):'<i>unassigned</i>'}${p.pm2?' + '+title(p.pm2):''}</td><td>${p.designer?title(p.designer):'—'}</td>
     <td class="num">${fmtD(p.start)}</td><td class="num">${fmtD(p.target)}</td>
     <td class="num"><span class="pill ${delayClass(p)}">${delayText(p)}</span></td>
     <td class="num">${p.value?aed(p.value):'—'}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderSummary(){
  const live = DATA.filter(p=>!['COMPLETED','LOST'].includes(p.status));
  const late = live.filter(p=>p.delay>0 && p.status!=='SITE_ON_HOLD');
  const total = DATA.reduce((s,p)=>s+(p.value||0),0);
  $('#stats').innerHTML = `
    <div class="stat"><b>${live.length}</b><span>live projects</span></div>
    <div class="stat crit"><b>${late.length}</b><span>past target</span></div>
    <div class="stat"><b>${aedS(total)}</b><span>pipeline value</span></div>
    <div class="stat"><b>${DATA.filter(p=>p.status==='QUOTE').length}</b><span>in quote</span></div>`;
  const seg = STAGES.map(([k,l])=>{const n=DATA.filter(p=>p.status===k).length; return `<span class="seg s-${k}" style="flex:${Math.max(n,0.35)}" title="${l}: ${n}"><i>${n}</i></span>`;}).join('');
  $('#pipe').innerHTML = seg;
  const pms = [...new Set(DATA.map(p=>p.pm).filter(Boolean))].sort();
  $('#pm').innerHTML = '<option value="">All PMs</option>' + pms.map(n=>`<option value="${n}">${title(n)} (${DATA.filter(p=>p.pm===n||p.pm2===n).length})</option>`).join('');
}

function openDetail(id){
  const p = DATA.find(x=>x.id==id); if(!p) return;
  const d = $('#detail');
  d.innerHTML = `<div class="sheet">
    <button class="close" id="closeBtn" aria-label="Close">×</button>
    <span class="enq">${p.enq||'—'}</span><h2>${title(p.name)}</h2>
    <p class="client">${title(p.client)}${p.contractor?` · via ${p.contractor}`:''}</p>
    <div class="stagebar">${STAGES.map(([k,l])=>`<span class="${ORDER[k]<=ORDER[p.status]?'on':''} ${k===p.status?'cur':''}">${l}</span>`).join('')}</div>
    <dl>
      <dt>Status</dt><dd><span class="status s-${p.status}">${LABEL[p.status]}</span> <span class="pill ${delayClass(p)}">${delayText(p)}</span></dd>
      <dt>Project manager</dt><dd>${p.pm?title(p.pm):'Unassigned'}${p.pm2?' + '+title(p.pm2):''}</dd>
      <dt>Designer</dt><dd>${p.designer?title(p.designer):'—'}</dd>
      <dt>Enquiry received</dt><dd>${fmtD(p.received)}</dd>
      <dt>Project start</dt><dd>${fmtD(p.start)}</dd>
      <dt>Target completion</dt><dd>${fmtD(p.target)}</dd>
      <dt>Completed</dt><dd>${fmtD(p.completed)}</dd>
      <dt>Duration so far</dt><dd>${p.duration!=null?p.duration+' days':'—'}</dd>
      <dt>Project value</dt><dd>${p.value?aed(p.value):'—'} <small>inc. VAT · ${p.vos} VO${p.vos==1?'':'s'}</small></dd>
    </dl>
    <p class="note">Editing, VO list and status history come with the real app. This page is read-only.</p>
  </div>`;
  d.hidden = false; document.body.classList.add('modal');
  $('#closeBtn').onclick = closeDetail;
}
function closeDetail(){ $('#detail').hidden = true; document.body.classList.remove('modal'); }

function render(){ renderBoard(); renderList(); $('#board').hidden = state.view!=='board'; $('#list').hidden = state.view!=='list';
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on', t.dataset.view===state.view)); }

document.addEventListener('click', e => {
  const t = e.target.closest('.tab'); if(t){ state.view = t.dataset.view; render(); try{localStorage.setItem('c5view',state.view)}catch{} return; }
  const c = e.target.closest('[data-id]'); if(c){ openDetail(c.dataset.id); return; }
  if(e.target.id==='detail') closeDetail();
});
document.addEventListener('keydown', e => { if(e.key==='Escape') closeDetail(); if(e.key==='Enter' && e.target.closest('[data-id]')) openDetail(e.target.closest('[data-id]').dataset.id); });
$('#pm').addEventListener('change', e => { state.pm = e.target.value; render(); });
$('#q').addEventListener('input', e => { state.q = e.target.value.trim().toLowerCase(); render(); });
try{ state.view = localStorage.getItem('c5view') || 'board'; }catch{}
renderSummary(); render();
'''

SHELL = '''<title>{title}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}">
<style>
{css}
</style>
<div class="app">
  <header class="top">
    <div class="brand">{mono}<span class="wordmark">Concept <em>5</em></span><span class="sub">Projects 2026</span></div>
    <nav class="tabs"><button class="tab on" data-view="board">Board</button><button class="tab" data-view="list">List</button></nav>
    <div class="tools"><select id="pm" aria-label="Filter by project manager"></select><input id="q" type="search" placeholder="Search projects…" aria-label="Search"></div>
  </header>
  <section class="summary"><div id="stats" class="stats"></div><div id="pipe" class="pipe" aria-label="Projects per stage"></div></section>
  <main>
    <div id="board" class="board"></div>
    <div id="list" class="listview" hidden></div>
  </main>
  <div id="detail" class="detail" hidden></div>
</div>
<script>
{js}
</script>
'''

# ---------- Direction A: "Navy" — dark, dense, operations-room ----------
CSS_A = '''
/* Layout: dark navy control-room. Sticky header, horizontal stage columns, dense cards; bronze = the one warm note. */
:root{
  --navy:#102C52; --bronze:#917764;
  --bg:#0B1B33; --bg2:#102C52; --bg3:#17386A; --line:rgba(255,255,255,.09); --line2:rgba(255,255,255,.18);
  --fg:#EAF0F8; --fg2:#A9B8CF; --fg3:#6F84A3;
  --ok:#3FBF8A; --soon:#E6C35C; --warn:#F09A3E; --crit:#F0564E; --done:#5EA6E8;
  --font:"IBM Plex Sans",system-ui,sans-serif; --mono:"IBM Plex Mono",ui-monospace,monospace;
  --r:6px; color-scheme:dark;
}
@media (prefers-color-scheme: light){ :root:not([data-theme="dark"]){ color-scheme:dark } }
:root[data-theme="light"]{ color-scheme:dark }
*{box-sizing:border-box} [hidden]{display:none!important} html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 var(--font);-webkit-font-smoothing:antialiased}
.app{display:flex;flex-direction:column;height:100%;min-height:100%}
.top{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding:10px 20px;background:var(--bg2);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;color:#fff}
.mono{width:30px;height:30px;color:#fff}
.wordmark{font-weight:600;letter-spacing:.02em;font-size:15px} .wordmark em{font-style:normal;color:var(--bronze)}
.sub{color:var(--fg3);font-size:12px;text-transform:uppercase;letter-spacing:.12em;margin-left:4px}
.tabs{display:flex;gap:2px;background:var(--bg);padding:3px;border-radius:var(--r)}
.tab{background:none;border:0;color:var(--fg2);font:600 13px var(--font);padding:6px 14px;border-radius:4px;cursor:pointer}
.tab.on{background:var(--bg3);color:#fff} .tab:focus-visible{outline:2px solid var(--bronze)}
.tools{display:flex;gap:8px;margin-left:auto;flex:1;justify-content:flex-end;min-width:0}
select,input[type=search]{background:var(--bg);border:1px solid var(--line2);color:var(--fg);font:13px var(--font);padding:7px 10px;border-radius:var(--r);min-width:0}
input[type=search]{width:min(260px,100%)} select:focus,input:focus{outline:2px solid var(--bronze);outline-offset:1px}
.summary{display:flex;gap:24px;align-items:center;flex-wrap:wrap;padding:12px 20px;border-bottom:1px solid var(--line)}
.stats{display:flex;gap:28px;flex-wrap:wrap}
.stat{display:flex;flex-direction:column} .stat b{font:600 22px/1 var(--mono);font-variant-numeric:tabular-nums} .stat span{color:var(--fg3);font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin-top:4px}
.stat.crit b{color:var(--crit)}
.pipe{display:flex;gap:2px;flex:1;min-width:220px;height:22px}
.seg{display:flex;align-items:center;justify-content:center;border-radius:2px;background:var(--bg3);font:600 11px var(--mono);color:#fff;min-width:18px}
.seg i{font-style:normal}
.s-QUOTE{background:#3A4A66}.s-DESIGN_DRAWINGS{background:#2F5EA8}.s-PROD_DRAWINGS{background:#3E7AC9}.s-PRODUCTION{background:var(--bronze)}.s-INSTALLATION{background:#B38E5D}.s-SNAGGING{background:#8E6E8A}.s-COMPLETED{background:#2E8B63}.s-SITE_ON_HOLD{background:#7A3C3C}.s-LOST{background:#444}
main{flex:1;min-height:0;display:flex}
.board{display:flex;gap:12px;padding:16px 20px 24px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;width:100%}
.col{flex:0 0 272px;scroll-snap-align:start;display:flex;flex-direction:column;background:rgba(255,255,255,.025);border:1px solid var(--line);border-radius:8px;max-height:100%}
.col.side{opacity:.8}
.col header{display:flex;align-items:baseline;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);position:sticky;top:0}
.col h2{margin:0;font:600 12px var(--font);text-transform:uppercase;letter-spacing:.1em;color:var(--fg2)}
.count{font:600 12px var(--mono);color:#fff;background:var(--bg3);padding:1px 7px;border-radius:10px}
.colval{margin-left:auto;font:12px var(--mono);color:var(--bronze)}
.cards{display:flex;flex-direction:column;gap:8px;padding:10px;overflow-y:auto}
.empty{color:var(--fg3);font-size:12px;text-align:center;padding:18px 0}
.card{flex:none;background:var(--bg2);border:1px solid var(--line);border-left:3px solid var(--fg3);border-radius:var(--r);padding:10px 12px;cursor:pointer;transition:border-color .15s,transform .15s}
.card:hover,.card:focus-visible{border-color:var(--line2);transform:translateY(-1px);outline:none}
.card.crit{border-left-color:var(--crit)}.card.warn{border-left-color:var(--warn)}.card.soon{border-left-color:var(--soon)}.card.ok{border-left-color:var(--ok)}.card.done{border-left-color:var(--done)}
.card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
.enq{font:12px var(--mono);color:var(--fg3)}
.card h3{margin:0 0 2px;font:600 13.5px/1.3 var(--font);color:#fff;text-wrap:balance}
.client{color:var(--fg2);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-foot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px}
.who{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--fg2)}
.av{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--bg3);color:#fff;font:600 10px var(--mono)}
.val{font:600 13px var(--mono);color:var(--bronze);font-variant-numeric:tabular-nums}
.dates{display:flex;justify-content:space-between;margin-top:8px;font:11px var(--mono);color:var(--fg3)}
.pill{font:600 11px var(--mono);padding:2px 7px;border-radius:3px;white-space:nowrap;background:rgba(255,255,255,.08);color:var(--fg2)}
.pill.crit{background:rgba(240,86,78,.18);color:#FF8A84}.pill.warn{background:rgba(240,154,62,.18);color:#FFB870}.pill.soon{background:rgba(230,195,92,.16);color:#F2D684}.pill.ok{background:rgba(63,191,138,.16);color:#7EE0B5}.pill.done{background:rgba(94,166,232,.16);color:#9CC9F5}
.listview{padding:16px 20px 24px;width:100%;overflow:auto}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;min-width:900px;font-size:13px}
th{position:sticky;top:0;background:var(--bg2);text-align:left;font:600 11px var(--font);text-transform:uppercase;letter-spacing:.08em;color:var(--fg3);padding:10px 12px;border-bottom:1px solid var(--line2)}
td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:middle}
tr[data-id]{cursor:pointer} tr[data-id]:hover td{background:rgba(255,255,255,.03)}
td.name{font-weight:600;color:#fff} td i{color:var(--fg3)}
.num{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}
.status{display:inline-block;font:600 11px var(--font);color:#fff;padding:2px 8px;border-radius:3px;white-space:nowrap}
.detail{position:fixed;inset:0;background:rgba(5,12,25,.7);z-index:20;display:flex;align-items:flex-end;justify-content:center;padding:0;backdrop-filter:blur(2px)}
.sheet{position:relative;background:var(--bg2);border:1px solid var(--line2);border-radius:12px 12px 0 0;width:min(640px,100%);max-height:90%;overflow:auto;padding:22px 22px calc(22px + env(safe-area-inset-bottom,0px))}
@media(min-width:700px){.detail{align-items:center;padding:24px}.sheet{border-radius:12px}}
.close{position:absolute;top:12px;right:12px;background:var(--bg3);border:0;color:#fff;width:32px;height:32px;border-radius:50%;font-size:20px;cursor:pointer}
.sheet h2{margin:4px 0 2px;font:600 20px/1.25 var(--font);color:#fff;text-wrap:balance}
.sheet .client{white-space:normal;margin:0 0 14px}
.stagebar{display:flex;gap:3px;margin:0 0 16px}
.stagebar span{flex:1;height:6px;border-radius:2px;background:var(--bg3);font-size:0}
.stagebar span.on{background:var(--bronze)} .stagebar span.cur{background:#fff}
dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 18px;margin:0}
dt{color:var(--fg3);font-size:12px;text-transform:uppercase;letter-spacing:.08em;padding-top:2px} dd{margin:0;font-variant-numeric:tabular-nums} dd small{color:var(--fg3)}
.note{color:var(--fg3);font-size:12px;margin:18px 0 0}
body.modal{overflow:hidden}
@media(max-width:640px){
  .top{gap:10px;padding:10px 16px} .sub{display:none} .tools{flex-basis:100%} .summary{padding:10px 16px;gap:14px} .stats{gap:18px} .stat b{font-size:18px}
  .board{padding:12px 16px 20px;gap:10px;scroll-snap-type:x mandatory} .col{flex-basis:86vw} .listview{padding:12px 16px}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
'''

# ---------- Direction B: "Studio" — light, warm, generous ----------
CSS_B = '''
/* Layout: light studio sheet. Navy type on warm white, bronze accents, big stage strip with totals, roomy cards that read like job sheets. */
:root{
  --navy:#102C52; --bronze:#917764;
  --bg:#F7F6F3; --bg2:#FFFFFF; --bg3:#EEEBE5; --line:#E2DED6; --line2:#C9C3B8;
  --fg:#102C52; --fg2:#4A5A74; --fg3:#8591A6;
  --ok:#2E9E6F; --soon:#C9A227; --warn:#D9822B; --crit:#D1433B; --done:#3B7FC4;
  --font:"Manrope",system-ui,sans-serif; --mono:"IBM Plex Mono",ui-monospace,monospace;
  --r:10px; color-scheme:light;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){ color-scheme:light } }
:root[data-theme="dark"]{ color-scheme:light }
*{box-sizing:border-box} [hidden]{display:none!important} html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 var(--font);-webkit-font-smoothing:antialiased}
.app{display:flex;flex-direction:column;height:100%}
.top{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;display:flex;align-items:center;gap:22px;flex-wrap:wrap;padding:14px 24px;background:var(--bg2);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:12px;color:var(--navy)}
.mono{width:34px;height:34px}
.wordmark{font-weight:800;font-size:17px;letter-spacing:-.01em} .wordmark em{font-style:normal;color:var(--bronze)}
.sub{color:var(--fg3);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.14em;margin-left:2px}
.tabs{display:flex;gap:4px;border-bottom:2px solid var(--line)}
.tab{background:none;border:0;border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--fg2);font:700 14px var(--font);padding:8px 12px;cursor:pointer}
.tab.on{color:var(--navy);border-bottom-color:var(--bronze)} .tab:focus-visible{outline:2px solid var(--bronze);border-radius:4px}
.tools{display:flex;gap:8px;margin-left:auto;flex:1;justify-content:flex-end;min-width:0}
select,input[type=search]{background:var(--bg);border:1px solid var(--line2);color:var(--fg);font:14px var(--font);padding:8px 12px;border-radius:999px;min-width:0}
input[type=search]{width:min(280px,100%)} select:focus,input:focus{outline:2px solid var(--bronze);outline-offset:1px}
.summary{display:flex;gap:28px;align-items:center;flex-wrap:wrap;padding:18px 24px 6px}
.stats{display:flex;gap:34px;flex-wrap:wrap}
.stat{display:flex;flex-direction:column} .stat b{font:800 30px/1 var(--font);letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--navy)} .stat span{color:var(--fg3);font-size:12px;font-weight:600;margin-top:5px}
.stat.crit b{color:var(--crit)}
.pipe{display:flex;gap:3px;flex:1;min-width:240px;height:28px}
.seg{display:flex;align-items:center;justify-content:center;border-radius:6px;font:700 12px var(--font);color:#fff;min-width:22px}
.seg i{font-style:normal}
.s-QUOTE{background:#9AA6BA}.s-DESIGN_DRAWINGS{background:#3C6CB5}.s-PROD_DRAWINGS{background:#5E8BD0}.s-PRODUCTION{background:var(--bronze)}.s-INSTALLATION{background:#B99B6B}.s-SNAGGING{background:#9D7FA0}.s-COMPLETED{background:#2E9E6F}.s-SITE_ON_HOLD{background:#B85C5C}.s-LOST{background:#7A7A7A}
main{flex:1;min-height:0;display:flex}
.board{display:flex;gap:16px;padding:14px 24px 28px;overflow-x:auto;scroll-snap-type:x proximity;width:100%}
.col{flex:0 0 300px;scroll-snap-align:start;display:flex;flex-direction:column;max-height:100%}
.col.side{opacity:.75}
.col header{display:flex;align-items:baseline;gap:10px;padding:6px 4px 10px}
.col h2{margin:0;font:800 15px var(--font);color:var(--navy);letter-spacing:-.01em}
.count{font:700 12px var(--font);color:var(--fg2);background:var(--bg3);padding:2px 9px;border-radius:999px}
.colval{margin-left:auto;font:700 12px var(--font);color:var(--bronze)}
.cards{display:flex;flex-direction:column;gap:10px;overflow-y:auto;padding:2px}
.empty{color:var(--fg3);font-size:13px;text-align:center;padding:24px 0;border:1px dashed var(--line2);border-radius:var(--r)}
.card{flex:none;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;cursor:pointer;box-shadow:0 1px 2px rgba(16,44,82,.05);transition:box-shadow .15s,transform .15s;position:relative;overflow:hidden}
.card::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:var(--fg3)}
.card:hover,.card:focus-visible{box-shadow:0 6px 18px rgba(16,44,82,.12);transform:translateY(-2px);outline:none}
.card.crit::after{background:var(--crit)}.card.warn::after{background:var(--warn)}.card.soon::after{background:var(--soon)}.card.ok::after{background:var(--ok)}.card.done::after{background:var(--done)}
.card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
.enq{font:12px var(--mono);color:var(--fg3)}
.card h3{margin:0 0 3px;font:800 15px/1.3 var(--font);color:var(--navy);letter-spacing:-.01em;text-wrap:balance}
.client{color:var(--fg2);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px}
.who{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--fg2)}
.av{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--navy);color:#fff;font:700 11px var(--font)}
.val{font:800 14px var(--font);color:var(--bronze);font-variant-numeric:tabular-nums}
.dates{display:flex;justify-content:space-between;margin:10px 0 6px;font:12px var(--font);color:var(--fg3)}
.pill{font:700 11px var(--font);padding:3px 9px;border-radius:999px;white-space:nowrap;background:var(--bg3);color:var(--fg2)}
.pill.crit{background:#FBE3E1;color:#9E2B25}.pill.warn{background:#FCEBD9;color:#9A5410}.pill.soon{background:#FAF1CF;color:#7A5F0B}.pill.ok{background:#DDF3E8;color:#1E6B49}.pill.done{background:#DCEBF9;color:#255A8E}
.listview{padding:14px 24px 28px;width:100%;overflow:auto}
.tablewrap{overflow-x:auto;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r)}
table{border-collapse:collapse;width:100%;min-width:900px;font-size:13.5px}
th{position:sticky;top:0;background:var(--bg2);text-align:left;font:700 12px var(--font);color:var(--fg3);padding:12px 14px;border-bottom:1px solid var(--line2)}
td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
tr[data-id]{cursor:pointer} tr[data-id]:hover td{background:var(--bg)}
td.name{font-weight:800;color:var(--navy)} td i{color:var(--fg3)}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.status{display:inline-block;font:700 11px var(--font);color:#fff;padding:3px 9px;border-radius:999px;white-space:nowrap}
.detail{position:fixed;inset:0;background:rgba(16,44,82,.45);z-index:20;display:flex;align-items:flex-end;justify-content:center}
.sheet{position:relative;background:var(--bg2);border-radius:16px 16px 0 0;width:min(640px,100%);max-height:90%;overflow:auto;padding:24px 24px calc(24px + env(safe-area-inset-bottom,0px))}
@media(min-width:700px){.detail{align-items:center;padding:24px}.sheet{border-radius:16px}}
.close{position:absolute;top:14px;right:14px;background:var(--bg3);border:0;color:var(--navy);width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer}
.sheet h2{margin:4px 0 2px;font:800 22px/1.2 var(--font);color:var(--navy);letter-spacing:-.02em;text-wrap:balance}
.sheet .client{white-space:normal;margin:0 0 16px}
.stagebar{display:flex;gap:4px;margin:0 0 18px}
.stagebar span{flex:1;height:8px;border-radius:4px;background:var(--bg3);font-size:0}
.stagebar span.on{background:var(--bronze)} .stagebar span.cur{background:var(--navy)}
dl{display:grid;grid-template-columns:max-content 1fr;gap:10px 20px;margin:0}
dt{color:var(--fg3);font-size:12px;font-weight:700;padding-top:2px} dd{margin:0;font-variant-numeric:tabular-nums} dd small{color:var(--fg3)}
.note{color:var(--fg3);font-size:12px;margin:18px 0 0}
body.modal{overflow:hidden}
@media(max-width:640px){
  .top{gap:12px;padding:12px 16px} .sub{display:none} .tools{flex-basis:100%} .summary{padding:14px 16px 4px;gap:14px} .stats{gap:20px} .stat b{font-size:24px}
  .board{padding:12px 16px 20px;gap:12px;scroll-snap-type:x mandatory} .col{flex-basis:88vw} .listview{padding:12px 16px}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
'''

js = JS.replace('__DATA__', DATA).replace('__STAGES__', json.dumps(STAGES)).replace('__SIDE__', json.dumps(SIDE))
for name, css, fonts, title in [
    ('direction-a-navy.html', CSS_A, 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap', 'C5 Projects — Navy'),
    ('direction-b-studio.html', CSS_B, 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;600&display=swap', 'C5 Projects — Studio'),
]:
    (HERE / name).write_text(SHELL.format(title=title, fonts=fonts, css=css, mono=MONO, js=js))
    print('wrote', name)
