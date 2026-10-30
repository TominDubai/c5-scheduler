// Who gets emailed, and what the email says. Pure-function tests for src/lib/notify.ts.
//
// Run from the app directory:
//   npx esbuild src/lib/notify.ts --bundle --platform=node --format=cjs --alias:@=./src \
//     --external:@supabase/supabase-js --outfile=.notify-test.cjs && node tests/notify-recipients.cjs; rm -f .notify-test.cjs
//
// The cases that matter: a signed quote reaches CD management even though nobody is assigned to the
// project yet, an ordinary edit does NOT reach them, and nobody is told about their own action.
const { recipients, describe, isAward } = require(require('path').join(__dirname, '..', '.notify-test.cjs'));
const P = (id, name, award = false) => [id, { id, name, full_name: name, email: `${name.toLowerCase()}@concept-5.com`, is_active: true, notify_on_award: award }];
const people = new Map([P('basim','BASIM',true), P('aftab','AFTAB',true), P('jinky','JINKY',true), P('darren','DARREN',true), P('tom','TOM',true),
                        P('ramus','RAMUS'), P('ankita','ANKITA'), P('gaj','GAJANAND'), P('sunil','SUNIL')]);
const names = (rs) => rs.map(r => r.name).sort().join(', ') || '(nobody)';
const ch = (o) => ({ id: 1, project_id: 'p1', meeting_id: null, kind: 'field', field: null, old_value: null, new_value: null, changed_by: null, changed_at: new Date().toISOString(), ...o });

let fail = 0;
const t = (label, got, want) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got:  ${got}${ok ? '' : `\n      want: ${want}`}`); };

// 1. Ramus marks a quote won. Nobody assigned yet.
const quote = { id:'p1', enquiry_no:'26-200', name:'MEADOWS 5', client:'SANA', status:'DESIGN_DRAWINGS', pm_id:null, pm2_id:null, designer_id:null, estimator_id:'ramus', signed_quote:450000 };
const award = [ch({ field:'status', old_value:'QUOTE', new_value:'DESIGN_DRAWINGS', changed_by:'ramus' })];
t('award -> CD management, not Ramus himself', names(recipients(quote, award, people, new Set())), 'AFTAB, BASIM, DARREN, JINKY, TOM');
t('award wording', describe(award[0], quote), 'Signed — AED 450,000. Now at Design drawings. Still needs a project manager and a designer.');

// 2. Same award, but Jinky is the one who clicked Won -> she is not told about her own action
t('award by Jinky excludes Jinky', names(recipients(quote, [ch({ field:'status', old_value:'QUOTE', new_value:'DESIGN_DRAWINGS', changed_by:'jinky' })], people, new Set())), 'AFTAB, BASIM, DARREN, TOM');

// 3. Team assigned + two people tagged; an ordinary later change
const live = { ...quote, pm_id:'basim', designer_id:'ankita' };
const edit = [ch({ field:'target_date', old_value:'2026-11-01', new_value:'2026-12-01', changed_by:'basim' })];
t('ordinary change -> team + tagged, not the editor', names(recipients(live, edit, people, new Set(['gaj','darren']))), 'ANKITA, DARREN, GAJANAND');
t('no award spam on an ordinary change', recipients(live, edit, people, new Set()).some(r => r.name === 'TOM'), false);

// 4. Award once the team is already on it -> no "still needs" tail
t('award wording when staffed', describe(award[0], live), 'Signed — AED 450,000. Now at Design drawings.');

// 5. Lost quote is not an award
t('lost is not an award', isAward(ch({ field:'status', old_value:'QUOTE', new_value:'LOST' })), false);
t('quote-stage change is not an award', isAward(ch({ field:'quote_stage', old_value:'QUOTE', new_value:'SUBMITTED' })), false);

// 6. Tagging someone reads properly in the digest
t('watcher added wording', describe(ch({ kind:'watcher_added', field:'watcher', new_value:'GAJANAND' })), 'Gajanand is now kept updated on this project');

// 7. Payment events (db/023): Installation -> the 45% list; Completed -> the final-invoice list (incl. Veronica)
const pay = new Map([...people, ['jean', { id:'jean', name:'JEAN', full_name:'Jean', email:'jean@concept-5.com', is_active:true, notify_on_award:false, notify_progress_invoice:true, notify_final_invoice:true }],
                                ['vero', { id:'vero', name:'VERONICA', full_name:'Veronica', email:'veronica@concept-5.com', is_active:true, notify_on_award:false, notify_progress_invoice:false, notify_final_invoice:true }]]);
for (const n of ['tom','aftab','jinky','darren','basim']) { pay.get(n).notify_progress_invoice = true; pay.get(n).notify_final_invoice = true; }
const installed = { ...live, status:'INSTALLATION', stage:14, project_value:1150000, vo_count:2, pm:'RICHARD' };
const prog = [ch({ kind:'payment_progress', field:'stage', old_value:'Dispatch', new_value:'Installation', changed_by:'gaj' })];
t('installation -> Jean + CC list + team, not Veronica', names(recipients(installed, prog, pay, new Set())), 'AFTAB, ANKITA, BASIM, DARREN, JEAN, JINKY, TOM');
t('progress wording', describe(prog[0], installed), 'PAYMENT — reached Installation: progress invoice (45%) due to the client. Project value AED 1,150,000 incl. 2 VOs. PM Richard.');
const done = { ...installed, status:'COMPLETED', stage:17 };
const fin = [ch({ kind:'payment_final', field:'stage', old_value:'Snagging and client handover', new_value:'Completed', changed_by:'basim' })];
t('completed -> Jean + Veronica + CC list, not Basim who moved it', names(recipients(done, fin, pay, new Set())), 'AFTAB, ANKITA, DARREN, JEAN, JINKY, TOM, VERONICA');
t('an ordinary edit does not reach Jean or Veronica', recipients(installed, edit, pay, new Set()).some(r => r.name === 'JEAN' || r.name === 'VERONICA'), false);

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
