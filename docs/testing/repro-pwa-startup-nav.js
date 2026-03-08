// ABOUTME: Replays the routines startup shell at 390x844 with a simulated standalone top safe area.
// ABOUTME: Captures deterministic evidence that the bottom nav remains visible on first load.
async function main() {
  const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173/#/routines'
  const screenshotPath = process.argv[3] ?? '/tmp/pwa-startup-nav-check.png'

  let webkit
  try {
    ;({ webkit } = await import('playwright'))
  } catch {
    throw new Error('Missing `playwright` module. Run `npm install playwright --no-save --no-package-lock` first.')
  }

  const browser = await webkit.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()

  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.waitForSelector('.bottom-nav')
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-top', '47px')
  })
  await page.waitForTimeout(120)

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('.app-shell')
    const nav = document.querySelector('.bottom-nav')

    if (!(shell instanceof HTMLElement) || !(nav instanceof HTMLElement)) {
      throw new Error('Required shell elements were not found.')
    }

    const shellRect = shell.getBoundingClientRect()
    const navRect = nav.getBoundingClientRect()
    return {
      shellPaddingTop: getComputedStyle(shell).paddingTop,
      shellTop: shellRect.top,
      shellBottom: shellRect.bottom,
      navTop: navRect.top,
      navBottom: navRect.bottom,
      navHeight: navRect.height,
      viewportHeight: window.innerHeight,
      navVisibleOnLoad: navRect.top < window.innerHeight && navRect.bottom <= window.innerHeight + 1,
    }
  })

  await page.screenshot({ path: screenshotPath, fullPage: false })

  console.log('PWA_STARTUP_NAV', JSON.stringify(metrics))
  console.log('SCREENSHOT', screenshotPath)

  await browser.close()

  if (metrics.shellPaddingTop !== '47px' || !metrics.navVisibleOnLoad) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
