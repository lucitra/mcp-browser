# @lucitra/mcp-browser

MCP server for browser automation via Playwright. Navigate, click, type, screenshot, and inspect web pages from any MCP client.

## Install

```bash
npm install @lucitra/mcp-browser
```

## Usage with Claude Code

Add to your Claude Code config (`~/.claude.json`):

```json
{
  "mcpServers": {
    "browser": {
      "type": "stdio",
      "command": "npx",
      "args": ["@lucitra/mcp-browser"]
    }
  }
}
```

## Usage as a Library

Import the tool registration functions to add browser tools to your own MCP server:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAllTools } from '@lucitra/mcp-browser'

const server = new McpServer({ name: 'my-server', version: '1.0.0' })
registerAllTools(server)
```

## Available Tools

| Tool | Description |
|------|-------------|
| `web_screenshot` | Take a screenshot of a web page. Optionally navigate to a URL first. |
| `web_navigate` | Navigate the browser to a URL. Cookies and state persist across calls. |
| `web_click` | Click an element by CSS selector or visible text. |
| `web_type` | Type text into an input by CSS selector or placeholder. |
| `web_select` | Select an option from a `<select>` dropdown. |
| `web_wait` | Wait for an element or text to appear/disappear. |
| `web_get_info` | Get the current page URL, title, visible text, and links. |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CDP_PORT` | `9222` | Chrome DevTools Protocol port for connecting to an existing browser |
| `BROWSER_PROFILE` | `~/.mcp-browser/chrome-profile` | Path to persistent browser profile directory |
| `BROWSER_HEADLESS` | `true` | Set to `"false"` to launch in headed mode |
| `BROWSER_VIEWPORT_WIDTH` | `1280` | Browser viewport width |
| `BROWSER_VIEWPORT_HEIGHT` | `720` | Browser viewport height |

## Browser Connection Priority

1. **CDP** — Connects to an existing Chrome instance via DevTools Protocol (uses existing cookies/sessions)
2. **Persistent Profile** — Launches Chromium with a persistent user data directory
3. **Fresh Context** — Falls back to a fresh browser context if the profile is locked

## Prerequisites

Playwright needs a Chromium binary. On first run:

```bash
npx playwright install chromium
```

## License

MIT
