// ABOUTME: Replays the 390x844 save-set flow and records shell/nav metrics before and after save.
// ABOUTME: Produces deterministic screenshot evidence for bottom-nav jump regressions.
async function main() {
  const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173/#/routines'
  const beforePath = process.argv[3] ?? '/tmp/nav-before-save-check.png'
  const afterPath = process.argv[4] ?? '/tmp/nav-after-save-check.png'

  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    throw new Error('Missing `playwright` module. Run `npm install playwright --no-save --no-package-lock` first.')
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()

  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.waitForSelector('.today-card')

  const firstCard = page.locator('.today-card').first()
  const weightInput = firstCard.locator('.compact-field input').first()
  const repsInput = firstCard.locator('.compact-field input').nth(1)

  await weightInput.click()
  await weightInput.fill('95')
  await repsInput.click()
  await repsInput.fill('8')

  const before = await readMetrics(page)
  await page.screenshot({ path: beforePath, fullPage: true })

  await firstCard.locator('.today-card__complete-button').click()
  await page.waitForTimeout(500)

  const after = await readMetrics(page)
  await page.screenshot({ path: afterPath, fullPage: true })

  console.log('NAV_METRICS_BEFORE', JSON.stringify(before))
  console.log('NAV_METRICS_AFTER', JSON.stringify(after))
  console.log('SCREENSHOT_BEFORE', beforePath)
  console.log('SCREENSHOT_AFTER', afterPath)

  await browser.close()
}

async function readMetrics(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('.bottom-nav')
    const navRect = nav?.getBoundingClientRect()
    return {
      shellHeight: getComputedStyle(document.documentElement).getPropertyValue('--app-shell-height').trim(),
      visualHeight: window.visualViewport?.height ?? null,
      visualOffsetTop: window.visualViewport?.offsetTop ?? null,
      navTop: navRect?.top ?? null,
      navBottom: navRect?.bottom ?? null,
      innerHeight: window.innerHeight,
    }
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
