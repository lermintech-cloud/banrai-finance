# การส่งขึ้นใช้งาน เกณฑ์ และความปลอดภัย

ขั้นตอนติดตั้งทีละขั้นอยู่ที่ `docs/INSTALL.md` ไฟล์นี้เน้นเกณฑ์ก่อนขึ้น Production การจัดการ Secret และการสำรองข้อมูล

> **ข้อควรทราบ**: ชุดนี้ถูกสร้างและทดสอบในสภาพแวดล้อมที่ไม่มีอินเทอร์เน็ต จึง **ยังไม่เคยรัน `wrangler`, `tsc`, GitHub Actions หรือ D1 จริง**
> คำสั่งด้านล่างเขียนตามพิมพ์เขียวข้อ 12 และต้องตรวจกับเอกสาร Cloudflare ฉบับปัจจุบันก่อนรันทุกครั้ง (ชื่อคำสั่ง/Flag เปลี่ยนตามเวอร์ชัน)
> สิ่งที่ทดสอบแล้วคือ SQL และตรรกะ Worker บน SQLite ในหน่วยความจำ (`npm test`)

## สิ่งที่ต้องมี
Node 22 ขึ้นไป (เทสต์ใช้ `node:sqlite` และ `--experimental-strip-types`; ทดสอบกับ 22.23), Python 3, บัญชี Cloudflare, บัญชี GitHub

## 1) ตรวจในเครื่อง (ไม่ต้องใช้บัญชี Cloudflare)
```bash
npm test          # ฐานข้อมูล + API + ตรรกะต้นแบบ
```
ต้องผ่านทั้งหมดก่อนทำขั้นต่อไป

## 2) สร้างทรัพยากร Dev
```bash
npm install
npx wrangler login
npx wrangler d1 create banrai_finance_dev
npx wrangler r2 bucket create banrai-finance-dev
```
นำ `database_id` ที่ได้ไปแทน `REPLACE_WITH_DEV_DATABASE_ID` ใน `apps/api/wrangler.jsonc`
(`database_id` ไม่ใช่ความลับ แต่ **ห้ามใส่ API Token หรือ Account ID ในไฟล์ใด ๆ ที่ commit**)

## 3) Migration และข้อมูลตัวอย่าง (Dev เท่านั้น)
```bash
npm run db:migrate:local          # ฐานข้อมูลจำลองในเครื่อง
npm run db:seed:local             # ข้อมูลตัวอย่าง ผู้ใช้ทุกคนถูกปิด
npm run dev
```
- `database/seeds/dev_seed.sql` **ห้ามรันบน Production** (เป็นข้อมูลสมมติ ยอดตัวเลขตัวอย่าง)
- ถ้าคำสั่งใดล้มเหลว ให้หยุดและอ่านข้อความ ห้ามแก้ด้วยการ Reset/Drop ฐานข้อมูล
- ถ้า Wrangler ปฏิเสธไฟล์ migration (เช่นทริกเกอร์ในไฟล์ `0003_integrity.sql`) ให้แจ้งผู้ดูแล แล้วปรับ SQL ให้ผ่านบน Dev ก่อน และรัน `npm test` ซ้ำ — จุดนี้ยังไม่เคยทดสอบกับ parser ของ D1 จริง

## 4) Migration บน Dev (ระยะไกล) และ Production
```bash
npx wrangler d1 migrations apply banrai_finance_dev --remote --config apps/api/wrangler.jsonc
```
ตรวจรายการที่รอรันด้วย `npx wrangler d1 migrations list banrai_finance_dev --remote --config apps/api/wrangler.jsonc` ก่อน

Production ใช้ฐานข้อมูล/Bucket แยกกัน (`banrai_finance_prod`, `banrai-finance-documents`) ใน `env.production` ของ `wrangler.jsonc`
ตัวอย่างลำดับ **ต้องผ่านทุกข้อ Deployment Gate (พิมพ์เขียว 12.4) ก่อน**:

- [ ] Branch ที่ Deploy เป็น Branch ที่ได้รับอนุมัติ
- [ ] `database_id` / ชื่อ Bucket ของ Production ถูกต้อง และ **ไม่ใช่ค่า Dev**
- [ ] ไม่มี Secret ในไฟล์ใด (ระบบรุ่นนี้ไม่ต้องใช้ Secret; ถ้าเพิ่มภายหลังให้ใช้ `wrangler secret put ... --env production`)
- [ ] Migration รันบน Dev และ API/Smoke test ผ่าน
- [ ] **Export สำรอง Production แล้ว** และทดสอบ Restore ลง Dev ได้
- [ ] `npm test` ผ่านใน CI
- [ ] ผู้ที่โรงเรียนมอบหมายอนุมัติการ Deploy เป็นลายลักษณ์อักษร (บันทึก Release และผู้อนุมัติ)
- [ ] แถว "ทะเบียนระเบียบ" ที่เกี่ยวข้องตรวจแล้ว (`docs/REGULATIONS_REGISTER.md`)
- [ ] Deploy Worker ด้วยคำสั่งที่ตรวจกับเอกสารล่าสุดแล้ว (เช่น `npx wrangler deploy --config apps/api/wrangler.jsonc --env production`) หลังผ่านข้อข้างต้นทั้งหมด
- [ ] โรงเรียนรับทราบวิธีเก็บรหัสผ่าน (ข้อ 6) บัญชีผู้ดูแลสร้างด้วย `create-admin` ไม่มีบัญชีตัวอย่างและไม่ได้รัน dev seed บน Production
- [ ] ทดสอบครบวงจรบน Dev แล้ว: เข้าสู่ระบบ เบิกจ่ายครบขั้นด้วย 3 บัญชี กลับรายการ พิมพ์เอกสาร และ `v_integrity_issues` ว่าง

## 5) Secrets และสิ่งที่ห้าม commit
- `.env`, `apps/api/.dev.vars`, โฟลเดอร์ `backups/`, ไฟล์ `*.sqlite` `*.db` `*.sql.gz` อยู่ใน `.gitignore` แล้ว — ไฟล์สำรองที่มีข้อมูลจริง (รวมถึงไฟล์ JSON จากปุ่มสำรองของต้นแบบ) ให้เก็บใน `backups/` หรือนอกโฟลเดอร์โปรเจกต์เสมอ ห้ามตั้งชื่อ `*.sql` ไว้ในโฟลเดอร์ที่ track เพราะ `.gitignore` ไม่ครอบคลุม ก่อน commit ครั้งแรกให้รัน `git status` ตรวจซ้ำ
- ค่าลับของ Production ตั้งผ่าน `wrangler secret put` หรือ Dashboard ไม่เขียนในไฟล์ใด
- R2 ไม่จำเป็น (ต้องผูกวิธีชำระเงินกับบัญชี Cloudflare) ค่าเริ่มต้นเก็บรูปตราครุฑในตาราง `stored_files` ของ D1 ถ้าเลือกใช้ R2 Bucket ต้องเป็น **Private** (ห้ามเปิด Public access หรือผูกโดเมนสาธารณะ) ไฟล์อ่านได้ผ่าน Worker ที่ตรวจเซสชันเท่านั้น
- ห้ามให้ Preview Deployment ใช้ฐานข้อมูล Production

## 6) การเข้าสู่ระบบและรหัสผ่าน — สิ่งที่เลือกไว้และต้องให้โรงเรียนรับทราบ
- รหัสผ่านเก็บเป็น **PBKDF2-SHA256 100,000 รอบ + salt 16 ไบต์** ผ่าน Web Crypto (`apps/api/src/services/password.ts`)
  100,000 คือจำนวนรอบสูงสุดที่ Workers รองรับสำหรับ PBKDF2 ซึ่ง**ต่ำกว่าคำแนะนำปัจจุบันของ OWASP สำหรับ PBKDF2-SHA256** และพิมพ์เขียวระบุ "Argon2id หรือวิธีที่ผ่านการประเมิน"
  จึงชดเชยด้วย: ความยาวขั้นต่ำ 10 ตัวอักษร, ล็อก 15 นาทีเมื่อผิด 5 ครั้ง, บังคับเปลี่ยนรหัสที่ผู้ดูแลตั้งให้, เซสชัน 12 ชั่วโมง
  รูปแบบที่เก็บระบุพารามิเตอร์ในตัว จึงเปลี่ยนเป็น Argon2id (ผ่าน WASM) ภายหลังได้โดยไม่ต้องรีเซ็ตผู้ใช้ทั้งหมด — **ให้ผู้รับผิดชอบด้านความปลอดภัยของโรงเรียน/เขตพื้นที่ตัดสินว่ายอมรับได้หรือไม่ก่อนขึ้น Production**
- Cookie เซสชัน: `HttpOnly; Secure; SameSite=Strict` ฐานข้อมูลเก็บเฉพาะ SHA-256 ของ token
- บัญชีผู้ดูแลคนแรกสร้างด้วย `npm run create-admin` บนเครื่องผู้ดูแล (ดู `INSTALL.md`) ไฟล์ SQL ที่ได้มีเฉพาะ hash อยู่ใน `backups/` ซึ่งไม่ถูก commit ลบหลังใช้
- ผู้ดูแลระบบ (super_admin) ไม่มีสิทธิ์สร้าง/อนุมัติ/จ่ายรายการ โดยออกแบบ ไม่ควรใช้บัญชีนี้ทำงานประจำวัน
- ควรเปิด Rate Limiting ของ Cloudflare ที่ `/api/auth/login` เพิ่ม เพราะการล็อกในระบบเป็นรายชื่อผู้ใช้ ไม่ใช่ราย IP
- **ห้ามใส่รหัสผ่านจริงใน SQL ไฟล์ migration ไฟล์ seed เอกสาร หรือ Git**

## 7) สำรองและกู้คืน (พิมพ์เขียวข้อ 13)
ยังไม่มีสคริปต์อัตโนมัติ และ **T12 (กู้คืนแล้วข้อมูล/ไฟล์ครบ) ยังไม่ได้ทดสอบ** แนวทางที่ต้องทำก่อนเปิดใช้:
D1 Time Travel (ตรวจระยะที่แผนรองรับ) + D1 Export ตามรอบ + สำรอง R2 + สำเนาเข้ารหัสนอก Cloudflare Account
ทดสอบ Restore ลงฐานข้อมูลใหม่ ตรวจจำนวนแถว ยอดแยกแหล่งเงิน เลขเอกสาร Foreign Keys และ `v_integrity_issues` ต้องว่าง
กำหนด RPO/RTO กับโรงเรียนและให้อนุมัติ ไม่ตั้งตามการคาดเดา

หลังกู้คืนทุกครั้งให้รัน: `SELECT * FROM v_integrity_issues;` (ต้องได้ 0 แถว) และเทียบ `v_fund_summary` กับยอดที่เจ้าหน้าที่การเงินยืนยัน

## 8) GitHub
`.github/workflows/test.yml` รัน `npm test` เทียบเท่า (ไม่ต้องมี Secret ไม่แตะ Cloudflare) ยังไม่เคยรันบน GitHub จริง
แนะนำ: เปิด Branch protection ให้ `main` ต้องผ่าน test และ Review ก่อน merge; การ Deploy Production ทำด้วยมือ/ขั้นตอนที่อนุมัติ ไม่ให้ push แล้วขึ้นเอง
