# Comet Bridge HTTP API

REST API server exposing all Comet-Bridge MCP tools as HTTP endpoints. Designed for environments that can't use MCP directly (sandboxed VMs, non-MCP clients, scripts).

## Starting the Server

```bash
cd <path-to-comet-mcp>
npm run build && npm run http
# Listening on http://localhost:3456
```

Set a custom port with `COMET_HTTP_PORT`:
```bash
COMET_HTTP_PORT=8080 npm run http
```

## Browsing Endpoints

All responses are JSON. All endpoints support CORS (`Access-Control-Allow-Origin: *`).

### Health Check
```
GET /api/health
-> { "status": "ok", "port": 3456, "timestamp": "..." }
```

### Connect to Comet
```
POST /api/connect
-> { "message": "Connected to Perplexity (cleaned 0 old tabs)" }
```

### Send a Prompt (blocking)
```
POST /api/ask
Body: { "prompt": "...", "newChat": false, "timeout": 15000 }
-> { "status": "completed", "response": "..." }
-> { "status": "in_progress", "steps": [...], "message": "..." }
```

### Poll Agent Status
```
GET /api/poll
-> { "status": "completed", "response": "..." }
-> { "status": "working", "steps": [...], "currentStep": "..." }
```

### Stop Agent
```
POST /api/stop
-> { "stopped": true, "message": "Agent stopped" }
```

### Screenshot
```
GET /api/screenshot
-> { "data": "<base64 PNG>", "mimeType": "image/png" }
```

### Get/Set Mode
```
POST /api/mode
Body: {}                       -> { "currentMode": "search" }
Body: { "mode": "research" }   -> { "mode": "research", "message": "Switched to research mode" }
```

## Tab Group Endpoints

Requires the Comet Tab Groups Bridge extension (see README.md for install instructions).

### List All Tab Groups
```
GET /api/tab-groups
-> { "groups": [{ "id": 123, "title": "Research", "color": "blue", "collapsed": false, "windowId": 456 }] }
```

### List All Tabs (with group assignments)
```
GET /api/tab-groups/tabs
-> { "tabs": [{ "id": 1, "groupId": 123, "title": "Page Title", "url": "https://...", ... }] }
```
Tabs with `groupId: -1` are ungrouped.

### Create Tab Group
```
POST /api/tab-groups
Body: { "tabIds": [1, 2, 3], "title": "My Group", "color": "blue" }
-> { "groupId": 789, "group": { "id": 789, "title": "My Group", "color": "blue", ... } }
```

### Update Tab Group
```
POST /api/tab-groups/update
Body: { "groupId": 789, "title": "New Name", "color": "red", "collapsed": true }
-> { "id": 789, "title": "New Name", "color": "red", "collapsed": true, ... }
```

### Delete Tab Group
```
POST /api/tab-groups/delete
Body: { "groupId": 789 }
-> { "deleted": true, "ungroupedTabs": 3 }
```

## Usage from Sandboxed Environments

For sandboxed VMs that can control Chrome via MCP but can't reach localhost directly, use Chrome's `fetch()` as a bridge:

```javascript
// Via Claude-in-Chrome javascript_tool on any Chrome tab:
const groups = await fetch('http://localhost:3456/api/tab-groups').then(r => r.json());

const result = await fetch('http://localhost:3456/api/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'Search for latest AI news', timeout: 30000 })
}).then(r => r.json());
```

## Concurrency

Only one CDP operation runs at a time (mutex). Concurrent requests receive `429`:
```json
{ "error": "Server busy - another operation is in progress. Try again shortly." }
```

## Error Handling

All errors return `{ "error": "description" }` with appropriate HTTP status:
- `200` success
- `400` bad request (missing params, invalid values)
- `404` unknown endpoint
- `429` server busy
- `500` internal error (CDP connection, Comet not running)
