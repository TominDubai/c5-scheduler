-- 016b: Workflow Rev 3 — stages, ball holder, controlled handovers, holds, evidence, supporting tasks.
-- Source: Darren's "Concept 5 Project Workflow Rev 3" (27 Oct 2026). Plan: Plans/C5-Workflow-Rev3_Plan_v1.md.
--
-- One sentence: every project is at one of 17 stages (0–16, then Completed), one named person holds the ball,
-- and the ball only moves when the next person accepts it.
--
-- Additive. `projects.status` stays and is kept in step with `projects.stage` by trigger (status_for_stage),
-- so the Items work, the award email and the estimation tab keep working during the switch. Names of people
-- are never in app code: the stage → default owner map lives in `stage_owners`, maintained on the Team page.
set search_path = scheduler, public;

-- ---------- people ----------
-- Email was already nullable; WhatsApp-only staff (Usman, Sakir, Rana) get a record each and no invented email.
alter table people add column if not exists can_sign_in boolean not null default true;
alter table people add column if not exists position text;      -- "Storekeeper / Dispatch lead" — shown under the ball holder on the card
insert into people(name, full_name, role, can_sign_in, position) values
  ('USMAN', 'Usman Ali', 'STORE', false, 'Storekeeper / Dispatch lead'),
  ('SAKIR', 'Sakir', 'STORE', false, 'Dispatch support'),
  ('RANA',  'Rana',  'STORE', false, 'Dispatch support')
on conflict (name) do nothing;
-- roles the app never had: these people exist already, Rev 3 names their function
update people set role = 'PROJECT_COORDINATOR', position = coalesce(position, 'Project Coordinator') where name = 'ANNE';
update people set role = 'PROCUREMENT',         position = coalesce(position, 'Procurement Coordinator') where name = 'VERONICA';
update people set role = 'ACCOUNTS',            position = coalesce(position, 'Accountant') where name = 'RITHU';
update people set position = coalesce(position, p.pos) from (values
  ('RAMUS','Estimator'), ('JEAN','Admin / HR / Accounting Manager'), ('BASIM','Lead Project Manager'),
  ('HAYDEE','Lead Designer / Acting Design Manager'), ('ALYSSA','Senior Technical Designer'),
  ('GAJANAND','Production Manager'), ('JINKY','Operations Manager'), ('DARREN','Production Design Director'),
  ('AFTAB','General Manager'), ('TOM','Managing Director'), ('TOM-BOLSOVER','Managing Director')) as p(nm, pos)
where people.name = p.nm;
-- people who cannot sign in must not be matched by me(): they have no email, so nothing changes there.

-- ---------- stages (reference) ----------
-- phase: the five groups the board shows. owner_rule: PERSON = the person in stage_owners; ALLOCATED_PM = this
-- project's lead PM; NONE = no active ball (Completed). retains_ball: the same owner carries on into the next stage
-- without a handover acceptance (1→2 Ramus, 11→12 Gaju, 14→15 the PM) — the checkpoint is still recorded.
create table if not exists stages (
  stage_no      smallint primary key,
  name          text not null,
  short_name    text not null,
  phase         text not null check (phase in ('ENQUIRY','HANDOVER','DESIGN','PRODUCTION','INSTALLATION','COMPLETE')),
  department    text not null,
  owner_rule    text not null default 'PERSON' check (owner_rule in ('PERSON','ALLOCATED_PM','NONE')),
  position      text,                                   -- the ball holder's position as Rev 3 states it
  description   text,
  checklist     jsonb not null default '[]'::jsonb,     -- [{"key":"a","text":"..."}] — the "Done when" ticks
  evidence      text,                                   -- the handover evidence sentence from Rev 3, shown under the checklist
  supporting    jsonb not null default '[]'::jsonb,     -- ["Giorgina | Junior Estimator", ...] displayed, not emailed
  loop          jsonb not null default '[]'::jsonb,     -- "Keep in the loop" — displayed on the card, never emailed (decision 5)
  attendance    jsonb not null default '[]'::jsonb,     -- mandatory attendance for the meeting stages
  retains_ball  boolean not null default false,         -- next stage keeps the same owner (checkpoint, not acceptance)
  next_stage    smallint,
  is_active     boolean not null default true
);
create table if not exists stage_owners (
  stage_no   smallint primary key references stages(stage_no),
  person_id  uuid not null references people(id),
  set_by     uuid references people(id),
  set_at     timestamptz not null default now()
);
create table if not exists stage_targets (
  stage_no        smallint primary key references stages(stage_no),
  target_days     int,            -- how long a project should sit in this stage; null = not agreed yet (Darren)
  response_hours  int             -- how long an acceptor has before escalation; null = not agreed yet
);

insert into stages(stage_no, name, short_name, phase, department, owner_rule, position, description, checklist, evidence, supporting, loop, attendance, retains_ball, next_stage) values
(0, 'Enquiry qualification', 'Qualifying', 'ENQUIRY', 'Sales', 'PERSON', 'Sales qualification',
 'Tom Brooks and Aftab Khan act as Sales and filter new project opportunities before they enter the active workflow. Confirm that the scope is suitable, strategically and commercially viable, and can be accommodated before it is passed to estimating.',
 '[{"key":"decision","text":"Proceed / decline decision recorded"},{"key":"details","text":"Initial client and project details, outline scope and known constraints noted"},{"key":"agree","text":"Tom and Aftab agree to proceed"}]',
 'Recorded proceed / decline decision, initial client and project details, outline scope, known constraints and confirmation that Tom and Aftab agree to proceed.',
 '["Jinky","Darren","Basim"]', '["Jean Suarez","Jinky Restrivera","Darren Dinglasan","Mohammad Basim","Ramus Bautista","Giorgina"]', '[]', false, 1),
(1, 'Enquiry registration', 'Registered', 'ENQUIRY', 'Estimating', 'PERSON', 'Estimator',
 'Register the qualified enquiry on the Estimation tab, keeping the enquiry number the app issues. Record the client, main contractor, project location, scope, drawings received, budget indication, required dates and quotation deadline. Identify missing information and appoint one enquiry contact. One number, one job: extra work on a project we have already won is a variation order on that project, not a new enquiry.',
 '[{"key":"ref","text":"Enquiry reference issued and brief recorded"},{"key":"client","text":"Client, location and scope information recorded"},{"key":"dates","text":"Required dates and quotation deadline recorded"},{"key":"gaps","text":"Information gaps identified and one enquiry contact appointed"}]',
 'Enquiry reference, recorded brief, client and location details, scope information, required dates, quotation deadline and identified information gaps.',
 '["Giorgina | Junior Estimator","Jinky Restrivera | Operations coordination and enquiry record"]', '["Tom Brooks and Aftab Khan | Sales","Client contact","Haydee Candole | Concept design support when required","Management and Operations | Unusual scope, capacity or delivery risks"]', '[]', true, 2),
(2, 'Quotation', 'Quotation', 'ENQUIRY', 'Estimating', 'PERSON', 'Estimator',
 'Prepare and follow up the quotation. Check quantities, exclusions, cost and lead times against the current base material rates. Every quotation and BOQ includes the standard conditions C1 (material approval threshold), C2 (site readiness) and C3 (timeline validity), and states the 30-day price validity. Group-company introductions carry the standard 10% commission; any client discount comes off the commission, not the production base price. Before the quotation is sent it must be checked by Tom, Aftab or Jinky, depending on who introduced the project.',
 '[{"key":"check","text":"Pre-issue check recorded with the reviewer''s name (Tom / Aftab / Jinky)"},{"key":"scope","text":"Agreed scope, exclusions and programme basis recorded"},{"key":"c123","text":"C1 to C3 included and terms approved"},{"key":"award","text":"Accepted quotation / award evidence attached"}]',
 'Accepted quotation / award evidence, recorded pre-issue check with the name of the reviewer, agreed scope, exclusions, programme basis, C1 to C3 included and approved terms. A lost enquiry closes as Lost, not Completed.',
 '["Giorgina | Junior Estimator","Sachin Jangir | early quantity take-off","Veronica Panaligan | supplier costs","Haydee | design intent","Gajanand Jangir | factory feasibility and base rates","Jean Suarez | payment terms"]', '["Anne","Jinky"]', '[]', false, 3),
(3, 'Award and contract administration', 'Award / contract', 'ENQUIRY', 'Admin', 'PERSON', 'Admin / HR / Accounting Manager',
 'Control the contract paperwork, approved terms, order records and required advance-payment confirmation. Confirm that the client has accepted the terms, including C1 to C3.',
 '[{"key":"contract","text":"Accepted contract / order on file"},{"key":"scope","text":"Scope and contractual start conditions confirmed"},{"key":"payment","text":"Payment status confirmed (advance received or terms agreed)"},{"key":"contacts","text":"Approval contacts recorded"}]',
 'Accepted contract / order, scope, payment status, contractual start conditions and approval contacts.',
 '["Rithunandha Subajahn | verifies receipts","Ramus | resolves quotation differences","Tom or his authorised delegate | approves contractual commitments"]', '["Jinky","Basim","Anne"]', '[]', false, 4),
(4, 'Project allocation', 'Allocation', 'ENQUIRY', 'Projects', 'PERSON', 'Lead Project Manager',
 'Name one lead PM and one Project Coordinator, agree project responsibilities and coordinate resources and dates with Jinky. Haydee names the project designer and Alyssa names the technical designer. Anne records the appointments in the app and books the Sales Handover Meeting. Until allocation is complete, Basim keeps the ball.',
 '[{"key":"team","text":"Lead PM, Project Coordinator, project designer and technical designer named in the app"},{"key":"folder","text":"Project folder created in the current folder format"},{"key":"meeting","text":"Sales Handover Meeting booked"}]',
 'Named lead PM, Project Coordinator, project designer and technical designer in the app, project folder created in the current folder format, and the Sales Handover Meeting booked.',
 '["Jinky Restrivera | resources and dates","Haydee | assigns the project designer","Alyssa Fernandez | assigns the technical designer","Anne | records the appointments and books the Sales Handover Meeting"]', '["Jean","Ramus","Darren Dinglasan","Gajanand","Veronica"]', '[]', false, 5),
(5, 'Sales handover meeting', 'Sales handover', 'HANDOVER', 'Estimating', 'PERSON', 'Estimator / Sales Handover lead',
 'Mandatory before the project becomes active. Ramus hands the project over from sales to the delivery team: who the client is and what type of client they are, their expectations, anything agreed verbally, the renders and quotation history, payment terms, and whether the client has been briefed on C1 to C3. The allocated PM and Project Coordinator must already be allocated before the meeting.',
 '[{"key":"held","text":"Sales Handover Meeting held with the mandatory attendees"},{"key":"notes","text":"Handover notes attached: client profile, verbal agreements, quotation and BOQ, renders, payment terms, C1–C3 briefing status"},{"key":"risks","text":"Known risks and open items listed"},{"key":"attendance","text":"Attendance record saved"}]',
 'Sales handover notes saved in the project folder and the app: client profile and expectations, verbal agreements, quotation and BOQ, renders, payment terms, C1 to C3 briefing status, known risks and open items, and the attendance record.',
 '[]', '["Tom Brooks or Aftab Khan, whoever introduced the project","Mohammad Basim","Alyssa Fernandez","Jean Suarez"]',
 '["Haydee Candole and her allocated project designer","Jinky Restrivera | Overall guide","Anne Rose Amoguis | Project Coordinator","Allocated PM","Darren Dinglasan"]', false, 6),
(6, 'Kick-off preparation', 'Kick-off prep', 'HANDOVER', 'Design', 'PERSON', 'Lead Designer / Acting Design Manager',
 'Straight after the Sales Handover, the allocated designer prepares three documents from the BOQ: the Joinery Key Plan, the drawing register (every expected drawing entered in the Master Live Tracker — the Items tab) and the Material Schedule. They do not need to be final; they are the basis for the kick-off discussion.',
 '[{"key":"keyplan","text":"Joinery Key Plan attached"},{"key":"register","text":"Drawing register entered on the Items tab"},{"key":"materials","text":"Material Schedule attached"},{"key":"booked","text":"Kick-off meeting booked by Anne with the three documents circulated beforehand"}]',
 'Joinery Key Plan, drawing register in the Master Live Tracker and Material Schedule attached to the project. Kick-off meeting booked by Anne, with the three documents circulated to attendees beforehand.',
 '["Allocated project designer | prepares the three documents","Allocated technical designer","Sachin Jangir | BOQ quantities","Ramus | BOQ and pricing clarification"]', '["Allocated PM","Anne","Alyssa"]', '[]', false, 7),
(7, 'Project kick-off meeting', 'Kick-off', 'HANDOVER', 'Projects', 'ALLOCATED_PM', 'Project Manager',
 'The internal kick-off gives everyone the full picture before anyone draws or orders. Go through the project item by item using the Key Plan, drawing register and Material Schedule; identify material feasibility, buildability, logistics, technical difficulty and suppliers early. Agree a realistic programme covering design, drafting and client approvals, production, installation and handover. The PM and designer then hold a short client kick-off to walk the client through C1 to C3, the approval process and the programme.',
 '[{"key":"minutes","text":"Kick-off minutes attached (YYYY.MM.DD)"},{"key":"programme","text":"Agreed programme with start and target completion dates entered in the app"},{"key":"risks","text":"Risk and issue list with named owners"},{"key":"longlead","text":"Long-lead items flagged to Veronica"},{"key":"client","text":"Client kick-off held; client''s acknowledgement of terms and programme recorded by email"}]',
 'Kick-off minutes saved in the project folder, agreed programme with start and target completion dates entered in the app, risk and issue list with named owners, long-lead items flagged to Veronica, and the client kick-off held with the client''s acknowledgement of terms and programme recorded by email.',
 '[]', '["Alyssa Fernandez","Veronica Panaligan | long-lead items","Ramus Bautista","Jean Suarez | payment milestones"]',
 '["Haydee Candole | Design lead","Allocated project designer","Allocated technical designer","Anne Rose Amoguis | Project Coordinator","Jinky Restrivera | Operations Manager","Gajanand Jangir | Production timeline and buildability","Mohammad Basim | Site construction and installation timeline","Darren Dinglasan | Technical guidance"]', false, 8),
(8, 'Design drawings', 'Design drawings', 'DESIGN', 'Design', 'PERSON', 'Lead Designer / Acting Design Manager',
 'Control design delivery against the kick-off programme. Before the PM visits site, give them a floor plan with MEP and key measurement points marked in red, and get complete C5 site measurements back. Secure the client''s written approval of layout, materials and finishes by email or DocuSign — WhatsApp is not an approval channel. Track material approvals against the C1 threshold. If waiting for the client, Haydee retains the ball and the app names the person following up.',
 '[{"key":"design","text":"Approved design and finish selections"},{"key":"measure","text":"Verified site measurements received"},{"key":"approvals","text":"Written client approvals (email / DocuSign) attached"},{"key":"c1","text":"Material approvals at or above the C1 threshold"},{"key":"package","text":"Complete design information handed to technical drafting using Alyssa''s template"}]',
 'Approved design, verified site measurements, finish selections, written client approvals (email / DocuSign), material approvals at or above the C1 threshold, resolved scope changes, and complete material, finish, equipment and design information handed to technical drafting using Alyssa''s template.',
 '["Allocated project designer","Allocated PM | site measurements and client meetings","Darren | technical concerns","Arun Kumar Jangid or Hitesh Jangir | 3D support"]', '["Alyssa","Anne","Veronica | early sourcing and long-lead items","Abhilash | hardware and fittings availability","Sachin | quantities","Ramus | scope changes"]', '[]', false, 9),
(9, 'Production drawings', 'Prod drawings', 'DESIGN', 'Technical design', 'PERSON', 'Senior Technical Designer / Acting Technical Drafts Team Leader',
 'Allocate the technical designer and issue a complete, buildable package using the current template and title block. Check item codes, quantities, hardware, fixings, site dimensions and revisions. After site-measurement updates, hold a short review with the PM, then an internal design-production check with Gaju and Abhilash before release. Obtain Darren''s technical review and required client approvals. Release by the standard FOR PRODUCTION email before drawings are printed for the shop floor.',
 '[{"key":"review","text":"PM review and internal design-production check with Gaju and Abhilash done"},{"key":"darren","text":"Darren''s technical review obtained"},{"key":"client","text":"Required client approvals obtained"},{"key":"forprod","text":"FOR PRODUCTION email sent (to Gaju, Abhilash, Sachin; CC Anne, Basim, Jinky, PM, designer, Darren) with the package attached"},{"key":"register","text":"Drawing register current; superseded revisions withdrawn"}]',
 'FOR PRODUCTION email sent with production drawings, material specs and technical datasheets, current approved drawing register, material and quantity requirements, technical review and withdrawn superseded revisions. Darren is a reviewer; Alyssa remains the ball holder while review is pending.',
 '["Allocated technical designer","Abhilash Alakadan Phutanpurayil | Production Designer","Sachin Jangir | Production / Qty Take Off","Haydee","Gajanand","Allocated PM"]', '["Veronica","Anne","Mohammad Basim","Jinky","Darren","Usman Ali"]', '[]', false, 10),
(10, 'Material readiness', 'Materials', 'DESIGN', 'Procurement', 'PERSON', 'Procurement Coordinator',
 'Check available stock, place authorised orders and track delivery of approved materials, hardware, consumables and outsourced items. Every request comes through a Material Request Form (MRF) endorsed by the PM and is logged in the Master Procurement Log before any supplier is contacted. No project-specific order until written client approval reaches the C1 threshold, unless management approves an exception. A shortage stays here with Veronica and a named follow-up action.',
 '[{"key":"list","text":"Material readiness list complete for the agreed production scope"},{"key":"log","text":"Master Procurement Log updated"},{"key":"receipt","text":"Receipt / allocation evidence attached"},{"key":"subs","text":"Any substitutions approved in writing and recorded"}]',
 'Material readiness list, Master Procurement Log updated, receipt / allocation evidence, approved substitutions and closure of every item required for the agreed production scope.',
 '["Sachin | full material take-off and quantities","Alyssa | specifications","Ramus | budget validation before any LPO","Jean and Rithunandha | payment administration","Usman | stock receipt / allocation","Gajanand | factory requirements","Shadab | field purchasing, under Veronica''s direction only"]', '["Allocated PM","Anne","Haydee | approval status","Jean | purchasing or payment blockers"]', '[]', false, 11),
(11, 'Production', 'Production', 'PRODUCTION', 'Factory', 'PERSON', 'Production Manager',
 'Accept the complete release package, then hold the production release meeting before manufacturing (drawings circulated the day before). Production is booked only when materials are ready and the PM has received the client''s Site Readiness Declaration (C2). Assign one factory team with a senior lead who owns the full drawing run. Each department checks the work it receives. If the site is not ready, the project comes off the production programme until the PM confirms an updated schedule.',
 '[{"key":"release","text":"Release record: scope, information, materials, method, dates and named factory team lead"},{"key":"c2","text":"Site Readiness Declaration (C2) received and payment conditions met"},{"key":"items","text":"Completed item list with manufacturing checks"}]',
 'Release record confirming scope, information, materials, method, dates and the named factory team lead; Site Readiness Declaration and applicable payment conditions; completed item list and manufacturing checks. Unresolved start conditions mean HOLD under Gajanand, with the blocker named.',
 '["Factory team lead for the project","Darren","Alyssa","Abhilash","Sachin","Veronica","Usman","Allocated PM | site readiness"]', '["Anne","Jinky","Allocated PM | progress and delivery outlook"]', '[]', true, 12),
(12, 'QC release', 'QC release', 'PRODUCTION', 'Factory', 'PERSON', 'Production Manager and QC Owner',
 'The factory team lead first verifies the full item list, including loose parts and accessories. Gaju then checks quality and completeness against the current approved drawings, quantities, finishes, hardware and accessories, records defects and verifies corrections before accepting the goods for dispatch. Gaju owns both Production and QC; the app still requires a separate QC record and stage time stamp before dispatch.',
 '[{"key":"itemlist","text":"Full item list verified by the factory team lead, including loose parts and accessories"},{"key":"qc","text":"Signed QC acceptance attached"},{"key":"defects","text":"Defects recorded and corrections verified"}]',
 'Signed QC acceptance, complete item checklist and verified corrections.',
 '["Factory team lead | verifies the item list","Factory team | corrects defects under Gaju","Alyssa | clarifies drawings","Sachin | reconciles quantities","Darren | resolves technical acceptance disputes"]', '["Allocated PM","Anne","Usman Ali","Darren | unresolved technical defects"]', '[]', false, 13),
(13, 'Dispatch', 'Dispatch', 'PRODUCTION', 'Store', 'PERSON', 'Storekeeper / Dispatch lead',
 'Own the packing list, loading verification, delivery note and delivery arrangement. Confirm site access with the allocated PM and required payment clearance with Jean. Include all loose parts and accessories. Missing delivery clearance keeps the ball in Dispatch. Usman holds the card; Sakir and Rana support him. Handovers in and out of Dispatch happen on WhatsApp and are recorded by Anne.',
 '[{"key":"qc","text":"QC release received"},{"key":"load","text":"Load verified against the packing list, loose parts and accessories included"},{"key":"note","text":"Delivery note attached"},{"key":"site","text":"Site readiness confirmed with the PM and payment clearance confirmed with Jean"},{"key":"receipt","text":"Allocated PM''s receipt / acceptance recorded"}]',
 'QC release, verified load, delivery note, site readiness, required payment clearance and the allocated PM''s recorded receipt / acceptance.',
 '["Sakir and Rana | Dispatch support","Gaju | QC / packing readiness","Anne | app recording","Jean and Rithunandha | payment clearance"]', '["Allocated PM","Anne","Jinky","Jean | when delivery or invoicing is affected"]', '[]', false, 14),
(14, 'Installation', 'Installation', 'INSTALLATION', 'Projects', 'ALLOCATED_PM', 'Project Manager',
 'Accept the site delivery, record shortages or damage and control installation to the approved drawings. Allocate the site team and keep progress and installation checks current. Save site photos and measurements to the project''s weekly site report folder, named by date. Drawings are never corrected by hand on site; any error goes through the PM to the designer as a formal revision.',
 '[{"key":"recon","text":"Delivery reconciliation done; shortages or damage recorded"},{"key":"notes","text":"Scanned delivery notes filed in the Store folder"},{"key":"checks","text":"Installation checks current"},{"key":"snags","text":"Dated snag list attached"}]',
 'Delivery reconciliation, scanned delivery notes filed in the Store folder, installation checks and a dated snag list. Installation is complete when the agreed scope is installed and ready for snag closure.',
 '["Basim | site resources","Anne | coordination","Usman Ali | delivery discrepancies","Alyssa | technical clarification","Allocated designer | reviews the daily site photos"]', '["Jinky","Gaju | QC clarification or a verified factory action"]', '[]', true, 15),
(15, 'Snagging and client handover', 'Snagging', 'INSTALLATION', 'Projects', 'ALLOCATED_PM', 'Project Manager',
 'Assign every snag to one task owner, verify closure and obtain client / consultant handover acceptance. Assemble the required warranties, care instructions and final drawings.',
 '[{"key":"snags","text":"Snag register closed, every snag with one task owner"},{"key":"accept","text":"Client / consultant handover acceptance attached"},{"key":"docs","text":"Handover documents assembled: warranties, care instructions, final drawings"},{"key":"remaining","text":"Any agreed remaining obligations listed"}]',
 'Closed snag register, client acceptance, handover documents and a clear list of any agreed remaining obligations.',
 '["Anne","Gaju | QC and verified manufacturing defects","Alyssa | final drawings","Jean | handover administration requirements"]', '["Basim","Jinky","Jean","Affected task owners"]', '[]', false, 16),
(16, 'Final administration and accounts', 'Final accounts', 'INSTALLATION', 'Admin', 'PERSON', 'Admin / HR / Accounting Manager',
 'Reconcile the approved order and variations, arrange final invoicing, confirm receipts and file the closeout records. Invoices are issued only on the allocated PM''s written instruction. Track retention and any remaining contractual obligations with named actions and due dates. Client handover does not automatically mean financial closure.',
 '[{"key":"reconcile","text":"Approved order and variations reconciled"},{"key":"invoice","text":"Final invoicing arranged on the PM''s written instruction; receipts confirmed"},{"key":"records","text":"Closeout records filed"},{"key":"retention","text":"Retention and remaining obligations tracked with named actions and due dates"}]',
 'Handover records complete and financial / contractual obligations settled.',
 '["Rithunandha | accounting entries and reconciliation","Ramus | pricing records","Allocated PM and Anne | completion evidence","Tom | decisions outside delegated limits"]', '["Allocated PM","Jinky","Aftab","Tom | unresolved financial decisions"]', '[]', false, 17),
(17, 'Completed', 'Completed', 'COMPLETE', 'Admin', 'NONE', null,
 'After stage 16. Jean remains the record custodian; there is no active ball.', '[]', null, '[]', '[]', '[]', false, null)
on conflict (stage_no) do nothing;

-- default ball holders, by name — data, not code; the Team page maintains this from here on
insert into stage_owners(stage_no, person_id)
select s.stage_no, p.id from (values
  (0,'TOM'), (1,'RAMUS'), (2,'RAMUS'), (3,'JEAN'), (4,'BASIM'), (5,'RAMUS'), (6,'HAYDEE'), (8,'HAYDEE'),
  (9,'ALYSSA'), (10,'VERONICA'), (11,'GAJANAND'), (12,'GAJANAND'), (13,'USMAN'), (16,'JEAN')) as s(stage_no, nm)
join people p on p.name = s.nm
on conflict (stage_no) do nothing;
insert into stage_targets(stage_no) select stage_no from stages on conflict do nothing;   -- numbers from Darren later

-- ---------- projects: stage, ball, flow status, team, next action ----------
alter table projects
  add column if not exists stage                smallint references stages(stage_no),
  add column if not exists ball_holder_id       uuid references people(id),
  add column if not exists flow_status          text not null default 'ACTIVE' check (flow_status in ('ACTIVE','AWAITING_ACCEPTANCE','ON_HOLD')),
  add column if not exists coordinator_id       uuid references people(id),
  add column if not exists stage_entered_at     timestamptz,
  add column if not exists stage_migrated       boolean not null default false,   -- "stage set by migration — not yet accepted"
  add column if not exists stage_accepted_at    timestamptz,
  add column if not exists next_action          text,
  add column if not exists next_action_owner_id uuid references people(id),
  add column if not exists next_action_due      date,
  add column if not exists qualified_by         uuid references people(id),       -- stage 0: who said proceed
  add column if not exists declined_at          timestamptz;                      -- stage 0: declined (terminal, like Lost)
create index if not exists projects_stage on projects(stage);
create index if not exists projects_ball on projects(ball_holder_id);

-- ---------- handovers: the audit trail ----------
create table if not exists handovers (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references projects(id) on delete cascade,
  from_stage           smallint references stages(stage_no),
  to_stage             smallint not null references stages(stage_no),
  from_person_id       uuid references people(id),
  to_person_id         uuid references people(id),
  status               text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','RETURNED','CANCELLED','OVERRIDE','MIGRATED','CHECKPOINT')),
  requested_at         timestamptz not null default now(),
  requested_by         uuid references people(id),
  note                 text,                           -- what the outgoing owner says to the next one
  accepted_at          timestamptz,
  returned_at          timestamptz,
  return_reason        text,
  recorded_by          uuid references people(id),     -- Anne, when the acceptance came on WhatsApp
  acceptance_evidence  text,                           -- the exact message, sender and project reference
  evidence_time        timestamptz,                    -- when the WhatsApp acceptance was sent
  override             boolean not null default false, -- moved by an admin without the acceptor (decision 4)
  authorised_by        uuid references people(id),
  override_reason      text
);
create index if not exists handovers_project on handovers(project_id, requested_at desc);
create index if not exists handovers_pending on handovers(to_person_id) where status = 'PENDING';

-- ---------- holds ----------
create table if not exists holds (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references projects(id) on delete cascade,
  reason               text not null,
  waiting_on_person_id uuid references people(id),
  waiting_on           text,                           -- "Client", "Supplier — XYZ", when it isn't a team member
  required_action      text,
  action_due           date,
  blocked_since        timestamptz not null default now(),
  review_date          date,
  created_by           uuid references people(id),
  released_at          timestamptz,
  released_by          uuid references people(id),
  release_note         text
);
create index if not exists holds_open on holds(project_id) where released_at is null;
create unique index if not exists holds_one_open on holds(project_id) where released_at is null;

-- ---------- stage checklist ticks and evidence files ----------
create table if not exists stage_evidence (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  stage_no    smallint not null references stages(stage_no),
  item_key    text,                                     -- a checklist key from stages.checklist; null = a loose attachment
  done        boolean not null default false,
  note        text,
  file_path   text,                                     -- Supabase Storage path in bucket `evidence`
  file_name   text,
  link_url    text,
  by          uuid references people(id),
  at          timestamptz not null default now()
);
create unique index if not exists stage_evidence_tick on stage_evidence(project_id, stage_no, item_key) where item_key is not null;
create index if not exists stage_evidence_project on stage_evidence(project_id, stage_no);

-- ---------- supporting tasks (under the card; cannot move it) ----------
create table if not exists project_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  title       text not null,
  owner_id    uuid references people(id),
  due         date,
  done_at     timestamptz,
  created_by  uuid references people(id),
  created_at  timestamptz not null default now()
);
create index if not exists project_tasks_open on project_tasks(project_id) where done_at is null;

-- ---------- reassignments ----------
create table if not exists reassignments (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  role           text not null check (role in ('BALL','PM','PM2','COORDINATOR','DESIGNER','TECHNICAL_DESIGNER')),
  from_person_id uuid references people(id),
  to_person_id   uuid references people(id),
  authorised_by  uuid references people(id),
  reason         text,
  at             timestamptz not null default now()
);

-- ---------- helpers ----------
create or replace function status_for_stage(s smallint) returns project_status language sql immutable as $$
  select case
    when s is null then null
    when s <= 2 then 'QUOTE'::project_status
    when s <= 8 then 'DESIGN_DRAWINGS'::project_status
    when s <= 10 then 'PROD_DRAWINGS'::project_status
    when s <= 13 then 'PRODUCTION'::project_status
    when s = 14 then 'INSTALLATION'::project_status
    when s = 15 then 'SNAGGING'::project_status
    when s = 16 then 'SNAGGING'::project_status
    else 'COMPLETED'::project_status end
$$;
create or replace function stage_for_status(st project_status) returns smallint language sql immutable as $$
  select case st
    when 'QUOTE' then 1 when 'DESIGN_DRAWINGS' then 8 when 'PROD_DRAWINGS' then 9 when 'PRODUCTION' then 11
    when 'INSTALLATION' then 14 when 'SNAGGING' then 15 when 'COMPLETED' then 17 else null end::smallint
$$;
/** the default ball holder for a stage on a given project: the stage owner, or this project's lead PM */
create or replace function default_ball_holder(s smallint, pm uuid) returns uuid language sql stable set search_path = scheduler, public as $$
  select case (select owner_rule from stages where stage_no = s)
    when 'ALLOCATED_PM' then pm
    when 'NONE' then null
    else (select person_id from stage_owners where stage_no = s) end
$$;
grant execute on function status_for_stage(smallint), stage_for_status(project_status), default_ball_holder(smallint, uuid) to authenticated, service_role;

-- keep stage and status in step whichever one the app writes; stamp stage_entered_at; fill the ball holder when a
-- stage is set without one (old code paths: card dropdown, status field on the form)
create or replace function sync_stage_status() returns trigger language plpgsql set search_path = scheduler, public as $$
begin
  if tg_op = 'INSERT' then
    if new.stage is null and new.status not in ('LOST','MERGED','SITE_ON_HOLD') then new.stage := stage_for_status(new.status); end if;
    if new.stage is not null and new.status is distinct from status_for_stage(new.stage) and new.status not in ('LOST','MERGED','SITE_ON_HOLD') then new.status := status_for_stage(new.stage); end if;
    if new.stage is not null then
      new.stage_entered_at := coalesce(new.stage_entered_at, now());
      if new.ball_holder_id is null then new.ball_holder_id := default_ball_holder(new.stage, new.pm_id); end if;
    end if;
    return new;
  end if;
  if new.stage is distinct from old.stage then
    -- stage drives status (a hold or a lost / merged outcome is left alone)
    if new.stage is not null then
      if new.status not in ('LOST','MERGED','SITE_ON_HOLD') then new.status := status_for_stage(new.stage); end if;
      if new.stage_entered_at is not distinct from old.stage_entered_at then new.stage_entered_at := now(); end if;   -- the migration sets it explicitly
      if new.stage = 17 then new.ball_holder_id := null; new.flow_status := 'ACTIVE';
      elsif new.ball_holder_id is not distinct from old.ball_holder_id then new.ball_holder_id := default_ball_holder(new.stage, new.pm_id); end if;
      if new.flow_status = 'AWAITING_ACCEPTANCE' then new.flow_status := 'ACTIVE'; end if;
    end if;
  elsif new.status is distinct from old.status then
    -- status drives stage (old code paths: card dropdown, status field on the form, Lost)
    if new.status in ('LOST','MERGED') then
      new.stage := null; new.ball_holder_id := null; new.flow_status := 'ACTIVE';
    elsif new.status = 'SITE_ON_HOLD' then
      new.flow_status := 'ON_HOLD';                       -- stage and owner stay (Rev 3: a hold keeps its stage and owner)
    elsif new.status is distinct from status_for_stage(new.stage) then
      new.stage := stage_for_status(new.status);
      new.stage_entered_at := now();
      new.ball_holder_id := default_ball_holder(new.stage, new.pm_id);
      if new.flow_status = 'AWAITING_ACCEPTANCE' then new.flow_status := 'ACTIVE'; end if;
    end if;
  end if;
  -- ALLOCATED_PM stages follow the lead PM
  if new.pm_id is distinct from old.pm_id and new.stage is not null and (select owner_rule from stages where stage_no = new.stage) = 'ALLOCATED_PM' and new.ball_holder_id is not distinct from old.ball_holder_id then
    new.ball_holder_id := new.pm_id;
  end if;
  -- no "No PM" after allocation (stage 5 onwards)
  if new.stage is not null and new.stage >= 5 and new.pm_id is null and new.status not in ('LOST','MERGED') and auth.role() = 'authenticated'
     and (new.stage is distinct from old.stage or new.pm_id is distinct from old.pm_id) then
    raise exception 'A lead project manager must be named before the Sales Handover (stage 5)';
  end if;
  return new;
end $$;
drop trigger if exists trg_sync_stage_status on projects;
create trigger trg_sync_stage_status before insert or update on projects for each row execute function sync_stage_status();

-- stage / ball / hold changes ride the 10-minute digest
create or replace function log_workflow_changes() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare who uuid := current_person_id();
begin
  if new.stage is distinct from old.stage then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by)
    values (new.id, 'stage', 'stage', (select name from stages where stage_no = old.stage), (select name from stages where stage_no = new.stage), who);
  end if;
  if new.ball_holder_id is distinct from old.ball_holder_id then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by)
    values (new.id, 'ball', 'ball_holder_id', person_name(old.ball_holder_id), person_name(new.ball_holder_id), who);
  end if;
  if new.flow_status is distinct from old.flow_status then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'flow', 'flow_status', old.flow_status, new.flow_status, who);
  end if;
  if new.coordinator_id is distinct from old.coordinator_id then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'coordinator_id', person_name(old.coordinator_id), person_name(new.coordinator_id), who);
  end if;
  if new.technical_designer_id is distinct from old.technical_designer_id then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'technical_designer_id', person_name(old.technical_designer_id), person_name(new.technical_designer_id), who);
  end if;
  if new.next_action is distinct from old.next_action or new.next_action_owner_id is distinct from old.next_action_owner_id or new.next_action_due is distinct from old.next_action_due then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by)
    values (new.id, 'next_action', 'next_action', old.next_action, coalesce(new.next_action, '—') || coalesce(' — ' || person_name(new.next_action_owner_id), '') || coalesce(' by ' || new.next_action_due::text, ''), who);
  end if;
  return null;
end $$;
drop trigger if exists trg_workflow_change_log on projects;
create trigger trg_workflow_change_log after update on projects for each row execute function log_workflow_changes();

-- ---------- handover rules ----------
-- Request: only the current ball holder, an admin, or the Project Coordinator recording on someone's behalf.
-- Accept / return: only the named next owner, an admin (override, with reason), or the coordinator with the
-- WhatsApp evidence pasted in. Acceptance moves stage and owner together.
create or replace function guard_handover() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  who uuid := current_person_id();
  mine people := me();
  p projects;
  coord boolean;
begin
  select * into p from projects where id = new.project_id;
  coord := coalesce(mine.role = 'PROJECT_COORDINATOR' or mine.can_edit_projects, false);
  if tg_op = 'INSERT' then
    if new.status in ('MIGRATED','CHECKPOINT') and auth.role() = 'authenticated' and not coalesce(mine.is_admin, false) then
      raise exception 'Only an administrator can write migration rows';
    end if;
    new.requested_by := coalesce(new.requested_by, who);
    if new.status = 'PENDING' then
      if auth.role() = 'authenticated' and not coalesce(who = p.ball_holder_id or coalesce(mine.is_admin, false) or coord, false) then
        raise exception 'Only the person holding the ball (or an administrator) can request a handover';
      end if;
      if exists (select 1 from handovers h where h.project_id = new.project_id and h.status = 'PENDING') then
        raise exception 'A handover is already awaiting acceptance on this project';
      end if;
      new.from_stage := coalesce(new.from_stage, p.stage);
      new.from_person_id := coalesce(new.from_person_id, p.ball_holder_id);
      if new.to_person_id is null then new.to_person_id := default_ball_holder(new.to_stage, p.pm_id); end if;
      if new.to_person_id is null and new.to_stage <> 17 then raise exception 'Name the next owner — nobody is set up to hold stage %', new.to_stage; end if;
      if who is distinct from p.ball_holder_id and coord and not coalesce(mine.is_admin, false) then new.recorded_by := who; end if;
      update projects set flow_status = 'AWAITING_ACCEPTANCE' where id = new.project_id and flow_status <> 'ON_HOLD';
    elsif new.status = 'OVERRIDE' then
      if auth.role() = 'authenticated' and not coalesce(mine.is_admin, false) then raise exception 'Only Tom, Aftab, Darren or Jinky can move a card without acceptance'; end if;
      if coalesce(trim(new.override_reason), '') = '' then raise exception 'Give a reason for moving the card without acceptance'; end if;
      new.override := true; new.authorised_by := coalesce(new.authorised_by, who); new.accepted_at := now();
      new.from_stage := coalesce(new.from_stage, p.stage); new.from_person_id := coalesce(new.from_person_id, p.ball_holder_id);
      if new.to_person_id is null then new.to_person_id := default_ball_holder(new.to_stage, p.pm_id); end if;
      update handovers set status = 'CANCELLED' where project_id = new.project_id and status = 'PENDING';
      update projects set stage = new.to_stage, ball_holder_id = new.to_person_id, flow_status = case when flow_status = 'ON_HOLD' then 'ON_HOLD' else 'ACTIVE' end,
        stage_migrated = false, stage_accepted_at = now(), next_action = null, next_action_owner_id = null, next_action_due = null where id = new.project_id;
    end if;
    return new;
  end if;

  -- UPDATE: PENDING → ACCEPTED / RETURNED / CANCELLED
  if old.status <> 'PENDING' then
    if auth.role() = 'authenticated' and not coalesce(mine.is_admin, false) then raise exception 'This handover is closed'; end if;
    return new;
  end if;
  if new.status = 'ACCEPTED' then
    if auth.role() = 'authenticated' then
      if who = old.to_person_id then null;
      elsif coalesce(mine.is_admin, false) then
        if coalesce(trim(new.override_reason), '') = '' and coalesce(trim(new.acceptance_evidence), '') = '' then
          raise exception 'Accepting for someone else needs either their message as evidence or an override reason';
        end if;
        if coalesce(trim(new.acceptance_evidence), '') = '' then new.override := true; new.authorised_by := who; end if;
        new.recorded_by := who;
      elsif coord then
        if coalesce(trim(new.acceptance_evidence), '') = '' then raise exception 'Paste the acceptance message as evidence when recording on someone''s behalf'; end if;
        new.recorded_by := who;
      else
        raise exception 'Only % can accept this handover', person_name(old.to_person_id);
      end if;
    end if;
    new.accepted_at := coalesce(new.accepted_at, now());
    update projects set stage = old.to_stage, ball_holder_id = old.to_person_id, flow_status = case when flow_status = 'ON_HOLD' then 'ON_HOLD' else 'ACTIVE' end,
      stage_migrated = false, stage_accepted_at = now(), next_action = null, next_action_owner_id = null, next_action_due = null where id = old.project_id;
  elsif new.status = 'RETURNED' then
    if auth.role() = 'authenticated' and not coalesce(who = old.to_person_id or coalesce(mine.is_admin, false) or coord, false) then raise exception 'Only % can return this handover', person_name(old.to_person_id); end if;
    if coalesce(trim(new.return_reason), '') = '' then raise exception 'Say why it is being returned'; end if;
    new.returned_at := now(); if who is distinct from old.to_person_id then new.recorded_by := who; end if;
    update projects set flow_status = case when flow_status = 'ON_HOLD' then 'ON_HOLD' else 'ACTIVE' end where id = old.project_id;
  elsif new.status = 'CANCELLED' then
    if auth.role() = 'authenticated' and not coalesce(who in (old.requested_by, old.from_person_id) or coalesce(mine.is_admin, false) or coord, false) then raise exception 'Only the requester can withdraw a handover'; end if;
    update projects set flow_status = case when flow_status = 'ON_HOLD' then 'ON_HOLD' else 'ACTIVE' end where id = old.project_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_handover on handovers;
create trigger trg_guard_handover before insert or update on handovers for each row execute function guard_handover();

-- handover events go into the digest; the next owner is a recipient (notify.ts)
create or replace function log_handover() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare who uuid := current_person_id(); nm text := (select name from stages where stage_no = new.to_stage);
begin
  if tg_op = 'INSERT' and new.status = 'PENDING' then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, 'handover_requested', nm, person_name(new.from_person_id), person_name(new.to_person_id), who);
  elsif tg_op = 'INSERT' and new.status = 'OVERRIDE' then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, 'handover_override', nm, person_name(new.from_person_id), person_name(new.to_person_id) || ' — ' || new.override_reason, who);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'ACCEPTED' then
      insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, case when new.override then 'handover_override' else 'handover_accepted' end, nm, person_name(new.from_person_id), person_name(new.to_person_id) || coalesce(' — recorded by ' || person_name(new.recorded_by), ''), who);
    elsif new.status = 'RETURNED' then
      insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, 'handover_returned', nm, person_name(new.to_person_id), new.return_reason, who);
    elsif new.status = 'CANCELLED' then
      insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, 'handover_cancelled', nm, person_name(new.to_person_id), null, who);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_log_handover on handovers;
create trigger trg_log_handover after insert or update on handovers for each row execute function log_handover();

-- ---------- hold rules ----------
create or replace function guard_hold() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare who uuid := current_person_id(); mine people := me(); p projects;
begin
  select * into p from projects where id = new.project_id;
  if tg_op = 'INSERT' then
    if auth.role() = 'authenticated' and not coalesce(who = p.ball_holder_id or mine.is_admin or mine.can_edit_projects or mine.role = 'PROJECT_COORDINATOR', false) then
      raise exception 'Only the person holding the ball (or an administrator) can put a project on hold';
    end if;
    new.created_by := coalesce(new.created_by, who);
    update projects set flow_status = 'ON_HOLD' where id = new.project_id;
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, 'hold', coalesce(person_name(new.waiting_on_person_id), new.waiting_on), null, new.reason || coalesce(' — ' || new.required_action, '') || coalesce(' by ' || new.action_due::text, ''), who);
    return new;
  end if;
  if new.released_at is not null and old.released_at is null then
    if auth.role() = 'authenticated' and not coalesce(who in (p.ball_holder_id, old.created_by) or mine.is_admin or mine.can_edit_projects or mine.role = 'PROJECT_COORDINATOR', false) then
      raise exception 'Only the person holding the ball (or an administrator) can release a hold';
    end if;
    new.released_by := coalesce(new.released_by, who);
    update projects set flow_status = case when exists (select 1 from handovers h where h.project_id = new.project_id and h.status = 'PENDING') then 'AWAITING_ACCEPTANCE' else 'ACTIVE' end where id = new.project_id;
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, 'hold_released', null, new.reason, new.release_note, who);
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_hold on holds;
create trigger trg_guard_hold before insert or update on holds for each row execute function guard_hold();

-- evidence / tasks: stamp who
create or replace function stamp_by() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
begin
  if tg_table_name = 'stage_evidence' then new.by := coalesce(current_person_id(), new.by); new.at := now();
  elsif tg_table_name = 'project_tasks' then if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, current_person_id()); end if;
  elsif tg_table_name = 'reassignments' then new.authorised_by := coalesce(new.authorised_by, current_person_id());
  elsif tg_table_name = 'stage_owners' then new.set_by := current_person_id(); new.set_at := now(); end if;
  return new;
end $$;
drop trigger if exists trg_stamp_evidence on stage_evidence;
create trigger trg_stamp_evidence before insert or update on stage_evidence for each row execute function stamp_by();
drop trigger if exists trg_stamp_task on project_tasks;
create trigger trg_stamp_task before insert on project_tasks for each row execute function stamp_by();
drop trigger if exists trg_stamp_reassignment on reassignments;
create trigger trg_stamp_reassignment before insert on reassignments for each row execute function stamp_by();
drop trigger if exists trg_stamp_stage_owner on stage_owners;
create trigger trg_stamp_stage_owner before insert or update on stage_owners for each row execute function stamp_by();

-- ---------- row security ----------
alter table stages         enable row level security;
alter table stage_owners   enable row level security;
alter table stage_targets  enable row level security;
alter table handovers      enable row level security;
alter table holds          enable row level security;
alter table stage_evidence enable row level security;
alter table project_tasks  enable row level security;
alter table reassignments  enable row level security;
create policy read_all on stages         for select to authenticated using (true);
create policy read_all on stage_owners   for select to authenticated using (true);
create policy read_all on stage_targets  for select to authenticated using (true);
create policy read_all on handovers      for select to authenticated using (true);
create policy read_all on holds          for select to authenticated using (true);
create policy read_all on stage_evidence for select to authenticated using (true);
create policy read_all on project_tasks  for select to authenticated using (true);
create policy read_all on reassignments  for select to authenticated using (true);
create policy write_admin on stages        for all to authenticated using (is_admin()) with check (is_admin());
create policy write_team_mgr on stage_owners  for all to authenticated using ((me()).can_manage_team) with check ((me()).can_manage_team);
create policy write_team_mgr on stage_targets for all to authenticated using ((me()).can_manage_team) with check ((me()).can_manage_team);
-- the triggers above hold the real rules; anyone on the team may write, the trigger decides
create policy write_team on handovers      for all to authenticated using (current_person_id() is not null) with check (current_person_id() is not null);
create policy write_team on holds          for all to authenticated using (current_person_id() is not null) with check (current_person_id() is not null);
create policy write_team on stage_evidence for all to authenticated using (current_person_id() is not null) with check (current_person_id() is not null);
create policy write_team on project_tasks  for all to authenticated using (current_person_id() is not null) with check (current_person_id() is not null);
create policy write_admin on reassignments for all to authenticated using (is_admin() or (me()).can_manage_team) with check (is_admin() or (me()).can_manage_team);
grant all on stages, stage_owners, stage_targets, handovers, holds, stage_evidence, project_tasks, reassignments to authenticated, service_role;

-- estimators: QUOTE rows may now also go to stage 3 (Won → Award / contract) — status_for_stage(3) is DESIGN_DRAWINGS, already allowed.

-- ---------- migration of existing cards (plan §3) ----------
-- Every card gets a stage and a ball holder from its status; stage_migrated marks it "set by migration — not yet
-- accepted" until its owner accepts it on the reconciliation screen. Reversible: stage/ball/flow columns are new.
alter table projects disable trigger trg_workflow_change_log;   -- no digest for the migration itself
update projects p set
  stage = case p.status when 'QUOTE' then case when p.quote_stage = 'SUBMITTED' then 2 else 1 end
                        when 'DESIGN_DRAWINGS' then 8 when 'PROD_DRAWINGS' then 9 when 'PRODUCTION' then 11
                        when 'INSTALLATION' then 14 when 'SNAGGING' then 15 when 'COMPLETED' then 17 else null end,
  flow_status = case when p.status = 'SITE_ON_HOLD' then 'ON_HOLD' else 'ACTIVE' end,
  stage_migrated = p.status not in ('COMPLETED','LOST','MERGED'),
  stage_entered_at = coalesce((select max(h.changed_at) from status_history h where h.project_id = p.id), p.created_at)
where p.stage is null;
update projects p set ball_holder_id = default_ball_holder(p.stage, p.pm_id) where p.stage is not null and p.ball_holder_id is null;
-- Site on hold cards: stage unknown (null) until Anne and Jinky reconcile; the hold record carries the old column's meaning
alter table holds disable trigger trg_guard_hold;
insert into holds(project_id, reason, blocked_since, created_by)
select p.id, 'Site on hold (carried over from the old board column — stage to be confirmed at reconciliation)', coalesce((select max(h.changed_at) from status_history h where h.project_id = p.id), p.created_at), null
from projects p where p.status = 'SITE_ON_HOLD' and p.deleted_at is null and not exists (select 1 from holds h where h.project_id = p.id and h.released_at is null);
alter table holds enable trigger trg_guard_hold;
-- history: one MIGRATED row per live card so nobody wonders why stages 3–7 are missing
insert into handovers(project_id, from_stage, to_stage, to_person_id, status, requested_at, accepted_at, note)
select p.id, null, p.stage, p.ball_holder_id, 'MIGRATED', p.stage_entered_at, p.stage_entered_at,
  'Stage set by migration from status ' || p.status::text || ' on ' || to_char(now(), 'DD Mon YYYY') || '. Stages 3–7 (award, allocation, sales handover, kick-off) are pre-workflow for this project and were not recorded.'
from projects p where p.stage is not null and p.status not in ('LOST','MERGED') and p.deleted_at is null
  and not exists (select 1 from handovers h where h.project_id = p.id);
alter table projects enable trigger trg_workflow_change_log;

-- ---------- projects_live ----------
-- NOTE: the migration tool refuses `drop view`; run the drop + create via execute_sql (016c).
