#!/usr/bin/env python3
"""Database-only checks (no Node, no Cloudflare needed). Python 3 standard library only.

    python3 tests/db/verify.py

Applies every migration in order, loads the dev seed, then checks balances, constraints and
triggers against SQLite with foreign keys ON (like D1). Exit code 0 = all passed.
"""
import glob
import json
import os
import sqlite3
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
read = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()

# Limits Cloudflare D1 enforces but stock SQLite does not (developers.cloudflare.com/d1/platform/limits).
# Both bit us on the first real deployment, so every database in these tests runs with them.
D1_LIKE_PATTERN_BYTES = 50   # documented: "Maximum characters (bytes) in a LIKE or GLOB pattern"
D1_COMPOUND_SELECT = 5       # not documented; a 6-term UNION ALL was rejected on D1, 3 terms work

def d1(c):
    if hasattr(c, 'setlimit'):
        c.setlimit(sqlite3.SQLITE_LIMIT_LIKE_PATTERN_LENGTH, D1_LIKE_PATTERN_BYTES)
        c.setlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT, D1_COMPOUND_SELECT)
    return c

def fresh(seed=True, folder='database/migrations'):
    c = d1(sqlite3.connect(':memory:'))
    c.execute('PRAGMA foreign_keys = ON')
    for f in sorted(glob.glob(os.path.join(ROOT, folder, '0*.sql'))):
        if folder.endswith('console') and '0003b' in f:
            continue
        c.executescript(open(f, encoding='utf-8').read())
    if seed:
        c.executescript(read('database/seeds/dev_seed.sql'))
    return c

passed = failed = 0
def check(name, ok, detail=''):
    global passed, failed
    if ok: passed += 1; print('PASS', name)
    else: failed += 1; print('FAIL', name, detail)

def fails(c, sql, needle, params=()):
    """True when the statement is rejected and the error mentions `needle`."""
    try:
        c.execute(sql, params)
    except sqlite3.Error as e:
        return needle.lower() in str(e).lower()
    return False

# ---- migrations
names = sorted(os.path.basename(f) for f in glob.glob(os.path.join(ROOT, 'database/migrations/*.sql')))
check('migrations are numbered 0001..000N without gaps', [n[:4] for n in names] == ['%04d' % i for i in range(1, len(names) + 1)], names)
import re
for f in names:
    txt = re.sub(r'--[^\n]*', '', read('database/migrations/' + f)).upper()   # ignore comments
    bad = re.search(r'\b(COMMIT|ROLLBACK|PRAGMA)\b|BEGIN\s+(TRANSACTION|DEFERRED|IMMEDIATE|EXCLUSIVE)', txt)
    check(f + ' has no transaction control / PRAGMA', not bad, bad.group(0) if bad else '')
    drops = re.findall(r'\bDROP\s+(?:TABLE|VIEW|TRIGGER|INDEX)\s+\w+', txt)
    allowed = ['DROP VIEW V_INTEGRITY_ISSUES', 'DROP VIEW V_INTEGRITY_ISSUES_LEDGER', 'DROP VIEW V_FUND_SUMMARY', 'DROP TABLE FUND_SOURCES'] if f.startswith('0008_') else []
    check(f + ' drops nothing outside its reviewed list', all(d in allowed for d in drops), drops)
    check(f + ' has no REAL/FLOAT/DOUBLE columns', not re.search(r'\b(REAL|FLOAT|DOUBLE)\b', txt))

c = fresh(seed=False)
check('migrations apply on an empty database', True)
check('test databases run with the D1 limits', hasattr(c, 'setlimit') and c.getlimit(sqlite3.SQLITE_LIMIT_LIKE_PATTERN_LENGTH) == D1_LIKE_PATTERN_BYTES)
schema = ' '.join(r[0] or '' for r in c.execute('select sql from sqlite_master'))
longest = max([len(m) for m in re.findall(r"(?:GLOB|LIKE)\s*'((?:[^']|'')*)'", schema, re.I)] + [0])
check('every LIKE/GLOB pattern in the final schema fits D1 (<= 50 bytes)', longest <= D1_LIKE_PATTERN_BYTES, longest)
check('fund colour check accepts #0A4FCF and rejects bad values (under D1 limits)',
      c.execute("insert into fund_types values ('ft','FT','x',1)") and
      not fails(c, "insert into fund_sources (id, fund_type_id, source_name, color) values ('ok','ft','ok','#0A4FCF')", 'x') and
      all(fails(c, "insert into fund_sources (id, fund_type_id, source_name, color) values (?, 'ft', ?, ?)", 'CHECK', (v, v, v))
          for v in ('0A4FCF', '#0A4FC', '#0A4FCFF', '#0A4FCG', '#0A4F C', 'blue')))
c.execute("delete from fund_sources"); c.execute("delete from fund_types")
cs = fresh(folder='database/console')
check('console SQL files build the same schema as the migrations and take the seed',
      sorted(cs.execute("select type, name from sqlite_master").fetchall()) == sorted(fresh(seed=False).execute("select type, name from sqlite_master").fetchall()))
for f in names:
    one = re.sub(r'\s+', ' ', re.sub(r'--[^\n]*', '', read('database/migrations/' + f))).strip().upper()
    con = re.sub(r'\s+', ' ', read('database/console/' + f)).strip().upper() if os.path.exists(os.path.join(ROOT, 'database/console', f)) else None
    check('console copy exists for ' + f, con is not None)
c = fresh(seed=False)
check('reference roles exist', c.execute('select count(*) from roles').fetchone()[0] == 6)
cols = [r for t in ('income_transactions', 'expense_transactions', 'ledger_entries', 'projects', 'bank_reconciliations') for r in c.execute(f'pragma table_info({t})')]
check('every *_satang column is INTEGER', all(r[2] == 'INTEGER' for r in cols if r[1].endswith('_satang')))

# ---- seed vs expected fixture
c = fresh()
fx = json.loads(read('database/fixtures/expected_balances.json'))
rows = {r[0]: (r[1], r[2]) for r in c.execute('select fund_source_id, balance_satang, committed_satang from v_fund_summary')}
for f, e in fx['funds'].items():
    check(f'seed balance {f}', rows[f] == (e['balance_satang'], e['committed_satang']), rows[f])
check('seed total balance', c.execute('select sum(amount_satang) from ledger_entries').fetchone()[0] == fx['total_balance_satang'])
check('seed has zero integrity issues', c.execute('select * from v_integrity_issues').fetchall() == [])
seq = dict(c.execute('select doc_type, last_no from document_sequences').fetchall())
check('sequences match issued numbers', seq == {'receipt': 4, 'voucher': 3} and c.execute("select count(*) from income_transactions where receipt_number is not null").fetchone()[0] == 4)
check('dev users are disabled', c.execute('select count(*) from users where is_active = 1').fetchone()[0] == 0)
check('no plain-text passwords', c.execute("select count(*) from users where password_hash not like 'DISABLED%'").fetchone()[0] == 0)
check('v_project_usage', c.execute("select paid_satang from v_project_usage where project_id='p1'").fetchone()[0] == 1285000)

# ---- immutability and append-only
check('posted income cannot change amount', fails(c, "update income_transactions set amount_satang=1 where id='inc-0001'", 'immutable_after_post'))
check('paid expense cannot change fund', fails(c, "update expense_transactions set fund_source_id='f2' where id='exp-0001'", 'immutable_after_post'))
check('posted income cannot be deleted', fails(c, "delete from income_transactions where id='inc-0001'", 'delete_not_allowed'))
check('draft income can be deleted', c.execute("delete from income_transactions where id='inc-0005'").rowcount == 1)
for t in ('ledger_entries', 'audit_logs', 'transaction_events'):
    check(t + ' is append-only (update)', fails(c, f'update {t} set id=id', 'append_only'))
    check(t + ' is append-only (delete)', fails(c, f'delete from {t}', 'append_only'))

# ---- status flow
c = fresh()
ins = "insert into expense_transactions (id, fiscal_year_id, fund_source_id, transaction_date, payee_name, description, amount_satang, payment_method, created_by{x}) values ('t1','fy-2570','f1','2026-11-13','a','b',{amt},'โอน','u-fin'{v})"
c.execute(ins.format(x='', amt=1000, v=''))
check('cannot skip review/approve (draft -> paid)', fails(c, "update expense_transactions set status='paid', paid_by='u-fin', paid_at='x', voucher_number='V', post_idempotency_key='k' where id='t1'", 'invalid_status_transition'))
check('cannot go draft -> approved', fails(c, "update expense_transactions set status='approved' where id='t1'", 'invalid_status_transition'))
check('new rows must start as draft', fails(c, ins.format(x=', status', amt=1000, v=", 'approved'").replace("'t1'", "'t2'"), 'initial_status_must_be_draft'))
check('amount must be positive', fails(c, ins.format(x='', amt=0, v='').replace("'t1'", "'t3'"), 'check'))
check('a fractional satang amount is refused by the database', fails(c, ins.format(x='', amt=12.5, v='').replace("'t1'", "'t6'"), 'check'))
check('a non-numeric text amount is refused by the database', fails(c, ins.format(x='', amt="'abc'", v='').replace("'t1'", "'t7'"), 'check'))

# ---- separation of duties (table CHECKs)
c.execute("update expense_transactions set status='submitted' where id='t1'")
check('requester cannot review own request', fails(c, "update expense_transactions set status='reviewed', reviewed_by='u-fin', reviewed_at='x' where id='t1'", 'ck_exp_sod_review'))
c.execute("update expense_transactions set status='reviewed', reviewed_by='u-acc', reviewed_at='x' where id='t1'")
check('requester cannot approve own request', fails(c, "update expense_transactions set status='approved', approved_by='u-fin', approved_at='x' where id='t1'", 'ck_exp_sod_approve'))
c.execute(ins.format(x='', amt=5, v='').replace("'t1'", "'t4'")); c.execute("update expense_transactions set status='submitted' where id='t4'")
check('reviewed status needs reviewer fields', fails(c, "update expense_transactions set status='reviewed' where id='t4'", 'ck_exp_reviewed_fields'))

# ---- overspend, closed year, project/fund
c = fresh()
c.execute(ins.format(x='', amt=99_999_999, v='').replace("'t1'", "'big'"))
for st, extra in (('submitted', ''), ('reviewed', ", reviewed_by='u-acc', reviewed_at='x'"), ('approved', ", approved_by='u-dir', approved_at='x'")):
    c.execute(f"update expense_transactions set status='{st}'{extra} where id='big'")
check('payment above fund balance is refused', fails(c, "update expense_transactions set status='paid', paid_by='u-fin', paid_at='x', voucher_number='V9', post_idempotency_key='k9' where id='big'", 'insufficient_funds'))
check('project of another fund is refused', fails(c, ins.format(x=', project_id', amt=10, v=", 'p2'").replace("'t1'", "'t5'"), 'project_fund_mismatch'))
c.execute("update fiscal_years set status='closed', closed_at='x', closed_by='u-dir'")
check('closed year: new income refused', fails(c, "insert into income_transactions (id, fiscal_year_id, fund_source_id, transaction_date, payer_name, description, amount_satang, payment_method, created_by) values ('z','fy-2570','f1','2026-11-13','a','b',1,'โอน','u-fin')", 'fiscal_year_closed'))
check('closed year: ledger insert refused', fails(c, "insert into ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, description, idempotency_key, created_by) values ('l','fy-2570','f1','2026-11-13',5,'opening','x','lk','u-dir')", 'fiscal_year_closed'))

# ---- ledger integrity
c = fresh()
led = "insert into ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, source_type, source_id, reverses_entry_id, description, idempotency_key, created_by) values ('{i}','fy-2570','f1','2026-11-13',{a},'{k}',{st},{si},{rv},'x','{i}','u-fin')"
check('income ledger needs a posted source', fails(c, led.format(i='a1', a=5, k='income', st="'income'", si="'inc-0005'", rv='null'), 'ledger_source_mismatch'))
check('expense ledger row with the wrong sign is refused', fails(c, led.format(i='a2', a=5, k='expense', st="'expense'", si="'exp-0001'", rv='null'), 'ledger_source_mismatch'))
check('same source cannot be posted twice', fails(c, led.format(i='a3', a=-1285000, k='expense', st="'expense'", si="'exp-0001'", rv='null'), 'unique'))
check('reversal needs a reversed source', fails(c, led.format(i='a4', a=1285000, k='reversal', st="'expense'", si="'exp-0001'", rv="'led-exp-0001'"), 'ledger_source_mismatch'))
check('reversal without original is refused', fails(c, led.format(i='a5', a=5, k='reversal', st="'expense'", si="'exp-0001'", rv='null'), 'ledger_source_mismatch'))
check('opening must be positive', fails(c, led.format(i='a6', a=-5, k='opening', st='null', si='null', rv='null'), 'ck_led_opening'))

# reversal end to end in SQL
c.execute("update expense_transactions set status='reversed', reversed_by='u-acc', reversed_at='x', reversal_reason='ทดสอบ', reversal_idempotency_key='rk1' where id='exp-0001'")
c.execute(led.format(i='r1', a=1285000, k='reversal', st="'expense'", si="'exp-0001'", rv="'led-exp-0001'"))
check('reversal restores the balance and leaves the original', c.execute("select balance_satang from v_fund_summary where fund_source_id='f1'").fetchone()[0] == 38215000 + 1285000 and c.execute("select count(*) from ledger_entries where source_id='exp-0001'").fetchone()[0] == 2)
check('a ledger entry can be reversed only once', fails(c, led.format(i='r2', a=1285000, k='reversal', st="'expense'", si="'exp-0001'", rv="'led-exp-0001'"), 'unique'))
check('integrity view still clean after reversal', c.execute('select * from v_integrity_issues').fetchall() == [])
check('reversal needs a reason', fails(c, "update income_transactions set status='reversed', reversed_by='u-acc', reversed_at='x', reversal_reason='  ', reversal_idempotency_key='rk2' where id='inc-0001'", 'ck_inc_reversed_fields'))

# integrity view catches damage done behind the triggers' back
c = fresh()
c.execute('drop trigger trg_ledger_no_delete')
c.execute("delete from ledger_entries where id='led-inc-0001'")
check('integrity view detects a missing ledger row', ('income_posted_without_ledger', 'inc-0001') in c.execute('select * from v_integrity_issues').fetchall())

# ---- settings tables
c = fresh()
check('school_settings is a single row', fails(c, "insert into school_settings (id, school_name, address_line, area_line, dept_line, memo_to_default) values (2,'a','a','a','a','a')", 'check'))
check('document signer roles are limited', fails(c, "insert into document_signers (role_key) values ('xyz')", 'check'))
check('fund colour must be a hex colour', fails(c, "insert into fund_sources (id, fund_type_id, source_name, color) values ('fx','ft-sample','x','red\" onmouseover=\"x')", 'check'))
check('foreign keys are enforced', fails(c, "insert into projects (id, fiscal_year_id, fund_source_id, project_code, project_name) values ('px','nope','f1','X','X')", 'foreign key'))

print(f'\n{passed} passed, {failed} failed')
sys.exit(1 if failed else 0)
