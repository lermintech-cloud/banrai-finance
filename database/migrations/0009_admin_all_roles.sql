-- 0009_admin_all_roles.sql
-- The school asked that the system administrator (super_admin) can act in every role.
-- Grants super_admin every transaction permission on top of setup/user administration.
-- Separation of duties is still enforced by the database (ck_inc_sod_post, ck_exp_sod_*):
-- nobody, the administrator included, can review/approve/post a transaction they created themselves.
-- Safe to run more than once (INSERT OR IGNORE).

INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role-super-admin', 'perm-create');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role-super-admin', 'perm-pay');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role-super-admin', 'perm-review');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role-super-admin', 'perm-confirm');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role-super-admin', 'perm-reverse');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role-super-admin', 'perm-approve');
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role-super-admin', 'perm-proj');
