# 🧠 Berget Memory API - Quick Start

## Starta dev-servern

```bash
npm run dev:once
# eller
npm run build && node dist/dev.js
```

Servern startar på `http://localhost:3456` med in-memory lagring.

## API-exempel

### 1. Skapa struktur
```bash
curl -X POST http://localhost:3456/memory/exec \
  -H "Content-Type: application/json" \
  -d '{"command": "mkdir /projects/myapp", "path": "/"}'
```

### 2. Skriva innehåll
```bash
curl -X POST http://localhost:3456/memory/exec \
  -H "Content-Type: application/json" \
  -d '{
    "command": "write /projects/myapp/README.md \"# My App\\n\\nBeskrivning av projektet.\"",
    "path": "/"
  }'
```

### 3. Läsa innehåll
```bash
curl -X POST http://localhost:3456/memory/exec \
  -H "Content-Type: application/json" \
  -d '{"command": "cat /projects/myapp/README.md", "path": "/"}'
```

### 4. Söka
```bash
# Full-text search
curl -X POST http://localhost:3456/memory/exec \
  -H "Content-Type: application/json" \
  -d '{"command": "search projektet /projects", "path": "/"}'

# Grep
curl -X POST http://localhost:3456/memory/exec \
  -H "Content-Type: application/json" \
  -d '{"command": "grep beskrivning /projects -r", "path": "/"}'
```

### 5. Batch-operations
```bash
curl -X POST http://localhost:3456/memory/batch \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      "mkdir /projects/myapp/docs",
      "cd /projects/myapp",
      "write docs/api.md \"# API Docs\"",
      "ls -l"
    ],
    "path": "/"
  }'
```

### 6. Tags och metadata
```bash
# Add tags
curl -X POST http://localhost:3456/memory/exec \
  -H "Content-Type: application/json" \
  -d '{
    "command": "tag /projects/myapp/README.md backend api v1",
    "path": "/"
  }'

# View metadata
curl -X POST http://localhost:3456/memory/exec \
  -H "Content-Type: application/json" \
  -d '{
    "command": "meta /projects/myapp/README.md",
    "path": "/"
  }'
```

### 7. SSE Events (realtid)
```bash
# Subscribe to all changes under /projects
curl -N "http://localhost:3456/events/stream?pathPrefix=/projects"

# Filter by event types
curl -N "http://localhost:3456/events/stream?types=node.created,node.updated&pathPrefix=/projects"
```

### 8. Debug
```bash
# View all stored data
curl http://localhost:3456/debug/dump

# Storage statistics
curl http://localhost:3456/debug/stats
```

## Agent-tips

Efter varje kommando får agenten kontextuella tips:
- **Struktur**: Tips om wings/rooms/drawers-organisation
- **Sökning**: När man ska använda `grep` vs `search` vs `vsearch`
- **Prestanda**: Filstorlekar, indexering, batch-operations
- **Organisering**: Tags, namnkonventioner, kontext-filer

## Dev-server detaljer

| Egenskap | Värde |
|----------|-------|
| Port | 3456 |
| Storage | In-memory (försvinner vid omstart) |
| Auth | Alla tokens accepteras (eller ingen) |
| Vector search | Aktiv med in-memory store |
| Events | SSE med realtids-prenumerationer |

## Testning

```bash
npm test          # Kör alla tester
npm test -- --ui  # Kör med UI (vitest)
```
