# @berget/memory

Agent memory storage API with SSH-simulated interface, backed by S3. Inspired by [MemPalace](https://github.com/MemPalace/mempalace) principles.

## Architecture

The memory system is organized like a palace:
- **Wings** - Top-level directories (e.g., `/projects`, `/conversations`, `/knowledge`)
- **Rooms** - Subdirectories within wings
- **Drawers** - Files containing actual memories

## API

### Authentication

All protected endpoints require a Keycloak Bearer token from `keycloak.berget.ai` realm `berget`.

```
Authorization: Bearer <token>
```

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
curl -H "Authorization: Bearer <token>" \
  "https://memory.berget.ai/events/stream?types=node.created,node.updated&pathPrefix=/projects"
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

**Use Cases:**
- **Real-time sync** - UI components auto-update when memory changes
- **Collaborative editing** - Multiple agents see each other's changes
- **Audit logging** - Track all mutations for compliance
- **Trigger workflows** - React to new memories (e.g., index on create)

#### GET /events/status
Check active SSE subscriptions for the authenticated user.

#### GET /memory/status
Check memory status for authenticated user.

### Commands

| Command | Description |
|---------|-------------|
| `ls [path] [-l]` | List directory contents |
| `cat <path>` | Display file contents |
| `grep <pattern> [path] [-r]` | Search for pattern in files |
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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `S3_BUCKET` | S3 bucket name |
| `S3_ENDPOINT` | S3 endpoint URL (optional, for MinIO) |
| `AWS_REGION` | AWS region |
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `KEYCLOAK_URL` | Keycloak URL (default: https://keycloak.berget.ai) |
| `KEYCLOAK_REALM` | Keycloak realm (default: berget) |

## Agent Tips

The API provides contextual tips after each command to help agents:

- **Structure**: "Organize your memory palace with top-level 'wings' like /projects, /conversations, /knowledge, /people"
- **Chunking**: "Keep files under 500 lines. Split large memories into focused files"
- **Tagging**: "Tag files with relevant keywords for better discoverability"
- **Search**: "Use `vsearch` for conceptual queries, `grep` for exact matches"
- **Pipelines**: "Chain commands with pipes for complex workflows"

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start development server
npm run dev

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
