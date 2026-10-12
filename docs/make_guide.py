#!/usr/bin/env python3
"""Generate the team guide: Concept 5 Projects — How it works (PDF).
Run from the repo root:  python3 docs/make_guide.py
Colours and rules below are copied from app/src/app/globals.css and app/src/lib/model.ts — keep them in sync."""
from weasyprint import HTML
from pathlib import Path
import base64, datetime

ROOT = Path(__file__).resolve().parent.parent
logo = base64.b64encode((ROOT / "app/public/c5-logo.png").read_bytes()).decode()
OUT = ROOT / "docs/Concept-5-Projects_Guide_v1.pdf"
today = datetime.date.today().strftime("%-d %B %Y")

STAGES = [("Quote", "#9AA6BA", "Enquiry being priced. Lives on the Estimation tab."),
          ("Design drawings", "#3C6CB5", "Won. Design team producing client drawings."),
          ("Prod drawings", "#5E8BD0", "Production drawings for the factory."),
          ("Production", "#917764", "Being made in the factory."),
          ("Installation", "#B99B6B", "On site, being fitted."),
          ("Snagging", "#9D7FA0", "Fitted; finishing the snag list."),
          ("Completed", "#2E9E6F", "Handed over. Done."),
          ("Site on hold", "#B85C5C", "Paused by the client or site. Not counted as late."),
          ("Lost", "#7A7A7A", "Quote not won. Kept for the record.")]

PILLS = [("crit", "#FBE3E1", "#9E2B25", "30d late", "Red", "More than 30 days past the target date."),
         ("warn", "#FCEBD9", "#9A5410", "6d late", "Orange", "Past the target date, by up to 30 days."),
         ("soon", "#FAF1CF", "#7A5F0B", "9d left", "Amber", "Target is within the next 14 days."),
         ("ok", "#DDF3E8", "#1E6B49", "42d left", "Green", "On track — more than 14 days to go."),
         ("done", "#DCEBF9", "#255A8E", "Done 3d early", "Blue", "Completed. Shows whether it finished early, late or on target."),
         ("none", "#EEEBE5", "#4A5A74", "No target", "Grey", "No target date set yet — nothing to measure against.")]

EST = [("crit", "#FBE3E1", "#9E2B25", "24d in", "Red", "Enquiry has been open more than 21 days."),
       ("warn", "#FCEBD9", "#9A5410", "12d in", "Orange", "Open more than 10 days."),
       ("ok", "#DDF3E8", "#1E6B49", "3d in", "Green", "Fresh — under 10 days."),
       ("done", "#DCEBF9", "#255A8E", "Sent 8 Oct", "Blue", "Quote submitted to the client; waiting on their decision.")]

def chips(rows):
    return "".join(f'<div class="chiprow"><span class="chip" style="background:{bg};color:{fg}">{txt}</span><div><b>{name}</b> — {desc}</div></div>' for _, bg, fg, txt, name, desc in rows)

def stages():
    return "".join(f'<div class="stagerow"><span class="swatch" style="background:{c}"></span><div><b>{n}</b><span class="dim"> — {d}</span></div></div>' for n, c, d in STAGES)

CSS = """
@page { size: A4; margin: 0; }
:root { --navy:#102C52; --bronze:#917764; --bg:#F7F6F3; --bg2:#fff; --bg3:#EEEBE5; --line:#E2DED6; --line2:#C9C3B8; --fg:#102C52; --fg2:#4A5A74; --fg3:#8591A6; }
* { box-sizing: border-box; }
body { margin:0; font-family: Inter, "DejaVu Sans", sans-serif; color: var(--fg2); font-size: 9.6pt; line-height: 1.5; }
.page { width:210mm; height:297mm; position:relative; page-break-after:always; background:var(--bg); overflow:hidden; padding: 16mm 20mm 18mm; }
.page:last-child { page-break-after:auto; }
h1,h2,h3,h4 { color:var(--navy); margin:0; }
h2 { font-size:19pt; font-weight:700; letter-spacing:-.01em; margin-bottom:2mm; }
h3 { font-size:11pt; font-weight:700; margin: 6mm 0 2mm; }
p { margin: 0 0 3mm; }
.label { font-size:7.5pt; font-weight:700; text-transform:uppercase; letter-spacing:.14em; color:var(--bronze); margin-bottom:1.5mm; }
.lead { font-size:11pt; color:var(--fg2); margin-bottom:5mm; }
.card { background:var(--bg2); border:1px solid var(--line); border-radius:3mm; padding:4.5mm 5.5mm; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:4mm; margin:3mm 0; }
.grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:4mm; margin:3mm 0; }
.card h4 { font-size:10pt; margin-bottom:1.5mm; }
.card p { font-size:9pt; margin-bottom:1.5mm; } .card p:last-child { margin:0; }
.hl { background:var(--bg3); border-left:2.5px solid var(--bronze); padding:3.5mm 5mm; border-radius:0 3mm 3mm 0; margin:4mm 0; }
.hl b { color:var(--navy); }
.chiprow, .stagerow { display:flex; align-items:flex-start; gap:4mm; padding:2.2mm 0; border-bottom:1px solid var(--line); font-size:9pt; }
.chiprow:last-child, .stagerow:last-child { border-bottom:0; }
.chip { flex:0 0 26mm; text-align:center; font-size:8pt; font-weight:700; padding:1.2mm 2.5mm; border-radius:99px; white-space:nowrap; }
.swatch { flex:0 0 9mm; height:5.5mm; border-radius:1.5mm; margin-top:.6mm; }
.stagerow b { color:var(--navy); } .dim { color:var(--fg2); }
.footer { position:absolute; bottom:9mm; left:20mm; right:20mm; display:flex; justify-content:space-between; font-size:7pt; color:var(--fg3); border-top:.5px solid var(--line2); padding-top:2mm; }
ul { margin:0 0 3mm; padding-left:5mm; } li { margin-bottom:1.2mm; }
.step { display:flex; gap:4mm; margin-bottom:3mm; } .num { flex:0 0 7mm; height:7mm; border-radius:50%; background:var(--navy); color:#fff; font-weight:700; font-size:9.5pt; display:flex; align-items:center; justify-content:center; }
.step b { color:var(--navy); }
/* mock card */
.mock { background:#fff; border:1px solid var(--line); border-radius:3mm; padding:4mm 4.5mm; position:relative; overflow:hidden; width:72mm; font-size:8.5pt; }
.mock::after { content:""; position:absolute; left:0; top:0; bottom:0; width:1.2mm; background:#D9822B; }
.mock .top { display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5mm; }
.mock .enq { font-family:"DejaVu Sans Mono", monospace; font-size:7.5pt; color:var(--fg3); }
.mock h5 { margin:0; font-size:10.5pt; color:var(--navy); }
.mock .client { color:var(--fg2); font-size:8.5pt; }
.mock .foot { display:flex; justify-content:space-between; align-items:center; margin-top:3mm; }
.mock .av { display:inline-flex; width:5.5mm; height:5.5mm; border-radius:50%; background:var(--navy); color:#fff; font-size:7pt; font-weight:700; align-items:center; justify-content:center; margin-right:1.5mm; vertical-align:middle; }
.mock .val { font-weight:800; color:var(--bronze); }
.mock .dates { display:flex; justify-content:space-between; margin-top:2.5mm; font-size:7.5pt; color:var(--fg3); }
.callout { display:grid; grid-template-columns: 76mm 1fr; gap:6mm; align-items:start; margin:3mm 0; }
.ann { font-size:8.8pt; } .ann div { margin-bottom:2mm; } .ann b { color:var(--navy); }
.tag { display:inline-block; font-size:7.5pt; font-weight:700; padding:.6mm 2mm; border-radius:1mm; background:var(--bg3); color:var(--fg2); font-family:"DejaVu Sans Mono",monospace; }
.pipe { display:flex; gap:1mm; height:7mm; margin:2mm 0 3mm; }
.pipe span { display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:8pt; border-radius:1.5mm; }
.cover { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; }
.cover img { width:60mm; margin-bottom:14mm; }
.cover .label { margin-bottom:4mm; }
.cover h1 { font-size:34pt; font-weight:800; letter-spacing:-.02em; line-height:1.05; }
.cover .sub { font-size:13pt; color:var(--fg2); margin-top:5mm; max-width:120mm; }
.cover .rule { width:14mm; height:1mm; background:var(--bronze); margin:12mm auto 0; border-radius:1mm; }
.coverfoot { position:absolute; bottom:16mm; left:0; right:0; text-align:center; font-size:8.5pt; color:var(--fg3); }
.coverfoot b { color:var(--navy); display:block; font-size:10pt; }
table.t { width:100%; border-collapse:collapse; font-size:8.8pt; margin:2mm 0 3mm; }
.t th { text-align:left; font-size:7.5pt; text-transform:uppercase; letter-spacing:.08em; color:var(--fg3); padding:1.5mm 2mm; border-bottom:1px solid var(--line2); }
.t td { padding:1.8mm 2mm; border-bottom:1px solid var(--line); vertical-align:top; } .t td:first-child { color:var(--navy); font-weight:600; white-space:nowrap; }
"""

def footer(n):
    return f'<div class="footer"><span>Concept 5 Projects — how it works</span><span>c5-scheduler.vercel.app · {n}</span></div>'

pipe = "".join(f'<span style="background:{c};flex:{f}">{n}</span>' for (_, c, _), f, n in zip(STAGES[:7], [8, 3, 2, 5, 4, 2, 6], [8, 3, 2, 5, 4, 2, 6]))

HTML_CONTENT = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>

<div class="page"><div class="cover">
  <img src="data:image/png;base64,{logo}">
  <div class="label">Team guide</div>
  <h1>Concept 5 Projects<br>How it works</h1>
  <div class="sub">What you're looking at, what the colours mean, and what happens when you change something.</div>
  <div class="rule"></div>
</div>
<div class="coverfoot"><b>c5-scheduler.vercel.app</b>Version 1 · {today} · Questions: Tom, Darren or Jinky</div></div>

<div class="page">
  <div class="label">1 · The basics</div>
  <h2>One place for every project</h2>
  <p class="lead">The app replaces the Excel project tracker. Everyone sees the same live list — on the office PCs and on your phone.</p>

  <h3>Signing in</h3>
  <div class="step"><div class="num">1</div><div>Open <b>c5-scheduler.vercel.app</b> and enter your <b>work email</b>. No password.</div></div>
  <div class="step"><div class="num">2</div><div>We email you a <b>code</b> (6–8 digits, valid for an hour). Type it in and you're in.</div></div>
  <div class="step"><div class="num">3</div><div>That's it for that device — you <b>stay signed in</b>. You only see the code screen again on a new phone or computer, or if you press Sign out.</div></div>
  <div class="hl"><b>On your phone:</b> open the link in your normal browser (not a private tab) and use "Add to Home Screen". It then opens like an app and stays signed in.</div>

  <h3>The four tabs</h3>
  <div class="grid2">
    <div class="card"><h4>Estimation</h4><p>Enquiries that are being priced, from "received" to "quote sent". Ramus, Giorgina, Jinky and Jean work here. Everyone else can look.</p></div>
    <div class="card"><h4>Board</h4><p>Every won project as a card, in columns from Design drawings through to Completed. The main screen for PMs and management.</p></div>
    <div class="card"><h4>List</h4><p>The same projects as a sortable table — click any column heading to sort by it. Best for finding a project quickly or checking dates.</p></div>
    <div class="card"><h4>Team</h4><p>Who's who: names, emails and WhatsApp numbers. Your email here is what lets you sign in and receive updates.</p></div>
  </div>

  <h3>Who can change what</h3>
  <table class="t">
    <tr><th>You are…</th><th>You can</th></tr>
    <tr><td>Anyone signed in</td><td>See everything on every tab, open any project.</td></tr>
    <tr><td>Estimation team</td><td>Add enquiries, move them between pricing stages, mark them Won or Lost.</td></tr>
    <tr><td>Project team &amp; office</td><td>Edit projects, move cards on the Board, add variation orders.</td></tr>
    <tr><td>Tom, Darren, Jinky</td><td>Add people to the Team page and update their details.</td></tr>
  </table>
  <p>If a button isn't there for you, it's because your account doesn't have that right. Ask Tom, Darren or Jinky if you think you need it.</p>
  {footer(2)}
</div>

<div class="page">
  <div class="label">2 · The Board</div>
  <h2>Reading a project card</h2>
  <div class="callout">
    <div class="mock">
      <div class="top"><span class="enq">26-031</span><span class="chip" style="background:#FCEBD9;color:#9A5410;flex:none">6d late</span></div>
      <h5>Wildflower K36</h5>
      <div class="client">Mr Al Falasi · GTS</div>
      <div class="foot"><span><span class="av">B</span>Basim + Akash</span><span class="val">412k</span></div>
      <div class="dates"><span>Start 2 Jun</span><span>Target 6 Oct</span></div>
    </div>
    <div class="ann">
      <div><b>Enquiry number</b> — the same number as on the quote and the job folder.</div>
      <div><b>Status pill (top right)</b> — how the project is doing against its target date. The colour matters; see below.</div>
      <div><b>Project name</b> — the site or address, as on the quote.</div>
      <div><b>Client · main contractor</b> — who we're working for, and through whom.</div>
      <div><b>PM</b> — who's running it. Two names means it's shared.</div>
      <div><b>Value</b> — signed quote plus all approved VOs, inc. VAT. "412k" = AED 412,000.</div>
      <div><b>Coloured stripe (left edge)</b> — same colour as the pill, so you can scan a column at a glance.</div>
    </div>
  </div>

  <h3>What the pill colours mean</h3>
  <div class="card">{chips(PILLS)}</div>
  <div class="hl"><b>Only the target date drives the colour.</b> If a project has no target date it stays grey and never turns red — so the first thing to fix on a new project is the target. Site on hold projects are not counted as late.</div>

  <h3>Columns are the stages</h3>
  <p>Cards sit in the column for their current stage. Inside a column, the most late project is at the top. The number in each column header is how many projects; the bronze figure is their total value.</p>
  <p>If you have edit rights, <b>drag a card to the next column</b> to move it on — that's all it takes to update the status. Or open the project and change the status there.</p>
  {footer(3)}
</div>

<div class="page">
  <div class="label">2 · The Board, continued</div>
  <h2>The stages, in order</h2>
  <div class="card">{stages()}</div>

  <h3>The strip at the top</h3>
  <div class="card">
    <div style="display:flex;gap:9mm;margin-bottom:3mm">
      <div><div style="font-size:18pt;font-weight:800;color:var(--navy);line-height:1">31</div><div style="font-size:7.5pt;color:var(--fg3);font-weight:600">live projects</div></div>
      <div><div style="font-size:18pt;font-weight:800;color:#D1433B;line-height:1">7</div><div style="font-size:7.5pt;color:var(--fg3);font-weight:600">past target</div></div>
      <div><div style="font-size:18pt;font-weight:800;color:var(--navy);line-height:1">18.4M</div><div style="font-size:7.5pt;color:var(--fg3);font-weight:600">pipeline value</div></div>
      <div><div style="font-size:18pt;font-weight:800;color:var(--navy);line-height:1">60</div><div style="font-size:7.5pt;color:var(--fg3);font-weight:600">in quote</div></div>
    </div>
    <div class="pipe">{pipe}</div>
    <p style="font-size:8.5pt;margin:0"><b>Live projects</b> = everything that isn't Completed or Lost. <b>Past target</b> = live projects beyond their target date (on-hold ones excluded). <b>Pipeline value</b> = all project values added up. The coloured bar shows how many projects are in each stage, using the stage colours above — wider block, more projects.</p>
  </div>

  <h3>Using the List instead</h3>
  <p>The List tab shows the same projects as a table. Click <b>Project</b>, <b>Target</b>, <b>Delay</b>, <b>Value</b> or any other heading to sort by it; click again to flip the order. The Delay column uses the same coloured pills as the Board. Use the search box to find a project by name, client or enquiry number, and the PM filter to see only one person's projects.</p>

  <h3>Adding a new project</h3>
  <p>Most projects arrive automatically: when an enquiry is marked <b>Won</b> on the Estimation tab it appears on the Board in Design drawings. For anything that didn't come through estimation, use <b>+ Project</b> at the top right. Fill in at least the name, client, PM and target date.</p>
  {footer(4)}
</div>

<div class="page">
  <div class="label">3 · Estimation</div>
  <h2>From enquiry to quote</h2>
  <p class="lead">Every enquiry is a card that moves left to right through four columns. The card tells you how long it's been waiting and when the quote is due.</p>

  <div class="grid2">
    <div class="card"><h4>Queued</h4><p>Received, not started. New enquiries land here.</p></div>
    <div class="card"><h4>Being priced</h4><p>Someone is actively working on the quote.</p></div>
    <div class="card"><h4>Waiting on info</h4><p>Stuck until something arrives — the card says what: client info, a stone or metal quote, a site measure…</p></div>
    <div class="card"><h4>Submitted</h4><p>Quote sent. Waiting on the client's decision. From here it's <b>Won → Design</b> or <b>Lost</b>.</p></div>
  </div>

  <h3>Card colours on this tab</h3>
  <div class="card">{chips(EST)}</div>
  <p style="margin-top:3mm">The pill counts <b>days since the enquiry was received</b>, so an enquiry that bounces between columns keeps its age. Oldest enquiries sit at the top of each column.</p>

  <h3>The due date</h3>
  <p>If a quote has a due date it shows at the bottom of the card: "Due in 5d", then <span style="color:#a66a00;font-weight:600">amber</span> when it's within 3 days, then <span style="color:#b3261e;font-weight:600">red</span> once it's overdue ("Due 2d ago").</p>

  <h3>Adding an enquiry</h3>
  <p>Press <b>+ New enquiry</b>. The next enquiry number is filled in for you — keep it unless you have a reason not to. Enter the project (site/address), client, main contractor, who's pricing it, the scope, who sent it in, and the quote due date if there is one.</p>
  <div class="hl"><b>One number, one job.</b> If a client asks for extra work on a project we've already won, don't raise a new enquiry with the old number — add it as a <b>variation order</b> on the existing project (see next page). A new enquiry is for new work.</div>
  {footer(5)}
</div>

<div class="page">
  <div class="label">4 · The project page</div>
  <h2>Everything about one project</h2>
  <p class="lead">Click any card or list row to open it. This is where the detail lives and where edits are made.</p>

  <div class="grid2">
    <div class="card"><h4>Stage bar</h4><p>The row of blocks under the title shows the seven stages. Filled = done, bronze = current. Quick way to see how far along it is.</p></div>
    <div class="card"><h4>At a glance</h4><p>PM, designer, key dates, programme length, days so far, project value, VO count and how long it's been in the current stage.</p></div>
    <div class="card"><h4>Variation orders</h4><p>Each VO has a number, description and value. They add to the signed quote to give the project value. Add one with the form; remove with the ×.</p></div>
    <div class="card"><h4>History</h4><p>Every status change, who made it and when. Nothing is lost when a card moves.</p></div>
  </div>

  <h3>Editing</h3>
  <p>If you have edit rights there's an <b>Edit project</b> panel. Change what you need and press <b>Save</b>. Saving the same thing twice is harmless; you won't flood anyone with emails (see next page).</p>
  <p>Dates matter more than anything else on this page. The Board's colours, the "past target" count and the update emails all work from <b>Start</b>, <b>Target completion</b> and <b>Completed</b>. Keep them honest — if the target moves, change it, don't leave the card going red.</p>

  <h3>Values</h3>
  <p>All money is <b>AED, including 5% VAT</b>, matching the quote. The signed quote is entered once; everything after that is a VO. Don't edit the signed quote to absorb a VO.</p>

  <div class="hl"><b>Don't delete, finish.</b> There's no delete button on purpose. A project that's over goes to <b>Completed</b>; a quote we didn't get goes to <b>Lost</b>; a job that's paused goes to <b>Site on hold</b>. The record stays so the numbers stay right.</div>
  {footer(6)}
</div>

<div class="page">
  <div class="label">5 · Email updates</div>
  <h2>You'll hear when your projects change</h2>
  <p class="lead">The system watches for meaningful changes and emails the people on that project. You don't have to check the Board to find out something moved.</p>

  <h3>What counts as a change</h3>
  <div class="grid2">
    <div class="card"><h4>You will be told about</h4><ul>
      <li>A new project created</li><li>Status or quote stage moved</li><li>PM, second PM, designer or estimator changed</li><li>Start, target, completed or quote-due date changed</li><li>Signed quote or quoted value changed</li><li>A VO added, changed or removed</li><li>Name, client or contractor changed</li></ul></div>
    <div class="card"><h4>You won't be told about</h4><ul>
      <li>Notes</li><li>Difficulty rating, folder path, scope, quote type</li><li>Who sent an enquiry in, or what it's waiting on</li><li>Anything <b>you</b> changed yourself</li><li>A save where nothing actually changed</li></ul></div>
  </div>

  <h3>Who gets the email</h3>
  <table class="t">
    <tr><th>Change on…</th><th>Goes to</th></tr>
    <tr><td>A live project</td><td>Its PM, second PM and designer</td></tr>
    <tr><td>An enquiry in estimation</td><td>Its estimator</td></tr>
    <tr><td>A new project, or a quote that's just been won</td><td>The above, plus Aftab</td></tr>
  </table>

  <h3>How often</h3>
  <p>Changes are gathered up and sent <b>every 10 minutes</b> — one email per person covering everything on all their projects since the last one. If someone is still editing a project it waits for the next run, so you don't get two half-emails. Expect a handful a day at most, not one per click.</p>

  <div class="hl"><b>No email in the Team page = no updates.</b> The emails go to the address on the Team tab. If yours is missing or wrong, tell Tom, Darren or Jinky and they'll fix it in a minute. The same address is what you sign in with.</div>

  <h3>What the email looks like</h3>
  <p>Subject line names the project. Inside: one block per project, each change on its own line with who made it and when, and an <b>Open project</b> link that takes you straight to it. It comes from <b>Concept 5 Projects</b> — add it to your safe senders if it lands in junk.</p>
  {footer(7)}
</div>

</body></html>"""

HTML(string=HTML_CONTENT).write_pdf(OUT)
print("wrote", OUT)
