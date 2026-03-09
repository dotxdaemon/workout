// ABOUTME: Loads the routines screen at 390x844 and measures the footer surface opacity.
// ABOUTME: Fails when the bottom nav background is translucent and shows content through the bar.
async function main() {
  const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173/#/routines'
  const screenshotPath = process.argv[3] ?? '/tmp/bottom-nav-opacity-check.png'

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

  const metrics = await page.evaluate(() => {
    const nav = document.querySelector('.bottom-nav')
    if (!(nav instanceof HTMLElement)) {
      throw new Error('Bottom nav was not found.')
    }

    const style = getComputedStyle(nav)
    const backgroundColor = style.backgroundColor
    const colorParts = backgroundColor.match(/rgba?\(([^)]+)\)/i)
    const alpha = colorParts == null ? Number.NaN : Number((colorParts[1].split(',')[3] ?? '1').trim())

    return {
      backgroundColor,
      alpha: Number.isFinite(alpha) ? alpha : 1,
      backdropFilter: style.backdropFilter,
      navTop: nav.getBoundingClientRect().top,
      navBottom: nav.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    }
  })

  await page.screenshot({ path: screenshotPath, fullPage: false })

  console.log('BOTTOM_NAV_OPACITY', JSON.stringify(metrics))
  console.log('SCREENSHOT', screenshotPath)

  await browser.close()

  if (metrics.alpha < 0.999) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
