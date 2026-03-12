import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerAllTools } from './tools.js'

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
  version: '0.1.0',
})

registerAllTools(server)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('mcp-browser server running on stdio')
