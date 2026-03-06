// ABOUTME: Replays the 390x844 routines scroll flow and records scroll-owner/nav metrics.
// ABOUTME: Produces deterministic screenshot evidence for bottom-nav shell anchoring regressions.
async function main() {
  const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173/#/routines'
  const beforePath = process.argv[3] ?? '/tmp/nav-before-scroll-check.png'
  const afterPath = process.argv[4] ?? '/tmp/nav-after-scroll-check.png'

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
  const screenArea = page.locator('.screen-area')

  const before = await readMetrics(page)
  await page.screenshot({ path: beforePath })

  await screenArea.evaluate((node) => {
    node.scrollTo({ top: 360, left: 0, behavior: 'auto' })
    node.scrollTop = 360
    node.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.waitForTimeout(200)

  const after = await readMetrics(page)
  await page.screenshot({ path: afterPath })

  console.log('NAV_METRICS_BEFORE', JSON.stringify(before))
  console.log('NAV_METRICS_AFTER', JSON.stringify(after))
  console.log('SCREENSHOT_BEFORE', beforePath)
  console.log('SCREENSHOT_AFTER', afterPath)

  if (!after.screenAreaScrollChanged) {
    throw new Error('Screen area did not become the vertical scroll owner.')
  }

  if (!after.navBottomStayedPinned) {
    throw new Error('Bottom nav moved while the app scroll container scrolled.')
  }

  await browser.close()
}

async function readMetrics(page) {
  return page.evaluate(() => {
    const screenArea = document.querySelector('.screen-area')
    const nav = document.querySelector('.bottom-nav')
    const navRect = nav?.getBoundingClientRect()
    return {
      screenAreaScrollTop: screenArea?.scrollTop ?? null,
      screenAreaScrollHeight: screenArea?.scrollHeight ?? null,
      screenAreaClientHeight: screenArea?.clientHeight ?? null,
      documentScrollTop: document.scrollingElement?.scrollTop ?? null,
      navTop: navRect?.top ?? null,
      navBottom: navRect?.bottom ?? null,
      innerHeight: window.innerHeight,
      screenAreaScrollChanged: (screenArea?.scrollTop ?? 0) > 0,
      navBottomStayedPinned:
        navRect != null ? Math.abs(navRect.bottom - window.innerHeight) <= 1 : false,
    }
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
