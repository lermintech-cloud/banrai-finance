// ทดสอบตรรกะของต้นแบบหน้าจอ (ไม่ต้องใช้เบราว์เซอร์): node tests/prototype/logic.test.cjs
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../../apps/web/public/index.html'),'utf8');
const js=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
const els=global.els={};
const mk=()=>{const form={onsubmit:null};return {innerHTML:'',value:'',textContent:'',style:{},dataset:{},className:'',select(){},querySelector(){return form},showModal(){},close(){}}};
global.document={querySelector:s=>els[s]||(els[s]=mk()),querySelectorAll:()=>[],documentElement:mk(),execCommand:()=>false};
global.documentElement=null;
global.dlg=els['#dlg']=mk();
global.localStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]}};
global.location={hash:''};global.matchMedia=()=>({matches:false,addEventListener(){}});global.addEventListener=()=>{};global.scrollTo=()=>{};
document.documentElement.style={setProperty(){}};
const test=`
;const out=[];const ok=(c,m)=>out.push((c?'PASS ':'FAIL ')+m);
const T=[];toast=(m,e)=>T.push((e?'E:':'')+m);
let MV={};modal=(t,b,cb)=>{MV.r=cb(MV.v)};
const b0=bal('f1');
const it={id:'t1',fund:'f1',date:'2026-11-13',party:'x',desc:'ทดสอบ',amt:100000,method:'โอน',proj:'',status:'draft',by:'fin'};S.exp.push(it);
S.user='fin';act('exp','t1','submit');ok(it.status=='submitted','fin submits');
act('exp','t1','review');ok(it.status=='submitted','fin cannot review');
S.user='acc';act('exp','t1','review');ok(it.status=='reviewed','acc reviews');
act('exp','t1','approve');ok(it.status=='reviewed','acc cannot approve');
S.user='dir';act('exp','t1','approve');ok(it.status=='approved','director approves');
ok(commit('f1')==642000+100000,'commitment counted');
S.user='fin';act('exp','t1','pay');ok(it.status=='paid'&&bal('f1')==b0-100000,'pay posts once');
const n=S.led.length;act('exp','t1','pay');ok(S.led.length==n,'no double post');
const it2={...it,id:'t2',status:'submitted',by:'acc'};S.exp.push(it2);S.user='acc';act('exp','t2','review');ok(it2.status=='submitted','no self review');
const it3={...it,id:'t3',amt:bal('f4')+1,fund:'f4',status:'approved',by:'fin'};S.exp.push(it3);S.user='fin';act('exp','t3','pay');ok(it3.status=='approved','overspend blocked');
const inc={id:'i1',fund:'f1',date:'2026-11-13',party:'p',desc:'d',amt:50000,method:'โอน',status:'draft',by:'fin'};S.inc.push(inc);
S.user='acc';act('inc','i1','confirm');ok(inc.status=='posted'&&!!inc.no,'income confirm + receipt no');
MV={v:{why:'ทดสอบ'}};S.user='acc';act('exp','t1','reverse');ok(it.status=='reversed'&&bal('f1')==b0+50000,'reverse restores balance');
ok(thb(2100)=='ยี่สิบเอ็ดบาทถ้วน'&&thb(1100)=='สิบเอ็ดบาทถ้วน'&&thb(10001)=='หนึ่งร้อยบาทหนึ่งสตางค์','thai baht text');
S.user='dir';MV={v:{name:'เงินทดสอบ',amt:'1234.50'}};const nf=S.funds.length;addFund();
ok(S.funds.length==nf+1&&bal(S.funds[nf].id)==123450,'addFund opening balance');
ok(S.banks.some(k=>k.fund==S.funds[nf].id),'bank account created');
MV={v:{name:'เงินทดสอบ',amt:'0'}};addFund();ok(String(MV.r).includes('มีอยู่แล้ว'),'duplicate fund rejected');
MV={v:{name:'อื่น',amt:'12.345'}};addFund();ok(String(MV.r).includes('ทศนิยม'),'bad amount rejected');
S.user='fin';MV={v:{name:'โครงการทดสอบ',fund:'f1',amt:'5000'}};const np=S.projects.length;addProj();ok(S.projects.length==np+1&&S.projects[np].bs==500000,'addProj');
S.user='acc';T.length=0;addProj();ok(T.some(x=>x.startsWith('E:')),'acc cannot addProj');
S.user='fin';T.length=0;addFund();ok(T.some(x=>x.startsWith('E:')),'fin cannot addFund');
document.querySelector('#rs');document.querySelector('#er');document.querySelector('#rsb');
S.user='dir';const snap=JSON.parse(JSON.stringify(S));
els['#rs'].value=JSON.stringify({app:'banrai-finance',v:5,data:snap});
restoreBk();ok(RSARM==1,'restore asks confirmation');restoreBk();ok(RSARM==0&&S.funds.length==snap.funds.length&&S.user=='dir','restore applied');
const bad=JSON.parse(JSON.stringify(snap));bad.inc[0].id="x');alert(1);('";els['#rs'].value=JSON.stringify({app:'banrai-finance',data:bad});RSARM=0;restoreBk();ok(RSARM==0&&els['#er'].textContent.includes('ไม่ใช่'),'tampered id rejected');
const bad2=JSON.parse(JSON.stringify(snap));bad2.funds[0].c='red" onmouseover="x';els['#rs'].value=JSON.stringify({app:'banrai-finance',data:bad2});restoreBk();ok(els['#er'].textContent.includes('ไม่ใช่'),'tampered color rejected');
const bad3=JSON.parse(JSON.stringify(snap));bad3.exp[0].status='constructor';els['#rs'].value=JSON.stringify({app:'banrai-finance',data:bad3});restoreBk();ok(els['#er'].textContent.includes('ไม่ใช่'),'bad status rejected');
els['#rs'].value='{{';restoreBk();ok(els['#er'].textContent.includes('อ่านข้อมูลไม่ได้'),'bad json handled');
S.user='fin';els['#rs'].value=JSON.stringify({app:'banrai-finance',data:snap});restoreBk();ok(els['#er'].textContent.includes('เฉพาะผู้อำนวยการ'),'fin cannot restore');
let bp=0;for(const u of ['fin','acc','dir','aud'])for(const k of Object.keys(P)){S.user=u;try{P[k]();}catch(e){bp++;ok(false,u+':'+k+' '+e.message)}}
ok(bp==0,'all '+Object.keys(P).length+' pages render for 4 roles');
for(const t of ['rc','pv','mm']){D.type=t;D.sel=null;D.id=null;dsync();ok(sheet().includes('class="sheet"'),'sheet '+t)}

// ---- settings consolidation
S.user='fin';const nLog=S.log.length;
ok(cfgApply({school:'โรงเรียนบ้านไร่',addr:'อ.ดอยเต่า',area:'สพป.',dept:'ส่วนราชการ',to:'ผอ.',logo:'1',mmBy:'dir',n_fin:'นายทดสอบ <b>x</b>',p_fin:'การเงิน',n_acc:'',p_acc:'บัญชี',n_dir:'นางผู้อำนวยการ',p_dir:'ผอ.'})===undefined,'fin can save doc settings');
ok(CF().sg.fin.n.includes('<b>')&&S.log.length==nLog+1&&S.log[0].a=='แก้ไขตั้งค่าเอกสาร'&&!S.log[0].ref.includes('นายทดสอบ'),'saved + audit logged without names');
const nl2=S.log.length;cfgApply({school:'โรงเรียนบ้านไร่',addr:'อ.ดอยเต่า',area:'สพป.',dept:'ส่วนราชการ',to:'ผอ.',logo:'1',mmBy:'dir',n_fin:'นายทดสอบ <b>x</b>',p_fin:'การเงิน',n_acc:'',p_acc:'บัญชี',n_dir:'นางผู้อำนวยการ',p_dir:'ผอ.'});ok(S.log.length==nl2,'no change -> no audit entry');
ok(String(cfgApply({school:'',addr:'a',area:'a',dept:'a',to:'a'})).includes('ครบ'),'blank org field rejected');
S.user='acc';ok(String(cfgApply({school:'x',addr:'a',area:'a',dept:'a',to:'a'})).includes('เฉพาะ'),'acc cannot save doc settings');
S.user='aud';ok(!can('docset'),'auditor cannot');S.user='dir';ok(can('docset'),'director can');
S.user='fin';D.type='mm';D.sel=null;D.id=null;dsync();
let h=sheet();ok(h.includes('&lt;b&gt;x&lt;/b&gt;')===false&&!h.includes('<b>x</b>'),'memo: signer escaped (mmBy=dir shows director)');
ok(h.includes('นางผู้อำนวยการ')&&h.includes('ผอ.'),'memo uses signer from settings');
D.type='rc';D.sel=null;D.id=null;dsync();h=sheet();ok(h.includes('&lt;b&gt;x&lt;/b&gt;')&&!h.includes('<b>x</b>x')&&h.includes('ผู้รับเงิน')&&h.includes('ผู้ตรวจสอบ'),'receipt uses fin signer, escaped');
D.type='pv';D.sel=null;D.id=null;dsync();h=sheet();ok(h.includes('นางผู้อำนวยการ')&&h.includes('ผู้อนุมัติ'),'voucher shows approver from settings');
ok(CF().logo===true&&sheet().includes('<img src='),'logo toggle on');
cfgApply({school:'โรงเรียนบ้านไร่',addr:'a',area:'a',dept:'a',to:'a',logo:'',mmBy:'zzz'});ok(CF().logo===false&&CF().mmBy=='fin'&&!sheet().includes('<img src='),'logo off + bad mmBy -> fin');
// page setup
ok(pgIsStd(),'page setup starts at standard');
ok(String(savePG({t:'1.5',b:'2',l:'3',r:'abc',fs:'16',lh:'1.15'})).includes('ตัวเลข'),'bad margin rejected');
ok(String(savePG({t:'9',b:'2',l:'3',r:'2',fs:'16',lh:'1.15'})).includes('ตัวเลข'),'margin > 8 rejected');
ok(String(savePG({t:'8',b:'8',l:'8',r:'8',fs:'16',lh:'1.15'})).includes('กว้าง'),'margins too large rejected');
ok(String(savePG({t:'1.5',b:'2',l:'3',r:'2',fs:'99',lh:'1.15'})).includes('เลือก'),'bad font size rejected');
ok(savePG({t:'2',b:'2',l:'3.5',r:'2',fs:'18',lh:'1.3'})===undefined&&PG.l==3.5&&PG.fs==18&&!pgIsStd()&&sheet().includes('padding:2cm 2cm 2cm 3.5cm;font-size:18pt;line-height:1.3'),'custom page setup applied to sheet');
ok(JSON.parse(localStorage.getItem('banrai-page')).fs==18,'page setup persisted');
S.user='aud';ok(savePG({...STD,t:'1.5',b:'2',l:'3',r:'2',fs:'16',lh:'1.15'})===undefined&&pgIsStd(),'any role can reset page setup (per-device)');
// settings page + doc page render
for(const u of ['fin','acc','dir','aud']){S.user=u;const st=P.set();ok(st.includes('เอกสารและผู้ลงนาม')&&(u=='fin'||u=='dir'?!st.includes('<fieldset disabled'):st.includes('<fieldset disabled')),'settings form for '+u)}
S.user='fin';D.type='mm';const dp=P.doc();
ok(!dp.includes('name="signer"')&&!dp.includes('dm(')&&!dp.includes('name="fs"')&&dp.includes('openPage()')&&dp.includes('ตั้งค่าหน้ากระดาษ'),'doc panel: page-setup controls hidden behind one button');
ok(!dp.includes('ตำแหน่ง</label>')&&dp.includes('href="#set"')&&dp.includes("แก้ไขในเมนู ตั้งค่า"),'doc panel: signer/position moved to settings');
// local date
ok(ld().length==10&&ld().split('-').length==3&&ld(new Date(2026,10,13,0,30))=='2026-11-13'&&ld(new Date(2026,0,5,23,59))=='2026-01-05','ld uses local date');
// restore keeps/sanitizes cfg
S.user='dir';const sn=JSON.parse(JSON.stringify(S));sn.cfg={school:'โรงเรียนใหม่',mmBy:'evil',logo:'yes',sg:{fin:{n:'ก',p:5}},__proto__:{x:1}};
els['#rs'].value=JSON.stringify({app:'banrai-finance',data:sn});RSARM=0;restoreBk();restoreBk();
ok(CF().school=='โรงเรียนใหม่'&&CF().mmBy=='fin'&&CF().logo===true&&CF().sg.fin.n=='ก'&&CF().sg.fin.p=='เจ้าหน้าที่การเงิน'&&CF().dept.length>0,'restore sanitizes cfg');
const sn2=JSON.parse(JSON.stringify(S));sn2.cfg='x';els['#rs'].value=JSON.stringify({app:'banrai-finance',data:sn2});RSARM=0;restoreBk();ok(els['#er'].textContent.includes('ไม่ใช่'),'non-object cfg rejected');
const sn3=JSON.parse(JSON.stringify(S));delete sn3.cfg;els['#rs'].value=JSON.stringify({app:'banrai-finance',data:sn3});RSARM=0;restoreBk();restoreBk();ok(!!CF().sg.fin&&CF().school.length>0,'old backup without cfg restores with defaults');
ok(CRRE.test('data:image/png;base64,AAAA')&&!CRRE.test('data:image/svg+xml;base64,AAAA')&&!CRRE.test('data:image/png;base64,AA" onerror="x'),'crut data-url validation');

ok(JSON.stringify(parseSel('1-2+3',11))=='[1,2,3]'&&JSON.stringify(parseSel('3, 1 5-4',11))=='[1,3,4,5]'&&parseSel('0',11)===null&&parseSel('1-99',11)===null&&parseSel('a',11)===null&&parseSel('',11)===null,'parseSel 1-2+3');
ok(JSON.stringify(parseSel('๑-๒+๓',11))=='[1,2,3]','parseSel thai digits');
for(const t of TPL){D.type=t[0];D.id=null;D.sel=null;const pg=curPages();ok(pg.length>=1&&pg.every(x=>typeof x=='string'&&x.length>50),'template renders: '+t[0])}
B.on=BK.map(x=>x[0]);B.order=BK.map(x=>x[0]);B.pn=true;B.month='2026-11';let bb=bookBuild();
ok(bb.out.length>=BK.length-1&&!bb.out[0].includes('class="pn"')&&bb.out[1].includes('- 1 -'),'book: cover unnumbered, numbering starts after cover');
ok(bb.out[1].includes('สารบัญ')&&bb.out[1].includes('ทะเบียนคุมเงิน'),'book: toc lists sections');
ok(bb.out.filter(x=>x.includes('class="pn"')).length==bb.out.length-1,'book: every page after cover numbered');
B.on=['sum'];ok(bookBuild().out.length==1,'book: single selection');B.on=[];ok(bookBuild().out.length==0,'book: empty selection');
B.pn=false;B.on=['sum','proj'];ok(!bookBuild().out.join('').includes('class="pn"'),'book: page numbers off');
B.order=['proj','sum'].concat(BK.map(x=>x[0]).filter(k=>k!='proj'&&k!='sum'));bb=bookBuild();ok(bb.out[0].includes('โครงการ')&&bb.secs[0].k=='proj','book: order follows list');
{const ms=months(),tot=S.funds.reduce((a,f)=>a+bal(f.id),0);ok(ms.length==12&&ms[11].bal==tot,'months: running balance ends at ledger total')}
{const many=[];for(let i=0;i<70;i++)many.push(['a','b','c']);const pp=rpt('t','s',[['x'],['y'],['z']],many,['','','']);ok(pp.length>=3&&pp.every(x=>(x.match(/<tr>/g)||[]).length<=rowsPer()+2)&&pp[pp.length-1].includes('ลงชื่อ')&&!pp[0].includes('ลงชื่อ'),'report paginates long tables')}
ok(['dash','all','inc','exp','led','aud','bud','proj','bank','rep','usr','set','doc','book'].every(k=>{S.user='dir';const h=P[k]();return typeof h=='string'&&h.length>200&&!h.includes('undefined')}),'all pages render without undefined');
ok(NAV.every(g=>g[3].length==3&&g[3].every(k=>P[k]&&PGS[k])),'menu: 4 groups x 3, all wired');

return out.join('\\n');`;
const res=new Function(js+test)();const fail=res.split('\n').filter(l=>l.startsWith('FAIL'));console.log(res);console.log('\n'+(res.split('\n').length-fail.length)+' passed, '+fail.length+' failed');setTimeout(()=>process.exit(fail.length?1:0),50);
