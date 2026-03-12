import { createRequire } from 'node:module'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import updateNotifier from 'update-notifier'
import { registerAllTools } from './tools.js'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

updateNotifier({ pkg }).notify({ isGlobal: true })

// Re-export for library usage
export { getPage } from './browser.js'
export {
  registerAllTools,
  registerScreenshotTool,
  registerNavigateTool,
  registerClickTool,
  registerTypeTool,
  registerSelectTool,
  registerWaitTool,
  registerGetInfoTool,
} from './tools.js'

const server = new McpServer({
  name: 'mcp-browser',
  version: pkg.version,
})

registerAllTools(server)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`mcp-browser v${pkg.version} running on stdio`)
