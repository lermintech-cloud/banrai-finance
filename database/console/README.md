# ไฟล์สำหรับวางใน D1 Console ของ Cloudflare

เนื้อหาเหมือน `database/migrations/` ทุกประการ แต่ตัดหมายเหตุ (`--`) ออก เพราะ Console รวมทุกบรรทัดเป็นบรรทัดเดียว
ทำให้หมายเหตุบรรทัดแรกกลืนคำสั่งทั้งไฟล์ ("No SQL statements detected")

วิธีใช้: วางทีละไฟล์ เรียงตามเลข 0001 → 0011 ห้ามข้าม ถ้าไฟล์ใด error ให้หยุด อย่าวางไฟล์ถัดไป
ถ้า Console รับได้ทีละคำสั่ง ให้วางทีละบรรทัด (หนึ่งบรรทัด = หนึ่งคำสั่ง)

ข้อควรรู้
- ถ้าสร้างตารางด้วยวิธีนี้แล้ว **อย่ารัน `npm run db:migrate:dev` กับฐานข้อมูลเดียวกัน** เพราะ wrangler ไม่รู้ว่าตารางมีแล้ว
- วิธีที่แนะนำยังเป็น `npm run db:migrate:dev` จากเครื่อง โฟลเดอร์นี้เป็นทางเลือกเมื่อใช้ wrangler ไม่ได้
- ถ้าแก้ไฟล์ใน `database/migrations/` ต้องสร้างไฟล์ในโฟลเดอร์นี้ใหม่ให้ตรงกัน
- ห้ามวาง `database/seeds/dev_seed.sql` ในฐานข้อมูลจริง

ไฟล์ `0003_integrity.sql` ในโฟลเดอร์นี้ใช้ `IF NOT EXISTS` จึงวางซ้ำได้ถ้าครั้งก่อนค้างกลางทาง
`0003b_fix_integrity_view.sql` = เฉพาะ 3 วิวท้ายไฟล์ 0003 สำหรับฐานข้อมูลที่วางไฟล์ 0003 รุ่นก่อนแล้วติด "too many terms in compound SELECT" (ถ้าวางไฟล์ 0003 รุ่นนี้ผ่านแล้ว ไม่ต้องใช้)

## ฐานข้อมูลที่ใช้งานอยู่แล้ว: วาง `0009_admin_all_roles.sql` เพิ่มไฟล์เดียว
ให้ผู้ดูแลระบบ (super_admin) ทำได้ทุกบทบาท วางซ้ำได้ ไม่แตะข้อมูลเงิน ผู้ดูแลยังอนุมัติ/ยืนยันรายการที่ตนเองสร้างไม่ได้ (ฐานข้อมูลบังคับแยกหน้าที่)
ตรวจหลังวาง (ต้องได้ 12): `SELECT COUNT(*) FROM role_permissions WHERE role_id = 'role-super-admin';`

## แผนงบประมาณโครงการ: วาง `0010_project_plan.sql` เพิ่ม (วางครั้งเดียว)
เพิ่มช่องกลุ่มงาน ผู้รับผิดชอบ และระยะเวลาให้โครงการ ไม่แตะข้อมูลเงิน **วางซ้ำจะ error "duplicate column name"** แปลว่าวางไปแล้ว ไม่ต้องทำอะไรต่อ
ตรวจหลังวาง (ต้องเห็น department, owner_name, period_text): `SELECT name FROM pragma_table_info('projects');`

## กิจกรรมในโครงการ: วาง `0011_project_activities.sql` เพิ่ม (หลัง 0010)
สร้างตารางกิจกรรม และช่องกิจกรรมในคำขอเบิก ไม่แตะข้อมูลเงิน ถ้าวางซ้ำจะ error "duplicate column name" ที่บรรทัด ALTER แปลว่าวางไปแล้ว
ตรวจหลังวาง (ต้องได้ 1, 1): `SELECT (SELECT COUNT(*) FROM sqlite_master WHERE name = 'project_activities'), (SELECT COUNT(*) FROM pragma_table_info('expense_transactions') WHERE name = 'activity_id');`

## ล้างข้อมูลทดลองก่อนใช้งานจริง: `reset_test_data.sql`
ใช้ **ครั้งเดียวก่อนเริ่มบันทึกเงินจริง** เมื่อที่ผ่านมาเป็นการทดลองใส่เท่านั้น
- ลบ: รายการรับ–จ่าย ทะเบียนคุม ประวัติสถานะ การกระทบยอด ไฟล์แนบ โครงการ บัญชีธนาคาร แหล่งเงิน และประวัติการใช้งาน (Audit Log)
- รีเซ็ตเลขเอกสารให้ฉบับถัดไปเป็น 0001
- เก็บไว้: บัญชีผู้ใช้และรหัสผ่าน บทบาท ปีงบประมาณ ตั้งค่าเอกสาร ผู้ลงนาม ตราครุฑ
- สคริปต์ปลดตัวล็อกการลบชั่วคราวแล้วใส่กลับครบ 6 ตัวในไฟล์เดียว และบันทึก "ล้างข้อมูลทดลองก่อนใช้งานจริง" เป็นประวัติแถวแรก
- **ห้ามใช้หลังเริ่มบันทึกเงินจริงแล้ว** ข้อมูลที่ลบกู้คืนไม่ได้ (ยกเว้น D1 Time Travel ภายในระยะที่ Cloudflare เก็บไว้)

ตรวจหลังวาง (ต้องได้ 0, 0, 0, 1): `SELECT (SELECT COUNT(*) FROM income_transactions), (SELECT COUNT(*) FROM ledger_entries), (SELECT COUNT(*) FROM fund_sources), (SELECT COUNT(*) FROM audit_logs);`

## ซ่อมฐานข้อมูลที่วางไม่ครบ: `repair_0003_0008.sql`
D1 Console ยกเลิกคำสั่งทั้งชุดเมื่อมีคำสั่งเดียว error ฐานข้อมูลที่เคยวางไฟล์ 0003 รุ่นแรก (ที่ error "too many terms in compound SELECT")
จึงไม่มีทริกเกอร์ 28 ตัวและวิว `v_fund_summary`, `v_project_usage` ไฟล์ซ่อมนี้สร้างส่วนที่ขาดให้ครบและแก้ตาราง `fund_sources` (แทน 0008)
ใช้ได้กับฐานข้อมูลที่วางถึง 0007 หรือ 0008 แล้ว วางซ้ำได้ ไม่ลบข้อมูล
ตรวจหลังวาง (ต้องได้ index 19, table 23, trigger 28, view 5):
`SELECT type, COUNT(*) AS n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' GROUP BY type ORDER BY type;`
