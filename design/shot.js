const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--headless=new']}); 
 for (const f of ['direction-a-navy','direction-b-studio']) {
  const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">'+require('fs').readFileSync(f+'.html','utf8')+'</body></html>';
  for (const [w,h,tag] of [[1400,860,'desk'],[400,820,'phone']]) {
   const p=await b.newPage({viewport:{width:w,height:h}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
   await p.setContent(html,{waitUntil:'load',timeout:15000}); await p.waitForTimeout(800);
   await p.screenshot({path:`${f}-${tag}.png`}); 
   const sw = await p.evaluate(()=>document.documentElement.scrollWidth); console.log(f,tag,'scrollWidth',sw,'errors',errs);
   if(tag==='desk'){ await p.click('.tab[data-view=list]'); await p.waitForTimeout(300); await p.screenshot({path:`${f}-list.png`}); await p.click('tr[data-id]'); await p.waitForTimeout(300); await p.screenshot({path:`${f}-detail.png`}); }
   await p.close(); }
 } await b.close(); })();
