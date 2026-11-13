-- 0005_reference_roles.sql
-- Reference data the code depends on: roles and permission codes. Safe for production (no people, no money).
-- The role names and who may do what are taken from the prototype and the blueprint (section 9.1).
-- The school must confirm role names, approvers and limits before Production (blueprint section 9.1).

INSERT OR IGNORE INTO permissions (id, code, description) VALUES
  ('perm-read',       'read',       'ดูข้อมูลการเงินและรายงาน'),
  ('perm-audit-read', 'audit_read', 'ดูบันทึกตรวจสอบ (Audit Log)'),
  ('perm-create',     'create',     'สร้างรายการและส่งตรวจ'),
  ('perm-pay',        'pay',        'บันทึกจ่ายเงิน'),
  ('perm-review',     'review',     'ตรวจรายการ'),
  ('perm-confirm',    'confirm',    'ยืนยันรับเงิน'),
  ('perm-reverse',    'reverse',    'กลับรายการ'),
  ('perm-approve',    'approve',    'อนุมัติ'),
  ('perm-setup',      'setup',      'ตั้งค่าระบบ แหล่งเงิน และกู้คืนข้อมูล'),
  ('perm-proj',       'proj',       'เพิ่มโครงการ'),
  ('perm-docset',     'docset',     'ตั้งค่าเอกสารและผู้ลงนาม'),
  ('perm-user-admin', 'user_admin', 'จัดการบัญชีผู้ใช้และสิทธิ์');

INSERT OR IGNORE INTO roles (id, role_key, role_name, description) VALUES
  ('role-super-admin', 'super_admin', 'ผู้ดูแลระบบ',          'ตั้งค่าระบบและผู้ใช้ ไม่ควรใช้ทำธุรกรรมประจำวัน'),
  ('role-director',    'director',    'ผู้อำนวยการ',          'อนุมัติรายการ ตั้งค่าระบบ'),
  ('role-finance',     'finance',     'เจ้าหน้าที่การเงิน',   'บันทึกรับ สร้างคำขอ จ่ายเงิน จัดทำเอกสาร'),
  ('role-accountant',  'accountant',  'เจ้าหน้าที่บัญชี',     'ตรวจรายการ ยืนยันรับเงิน กลับรายการ'),
  ('role-auditor',     'auditor',     'ผู้ตรวจสอบ',          'อ่านอย่างเดียว รวมถึง Audit Log'),
  ('role-requester',   'requester',   'ผู้เบิก/ผู้รับผิดชอบโครงการ', 'สร้างคำขอและติดตามสถานะ');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
  ('role-super-admin', 'perm-read'), ('role-super-admin', 'perm-audit-read'), ('role-super-admin', 'perm-setup'),
  ('role-super-admin', 'perm-docset'), ('role-super-admin', 'perm-user-admin'),
  ('role-director', 'perm-read'), ('role-director', 'perm-approve'), ('role-director', 'perm-setup'),
  ('role-director', 'perm-proj'), ('role-director', 'perm-docset'),
  ('role-finance', 'perm-read'), ('role-finance', 'perm-create'), ('role-finance', 'perm-pay'),
  ('role-finance', 'perm-proj'), ('role-finance', 'perm-docset'),
  ('role-accountant', 'perm-read'), ('role-accountant', 'perm-review'), ('role-accountant', 'perm-confirm'),
  ('role-accountant', 'perm-reverse'),
  ('role-auditor', 'perm-read'), ('role-auditor', 'perm-audit-read'),
  ('role-requester', 'perm-read'), ('role-requester', 'perm-create');
