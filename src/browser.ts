/**
 * Playwright browser lifecycle manager.
 *
 * Connection priority:
 * 1. Connect to existing Chrome via CDP (configurable port, default 9222).
 * 2. Launch Playwright Chromium with a persistent profile so cookies/sessions
 *    survive across tool calls.
 * 3. Launch Playwright Chromium with a fresh context as a last resort.
 *
 * Single persistent page — state persists within a session.
 * Cleanup happens when the MCP process exits.
 *
 * Environment variables:
 *   CDP_PORT         — Chrome DevTools Protocol port (default: 9222)
 *   BROWSER_PROFILE  — Path to persistent browser profile directory
 *                      (default: ~/.mcp-browser/chrome-profile)
 *   BROWSER_HEADLESS — Set to "false" to launch in headed mode (default: true)
 *   BROWSER_VIEWPORT_WIDTH  — Viewport width (default: 1280)
 *   BROWSER_VIEWPORT_HEIGHT — Viewport height (default: 720)
 */

import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Browser, BrowserContext, Page } from 'playwright'

const CDP_PORT = parseInt(process.env.CDP_PORT ?? '9222', 10)
const PROFILE_DIR = process.env.BROWSER_PROFILE ?? join(homedir(), '.mcp-browser', 'chrome-profile')
const HEADLESS = process.env.BROWSER_HEADLESS !== 'false'
const VIEWPORT = {
  width: parseInt(process.env.BROWSER_VIEWPORT_WIDTH ?? '1280', 10),
  height: parseInt(process.env.BROWSER_VIEWPORT_HEIGHT ?? '720', 10),
}

let browser: Browser | null = null
let page: Page | null = null
let launching: Promise<Page> | null = null
let connectedViaCDP = false
let chromiumInstallAttempted = false

function isMissingBrowserError(msg: string): boolean {
  return (
    msg.includes('Executable doesn') ||
    msg.includes('browserType.launch') ||
    msg.includes('browserType.launchPersistentContext') ||
    msg.includes('PLAYWRIGHT_BROWSERS_PATH')
  )
}

async function ensureChromium(): Promise<void> {
  if (chromiumInstallAttempted) return
  chromiumInstallAttempted = true

  console.error('[mcp-browser] Chromium not found — installing automatically...')
  try {
    execFileSync('npx', ['--yes', 'playwright', 'install', 'chromium'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    })
    console.error('[mcp-browser] Chromium installed successfully')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Failed to auto-install Chromium. Install manually: npx playwright install chromium\n${msg}`
    )
  }
}

async function connectCDP(): Promise<Page | null> {
  let chromium: typeof import('playwright').chromium

  try {
    const pw = await import('playwright')
    chromium = pw.chromium
  } catch {
    return null
  }

  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    connectedViaCDP = true

    const contexts = browser.contexts()
    let context: BrowserContext
    if (contexts.length > 0) {
      context = contexts[0]
    } else {
      context = await browser.newContext({ viewport: VIEWPORT })
    }

    page = await context.newPage()

    console.error(`[mcp-browser] Connected to Chrome via CDP on port ${CDP_PORT}`)
    return page
  } catch {
    browser = null
    connectedViaCDP = false
    return null
  }
}

async function launchWithProfile(): Promise<Page> {
  let chromium: typeof import('playwright').chromium

  try {
    const pw = await import('playwright')
    chromium = pw.chromium
  } catch {
    throw new Error(
      'Playwright is not installed. Run: npx playwright install chromium'
    )
  }

  try {
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: HEADLESS,
      viewport: VIEWPORT,
    })

    browser = null
    page = context.pages()[0] || (await context.newPage())

    console.error(`[mcp-browser] Launched Chromium with profile: ${PROFILE_DIR}`)
    return page
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

    if (msg.includes('lock') || msg.includes('already in use') || msg.includes('SingletonLock')) {
      console.error('[mcp-browser] Profile locked, launching fresh context')
      return launchFresh(chromium)
    }

    if (isMissingBrowserError(msg)) {
      await ensureChromium()
      // Retry once after install
      const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: HEADLESS,
        viewport: VIEWPORT,
      })
      browser = null
      page = context.pages()[0] || (await context.newPage())
      console.error(`[mcp-browser] Launched Chromium with profile: ${PROFILE_DIR}`)
      return page
    }

    throw err
  }
}

async function launchFresh(chromium: typeof import('playwright').chromium): Promise<Page> {
  try {
    browser = await chromium.launch({ headless: HEADLESS })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (isMissingBrowserError(msg)) {
      await ensureChromium()
      browser = await chromium.launch({ headless: HEADLESS })
    } else {
      throw err
    }
  }

  const context = await browser.newContext({ viewport: VIEWPORT })
  page = await context.newPage()

  console.error('[mcp-browser] Launched Chromium with fresh context')
  return page
}

async function launch(): Promise<Page> {
  const cdpPage = await connectCDP()
  if (cdpPage) return cdpPage
  return launchWithProfile()
}

/**
 * Get the persistent browser page, launching if needed.
 * Promise-based lock prevents double-init from concurrent tool calls.
 */
export async function getPage(): Promise<Page> {
  if (page) {
    if (connectedViaCDP && browser?.isConnected()) return page
    if (!connectedViaCDP && !page.isClosed()) return page
  }

  if (launching) return launching

  launching = launch()
  try {
    return await launching
  } finally {
    launching = null
  }
}

async function cleanup() {
  try {
    if (connectedViaCDP) {
      await page?.close().catch(() => {})
      await browser?.close().catch(() => {})
    } else if (browser) {
      await browser.close()
    } else if (page) {
      await page.context().close()
    }
  } catch {
    // Best-effort cleanup
  }
  browser = null
  page = null
  connectedViaCDP = false
}

process.on('exit', () => {
  if (connectedViaCDP) {
    page?.close().catch(() => {})
    browser?.close().catch(() => {})
  } else {
    browser?.close().catch(() => {})
    page?.context().close().catch(() => {})
  }
})

process.on('SIGTERM', async () => {
  await cleanup()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await cleanup()
  process.exit(0)
})
