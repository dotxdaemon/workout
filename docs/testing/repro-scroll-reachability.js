// ABOUTME: Replays the 390x844 save-set flow on a lower routine card and verifies the mode toggle is reachable again.
// ABOUTME: Captures deterministic screenshots and scroll metrics for the document-scroll regression.
async function main() {
  const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173/#/routines'
  const beforePath = process.argv[3] ?? '/tmp/reachability-before.png'
  const afterPath = process.argv[4] ?? '/tmp/reachability-after.png'

  let webkit
  let devices
  try {
    ;({ webkit, devices } = await import('playwright'))
  } catch {
    throw new Error('Missing `playwright` module. Run `npm install playwright --no-save --no-package-lock` first.')
  }

  const browser = await webkit.launch({ headless: true })
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()

  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.waitForSelector('.today-card')
  await page.evaluate(() => window.scrollTo({ top: 320, left: 0, behavior: 'auto' }))
  await page.waitForTimeout(200)

  const targetCard = page.locator('.today-card').nth(3)
  await targetCard.scrollIntoViewIfNeeded()
  await page.waitForTimeout(100)
  await targetCard.locator('input[inputmode="decimal"]').fill('95')
  await targetCard.locator('input[inputmode="numeric"]').fill('8')

  const before = await readMetrics(page)
  await page.screenshot({ path: beforePath, fullPage: true })

  await targetCard.locator('.today-card__complete-button').click()
  await page.waitForTimeout(400)
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }))
  await page.waitForTimeout(300)

  const after = await readMetrics(page)
  await page.screenshot({ path: afterPath, fullPage: true })

  console.log('REACHABILITY_BEFORE', JSON.stringify(before))
  console.log('REACHABILITY_AFTER', JSON.stringify(after))
  console.log('SCREENSHOT_BEFORE', beforePath)
  console.log('SCREENSHOT_AFTER', afterPath)

  await browser.close()

  if (!after.toggleVisible || after.windowScrollY !== 0) {
    process.exitCode = 1
  }
}

async function readMetrics(page) {
  return page.evaluate(() => {
    const header = document.querySelector('.routines-header')
    const nav = document.querySelector('.bottom-nav')
    const screenArea = document.querySelector('.screen-area')
    const headerRect = header?.getBoundingClientRect()
    const navRect = nav?.getBoundingClientRect()

    return {
      windowScrollY: window.scrollY,
      screenAreaScrollTop: screenArea instanceof HTMLElement ? screenArea.scrollTop : null,
      toggleVisible: headerRect ? headerRect.bottom > 0 && headerRect.top < window.innerHeight : false,
      headerTop: headerRect?.top ?? null,
      headerBottom: headerRect?.bottom ?? null,
      navTop: navRect?.top ?? null,
      navBottom: navRect?.bottom ?? null,
      navHeight: navRect?.height ?? null,
    }
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
