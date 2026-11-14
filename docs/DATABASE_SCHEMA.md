# โครงสร้างฐานข้อมูล (Cloudflare D1 / SQLite)

ไฟล์จริงอยู่ที่ `database/migrations/` เรียงตามเลข ห้ามแก้ไฟล์ที่เคยรันบน Production แล้ว
ให้เพิ่มไฟล์ใหม่ (`0006_...`) เท่านั้น กติกาของไฟล์ migration: ไม่มี `BEGIN/COMMIT/PRAGMA`, ไม่มี `DROP`,
ไม่มีรหัสผ่านหรือ Secret, เงินเป็น `INTEGER` สตางค์, วันที่เป็น `YYYY-MM-DD`, เวลาเป็น UTC ISO 8601

> ทดสอบกับ SQLite ที่ติดมากับ Python/Node แล้ว (`tests/db/verify.py`) แต่ **ยังไม่ได้รันผ่าน `wrangler d1 migrations apply` บน D1 จริง**
> ให้รันบน Dev ก่อนเสมอ และอ่านผลก่อนแตะ Production

## ตาราง

| กลุ่ม | ตาราง | หมายเหตุ |
| --- | --- | --- |
| ผู้ใช้และสิทธิ์ (0001, 0006) | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `sessions`, `login_attempts` | เก็บเฉพาะ hash ของรหัสผ่านและ hash ของ session token; `users.must_change_password`; `login_attempts` ใช้ล็อกเมื่อใส่รหัสผิดซ้ำ |
| ตั้งค่า (0001) | `school_settings` (แถวเดียว id=1), `document_signers` (fin/acc/dir), `fiscal_years`, `fund_types`, `fund_sources`, `projects`, `document_sequences` | ตรงกับเมนู "ตั้งค่า > เอกสารและผู้ลงนาม" ในต้นแบบ |
| ธุรกรรม (0002) | `income_transactions`, `expense_transactions`, `transaction_events` | `transaction_events` = ประวัติการเปลี่ยนสถานะทีละขั้น |
| ทะเบียนคุม (0002) | `ledger_entries` | ยอดติดลบ/บวกเป็นสตางค์ มีเครื่องหมาย; ยอดคงเหลือ = ผลรวมของตารางนี้ |
| ตรวจสอบ (0002) | `audit_logs` | append-only |
| หลักฐาน (0002) | `attachments` | เก็บ metadata + `r2_object_key` ไฟล์จริงอยู่ใน R2 (ส่วนอัปโหลดยังไม่ได้ทำ) |
| ธนาคาร (0002) | `bank_accounts`, `bank_reconciliations` | กระทบยอดเป็นรายครั้ง ยังไม่มีการนำเข้ารายการ Statement |

## สถานะของธุรกรรม

รายรับ: `draft → submitted → posted → reversed`; `draft/submitted → rejected`; `draft → cancelled`
(การ "ยืนยันรับเงิน" ข้ามจาก `draft` ไป `posted` ได้ตามต้นแบบ)

รายจ่าย: `draft → submitted → reviewed → approved → paid → reversed`; `submitted/reviewed → rejected`; `draft → cancelled`

- `approved` = กันวงเงินไว้เท่านั้น ยังไม่ลดยอดคงเหลือ (แสดงเป็น `committed_satang`)
- `paid` / `posted` = มีแถวในทะเบียนคุมแล้ว ถึงจะกระทบยอดคงเหลือ
- ทริกเกอร์ `trg_*_status_flow` ปฏิเสธการข้ามขั้นหรือย้อนสถานะ

## หลักประกัน → กลไก → การทดสอบ

| หลักประกัน | กลไกในฐานข้อมูล | ทดสอบ |
| --- | --- | --- |
| จำนวนเงินเป็นจำนวนเต็มสตางค์ ไม่เป็นทศนิยมหรือข้อความ | `CHECK (typeof(col)='integer' AND col>0)` ทุกคอลัมน์ `*_satang` | verify.py "fractional satang", "non-numeric text" |
| แถวใหม่ต้องเริ่มเป็น draft | `trg_*_insert_draft` → `initial_status_must_be_draft` | verify.py |
| ข้ามขั้นตอนไม่ได้ | `trg_*_status_flow` → `invalid_status_transition` | verify.py, api.test.ts |
| Post แล้วแก้/ลบไม่ได้ | `trg_*_frozen` → `immutable_after_post`; `trg_*_no_delete` → `delete_not_allowed` | verify.py, api.test.ts (SQL ตรง) |
| ทะเบียนคุม/Audit/Events/กระทบยอด เป็น append-only | `trg_*_no_update`, `trg_*_no_delete` → `append_only` | verify.py |
| ผู้ทำรายการตรวจ/อนุมัติเองไม่ได้ | `ck_exp_sod_review`, `ck_exp_sod_approve`, `ck_inc_sod_post` | verify.py, api.test.ts |
| สถานะต้องมีผู้ทำ-เวลา และเหตุผล (ปฏิเสธ/กลับรายการ) | `ck_exp_*_fields`, `ck_inc_*_fields`, `ck_*_rejected_reason`, `ck_*_reversed_fields` | verify.py |
| จ่ายเกินยอดคงเหลือของแหล่งเงินไม่ได้ | `trg_expense_no_overspend` → `insufficient_funds` | verify.py, api.test.ts (T04) |
| โครงการต้องเป็นแหล่งเงิน/ปีเดียวกับรายจ่าย | `trg_expense_project_fund_ins/upd` → `project_fund_mismatch` | verify.py, api.test.ts |
| ปีงบที่ปิดแล้ว Post/กลับรายการ/ลงทะเบียนคุมไม่ได้ | `trg_*_year_open`, `trg_*_post_year_open`, `trg_ledger_year_open` → `fiscal_year_closed` | verify.py, api.test.ts (T11) |
| ทะเบียนคุมต้องอ้างธุรกรรมที่ Post แล้วและยอด/เครื่องหมายตรงกัน | `trg_ledger_source_income/expense` → `ledger_source_mismatch` | verify.py |
| ธุรกรรมหนึ่งลงทะเบียนคุมได้ครั้งเดียว | `ux_ledger_one_per_source` (partial unique) + `idempotency_key UNIQUE` | verify.py, api.test.ts (T06) |
| กลับรายการได้ครั้งเดียว ต้องมีต้นฉบับ ต้องมีสถานะ reversed | `reverses_entry_id UNIQUE`, `trg_ledger_reversal_match/state` | verify.py, api.test.ts (T07) |
| เลขเอกสารไม่ซ้ำ | `UNIQUE` บนเลขใบเสร็จ/ใบสำคัญ + `document_sequences` | api.test.ts (T09) |
| Foreign Keys | D1 บังคับเสมอ | verify.py |

## วิว

| วิว | ใช้ทำอะไร |
| --- | --- |
| `v_fund_summary` | ยอดยกมา รับสุทธิ จ่ายสุทธิ ปรับปรุง **คงเหลือ** และ **กันวงเงิน (approved)** ต่อแหล่งเงิน |
| `v_project_usage` | งบโครงการ เทียบกับจ่ายจริง (`paid`) และกันวงเงิน (`approved`) |
| `v_integrity_issues` | ควรว่างเสมอ ถ้ามีแถว = ข้อมูลไม่สอดคล้อง (เช่น Post แล้วแต่ไม่มีทะเบียนคุม) |
| `v_integrity_issues_tx`, `v_integrity_issues_ledger` | ส่วนย่อยของวิวข้างบน แยกไว้เพราะ D1 จำกัดจำนวน SELECT ที่ต่อกันด้วย UNION (พบจากการรันบน D1 จริง) |

## หน้าเว็บ → ฐานข้อมูล

| บนหน้าจอ | ในฐานข้อมูล |
| --- | --- |
| `S.cfg` (ชื่อโรงเรียน ที่อยู่ ส่วนราชการ เรียน ผู้ลงนาม ผู้ลงนามบันทึกข้อความ) | `school_settings`, `document_signers` |
| ครุฑ | `school_settings.crest_object_key` → ไฟล์ใน R2 แบบ Private อ่านผ่าน `/api/settings/crest` |
| แหล่งเงิน/โครงการ | `fund_types`, `fund_sources`, `projects` |
| รายการรับ/จ่าย + ประวัติ | `income_transactions`, `expense_transactions`, `transaction_events` |
| ยอดคงเหลือแต่ละแหล่งเงิน | คำนวณจาก `ledger_entries` (`v_fund_summary`) ไม่เก็บเป็นตัวเลขตายตัว |
| บันทึกตรวจสอบ | `audit_logs` |
| ขอบกระดาษ/ขนาดอักษร (`banrai-page`) และธีม/สี (`banrai-look`) | **ไม่ย้ายเข้าฐานข้อมูล** เป็นค่าของแต่ละเครื่อง |
| เลขเอกสาร `ร.70/…`, `จ.70/…` | `document_sequences.prefix` (ค่าตั้งต้นเป็นตัวอย่าง รอโรงเรียนยืนยัน) |

## ยังไม่ได้ออกแบบ/ทำ (ตั้งใจเว้น)

- งบประมาณแบบจัดสรร/โอนระหว่างรายการ (ตอนนี้มีแค่ `projects.budget_amount_satang`)
- สมุดรายวัน ผังบัญชี บัญชีคู่ — ต้องให้โรงเรียนยืนยันว่าต้องใช้และผังบัญชีที่ใช้จริงก่อน
- ปิดงวดรายเดือน (มีเฉพาะปิดปีงบ)
- นำเข้ารายการเดินบัญชีธนาคาร
- กิจกรรมย่อยในโครงการ
- ตารางวงเงินอนุมัติ/ผู้มีอำนาจอนุมัติตามวงเงิน (พิมพ์เขียว 9.1 ให้โรงเรียนยืนยัน)
- แนบไฟล์หลักฐานของรายการ (ตาราง `attachments` พร้อม แต่ยังไม่มี endpoint/หน้าจอ; ตราครุฑใช้ R2 แล้ว)
- ยอดยกข้ามปี: ไม่มีรายการปิดบัญชีสิ้นปี ยอดคงเหลือสะสมต่อเนื่องจากทะเบียนคุมทุกปี และหน้าจอรวมปีก่อนเป็นแถว "ยอดยกมาจากปีก่อน" — ให้เจ้าหน้าที่การเงินยืนยันว่าตรงกับแนวปฏิบัติ
- กรณีทดสอบ T08 (ดาวน์โหลดไฟล์ไม่มีสิทธิ์) และ T12 (กู้คืน Backup) ของพิมพ์เขียว ยังไม่มีเทสต์

## การเปลี่ยนแปลงหลังใช้งานจริง

เพิ่มไฟล์ migration ใหม่ต่อท้าย ห้ามแก้ไฟล์เก่า ห้ามใช้ `DROP TABLE`/Reset บน Production
SQLite เปลี่ยนข้อจำกัดของคอลัมน์เดิมไม่ได้ตรง ๆ ต้องสร้างตารางใหม่แล้วย้ายข้อมูล — วางแผน ทดสอบบน Dev
และสำรอง Production ก่อนเสมอ
