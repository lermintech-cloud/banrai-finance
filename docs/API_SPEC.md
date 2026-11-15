# API

Worker: `apps/api/src/index.ts` ทุกเส้นทางใต้ `/api/` ตอบ JSON (ยกเว้นรูปตราครุฑ) เส้นทางอื่นคือหน้าเว็บ

## กติกาทั่วไป
- ทุก endpoint ต้องมี session cookie `banrai_session` ยกเว้น `/api/health` และ `/api/auth/login`
- สิทธิ์อ่านจากฐานข้อมูลทุกคำขอ ไม่เชื่อค่า role/user จาก client
- คำขอที่ไม่ใช่ GET ต้องมีหัว `Origin` ตรงกับเว็บเอง (กัน CSRF) รวมถึงการล็อกอิน
- เนื้อ JSON ไม่เกิน 16 KB; จำนวนเงินส่งเป็น**ข้อความทศนิยม** เช่น `"1285.50"` ไม่เกิน 2 ตำแหน่ง
- `confirm` / `pay` / `reverse` ต้องมีหัว `Idempotency-Key` (8-100 ตัว `A-Za-z0-9_-`) ส่งซ้ำด้วย key เดิมได้ผลเดิม ไม่ลงบัญชีซ้ำ
- ผู้ใช้ที่ยังไม่เปลี่ยนรหัสผ่านชั่วคราว เรียกได้เฉพาะ `/api/auth/*` (อื่น ๆ ได้ `403 password_change_required`)
- Cookie: `HttpOnly; Secure; SameSite=Strict; Path=/` อายุ 12 ชั่วโมง ฐานข้อมูลเก็บเฉพาะ SHA-256 ของ token

## Auth และผู้ใช้
| Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- |
| GET | `/api/health` | - | ตรวจว่า Worker ต่อ D1 ได้ |
| POST | `/api/auth/login` | - | `{username,password}` ผิด 5 ครั้งล็อก 15 นาที (`429 account_locked`) |
| GET | `/api/auth/me` | เข้าสู่ระบบ | ชื่อ บทบาท สิทธิ์ `mustChangePassword` |
| POST | `/api/auth/logout` | เข้าสู่ระบบ | เพิกถอนเซสชันนี้ |
| POST | `/api/auth/password` | เข้าสู่ระบบ | `{currentPassword,newPassword}` เพิกถอนเซสชันอื่นของผู้ใช้ |
| GET | `/api/users` | `user_admin` | รายชื่อผู้ใช้และบทบาท (ไม่มี hash) |
| POST | `/api/users` | `user_admin` | `{username,fullName,position?,roleKey,password}` รหัสชั่วคราว ต้องเปลี่ยนเมื่อเข้าครั้งแรก |
| POST | `/api/users/:id/enable` `/disable` | `user_admin` | เปิด/ปิดบัญชี (ปิดแล้วเซสชันถูกเพิกถอน) ทำกับตนเองไม่ได้ |
| POST | `/api/users/:id/password` | `user_admin` | ตั้งรหัสชั่วคราวใหม่ |
| POST | `/api/users/:id/update` | `user_admin` | `{fullName, position, roleKey}` แก้ชื่อ ตำแหน่ง บทบาท (บทบาทของตนเองเปลี่ยนไม่ได้ → 409 `cannot_change_self`) |
| POST | `/api/users/:id/delete` | `user_admin` | ไม่เคยใช้งาน → ลบจริง (`mode: deleted`); เคยใช้งาน → ปลดออก (`mode: retired`): เข้าไม่ได้ ไม่แสดงในรายชื่อ ชื่อผู้ใช้ว่างให้ตั้งใหม่ ประวัติยังอยู่ |

รหัสผ่าน: 10-128 ตัวอักษร ไม่มีชื่อผู้ใช้อยู่ข้างใน เก็บเป็น `pbkdf2-sha256$100000$salt$hash`

## ข้อมูลรวมและข้อมูลหลัก
| Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- |
| GET | `/api/state` | `read` | ทุกอย่างที่หน้าจอใช้ในครั้งเดียว: ปีงบปัจจุบัน ตั้งค่า แหล่งเงิน โครงการ ธนาคาร รายการรับ/จ่าย ทะเบียนคุม; บันทึกตรวจสอบเฉพาะผู้มี `audit_read` |
| PUT | `/api/settings` | `docset` | ข้อมูลโรงเรียนและผู้ลงนาม |
| PUT / GET / DELETE | `/api/settings/crest` | `docset` / `read` / `docset` | ตราครุฑ PNG/JPG ≤ 1 MB ตรวจชนิดจากเนื้อไฟล์ เก็บใน D1 (หรือ R2 ถ้าผูกไว้) |
| POST | `/api/fiscal-years` | `setup` | `{yearBe}` สร้างปีงบ (1 ต.ค. - 30 ก.ย.) และเลขเอกสารชุดใหม่ |
| POST | `/api/fiscal-years/:id/close` | `setup` | ปิดปี (ต้องไม่มีรายการค้าง) เปิดกลับไม่ได้ผ่าน API |
| POST | `/api/funds` | `setup` | `{name,opening}` สร้างแหล่งเงิน + ยอดยกมา + บัญชีธนาคาร |
| POST | `/api/funds/:id/rename` | `setup` | แก้ชื่อ |
| POST | `/api/funds/:id/update` | `setup` | แก้ชื่อ และยอดยกมาของปีงบปัจจุบัน `{name, opening?}` — ยอดยกมาแก้ได้เมื่อแหล่งเงินยังไม่มีรายการ ผู้มีสิทธิ์ `user_admin` แก้ได้เสมอ บันทึกเป็นรายการปรับปรุง (`adjustment`, ref `ปรับยอดยกมา`) เพราะทะเบียนคุมแก้/ลบไม่ได้; ใช้แล้ว → 409 `fund_in_use` |
| POST | `/api/funds/:id/delete` | `setup` | ลบแหล่งเงินที่ยังไม่มีรายการ: ไม่มีแถวในทะเบียนคุมเลย → ลบจริง (`mode: deleted`); มีแค่ยอดยกมา → ปรับยอดเป็นศูนย์แล้วซ่อน (`mode: archived`); ใช้แล้ว → 409 `fund_in_use` |
| POST | `/api/projects` | `proj` | `{name,fundSourceId,budget}` |
| POST | `/api/banks/:id/reconcile` | `review` | `{amount}` บันทึกยอดตามสมุดบัญชี (ไม่ปรับทะเบียนคุมเอง) |

ยอดของปีก่อนหน้าปีงบปัจจุบันถูกรวมเป็นแถว "ยอดยกมาจากปีก่อน" ต่อแหล่งเงินใน `/api/state`
ข้อจำกัด: `/api/state` ส่งรายการรับ/จ่ายของปีปัจจุบันสูงสุด 3,000 รายการต่อประเภท และทะเบียนคุม 8,000 แถว ยังไม่มีการแบ่งหน้า

## รายการรับ-จ่าย
| Method | Path | สิทธิ์ | ทำอะไร |
| --- | --- | --- | --- |
| POST | `/api/income`, `/api/expenses` | `create` | สร้างร่าง (`fundSourceId, transactionDate, partyName, description, paymentMethod, amount, projectId?`) |
| POST | `/api/{income\|expenses}/:id/submit` | `create` | ส่งตรวจ |
| POST | `/api/expenses/:id/review` | `review` | ตรวจ |
| POST | `/api/expenses/:id/approve` | `approve` | อนุมัติ (ยังไม่ลดยอดคงเหลือ) |
| POST | `/api/{income\|expenses}/:id/reject` | รายจ่าย: `review`/`approve` ตามขั้น; รายรับ: `confirm` | ต้องมี `reason` |
| POST | `/api/income/:id/confirm` | `confirm` | ออกเลขใบเสร็จ + ลงทะเบียนคุม |
| POST | `/api/expenses/:id/pay` | `pay` | ออกเลขใบสำคัญ + ลงทะเบียนคุม |
| POST | `/api/{income\|expenses}/:id/reverse` | `reverse` | กลับรายการ ต้องมี `reason` |
| GET | `/api/income`, `/api/expenses`, `/api/funds/summary` | `read` | รายการ/ยอด |
| GET | `/api/integrity`, `/api/audit-logs` | `audit_read` | ตรวจความสอดคล้อง / บันทึกตรวจสอบ |

การออกเลข เปลี่ยนสถานะ ลงทะเบียนคุม และ audit ของ confirm/pay/reverse อยู่ใน D1 batch เดียว

## รหัสข้อผิดพลาด (`{"error":"<code>"}`)
| HTTP | code |
| --- | --- |
| 400 | `invalid_json`, `idempotency_key_required` |
| 401 | `unauthenticated`, `invalid_credentials` |
| 403 | `forbidden`, `bad_origin`, `separation_of_duties`, `wrong_password`, `password_change_required` |
| 404 | `not_found`, `unknown_action` |
| 409 | `invalid_state`, `state_changed`, `invalid_status_transition`, `immutable_after_post`, `insufficient_funds`, `fiscal_year_closed`, `no_open_fiscal_year`, `year_has_open_items`, `already_posted`, `already_reversed`, `duplicate`, `cannot_change_self`, `settings_required` |
| 413 | `body_too_large`, `file_too_large` |
| 422 | `invalid_amount`, `invalid_date`, `invalid_<ฟิลด์>`, `invalid_username`, `invalid_role`, `invalid_year`, `invalid_image`, `password_too_short`, `password_contains_username`, `password_too_simple`, `password_unchanged`, `no_fiscal_year_for_date`, `project_fund_mismatch`, `invalid_reference`, `constraint_failed` |
| 429 | `account_locked` |
| 500 | `internal` (รายละเอียดอยู่ใน log ของ Worker ไม่ส่งให้ผู้ใช้) |

## ยังไม่ได้ทำ
แนบ/ดาวน์โหลดไฟล์หลักฐาน (`/api/files/*`, T08), งบประมาณ (`/api/budgets`), รายงานส่งออก, แก้ไข/ยกเลิกร่าง, แก้บทบาทผู้ใช้เดิม,
ดูปีงบเก่า, จำกัดอัตราคำขอระดับ IP (ควรตั้ง Rate Limiting ของ Cloudflare หน้า `/api/auth/login` เพิ่ม)
