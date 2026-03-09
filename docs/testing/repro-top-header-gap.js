// ABOUTME: Replays the routines scroll flow at 390x844 and measures exposed space above the sticky header.
// ABOUTME: Fails when the scroll container padding leaves visible content above the routines header.
async function main() {
  const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173/#/routines'
  const screenshotPath = process.argv[3] ?? '/tmp/top-header-gap-check.png'

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
  await page.waitForSelector('.routines-header')

  await page.evaluate(() => {
    const screenArea = document.querySelector('.screen-area')
    if (screenArea instanceof HTMLElement) {
      screenArea.scrollTop = 260
      screenArea.dispatchEvent(new Event('scroll', { bubbles: true }))
    }
  })

  await page.waitForTimeout(120)

  const metrics = await page.evaluate(() => {
    const screenArea = document.querySelector('.screen-area')
    const header = document.querySelector('.routines-header')
    if (!(screenArea instanceof HTMLElement) || !(header instanceof HTMLElement)) {
      throw new Error('Required routines shell elements were not found.')
    }

    const screenRect = screenArea.getBoundingClientRect()
    const headerRect = header.getBoundingClientRect()

    return {
      screenTop: screenRect.top,
      headerTop: headerRect.top,
      exposedGap: headerRect.top - screenRect.top,
      screenScrollTop: screenArea.scrollTop,
    }
  })

  await page.screenshot({ path: screenshotPath, fullPage: false })

  console.log('TOP_HEADER_GAP', JSON.stringify(metrics))
  console.log('SCREENSHOT', screenshotPath)

  await browser.close()

  if (metrics.exposedGap > 1) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
