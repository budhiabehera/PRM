# Authentication & Roles

## How login works

1. Frontend posts `{ username, password }` to `POST /api/auth/login`.
2. Backend verifies the password (hashed with PBKDF2-SHA256, stdlib-only — no
   compiled dependency, so it installs cleanly everywhere including bare
   Windows Python setups) and returns a JWT access token + the user's profile.
3. The frontend stores the token in `localStorage` (via the Zustand
   `useAuthStore`) and attaches it as `Authorization: Bearer <token>` on every
   subsequent API request (`frontend/src/services/api.js` axios interceptor).
4. Every backend route except `/api/auth/login` requires a valid token
   (`app/main.py` applies `Depends(get_current_user)` to every router). A
   401 response anywhere automatically logs the user out and redirects to
   `/login`.

Tokens expire after 12 hours (`ACCESS_TOKEN_EXPIRE_MINUTES` in `app/auth.py`).

## Default seeded accounts

| Username | Password | Role | Linked developer |
|---|---|---|---|
| `admin` | `Admin@123` | Admin | — |
| `elango.manager` | `Manager@123` | Manager | Elango Muthu Kumar |
| `ramesh.lead` | `Lead@123` | Lead (Team Lead) | Ramesh Meda |
| `srishti.dev` | `Dev@123` | Developer | Srishti Rawat |

**Change these before deploying anywhere real** — they exist purely so the app
is testable out of the box. Delete/replace them from the Admin → Users page
(Admin role only) or directly in the database.

## Role permission matrix

| Action | Admin | Manager | Lead | Developer |
|---|:---:|:---:|:---:|:---:|
| View dashboards, tasks, team, utilization, timeline | ✅ | ✅ | ✅ | ✅ |
| Create/edit/delete **Projects, Modules, Resources, Work Types, Sprints** | ✅ | ✅ | ❌ | ❌ |
| Create/assign a new **Task** | ✅ | ✅ | ✅ | ❌ |
| Edit **any** task (reassign, reprioritize, reschedule) | ✅ | ✅ | ✅ | ❌ |
| Edit **status / actual hours** on a task assigned to them | ✅ | ✅ | ✅ | ✅ (own tasks only) |
| Delete a task | ✅ | ✅ | ✅ | ❌ |
| Set/remove developer leave (Availability) | ✅ | ✅ | ✅ | ❌ (view only) |
| Manage login accounts (Admin → Users) | ✅ | ❌ | ❌ | ❌ |

This is enforced on **both** ends:
- **Backend** (source of truth) — `app/deps.py` (`require_roles`, `can_edit_task`,
  `can_delete_task`, `restrict_fields_for_developer`) is applied inside each
  router. Even if someone bypasses the UI and calls the API directly, these
  rules still hold.
- **Frontend** (UX only) — `frontend/src/store/useAuthStore.js` exports the
  same rules (`isAdmin`, `isManagerOrAbove`, `isLeadOrAbove`, `canEditTask`,
  etc.) so buttons/routes are hidden rather than shown-then-rejected. Routes
  are additionally gated in `App.jsx` via `<ProtectedRoute allowedRoles={...}>`.

## Adding real users

As an Admin, go to **Admin → Users** to create accounts for your team, each
optionally linked to their `Developer` record (this is what makes "edit my
own tasks" work for a Developer-role account — without a linked developer,
a Developer-role account can view but can't edit anything, since it has no
"own tasks").

## "Domain login" — connecting to real corporate SSO/LDAP

This project ships with self-contained username/password + JWT auth so it
runs standalone with zero external dependencies. If you want actual **domain
login** (Active Directory / LDAP / Azure AD / Okta SSO) instead of local
accounts, the integration point is `app/routers/auth.py`:

- **LDAP/Active Directory**: replace the `verify_password` check in `login()`
  with an LDAP bind call (e.g. via the `ldap3` package) against your domain
  controller, then look up/create the matching local `User` row for role
  assignment.
- **SSO (SAML/OIDC via Azure AD, Okta, etc.)**: add a callback route that
  verifies the identity provider's token/assertion, then issue your own JWT
  the same way `login()` does today, so the rest of the app (role checks,
  frontend token handling) doesn't need to change.

Let your Anthropic contact or IT team know which of these you're targeting if
you'd like help wiring it up — the specifics depend heavily on your
organization's directory setup.
