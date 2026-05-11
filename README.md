# @berget/memory

Agent memory storage API with SSH-simulated interface, backed by S3. Inspired by [MemPalace](https://github.com/MemPalace/mempalace) principles.

## Architecture

The memory system is organized like a palace:
- **Wings** - Top-level directories (e.g., `/projects`, `/conversations`, `/knowledge`)
- **Rooms** - Subdirectories within wings
- **Drawers** - Files containing actual memories

## Quick Start

### Start the dev server

```bash
npm install
npm run build
npm run dev:once
```

This starts:
- **HTTP API** on `http://localhost:3456`
- **SSH Server** on `localhost:2222`

### Connect via SSH

```bash
ssh -p 2222 localhost
```

You get an interactive shell with all memory commands.

### Or use HTTP API directly

```bash
# Create structure
curl -X POST http://localhost:3456/memory/exec \
  -H "Content-Type: application/json" \
  -d '{"command": "mkdir /projects/myapp", "path": "/"}'

# Write content
curl -X POST http://localhost:3456/memory/exec \
  -H "Content-Type: application/json" \
  -d '{"command": "write /projects/myapp/README.md \"# My Project\"", "path": "/"}'

# Read content
curl -X POST http://localhost:3456/memory/exec \
  -H "Content-Type: application/json" \
  -d '{"command": "cat /projects/myapp/README.md", "path": "/"}'
```

## API

### Authentication

All protected endpoints require a Keycloak Bearer token from `keycloak.berget.ai` realm `berget`.

```
Authorization: Bearer <token>
```

In dev mode, any token (or no token) is accepted.

### Endpoints

#### POST /memory/exec
Execute a single SSH-like command.

```json
{
  "command": "ls -l /projects",
  "path": "/"
}
```

Response includes `tips` field with contextual guidance for agents:
```json
{
  "stdout": "file listing...",
  "stderr": "",
  "exitCode": 0,
  "currentPath": "/",
  "tips": ["TIP: Organize your memory palace with top-level 'wings'..."]
}
```

#### POST /memory/batch
Execute multiple commands in sequence.

```json
{
  "commands": [
    "mkdir /projects/myapp",
    "cd /projects/myapp",
    "write README.md \"# My Project\"",
    "ls -l"
  ],
  "path": "/"
}
```

#### GET /events/stream
**SSE endpoint** for real-time memory events. Subscribe to changes as they happen.

```bash
curl -N "http://localhost:3456/events/stream?types=node.created,node.updated&pathPrefix=/projects"
```

**Query Parameters:**
- `types` - Filter by event types (comma-separated): `node.created`, `node.updated`, `node.deleted`, `node.tagged`, `node.indexed`
- `pathPrefix` - Only events under this path
- `nodeType` - `file` or `directory`
- `tags` - Only events matching these tags (comma-separated)

**Event Format:**
```
event: node.created
data: {"id":"evt-123","type":"node.created","userId":"user-123","path":"/projects/app","nodeType":"directory","timestamp":"2024-01-15T10:00:00Z","metadata":{"action":"mkdir"}}
```

#### GET /events/status
Check active SSE subscriptions for the authenticated user.

#### GET /memory/status
Check memory status for authenticated user.

### Commands

| Command | Description |
|---------|-------------|
| `ls [path] [-l]` | List directory contents |
| `cat <path>` | Display file contents |
| `grep <pattern> [path] [-r] [--include='*.md']` | Search for pattern in files. Use `--include` to filter by file type |
| `mkdir <path>` | Create a directory |
| `touch <path>` | Create or update a file |
| `rm <path> [-r]` | Remove a file or directory |
| `write <path> <content>` | Write content to a file |
| `cd <path>` | Change directory |
| `pwd` | Print working directory |
| `tree [path] [-L<n>]` | Display directory tree |
| `find <pattern> [path]` | Find files by name pattern |
| `meta <path> [key] [value]` | View or edit metadata |
| `tag <path> <tags...> [-d]` | Add or remove tags |
| `search <query> [path] [-n<N>]` | Full-text search with ranking |
| `vsearch <query> [path]` | Semantic/vector search |
| `index [path]` | Rebuild search index |
| `stats` | Display memory statistics |
| `help` | Show help message |

### Pipelines

Chain commands with pipes:
```bash
ls /projects | grep api
find /docs | grep setup
cat /README.md | grep TODO
```

## MemPalace Strategies

### Memory Structure

```
/                    <- Root
├── projects/        <- Wing: Active projects
│   ├── myapp/       <- Room: Specific project
│   │   ├── README.md
│   │   ├── docs/
│   │   └── src/
│   └── other-project/
├── conversations/   <- Wing: Meeting notes & decisions
│   ├── client-acme/
│   │   ├── context.md
│   │   └── 2024-01-15-meeting.md
│   └── team-syncs/
├── knowledge/       <- Wing: Research & architecture
│   ├── architecture/
│   ├── patterns/
│   └── decisions/
├── people/          <- Wing: Contacts & relationships
└── tasks/           <- Wing: TODOs & deadlines
```

### Naming Conventions

- **kebab-case** for files: `api-gateway-design.md`
- **Dates** for chronological items: `2024-01-15-meeting.md`
- **Be descriptive**: bad="notes.md" good="graphql-vs-rest-decision.md"

### Tagging

Tag everything immediately after creation:
```bash
tag /projects/myapp/README.md backend api v1
```

Use consistent tags: `backend`, `frontend`, `urgent`, `decision`, `research`

### Search Strategies

```bash
# Exact text search (fast)
grep "pattern" / -r

# Full-text with ranking
search "microservices benefits" /knowledge

# Semantic similarity (find related ideas)
vsearch "container orchestration"

# Find by filename
find "micro" /knowledge

# Filter by file type
grep "pattern" /projects -r --include='*.md'
grep "pattern" /projects -r --include='*.yaml'
```

### Context Files

Store session context for continuity:
```bash
write /conversations/client-acme/context.md "# Context
Client: ACME Corp
Budget: $50k
Timeline: 3 months
Stakeholders: John (CTO), Sarah (PM)"
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `SSH_PORT` | SSH server port (default: 2222) |
| `S3_BUCKET` | S3 bucket name |
| `S3_ENDPOINT` | S3 endpoint URL (optional, for MinIO) |
| `AWS_REGION` | AWS region |
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `KEYCLOAK_URL` | Keycloak URL (default: https://keycloak.berget.ai) |
| `KEYCLOAK_REALM` | Keycloak realm (default: berget) |

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start dev server (API + SSH)
npm run dev:once

# Build
npm run build
```

## Structure

```
src/
├── domain/          # Domain models, errors, events
├── ports/           # Interface definitions (ports)
├── adapters/        # External system adapters (S3, Keycloak, Vector Store)
├── services/        # Business logic (commands, paths, search, events)
├── middleware/      # Koa middleware (auth, error handling)
├── routes/          # API routes (memory, events, health)
└── index.ts         # Application entry point
```
