# Integrations: Microsoft Teams & Salesforce

Both integrations are **optional**, off by default, and configured entirely
from **Admin → Settings** (Admin role only) — no code or `.env` changes
needed. Settings are stored in the `integration_settings` table.

Neither integration blocks normal use of PRM if left unconfigured — Teams
notifications and Salesforce sync are only triggered when you explicitly
click "🟦 Teams" / "☁️ SFDC" on a task, or "Send Test Message" / "Test
Connection" in Settings.

---

## Microsoft Teams

PRM posts a message card to a channel via either a classic **Incoming
Webhook** or a **Power Automate workflow** — both accept the same HTTP POST,
so either works with no code changes.

### Option A — Incoming Webhook (simplest, being phased out by Microsoft but still works today)
1. In Teams, go to the channel you want notifications in → **"..."** → **Connectors**.
2. Find **Incoming Webhook** → **Configure**.
3. Give it a name (e.g. "PRM Notifications"), optionally upload `frontend/public/logo.png` as its icon.
4. Copy the generated webhook URL.

### Option B — Power Automate Workflow (Microsoft's current recommended path)
1. In Teams, go to the channel → **"..."** → **Workflows**.
2. Choose the template **"When a Teams webhook request is received"** (or build a
   custom flow that starts with an HTTP trigger and posts an Adaptive Card to
   the channel).
3. Copy the flow's trigger URL.

### Configure in PRM
1. Log in as **Admin** → **Settings** → Microsoft Teams section.
2. Paste the URL into **Incoming Webhook / Workflow URL**.
3. Check **Enabled**, click **Save Integration Settings**.
4. Click **Send Test Message** — you should see a "PRM Test Notification" card appear in the Teams channel within a few seconds.

### Using it
On the **Tasks** page, any Lead/Manager/Admin can click **🟦 Teams** on a task
row to post an update card (task code, project, developer, priority, status,
estimated hours) to the configured channel.

---

## Salesforce

PRM authenticates via the OAuth 2.0 **username-password flow** and pushes a
task to Salesforce as a standard **Case** via the REST API (works on any org
— Developer Edition, Sandbox, or Production — without needing custom fields).

### One-time setup in Salesforce (by a Salesforce admin)
1. **Setup** → search **App Manager** → **New Connected App**.
2. Fill in name/email, check **Enable OAuth Settings**.
3. Callback URL: any placeholder works, e.g. `https://localhost/callback`
   (we don't use the browser redirect — only the direct password grant).
4. OAuth Scopes: add **"Manage user data via APIs (api)"**.
5. Save. Salesforce takes a few minutes to activate a new Connected App.
6. Open the app again → copy the **Consumer Key** and **Consumer Secret**.
7. Get a **Security Token**: your Salesforce user → avatar → **Settings** →
   **Reset My Security Token** (emailed to the account's email address).

### Configure in PRM
1. Log in as **Admin** → **Settings** → Salesforce section.
2. **Login URL**: `https://login.salesforce.com` for Production/Developer orgs,
   or `https://test.salesforce.com` for a Sandbox.
3. Fill in **Consumer Key**, **Consumer Secret**, your Salesforce **Username**,
   **Password**, and **Security Token**.
4. Check **Enabled**, click **Save Integration Settings**.
5. Click **Test Connection** — should report "Connected to Salesforce org at
   https://yourorg.my.salesforce.com."

### Using it
On the **Tasks** page, any Lead/Manager/Admin can click **☁️ SFDC** on a task
row to create a Case in Salesforce (Subject = task code + description,
Description = project/developer/priority/hours, Priority and Status mapped
from the task). The returned Salesforce Case Id is stored back onto the
task's **Case #** field for traceability.

**Note on re-syncing:** the current implementation always creates a **new**
Case rather than updating a previously-synced one (Salesforce orgs vary in
which custom fields exist for de-duplication). If you want "sync" to mean
"create once, then update," add an external-id custom field to Case (e.g.
`External_Task_Id__c`) in your org and extend `push_task_as_case` in
`backend/app/integrations/salesforce.py` to query on it first — the function
is intentionally small and isolated to make that change straightforward.

---

## Security note

Integration credentials (webhook URL, Salesforce secrets) are stored in plain
text in the local SQLite database, matching how the rest of this local/dev
app handles configuration. Before using real production credentials in a
shared or internet-facing deployment, encrypt these at rest or move them to a
proper secrets manager (e.g. environment variables injected at deploy time,
Azure Key Vault, AWS Secrets Manager) — this is flagged in
`docs/DEPLOYMENT.md` as a production hardening step.
