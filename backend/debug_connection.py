"""Debug connection - test different connection string formats."""
import pyodbc

server = "fx1admin.database.windows.net"
database = "FX_Sabre_Interface_Log"
username = "fxoneadmin"
password = "hYL2nrnB1Ewvr4w8pHDh"
driver = "ODBC Driver 18 for SQL Server"

print("=" * 60)
print("DEBUG: Connection string tests")
print("=" * 60)
print(f"Password: '{password}'")
print(f"Password length: {len(password)}")
print(f"Password repr: {repr(password)}")
print()

# Test 1: Minimal connection string
print("--- Test 1: Minimal (no Encrypt/Trust) ---")
conn_str1 = (
    f"DRIVER={{{driver}}};"
    f"SERVER={server};"
    f"DATABASE={database};"
    f"UID={username};"
    f"PWD={password}"
)
print(f"Conn string: {conn_str1}")
try:
    conn = pyodbc.connect(conn_str1, timeout=10)
    print("SUCCESS!")
    conn.close()
except Exception as e:
    print(f"FAILED: {e}")
print()

# Test 2: With Encrypt=yes and TrustServerCertificate=yes
print("--- Test 2: With Encrypt + Trust ---")
conn_str2 = (
    f"DRIVER={{{driver}}};"
    f"SERVER={server};"
    f"DATABASE={database};"
    f"UID={username};"
    f"PWD={password};"
    f"Encrypt=yes;"
    f"TrustServerCertificate=yes"
)
print(f"Conn string: {conn_str2}")
try:
    conn = pyodbc.connect(conn_str2, timeout=10)
    print("SUCCESS!")
    conn.close()
except Exception as e:
    print(f"FAILED: {e}")
print()

# Test 3: With Connection Timeout in string
print("--- Test 3: With Connection Timeout ---")
conn_str3 = (
    f"DRIVER={{{driver}}};"
    f"SERVER={server};"
    f"DATABASE={database};"
    f"UID={username};"
    f"PWD={password};"
    f"Encrypt=yes;"
    f"TrustServerCertificate=yes;"
    f"Connection Timeout=30"
)
print(f"Conn string: {conn_str3}")
try:
    conn = pyodbc.connect(conn_str3, timeout=30)
    print("SUCCESS!")
    conn.close()
except Exception as e:
    print(f"FAILED: {e}")
print()

# Test 4: List available drivers
print("--- Available ODBC Drivers ---")
drivers = pyodbc.drivers()
for d in drivers:
    print(f"  {d}")
