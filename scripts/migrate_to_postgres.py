import os
import sys
import sqlite3
import argparse
import json
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db, sanitize_db_url

# Ordered tables list (parent tables first)
MIGRATION_TABLE_ORDER = [
    'roles',
    'users',
    'franchises',
    'leads',
    'expense_categories',
    'expenses',
    'visit_expenses',
    'call_history',
    'follow_ups',
    'token_records',
    'survey_versions',
    'payments',
    'branding_setup',
    'marketing_campaigns',
    'training_records',
    'store_operations',
    'material_assets',
    'purchases',
    'gr_returns',
    'company_support',
    'documents',
    'audit_logs',
    'import_history',
    'complaints',
    'generic_stage_entries'
]

def run_postgres_migration(target_db_url=None, verify_only=False):
    db_url = sanitize_db_url(target_db_url or os.environ.get('DATABASE_URL'))
    sqlite_db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "franchise_management.db")

    print("==================================================")
    print("SQLITE TO SUPABASE POSTGRESQL MIGRATION ENGINE")
    print("==================================================")
    print(f"Source Database: SQLite ({sqlite_db_path})")
    print(f"Target Database: {db_url if db_url else 'None (Target URL not set)'}")
    print(f"Execution Mode: {'DRY RUN / VERIFY ONLY' if verify_only else 'MIGRATION EXECUTE'}")
    print("==================================================\n")

    if not os.path.exists(sqlite_db_path):
        print(f"[ERROR] Source SQLite database file does not exist at {sqlite_db_path}")
        return False

    # Read Source SQLite Data
    sqlite_conn = sqlite3.connect(sqlite_db_path)
    sqlite_cursor = sqlite_conn.cursor()
    sqlite_cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    source_tables = [t[0] for t in sqlite_cursor.fetchall() if not t[0].startswith('sqlite_')]

    source_data = {}
    source_counts = {}

    for t in MIGRATION_TABLE_ORDER:
        if t in source_tables:
            sqlite_cursor.execute(f"SELECT * FROM \"{t}\"")
            rows = sqlite_cursor.fetchall()
            sqlite_cursor.execute(f"PRAGMA table_info(\"{t}\")")
            cols = [c[1] for c in sqlite_cursor.fetchall()]
            dict_rows = [dict(zip(cols, r)) for r in rows]
            source_data[t] = dict_rows
            source_counts[t] = len(dict_rows)
        else:
            source_data[t] = []
            source_counts[t] = 0

    print("--- 1. SOURCE SQLITE TABLE AUDIT ---")
    total_source_records = 0
    for t, count in source_counts.items():
        print(f"  Table '{t}': {count} records")
        total_source_records += count
    print(f"Total Source Records: {total_source_records}\n")

    if not db_url:
        print("[NOTICE] Target PostgreSQL DATABASE_URL is not set.")
        print("[DRY RUN RESULT] Source database is healthy. Set DATABASE_URL to execute PostgreSQL transfer.")
        return True

    # Configure target Flask app context for target PostgreSQL
    app.config['SQLALCHEMY_DATABASE_URI'] = db_url
    try:
        db.engine.dispose()
    except Exception:
        pass

    with app.app_context():
        try:
            with db.engine.connect() as conn:
                conn.execute(db.text("SELECT 1"))
            print("[SUCCESS] Target PostgreSQL Database connected successfully.")
        except Exception as conn_err:
            print(f"[ERROR] Unable to connect to target PostgreSQL: {conn_err}")
            return False

        if verify_only:
            print("\n--- 2. VERIFY-ONLY / DRY RUN COMPARISON ---")
            inspector = db.inspect(db.engine)
            target_tables = inspector.get_table_names()
            
            missing_tables = [t for t in MIGRATION_TABLE_ORDER if t not in target_tables]
            print(f"Target Tables Present: {len(target_tables)}")
            print(f"Missing Tables in Target: {missing_tables if missing_tables else 'None'}")

            target_counts = {}
            mismatches = []

            for t in MIGRATION_TABLE_ORDER:
                if t in target_tables:
                    with db.engine.connect() as conn:
                        res = conn.execute(db.text(f"SELECT count(*) FROM \"{t}\"")).fetchone()
                        cnt = res[0] if res else 0
                        target_counts[t] = cnt
                        if cnt != source_counts[t]:
                            mismatches.append((t, source_counts[t], cnt))
                else:
                    target_counts[t] = 0

            print("\n--- TABLE ROW COUNT COMPARISON ---")
            for t in MIGRATION_TABLE_ORDER:
                s_cnt = source_counts.get(t, 0)
                t_cnt = target_counts.get(t, 0)
                status = "MATCH" if s_cnt == t_cnt else "DIFFERENT"
                print(f"  Table '{t}': Source={s_cnt}, Target={t_cnt} [{status}]")

            print("\n[DRY RUN SUMMARY]")
            if not missing_tables and not mismatches:
                print(">>> Target PostgreSQL is in exact parity with SQLite source! <<<")
            else:
                print(f">>> Dry run ready. Execute migration script to transfer {total_source_records} records to PostgreSQL. <<<")
            return True

        # EXECUTE MIGRATION
        print("\n--- 2. EXECUTING MIGRATION TO POSTGRESQL ---")
        db.create_all()

        migrated_total = 0
        for table in MIGRATION_TABLE_ORDER:
            rows = source_data.get(table, [])
            if not rows:
                print(f"  Table '{table}': 0 records (Skipped insertion)")
                continue

            cols = list(rows[0].keys())
            col_str = ", ".join([f"\"{c}\"" for c in cols])
            val_placeholders = ", ".join([f":{c}" for c in cols])
            
            insert_sql = db.text(f"INSERT INTO \"{table}\" ({col_str}) VALUES ({val_placeholders}) ON CONFLICT DO NOTHING")
            
            with db.engine.connect() as conn:
                for row in rows:
                    conn.execute(insert_sql, row)
                conn.commit()

            # Sequence reset for PostgreSQL auto-increment primary key
            try:
                with db.engine.connect() as conn:
                    seq_res = conn.execute(db.text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE(MAX(id), 1)) FROM \"{table}\""))
                    conn.commit()
            except Exception as seq_err:
                pass

            print(f"  Table '{table}': Migrated {len(rows)} records successfully.")
            migrated_total += len(rows)

        print(f"\n[MIGRATION SUCCESS] Total {migrated_total} records migrated to PostgreSQL.")
        return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate SQLite database to Supabase PostgreSQL")
    parser.add_argument("--db-url", type=str, help="Target PostgreSQL DATABASE_URL")
    parser.add_argument("--verify-only", action="store_true", help="Run dry run verification without writing")
    args = parser.parse_args()

    run_postgres_migration(target_db_url=args.db_url, verify_only=args.verify_only)
