// ABOUTME: Replays the routines scroll flow at 390x844 and detects card overlap with the bottom nav.
// ABOUTME: Captures deterministic screenshot evidence for bottom-nav/content collision regressions.
async function main() {
  const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173/#/routines'
  const screenshotPath = process.argv[3] ?? '/tmp/bottom-nav-overlap-check.png'

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
  await page.waitForSelector('.today-card')

  const scrollOwner = await page.evaluate((top) => {
    const screenArea = document.querySelector('.screen-area')
    if (screenArea instanceof HTMLElement) {
      const style = getComputedStyle(screenArea)
      const ownsVerticalScroll =
        ['auto', 'scroll'].includes(style.overflowY) && screenArea.scrollHeight > screenArea.clientHeight

      if (ownsVerticalScroll) {
        screenArea.scrollTo({ top, left: 0, behavior: 'auto' })
        screenArea.scrollTop = top
        screenArea.dispatchEvent(new Event('scroll', { bubbles: true }))
        return 'screen-area'
      }
    }

    window.scrollTo({ top, left: 0, behavior: 'auto' })
    return 'document'
  }, 200)

  await page.waitForTimeout(180)

  const metrics = await page.evaluate(() => {
    const nav = document.querySelector('.bottom-nav')
    const screenArea = document.querySelector('.screen-area')

    if (!(nav instanceof HTMLElement) || !(screenArea instanceof HTMLElement)) {
      throw new Error('Required app shell elements were not found.')
    }

    const navRect = nav.getBoundingClientRect()
    const screenRect = screenArea.getBoundingClientRect()
    const visibleOverlap = screenRect.bottom - navRect.top

    return {
      visibleOverlap,
      navTop: navRect.top,
      navBottom: navRect.bottom,
      navHeight: navRect.height,
      screenAreaTop: screenRect.top,
      screenAreaBottom: screenRect.bottom,
      screenAreaScrollTop: screenArea.scrollTop,
      documentScrollTop: document.scrollingElement?.scrollTop ?? null,
      viewportHeight: window.innerHeight,
    }
  })

  await page.screenshot({ path: screenshotPath, fullPage: false })

  console.log('SCROLL_OWNER', scrollOwner)
  console.log('BOTTOM_NAV_OVERLAP', JSON.stringify(metrics))
  console.log('SCREENSHOT', screenshotPath)

  await browser.close()

  if (metrics.visibleOverlap > 1) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
