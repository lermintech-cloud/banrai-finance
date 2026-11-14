# คู่มือติดตั้ง (ทีละขั้น)

ภาพรวม: โค้ดอยู่ใน **GitHub** → ส่งขึ้น **Cloudflare** เป็น Worker ตัวเดียว (หน้าเว็บ + API) → ข้อมูลอยู่ใน **D1** (R2 ไม่จำเป็น: ถ้าไม่ผูก R2 รูปตราครุฑจะเก็บใน D1)

| ระดับ | ได้อะไร | ต้องมี | สถานะการทดสอบ |
| --- | --- | --- | --- |
| 1. ลองในเครื่อง | ทั้งระบบพร้อมล็อกอิน ข้อมูลตัวอย่าง | Node 22+, Python 3 | ทดสอบแล้ว |
| 2. เก็บเข้า GitHub | ประวัติไฟล์ เทสต์อัตโนมัติ | Git, บัญชี GitHub | คำสั่งมาตรฐาน ยังไม่ได้รันกับ repo จริง |
| 3. Dev บน Cloudflare | เว็บจริงสำหรับทดลอง ฐานข้อมูล Dev | บัญชี Cloudflare | **ยังไม่เคยรันจริง** ตรวจกับเอกสาร Cloudflare ล่าสุด |
| 4. Production | ใช้งานจริง | ผ่านเกณฑ์ใน `DEPLOYMENT.md` | ยังไม่เคยรันจริง |

ถ้าคำสั่งใดในระดับ 3-4 ไม่ผ่าน ให้หยุด อ่านข้อความ และตรวจกับเอกสาร Cloudflare ล่าสุด **ห้ามแก้ด้วยการลบ/รีเซ็ตฐานข้อมูล**

---

## ระดับ 1: ลองทั้งระบบในเครื่อง (10 นาที)

ไม่ต้องมีบัญชี Cloudflare ไม่ต้อง `npm install`

```bash
node -v            # ต้องเป็น v22 ขึ้นไป
npm test           # ต้องผ่าน 3 ชุด: ฐานข้อมูล 64, API 35, หน้าเว็บ 88
npm run local      # เปิดระบบพร้อมข้อมูลตัวอย่าง
```
หน้าต่างคำสั่งจะแสดงที่อยู่ `http://localhost:8788` รายชื่อผู้ใช้ตัวอย่าง 5 คน และรหัสผ่านชั่วคราวที่สุ่มใหม่ทุกครั้ง
เปิดหลายเบราว์เซอร์ (หรือหน้าต่างไม่ระบุตัวตน) เพื่อเข้าเป็นการเงิน บัญชี และผู้อำนวยการพร้อมกัน แล้วลองเดินงานเบิกจ่ายครบขั้น

- `npm run local:empty` = ฐานข้อมูลว่าง มีเฉพาะผู้ดูแล `admin` เพื่อลองขั้นตอนตั้งต้นระบบ
- ข้อมูลอยู่ในหน่วยความจำ ปิดหน้าต่างคำสั่งแล้วหายทั้งหมด **ห้ามใช้เก็บข้อมูลจริง**
- อยากดูแค่หน้าตาโดยไม่ล็อกอิน: ดับเบิลคลิก `apps/web/public/index.html` (โหมดสาธิต ข้อมูลเก็บในเบราว์เซอร์)

---

## ระดับ 2: เก็บเข้า GitHub (15 นาที)

1. ติดตั้ง Git และสมัคร GitHub
2. สร้าง repository ใหม่ ตั้งเป็น **Private** ชื่อเช่น `banrai-finance` ไม่ต้องติ๊กสร้าง README/.gitignore
3. ในโฟลเดอร์ `banrai-finance`

```bash
git init
git add .
git status          # ตรวจว่าไม่มี .env, .dev.vars, โฟลเดอร์ backups/ หรือไฟล์ข้อมูลจริง
git commit -m "BanRai Finance 1.0.0-rc.1"
git branch -M main
git remote add origin https://github.com/<ชื่อบัญชี>/banrai-finance.git
git push -u origin main
```
4. แท็บ **Actions** บน GitHub จะรันเทสต์อัตโนมัติทุกครั้งที่ push (ไม่ใช้ Secret ไม่แตะ Cloudflare)

ห้าม commit: รหัสผ่าน, API Token, Cloudflare Account ID, `.env`, `.dev.vars`, `backups/`, ไฟล์ที่มีข้อมูลการเงินจริง

---

## ระดับ 3: Dev บน Cloudflare (ประมาณ 1 ชั่วโมง)

### 3.1 ติดตั้งเครื่องมือและเข้าสู่ระบบ
```bash
npm install
npx wrangler login
```

### 3.2 สร้างฐานข้อมูลและที่เก็บไฟล์ของ Dev
```bash
npx wrangler d1 create banrai_finance_dev
```
คัดลอก `database_id` ที่ได้ ไปแทน `REPLACE_WITH_DEV_DATABASE_ID` ใน `apps/api/wrangler.jsonc`
ตั้ง `compatibility_date` ในไฟล์เดียวกันเป็นวันที่ทำการทดสอบ

### 3.3 ลองในเครื่องด้วย Wrangler ก่อน
```bash
npm run db:migrate:local      # สร้างตาราง (ไฟล์ 0001-0007)
npm run db:seed:local         # ข้อมูลตัวอย่าง (ผู้ใช้ตัวอย่างถูกปิด เข้าไม่ได้)
npm run create-admin          # สร้างผู้ดูแลของคุณเอง: ถามชื่อผู้ใช้ ชื่อ และรหัสผ่าน
npx wrangler d1 execute DB --local --config apps/api/wrangler.jsonc --file backups/create-admin.sql
npm run dev
```
เปิด `http://localhost:8787` เข้าสู่ระบบด้วยบัญชีที่เพิ่งสร้าง แล้วเพิ่มผู้ใช้อื่นจากเมนู **ผู้ใช้งาน**
ตรวจ `http://localhost:8787/api/health` ต้องได้ `{"ok":true}`

`create-admin` เขียนไฟล์ `backups/create-admin.sql` ที่มีเฉพาะ hash ของรหัสผ่าน **ลบไฟล์นี้หลังนำเข้าแล้ว**
(ถ้ารหัสผ่านที่พิมพ์แสดงบนจอ ให้ล้างหน้าจอหลังเสร็จ)

### 3.4 ส่งขึ้น Dev บน Cloudflare
```bash
npm run db:migrate:dev        # สร้างตารางบน D1 ของ Dev
npm run create-admin
npx wrangler d1 execute DB --remote --config apps/api/wrangler.jsonc --file backups/create-admin.sql
npm run deploy:dev            # ได้ที่อยู่เว็บ https://banrai-finance.<บัญชี>.workers.dev
```
เปิดที่อยู่ที่ได้ → เข้าสู่ระบบ → ระบบจะพาไปหน้า **เริ่มต้นใช้งาน** ให้ทำตามลำดับ
1. เปิดปีงบประมาณ
2. ตั้งค่าเอกสารและผู้ลงนาม
3. เพิ่มแหล่งเงินพร้อมยอดยกมา (ตรวจตัวเลขให้ถูก แก้ภายหลังไม่ได้)
4. เพิ่มบัญชีผู้ใช้ของเจ้าหน้าที่แต่ละคน

จุดที่ต้องสังเกตเป็นพิเศษ เพราะยังไม่เคยทดสอบกับของจริง
- migration `0003_integrity.sql` (ทริกเกอร์จำนวนมาก) ผ่านบน D1 หรือไม่
- การเข้าสู่ระบบใช้เวลาประมวลผลรหัสผ่าน (PBKDF2 100,000 รอบ) อยู่ในขีดจำกัดเวลา CPU ของแผนที่ใช้หรือไม่
- คีย์ `assets` / `run_worker_first` ใน `wrangler.jsonc` ตรงกับ Wrangler รุ่นที่ติดตั้งหรือไม่
- หลังทดสอบ: ในแดชบอร์ด D1 รัน `SELECT * FROM v_integrity_issues;` ต้องได้ 0 แถว

**ห้ามรัน `database/seeds/dev_seed.sql` กับฐานข้อมูล Production**

---

## ระดับ 4: Production

ทำเมื่อผ่านเกณฑ์ทุกข้อใน `docs/DEPLOYMENT.md` (Deployment Gate) เท่านั้น ลำดับโดยย่อ
```bash
npx wrangler d1 create banrai_finance_prod
# ใส่ database_id ใน env.production ของ apps/api/wrangler.jsonc
npx wrangler d1 migrations apply DB --remote --config apps/api/wrangler.jsonc --env production
npm run create-admin
npx wrangler d1 execute DB --remote --config apps/api/wrangler.jsonc --env production --file backups/create-admin.sql
npx wrangler deploy --config apps/api/wrangler.jsonc --env production
```
แนะนำให้ผูกโดเมนของโรงเรียน เปิด Rate Limiting ที่ `/api/auth/login` และตั้งรอบสำรองข้อมูลก่อนเริ่มบันทึกเงินจริง

---

## แก้ปัญหาเบื้องต้น

| อาการ | สาเหตุที่พบบ่อย | วิธีแก้ |
| --- | --- | --- |
| `npm test` error เรื่อง `node:sqlite` หรือ `strip-types` | Node เก่ากว่า 22 | ติดตั้ง Node 22 ขึ้นไป |
| `python3: command not found` (Windows) | Python ใช้ชื่อ `python` | ติดตั้ง Python 3 หรือรัน `python tests/db/verify.py` |
| `wrangler` ไม่รู้จัก flag หรือคีย์ใน config | รุ่น Wrangler ต่างกัน | ดู `npx wrangler <คำสั่ง> --help` และเอกสารล่าสุด |
| migration ไม่ผ่าน | D1 ตีความ SQL ต่างจาก SQLite | หยุด อย่าข้ามไฟล์ ปรับ SQL บน Dev แล้วรัน `npm test` ซ้ำ |
| เข้าสู่ระบบแล้วเด้งกลับหน้าเข้าสู่ระบบ | Cookie แบบ Secure ถูกปฏิเสธเพราะเปิดผ่าน http ที่ไม่ใช่ localhost | เปิดผ่าน https หรือ `localhost` เท่านั้น |
| ขึ้น "บัญชีถูกล็อกชั่วคราว" | ใส่รหัสผิด 5 ครั้ง | รอ 15 นาที หรือให้ผู้ดูแลตั้งรหัสผ่านใหม่ |
| ลืมรหัสผู้ดูแลคนเดียวของระบบ | ไม่มีผู้ดูแลอื่นช่วยตั้งใหม่ | รัน `npm run create-admin` สร้างผู้ดูแลอีกบัญชี แล้วนำเข้าด้วย wrangler |
| ปุ่มพิมพ์ไม่ขึ้น | เปิดผ่านหน้าฝัง (iframe) | เปิดเว็บในแท็บของเบราว์เซอร์โดยตรง |
