# Site Forge

Site Forge is a Linux-hosted, prompt-first website factory. A user enters one website brief; the service asks Codex to create and critique a complete Next.js site, validates the production build, creates a new GitHub repository, pushes the source, connects that repository to Vercel, and triggers a production deployment.

The control UI never receives your OpenAI, GitHub, or Vercel credentials. They remain in the Linux service environment.

## What it does

1. Creates an isolated temporary Git workspace.
2. Runs a build pass and a separate design-review pass through the Codex SDK.
3. Runs `npm install` and `npm run build`.
4. Sends failed build output back to the same Codex thread for up to two repair passes.
5. Creates a GitHub repository and pushes the validated `main` branch.
6. Creates a Vercel project connected to that repository.
7. Starts a production deployment and returns both URLs in the UI.

## Requirements

- Linux with Node.js 20 or newer, npm, and Git; or Docker.
- An OpenAI API key with Codex access.
- A GitHub token that can create repositories and push repository contents.
- A Vercel access token.
- The Vercel GitHub integration installed for the GitHub account or organization that will own generated repositories. Private repositories must be included in the integration's repository access.

## Linux installation

```bash
sudo useradd --system --home /var/lib/site-forge --create-home --shell /usr/sbin/nologin siteforge
sudo mkdir -p /opt/site-forge /etc/site-forge /var/lib/site-forge/{data,workspaces}
sudo cp -R . /opt/site-forge
sudo chown -R siteforge:siteforge /opt/site-forge /var/lib/site-forge
cd /opt/site-forge
sudo -u siteforge npm install --omit=dev
sudo cp .env.example /etc/site-forge/site-forge.env
sudo chmod 600 /etc/site-forge/site-forge.env
sudo chown root:siteforge /etc/site-forge/site-forge.env
```

Edit `/etc/site-forge/site-forge.env` and set at least:

```dotenv
SITEFORGE_ACCESS_TOKEN=use-a-long-random-value
CODEX_API_KEY=...
GITHUB_TOKEN=...
GITHUB_OWNER=your-github-login
GITHUB_OWNER_TYPE=user
VERCEL_TOKEN=...
```

For a Vercel team, also set `VERCEL_TEAM_ID`. For a personal Vercel account, leave it blank.

Install the service:

```bash
sudo cp /opt/site-forge/systemd/site-forge.service /etc/systemd/system/site-forge.service
sudo systemctl daemon-reload
sudo systemctl enable --now site-forge
sudo systemctl status site-forge
```

The default listener is `127.0.0.1:8787`. Put it behind an authenticated HTTPS reverse proxy for remote use. The service refuses to bind to a non-loopback address unless `SITEFORGE_ACCESS_TOKEN` is configured.

## Docker

```bash
sudo mkdir -p /etc/site-forge
sudo cp .env.example /etc/site-forge/site-forge.env
sudo chmod 600 /etc/site-forge/site-forge.env
# Edit the environment file, then:
docker compose up -d --build
```

Open `http://127.0.0.1:8787`, select **Access token**, and enter the same `SITEFORGE_ACCESS_TOKEN` stored on Linux.

## Credential permissions

### GitHub

For a personal account, keep `GITHUB_OWNER_TYPE=user`; for an organization, set it to `org`. The service calls the corresponding repository creation endpoint, then pushes with Git over HTTPS. A classic personal access token needs `repo` for private repositories. A fine-grained token must be permitted to create repositories and write contents for the target owner.

### Vercel

Create a Vercel access token scoped to the correct personal account or team. The GitHub integration must already be installed and able to read generated repositories; otherwise Vercel cannot attach the repository during project creation.

## Quality loop

The user sees one main prompt field, but the backend runs a controlled multi-pass process:

- **Build:** complete product, responsive implementation, finished copy, functional interactions, SEO, and accessibility.
- **Critique:** a separate senior design-engineering review that directly improves hierarchy, composition, mobile behaviour, visual distinctiveness, and weak states.
- **Validate and repair:** production build failures are returned to the same Codex thread, then rebuilt.

This is deliberately more reliable than sending one unstructured prompt and publishing the first output.

## API

- `GET /health` — unauthenticated process health.
- `GET /api/config` — credential readiness without secret values.
- `POST /api/builds` — create a build with `{ prompt, repoName?, privateRepository? }`.
- `GET /api/builds` — recent jobs.
- `GET /api/builds/:id` — job details.
- `GET /api/builds/:id/events` — Server-Sent Events progress stream.

Authenticated API requests use `Authorization: Bearer $SITEFORGE_ACCESS_TOKEN`.

## Security notes

- Credentials are read only by the server process and are redacted from stored logs.
- Generated code runs only in a temporary workspace. The Codex thread uses workspace-write sandbox mode.
- Build commands have a configurable timeout and jobs run with limited concurrency.
- Generated repositories should still receive normal dependency, code-review, and security scanning before handling sensitive data or payments.
- Do not expose the service directly to the public internet. Use a reverse proxy, TLS, and an additional identity layer for shared deployments.
