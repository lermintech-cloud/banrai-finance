// Creates the SQL for the FIRST administrator account. Run on the administrator's own computer:
//   npm run create-admin
// It asks for a username, a name and a password (typed twice, not shown), and writes
// backups/create-admin.sql containing only the salted hash, never the password.
// Apply that file with wrangler (the command is printed at the end), then delete it.
// The backups/ folder is in .gitignore. Never commit the file, and never put a password in Git.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { checkPasswordPolicy, hashPassword } from '../apps/api/src/services/password.ts';

const lines: string[] = [];
let waiting: ((s: string) => void) | null = null;
let hide = false;
const tty = process.stdin.isTTY === true;
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: tty });
// do not echo what is typed while a password is being entered
(rl as any)._writeToOutput = (s: string) => { if (!hide || s.includes('\n')) process.stdout.write(hide ? '\n' : s); };
rl.on('line', (l) => (waiting ? (waiting(l), (waiting = null)) : lines.push(l)));
const ask = (q: string, secret = false) => new Promise<string>((res) => {
  process.stdout.write(q);
  hide = secret && tty;
  const done = (s: string) => { hide = false; res(s); };
  if (lines.length) done(lines.shift()!); else waiting = done;
});
const sq = (s: string) => `'${s.replace(/'/g, "''")}'`;

const username = (await ask('ชื่อผู้ใช้ (a-z 0-9 . _ -) : ')).trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) { console.error('ชื่อผู้ใช้ไม่ถูกต้อง'); process.exit(1); }
const fullName = (await ask('ชื่อ-สกุล : ')).trim();
if (!fullName || fullName.length > 120) { console.error('กรอกชื่อ-สกุล'); process.exit(1); }
const p1 = await ask('รหัสผ่าน (อย่างน้อย 10 ตัวอักษร จะไม่แสดงบนจอ) : ', true);
const p2 = await ask('พิมพ์รหัสผ่านอีกครั้ง : ', true);
rl.close();
if (p1 !== p2) { console.error('รหัสผ่านสองครั้งไม่ตรงกัน'); process.exit(1); }
try { checkPasswordPolicy(p1, username); } catch (e) { console.error('รหัสผ่านไม่ผ่านเกณฑ์: ' + (e as Error).message); process.exit(1); }

const id = 'u-' + crypto.randomUUID();
const sql = `-- First administrator. Contains a salted password HASH only. Delete this file after applying it.
INSERT INTO users (id, username, password_hash, full_name, position, is_active, must_change_password) VALUES (${sq(id)}, ${sq(username)}, ${sq(await hashPassword(p1))}, ${sq(fullName)}, 'ผู้ดูแลระบบ', 1, 0);
INSERT INTO user_roles (user_id, role_id) VALUES (${sq(id)}, 'role-super-admin');
`;
mkdirSync('backups', { recursive: true });
writeFileSync('backups/create-admin.sql', sql, { mode: 0o600 });
console.log(`
สร้างไฟล์ backups/create-admin.sql แล้ว (มีเฉพาะ hash ไม่มีรหัสผ่าน)
นำเข้าฐานข้อมูลด้วยคำสั่งใดคำสั่งหนึ่ง แล้วลบไฟล์ทิ้ง:
  ในเครื่อง   : npx wrangler d1 execute DB --local  --config apps/api/wrangler.jsonc --file backups/create-admin.sql
  Dev         : npx wrangler d1 execute DB --remote --config apps/api/wrangler.jsonc --file backups/create-admin.sql
  Production  : npx wrangler d1 execute DB --remote --config apps/api/wrangler.jsonc --env production --file backups/create-admin.sql
`);
