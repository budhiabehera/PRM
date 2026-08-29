"""Quick test - hardcoded credentials."""
import pyodbc

server = "fx1admin.database.windows.net"
database = "FX_Sabre_Interface_Log"
username = "fxoneadmin"
password = "hYL2nrnB1Ewvr4w8pHDh"
driver = "ODBC Driver 18 for SQL Server"

print("Password length:", len(password))

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

print("Attempting connection...")
try:
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 AS test")
    row = cursor.fetchone()
    print("SUCCESS! Connected. Result: " + str(row[0]))
    conn.close()
except Exception as e:
    print("FAILED: " + str(e))
