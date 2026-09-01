"""Bitbucket API client — handles REST API calls to Bitbucket Cloud/Server.

Updated Aug 2026:
- CHANGE-2770: Cross-workspace APIs removed Apr 14 2026.
  Use workspace-scoped endpoints only.
- App passwords deprecated Jul 28 2026 — replaced by API tokens.
  Bitbucket API tokens use BASIC auth (email + token), not Bearer.
"""

import requests
from typing import Any


class BitbucketClient:
    """Thin wrapper around the Bitbucket REST API."""

    def __init__(self, platform: str, workspace_slug: str | None,
                 base_url: str | None, auth_username: str | None,
                 auth_token: str | None, auth_type: str = "api_token"):
        self.platform = platform
        self.workspace = workspace_slug
        self.auth_type = auth_type
        if platform == "cloud":
            self.base = "https://api.bitbucket.org/2.0"
        else:
            self.base = (base_url or "").rstrip("/") + "/rest/api/1.0"

        # --- Authentication setup ---
        # For Bitbucket Cloud: ALL auth types (api_token, app_password, pat)
        # use Basic auth (username + token/password). Bearer is only for OAuth.
        # For Bitbucket Server: PAT without username uses Bearer header;
        # with username uses Basic auth.
        self.auth = None
        self.headers = {}

        if platform == "cloud":
            # Cloud always uses Basic auth regardless of auth_type
            if auth_username and auth_token:
                self.auth = (auth_username, auth_token)
        else:
            # Bitbucket Server / Data Center
            if auth_token and not auth_username:
                # Server PAT without username — use Bearer header
                self.headers["Authorization"] = f"Bearer {auth_token}"
            elif auth_username and auth_token:
                self.auth = (auth_username, auth_token)

    def _get(self, path: str, params: dict | None = None) -> Any:
        url = f"{self.base}{path}"
        resp = requests.get(url, auth=self.auth, headers=self.headers,
                           params=params, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, json_data: dict | None = None) -> Any:
        url = f"{self.base}{path}"
        resp = requests.post(url, auth=self.auth, headers=self.headers,
                            json=json_data, timeout=15)
        resp.raise_for_status()
        return resp.json()

    # ------------------------------------------------------------------
    # Connection test
    # ------------------------------------------------------------------
    def test_connection(self) -> tuple[bool, str]:
        """Verify credentials and connectivity.

        Cloud: uses GET /2.0/workspaces/{workspace} (workspace-scoped,
               not the removed cross-workspace /repositories endpoint).
        Server: uses GET /rest/api/1.0/projects?limit=1.
        """
        try:
            if self.platform == "cloud":
                data = self._get(f"/workspaces/{self.workspace}")
                ws_name = data.get("name", self.workspace)
                return True, f"Connected! Workspace: '{ws_name}'."
            else:
                data = self._get("/projects", params={"limit": 1})
                return True, "Connected to Bitbucket Server."
        except requests.HTTPError as e:
            return False, f"HTTP {e.response.status_code}: {e.response.text[:200]}"
        except Exception as e:
            return False, f"Connection failed: {str(e)[:200]}"

    # ------------------------------------------------------------------
    # Repositories
    # ------------------------------------------------------------------
    def list_repositories(self, page: int = 1, page_size: int = 50) -> dict:
        """List repos within the configured workspace.

        Cloud: GET /2.0/repositories/{workspace} — workspace-scoped,
               still valid after CHANGE-2770.
        """
        if self.platform == "cloud":
            return self._get(f"/repositories/{self.workspace}",
                           params={"pagelen": page_size, "page": page})
        else:
            return self._get("/repos",
                           params={"limit": page_size,
                                   "start": (page - 1) * page_size})

    # ------------------------------------------------------------------
    # Branches
    # ------------------------------------------------------------------
    def list_branches(self, repo_slug: str, page: int = 1,
                      page_size: int = 100) -> dict:
        """List branches for a repository."""
        if self.platform == "cloud":
            path = f"/repositories/{self.workspace}/{repo_slug}/refs/branches"
            return self._get(path, params={"pagelen": page_size,
                                           "page": page})
        else:
            path = (f"/projects/{self.workspace}/repos/{repo_slug}"
                    f"/branches")
            return self._get(path, params={"limit": page_size,
                                           "start": (page - 1) * page_size,
                                           "orderBy": "ALPHABETICAL"})

    def create_branch(self, repo_slug: str, branch_name: str,
                      source_branch: str = "main") -> dict:
        """Create a new branch in a repository.

        Cloud: POST /2.0/repositories/{workspace}/{repo}/refs/branches
        Server: POST /rest/api/1.0/projects/{workspace}/repos/{repo}/branches
        """
        if self.platform == "cloud":
            path = f"/repositories/{self.workspace}/{repo_slug}/refs/branches"
            return self._post(path, json_data={
                "name": branch_name,
                "target": {
                    "hash": source_branch,  # Can be branch name or commit hash
                },
            })
        else:
            path = (f"/projects/{self.workspace}/repos/{repo_slug}"
                    f"/branches")
            return self._post(path, json_data={
                "name": branch_name,
                "startPoint": source_branch,
            })

    # ------------------------------------------------------------------
    # Commits
    # ------------------------------------------------------------------
    def list_commits(self, repo_slug: str, branch: str | None = None,
                     page: int = 1, page_size: int = 50) -> dict:
        if self.platform == "cloud":
            path = f"/repositories/{self.workspace}/{repo_slug}/commits"
            params: dict[str, Any] = {"pagelen": page_size, "page": page}
            if branch:
                params["include"] = branch
            return self._get(path, params=params)
        else:
            path = f"/projects/{self.workspace}/repos/{repo_slug}/commits"
            params = {"limit": page_size, "start": (page - 1) * page_size}
            if branch:
                params["until"] = branch
            return self._get(path, params=params)

    # ------------------------------------------------------------------
    # Pull Requests
    # ------------------------------------------------------------------
    def list_pull_requests(self, repo_slug: str, state: str = "ALL",
                          page: int = 1, page_size: int = 50) -> dict:
        if self.platform == "cloud":
            path = f"/repositories/{self.workspace}/{repo_slug}/pullrequests"
            return self._get(path, params={"state": state,
                                           "pagelen": page_size,
                                           "page": page})
        else:
            path = (f"/projects/{self.workspace}/repos/{repo_slug}"
                    f"/pull-requests")
            return self._get(path, params={"state": state,
                                           "limit": page_size,
                                           "start": (page - 1) * page_size})

    # ------------------------------------------------------------------
    # Tags / Releases
    # ------------------------------------------------------------------
    def list_tags(self, repo_slug: str, page: int = 1,
                  page_size: int = 50) -> dict:
        if self.platform == "cloud":
            path = f"/repositories/{self.workspace}/{repo_slug}/refs/tags"
            return self._get(path, params={"pagelen": page_size,
                                           "page": page})
        else:
            path = f"/projects/{self.workspace}/repos/{repo_slug}/tags"
            return self._get(path, params={"limit": page_size,
                                           "start": (page - 1) * page_size})
