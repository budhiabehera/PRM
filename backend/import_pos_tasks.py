"""
Import POS tasks from Excel into MSSQL PRM_tasks table.
Run from: D:\\Work\\GitHub\\Projects\\fx-resource-dashboard\\backend
Usage: python import_pos_tasks.py
"""
import re
import os
import pyodbc
import openpyxl
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

# --- Read credentials from test_connection.py (same as database.py does) ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
tc_file = os.path.join(BASE_DIR, "test_connection.py")

with open(tc_file, "r") as f:
    tc_src = f.read()

server = re.search(r'server\s*=\s*"([^"]+)"', tc_src).group(1)
database = re.search(r'database\s*=\s*"([^"]+)"', tc_src).group(1)
username = re.search(r'username\s*=\s*"([^"]+)"', tc_src).group(1)
password = re.search(r'password\s*=\s*"([^"]+)"', tc_src).group(1)
driver = re.search(r'driver\s*=\s*"([^"]+)"', tc_src).group(1)

conn_str = (
    "DRIVER={" + driver + "};"
    "SERVER=" + server + ";"
    "DATABASE=" + database + ";"
    "UID=" + username + ";"
    "PWD=" + password + ";"
    "Encrypt=yes;"
    "TrustServerCertificate=yes;"
    "Connection Timeout=30;"
)

# --- Excel File ---
EXCEL_FILE = os.path.join(BASE_DIR, "POS task-june_july.xlsx")


def parse_date(val):
    if not val:
        return None
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d')
    s = str(val).strip()
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%d-%b-%Y', '%d-%b-%y'):
        try:
            return datetime.strptime(s, fmt).strftime('%Y-%m-%d')
        except:
            pass
    return None


def safe_float(val):
    if val is None:
        return 0
    s = str(val).strip().replace('%', '').replace(',', '')
    try:
        return float(s)
    except:
        return 0


def main():
    print(f"Server: {server}")
    print(f"Database: {database}")
    print("Connecting to MSSQL...")
    conn = pyodbc.connect(conn_str)
    cur = conn.cursor()
    print("Connected!")

    count_before = cur.execute("SELECT COUNT(*) FROM PRM_tasks").fetchone()[0]
    print(f"PRM_tasks current rows: {count_before}")

    print(f"Reading Excel: {EXCEL_FILE}")
    wb = openpyxl.load_workbook(EXCEL_FILE, read_only=True, data_only=True)
    ws = wb['Sheet1']
    rows = list(ws.iter_rows(values_only=True))
    print(f"Total rows (incl header): {len(rows)}")

    now_ist = datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S')
    imported = 0
    errors = []
    row_num = 0

    for i, row in enumerate(rows[1:], start=2):
        task_name = row[2]
        if not task_name:
            continue
        row_num += 1

        case_ref = str(row[0]).strip() if row[0] else ''
        customer_name = str(row[1]).strip() if row[1] else ''
        project = str(row[3]).strip() if row[3] else ''
        module = str(row[4]).strip() if row[4] else ''
        sub_module = str(row[5]).strip() if row[5] else ''
        developer = str(row[6]).strip() if row[6] else ''
        work_type = str(row[7]).strip() if row[7] else ''
        priority = str(row[8]).strip() if row[8] else 'Medium'
        status = str(row[9]).strip() if row[9] else 'Not Started'
        start_date = parse_date(row[10])
        end_date = parse_date(row[11])
        est_hrs = safe_float(row[12])
        actual_hrs = safe_float(row[13])
        pct = safe_float(row[14])
        if 0 < pct <= 1:
            pct = pct * 100
        customer_committed = str(row[19]).strip().lower() in ('yes', 'true', '1') if row[19] else False

        task_code = f"POS{row_num:04d}"
        subject_info = f"Developer: {developer} | Module: {module} | SubModule: {sub_module} | WorkType: {work_type} | Project: {project}"

        if priority.capitalize() not in ('Low', 'Medium', 'High', 'Critical'):
            priority = 'Medium'

        try:
            cur.execute("""
                INSERT INTO PRM_tasks (task_code, case_ref, property_client, description, subject,
                    priority, status, start_date, end_date, estimated_hours, actual_hours,
                    percentage, customer_committed, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                task_code, case_ref, customer_name, str(task_name).strip(), subject_info,
                priority.capitalize(), status,
                start_date, end_date, est_hrs, actual_hrs, pct,
                1 if customer_committed else 0, now_ist
            ))
            imported += 1
            if imported % 25 == 0:
                print(f"  ...imported {imported} so far")
        except Exception as e:
            errors.append(f"Row {i}: {str(e)[:120]}")

    conn.commit()
    count_after = cur.execute("SELECT COUNT(*) FROM PRM_tasks").fetchone()[0]
    conn.close()

    print(f"\n{'='*40}")
    print(f"Import Complete!")
    print(f"{'='*40}")
    print(f"PRM_tasks before: {count_before}")
    print(f"PRM_tasks after:  {count_after}")
    print(f"Imported: {imported} tasks")
    if errors:
        print(f"\nErrors ({len(errors)}):")
        for e in errors[:10]:
            print(f"  {e}")
    else:
        print("No errors!")


if __name__ == "__main__":
    main()
