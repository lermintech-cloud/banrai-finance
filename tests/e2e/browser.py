# Browser test of the whole system (optional; needs Python Playwright and a Chromium/Chrome).
# Start two local servers first, in two terminals, from the project folder:
#   LOCAL_PASSWORD=Local-test-2570x PORT=8788 node --experimental-strip-types tests/e2e/local-server.ts --seed
#   LOCAL_PASSWORD=Local-test-2570x PORT=8789 node --experimental-strip-types tests/e2e/local-server.ts
# then:  python3 tests/e2e/browser.py        (set CHROME=/path/to/chrome to use an installed browser)
# Restart the servers before each run: the test changes data. The password above is a throwaway for this local test only.
from playwright.sync_api import sync_playwright
import os,tempfile
PW='Local-test-2570x';R=[];SP=tempfile.mkdtemp()+'/'
CHROME=os.environ.get('CHROME')
def ok(c,m):R.append(('PASS ' if c else 'FAIL ')+m)
def login(page,u,pw=PW):
    page.fill('input[name=username]',u);page.fill('input[name=password]',pw);page.click('#lf button');page.wait_for_timeout(700)
def ctx(b,base):
    c=b.new_context(viewport={'width':1300,'height':900},base_url=base);p=c.new_page();p.errs=[]
    p.on('pageerror',lambda e:p.errs.append(str(e)));p.on('console',lambda m:p.errs.append(m.text) if m.type=='error' and 'fonts' not in m.text and 'status of 4' not in m.text and 'ERR_' not in m.text else None)
    p.goto('/');p.wait_for_timeout(600);return p
def modal_ok(page):
    page.click('#mb2');page.click('#mb2');page.wait_for_timeout(900)
import atexit
atexit.register(lambda:print('\n'.join(R)+'\n'+str(sum(r.startswith('PASS') for r in R))+' pass '+str(sum(r.startswith('FAIL') for r in R))+' fail'))
with sync_playwright() as pw:
    b=pw.chromium.launch(**({'executable_path':CHROME} if CHROME else {}))
    A='http://localhost:8788'
    fin=ctx(b,A)
    ok(fin.is_visible('#lf') and not fin.is_visible('aside'),'unauthenticated visitor sees only the sign-in page')
    fin.screenshot(path=SP+'e2e_login.png')
    login(fin,'dev.finance','wrong-password-1');ok('ไม่ถูกต้อง' in fin.inner_text('#ler'),'wrong password message')
    login(fin,'dev.finance');ok(fin.is_visible('aside') and '728,950.00' in fin.inner_text('.hb'),'finance signs in; balance comes from the database')
    ok(fin.evaluate("localStorage.getItem('banrai-fin-v5')") is None,'server data is not copied into localStorage')
    ok('สมชาย' in fin.inner_text('#bar') and fin.locator('#bar select').count()==0,'bar shows the signed-in user, no role switcher')
    # create expense through UI
    fin.goto('/#exp');fin.wait_for_timeout(300);fin.click('text=+ สร้างคำขอเบิก');fin.fill('input[name=party]','ร้านอีทูอี');fin.fill('input[name=desc]','ค่าทดสอบครบวงจร');fin.fill('input[name=amt]','2500.75');modal_ok(fin)
    ok('ค่าทดสอบครบวงจร' in fin.inner_text('#main') and 'ฐานข้อมูลกลาง' in fin.inner_text('#toast'),'expense draft saved to the database with confirmation')
    row=lambda p:p.locator('tr',has_text='ค่าทดสอบครบวงจร')
    row(fin).locator('button:has-text("ส่งตรวจ")').click();fin.click('#cb2');fin.wait_for_timeout(900)
    ok('รอตรวจ' in row(fin).inner_text(),'submitted')
    acc=ctx(b,A);login(acc,'dev.accountant');acc.goto('/#exp');acc.wait_for_timeout(400)
    ok('ค่าทดสอบครบวงจร' in acc.inner_text('#main'),'another user on another browser sees the same record')
    row(acc).locator('button:has-text("ตรวจผ่าน")').click();acc.click('#cb2');acc.wait_for_timeout(900)
    dr=ctx(b,A);login(dr,'dev.director');dr.goto('/#exp');dr.wait_for_timeout(400)
    row(dr).locator('button:has-text("อนุมัติ")').first.click();dr.click('#cb2');dr.wait_for_timeout(900)
    ok('อนุมัติแล้ว' in row(dr).inner_text(),'director approved')
    ok(row(dr).locator('button:has-text("บันทึกจ่าย")').count()==0,'director has no pay button')
    fin.click('text=โหลดใหม่');fin.wait_for_timeout(900);row(fin).locator('button:has-text("บันทึกจ่าย")').click();fin.click('#cb2');fin.wait_for_timeout(1000)
    ok('จ่ายแล้ว' in row(fin).inner_text() and 'จ.70/' in row(fin).inner_text(),'paid, voucher number issued by the server')
    fin.goto('/#dash');fin.wait_for_timeout(400);ok('726,449.25' in fin.inner_text('.hb'),'balance dropped by exactly 2,500.75')
    # stale action: accountant tries to act on old screen
    # reverse by accountant with reason
    acc.click('text=โหลดใหม่');acc.wait_for_timeout(900);row(acc).locator('button:has-text("กลับรายการ")').click();acc.fill('input[name=why]','ทดสอบกลับรายการ');modal_ok(acc)
    ok('กลับรายการ' in row(acc).locator('.b').inner_text(),'reversed with reason')
    acc.goto('/#dash');acc.wait_for_timeout(400);ok('728,950.00' in acc.inner_text('.hb'),'balance restored after reversal')
    # separation of duties surfaced
    fin.goto('/#inc');fin.wait_for_timeout(300);fin.click('text=+ บันทึกรับเงิน');fin.fill('input[name=party]','ผู้ปกครอง');fin.fill('input[name=desc]','เงินบริจาคทดสอบ');fin.fill('input[name=amt]','100');modal_ok(fin)
    ok(fin.locator('tr',has_text='เงินบริจาคทดสอบ').locator('button').count()==0,'finance cannot confirm own receipt')
    acc.goto('/#inc');acc.wait_for_timeout(400);acc.locator('tr',has_text='เงินบริจาคทดสอบ').locator('button:has-text("ยืนยันรับเงิน")').click();acc.click('#cb2');acc.wait_for_timeout(900)
    ok('ร.70/' in acc.locator('tr',has_text='เงินบริจาคทดสอบ').inner_text(),'receipt confirmed, number issued')
    # overspend error message
    fin.goto('/#exp');fin.wait_for_timeout(300);fin.click('text=+ สร้างคำขอเบิก');fin.fill('input[name=party]','x');fin.fill('input[name=desc]','เกินยอด');fin.fill('input[name=amt]','abc');fin.click('#mb2');fin.click('#mb2');fin.wait_for_timeout(600)
    ok('ตัวเลข' in fin.inner_text('#er'),'client validation still first')
    fin.click('#mb1') if fin.is_visible('#mb1') else None
    fin.evaluate("dlg.close()")
    # settings save + reload persists
    fin.goto('/#set');fin.wait_for_timeout(400);fin.fill('input[name=n_fin]','นางสาวทดสอบ ระบบจริง');fin.click('text=บันทึกตั้งค่าเอกสาร');fin.click('#cb2');fin.wait_for_timeout(1000)
    fin.reload();fin.wait_for_timeout(900);ok(fin.input_value('input[name=n_fin]')=='นางสาวทดสอบ ระบบจริง','settings persist across reload (session cookie kept)')
    dr.goto('/#set');dr.wait_for_timeout(500);ok(dr.input_value('input[name=n_fin]')=='นางสาวทดสอบ ระบบจริง','settings shared between users')
    # crest upload
    import struct,zlib
    def png():
        raw=b'\x00\xff\x00\x00';d=zlib.compress(raw);ch=lambda t,c:struct.pack('>I',len(c))+t+c+struct.pack('>I',zlib.crc32(t+c)&0xffffffff)
        return b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+ch(b'IDAT',d)+ch(b'IEND',b'')
    open(SP+'crest.png','wb').write(png())
    fin.set_input_files('input[type=file]',SP+'crest.png');fin.wait_for_timeout(1200)
    ok(fin.evaluate("CRUT")and '/api/settings/crest' in fin.evaluate("CRUT") and fin.evaluate("fetch(CRUT).then(r=>r.status)")==200,'crest stored on the server and readable when signed in')
    # director adds fund + project ; accountant reconciles
    dr.click('text=+ เพิ่มแหล่งเงิน');dr.fill('input[name=name]','เงินบริจาคอีทูอี');dr.fill('input[name=amt]','5000');modal_ok(dr)
    ok('เงินบริจาคอีทูอี' in dr.inner_text('#main'),'fund added with opening balance')
    dr.goto('/#dash');dr.wait_for_timeout(400);ok('734,050.00' in dr.inner_text('.hb'),'opening balance counted (728,950+100+5,000)')
    acc.goto('/#bank');acc.wait_for_timeout(500);acc.locator('.card',has_text='เงินบริจาคอีทูอี').locator('button').click();acc.fill('input[name=amt]','5000');modal_ok(acc)
    ok('ยอดตรงกัน' in acc.locator('.card',has_text='เงินบริจาคอีทูอี').inner_text(),'bank reconciliation saved')
    # auditor: read only + audit log
    au=ctx(b,A);login(au,'dev.auditor');au.goto('/#aud');au.wait_for_timeout(500)
    t=au.inner_text('#main');ok('กลับรายการจ่าย' in t and 'เข้าสู่ระบบ' in t and 'ทดสอบกลับรายการ' in t,'audit log shows actions, sign-ins and reasons')
    au.goto('/#exp');au.wait_for_timeout(400);ok(au.locator('td.ac button:not(:has-text("เอกสาร"))').count()==0 and au.locator('text=+ สร้างคำขอเบิก').count()==0,'auditor has no action buttons')
    # documents + book in server mode
    au.goto('/#book');au.wait_for_timeout(600);ok(au.evaluate("PRN.length")>=5,'whole-book preview works with server data')
    # user admin
    ad=ctx(b,A);login(ad,'dev.admin');ad.goto('/#usr');ad.wait_for_timeout(500)
    ok(ad.locator('tr',has_text='dev.finance').count()==1,'admin sees user list')
    ad.click('text=+ เพิ่มผู้ใช้');ad.fill('input[name=username]','kru.mai');ad.fill('input[name=fullName]','ครูใหม่ ทดสอบ');ad.select_option('select[name=roleKey]','finance');ad.fill('input[name=pw]','Temp-pass-4321');modal_ok(ad)
    ok(ad.locator('tr',has_text='kru.mai').count()==1 and 'รอเปลี่ยนรหัสผ่าน' in ad.locator('tr',has_text='kru.mai').inner_text(),'user created, flagged to change password')
    nu=ctx(b,A);login(nu,'kru.mai','Temp-pass-4321');ok(nu.is_visible('#pf') and not nu.is_visible('aside'),'new user is forced to set a password first')
    nu.fill('input[name=cur]','Temp-pass-4321');nu.fill('input[name=pw]','Kru-mai-own-pass1');nu.fill('input[name=pw2]','Kru-mai-own-pass2');nu.click('#pf button');nu.wait_for_timeout(400);ok('ไม่ตรงกัน' in nu.inner_text('#per'),'mismatch caught')
    nu.fill('input[name=pw2]','Kru-mai-own-pass1');nu.click('#pf button');nu.wait_for_timeout(1200);ok(nu.is_visible('aside') and 'ครูใหม่' in nu.inner_text('#bar'),'after changing, the app opens')
    ad.locator('tr',has_text='kru.mai').locator('button:has-text("ปิดบัญชี")').click();ad.click('#cb2');ad.wait_for_timeout(900)
    nu.click('text=โหลดใหม่');nu.wait_for_timeout(900);ok(nu.is_visible('#lf'),'disabled user is signed out at the next request')
    # logout
    fin.click('text=ออกจากระบบ');fin.click('#cb2');fin.wait_for_timeout(800);ok(fin.is_visible('#lf'),'logout returns to sign-in');fin.reload();fin.wait_for_timeout(700);ok(fin.is_visible('#lf'),'still signed out after reload')
    fin.screenshot(path=SP+'e2e_login2.png')
    ok(ad.evaluate("fetch('/api/integrity').then(r=>r.json()).then(j=>j.issues.length)")==0,'integrity view empty after all of the above')
    for n,p in [('fin',fin),('acc',acc),('dir',dr),('aud',au),('admin',ad),('new',nu)]: ok(not p.errs,'no page errors: '+n+' '+str(p.errs[:2]))
    # ---- empty database: onboarding
    B='http://localhost:8789'
    a2=ctx(b,B);login(a2,'admin');ok(a2.is_visible('#pf'),'fresh install: admin must change the initial password')
    a2.fill('input[name=cur]',PW);a2.fill('input[name=pw]','School-own-pass-77');a2.fill('input[name=pw2]','School-own-pass-77');a2.click('#pf button');a2.wait_for_timeout(1200)
    ok('เริ่มต้นใช้งาน' in a2.inner_text('#main'),'empty database shows the setup checklist')
    a2.screenshot(path=SP+'e2e_onboard.png')
    a2.click('.task button');a2.click('#cb2');a2.wait_for_timeout(1000)
    ok(a2.evaluate("NET.fy&&NET.fy.be")==2570,'fiscal year 2570 opened for today (13 Nov 2026)')
    a2.goto(B+'/#set');a2.wait_for_timeout(500);a2.click('text=บันทึกตั้งค่าเอกสาร');a2.click('#cb2');a2.wait_for_timeout(1000)
    a2.click('text=+ เพิ่มแหล่งเงิน');a2.fill('input[name=name]','เงินอุดหนุนรายหัว');a2.fill('input[name=amt]','85000');modal_ok(a2)
    a2.goto(B+'/#dash');a2.wait_for_timeout(600);ok('85,000.00' in a2.inner_text('.hb') and 'เริ่มต้นใช้งาน' not in a2.inner_text('#main'),'after setup the dashboard opens with the opening balance')
    ok(not a2.errs,'no page errors: fresh '+str(a2.errs[:2]))
    b.close()
