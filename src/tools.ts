import { z } from 'zod'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getPage } from './browser.js'

const SCREENSHOT_DIR = join(process.env.HOME || tmpdir(), '.lucitra', 'screenshots')

/** Open a file in VSCode via macOS LaunchServices (works from background processes) */
function openInEditor(filePath: string) {
  execFile('open', ['-a', 'Visual Studio Code', filePath], (err) => {
    if (err) {
      // Fallback: open with default app
      execFile('open', [filePath], (err2) => {
        if (err2) console.error(`[openInEditor] failed: ${err2.message}`)
      })
    }
  })
}

async function saveAndOpen(pngBuffer: Buffer, prefix: string): Promise<string> {
  await mkdir(SCREENSHOT_DIR, { recursive: true })
  const filePath = join(SCREENSHOT_DIR, `${prefix}-${Date.now()}.png`)
  await writeFile(filePath, pngBuffer)
  openInEditor(filePath)
  return filePath
}

export function registerScreenshotTool(server: McpServer) {
  server.tool(
    'web_screenshot',
    'Take a screenshot of a web page. If a URL is provided, navigates there first. Otherwise screenshots the current page. Returns a PNG image.',
    {
      url: z
        .string()
        .url()
        .optional()
        .describe('URL to navigate to before taking the screenshot. Omit to screenshot the current page.'),
    },
    async ({ url }) => {
      try {
        const page = await getPage()

        if (url) {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
        }

        const pngBuffer = Buffer.from(await page.screenshot({ type: 'png', fullPage: false }))
        const filePath = await saveAndOpen(pngBuffer, 'web')

        return {
          content: [
            {
              type: 'image' as const,
              data: pngBuffer.toString('base64'),
              mimeType: 'image/png' as const,
            },
            {
              type: 'text' as const,
              text: `Screenshot saved: ${filePath}`,
            },
          ],
        }
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `web_screenshot failed: ${err instanceof Error ? err.message : err}` },
          ],
        }
      }
    },
  )
}

export function registerNavigateTool(server: McpServer) {
  server.tool(
    'web_navigate',
    'Navigate the browser to a URL. The browser keeps cookies and state across tool calls.',
    {
      url: z.string().url().describe('URL to navigate to'),
      waitUntil: z
        .enum(['load', 'domcontentloaded', 'networkidle'])
        .optional()
        .default('load')
        .describe('When to consider navigation complete'),
    },
    async ({ url, waitUntil }) => {
      try {
        const page = await getPage()
        const response = await page.goto(url, { waitUntil, timeout: 30_000 })
        const status = response?.status() ?? 'unknown'
        const title = await page.title()

        return {
          content: [
            { type: 'text', text: `Navigated to: ${page.url()}\nStatus: ${status}\nTitle: ${title}` },
          ],
        }
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `web_navigate failed: ${err instanceof Error ? err.message : err}` },
          ],
        }
      }
    },
  )
}

export function registerClickTool(server: McpServer) {
  server.tool(
    'web_click',
    'Click an element on the current web page by CSS selector or visible text.',
    {
      selector: z.string().optional().describe('CSS selector of the element to click'),
      text: z.string().optional().describe('Visible text of the element to click (uses getByText)'),
    },
    async ({ selector, text }) => {
      if (!selector && !text) {
        return {
          content: [{ type: 'text', text: 'Provide either selector or text to identify the element.' }],
        }
      }

      try {
        const page = await getPage()

        if (selector) {
          await page.click(selector, { timeout: 10_000 })
          return {
            content: [{ type: 'text', text: `Clicked element matching selector: ${selector}` }],
          }
        }

        await page.getByText(text!, { exact: false }).first().click({ timeout: 10_000 })
        return {
          content: [{ type: 'text', text: `Clicked element with text: "${text}"` }],
        }
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `web_click failed: ${err instanceof Error ? err.message : err}` },
          ],
        }
      }
    },
  )
}

export function registerTypeTool(server: McpServer) {
  server.tool(
    'web_type',
    'Type text into an input or textarea. Target by CSS selector or placeholder text.',
    {
      selector: z.string().optional().describe('CSS selector of the input element'),
      placeholder: z.string().optional().describe('Placeholder text to find the input'),
      text: z.string().describe('Text to type into the input'),
      clear: z
        .boolean()
        .optional()
        .default(true)
        .describe('Clear existing value before typing (default true). When false, appends.'),
    },
    async ({ selector, placeholder, text, clear }) => {
      if (!selector && !placeholder) {
        return {
          content: [{ type: 'text', text: 'Provide either selector or placeholder to identify the input.' }],
        }
      }

      try {
        const page = await getPage()

        if (placeholder) {
          const locator = page.getByPlaceholder(placeholder).first()
          if (clear) {
            await locator.fill(text)
          } else {
            await locator.type(text)
          }
          await page.waitForTimeout(100)
          const value = await locator.inputValue()
          return {
            content: [{ type: 'text', text: `Typed into input with placeholder "${placeholder}". Current value: "${value}"` }],
          }
        }

        if (clear) {
          await page.fill(selector!, text)
        } else {
          await page.type(selector!, text)
        }
        await page.waitForTimeout(100)
        const value = await page.inputValue(selector!)
        return {
          content: [{ type: 'text', text: `Typed into element matching selector: ${selector}. Current value: "${value}"` }],
        }
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `web_type failed: ${err instanceof Error ? err.message : err}` },
          ],
        }
      }
    },
  )
}

export function registerSelectTool(server: McpServer) {
  server.tool(
    'web_select',
    'Select an option from a <select> dropdown on the current web page.',
    {
      selector: z.string().describe('CSS selector of the <select> element'),
      value: z.string().optional().describe('Option value attribute to select'),
      label: z.string().optional().describe('Visible label text of the option to select'),
    },
    async ({ selector, value, label }) => {
      if (!value && !label) {
        return {
          content: [{ type: 'text', text: 'Provide either value or label to identify the option.' }],
        }
      }

      try {
        const page = await getPage()
        const option = value ? { value } : { label: label! }
        const selected = await page.selectOption(selector, option)

        return {
          content: [{ type: 'text', text: `Selected option in ${selector}. Selected values: ${JSON.stringify(selected)}` }],
        }
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `web_select failed: ${err instanceof Error ? err.message : err}` },
          ],
        }
      }
    },
  )
}

export function registerWaitTool(server: McpServer) {
  server.tool(
    'web_wait',
    'Wait for an element or text to appear/disappear on the page. Useful for async UI updates.',
    {
      selector: z.string().optional().describe('CSS selector to wait for'),
      text: z.string().optional().describe('Text content to wait for on the page'),
      state: z
        .enum(['visible', 'hidden', 'attached', 'detached'])
        .optional()
        .default('visible')
        .describe('State to wait for (default: visible)'),
      timeout: z
        .number()
        .optional()
        .default(10000)
        .describe('Maximum wait time in milliseconds (default: 10000)'),
    },
    async ({ selector, text, state, timeout }) => {
      if (!selector && !text) {
        return {
          content: [{ type: 'text', text: 'Provide either selector or text to wait for.' }],
        }
      }

      try {
        const page = await getPage()

        if (selector) {
          await page.waitForSelector(selector, { state, timeout })
          return {
            content: [{ type: 'text', text: `Element matching "${selector}" is now ${state}.` }],
          }
        }

        await page.waitForFunction(
          (t) => document.body?.innerText?.includes(t),
          text!,
          { timeout },
        )
        return {
          content: [{ type: 'text', text: `Text "${text}" is now visible on the page.` }],
        }
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `web_wait failed: ${err instanceof Error ? err.message : err}` },
          ],
        }
      }
    },
  )
}

export function registerGetInfoTool(server: McpServer) {
  server.tool(
    'web_get_info',
    'Get information about the current web page: URL, title, visible text, and links.',
    {},
    async () => {
      try {
        const page = await getPage()
        const url = page.url()
        const title = await page.title()

        const text = await page.evaluate(() => {
          const body = document.body
          if (!body) return ''
          return body.innerText.slice(0, 5000)
        })

        const links = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]'))
            .slice(0, 50)
            .map((a) => ({
              text: (a as HTMLAnchorElement).innerText.trim().slice(0, 100),
              href: (a as HTMLAnchorElement).href,
            }))
            .filter((l) => l.text.length > 0)
        })

        const linksText = links.map((l) => `  [${l.text}](${l.href})`).join('\n')

        return {
          content: [
            {
              type: 'text',
              text: `URL: ${url}\nTitle: ${title}\n\nVisible text:\n${text}\n\nLinks (${links.length}):\n${linksText}`,
            },
          ],
        }
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `web_get_info failed: ${err instanceof Error ? err.message : err}` },
          ],
        }
      }
    },
  )
}

/**
 * Register all browser tools on an MCP server.
 */
export function registerAllTools(server: McpServer) {
  registerScreenshotTool(server)
  registerNavigateTool(server)
  registerClickTool(server)
  registerTypeTool(server)
  registerSelectTool(server)
  registerWaitTool(server)
  registerGetInfoTool(server)
}
