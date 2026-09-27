// ABOUTME: Measures Train and Settings presentation at 390x844 against the visual polish acceptance criteria.
// ABOUTME: Fails when the sticky header lets content bleed through, controls diverge in style, or nav geometry moves.
async function main() {
  const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173/'
  const screenshotDir = process.argv[3] ?? '/tmp'

  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    throw new Error('Missing `playwright` module. Run `npm install playwright --no-save --no-package-lock` first.')
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const consoleProblems = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') consoleProblems.push(message.text())
  })
  page.on('pageerror', (error) => consoleProblems.push(String(error)))

  await page.goto(`${baseUrl}#/routines`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.exercise-card--active')

  const train = await page.evaluate(() => {
    const style = (selector) => {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`)
      return getComputedStyle(element)
    }
    const alpha = (color) => {
      const match = color.match(/rgba?\(([^)]+)\)/)
      if (!match) return 1
      const parts = match[1].split(',').map((part) => part.trim())
      return parts.length === 4 ? Number(parts[3]) : 1
    }
    const header = style('.training-console--today')
    const days = style('.training-console__days')
    const modes = style('.training-console .segmented')
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect()
    return {
      headerBackgroundImage: header.backgroundImage,
      headerBackgroundAlpha: alpha(header.backgroundColor),
      dayTrackBackground: days.backgroundColor,
      modeTrackBackground: modes.backgroundColor,
      dayTrackRadius: days.borderTopLeftRadius,
      modeTrackRadius: modes.borderTopLeftRadius,
      activeCardShadow: style('.exercise-card--active').boxShadow,
      finishDisabledOpacity: Number(style('.finish-workout').opacity),
      primaryRadius: style('.entry-actions .btn--primary').borderTopLeftRadius,
      wellRadius: style('.quick-entry .set-entry__value').borderTopLeftRadius,
      navLabelTransform: style('.nav-link__label').textTransform,
      navLabelFont: style('.nav-link__label').fontFamily,
      navTop: nav.top,
      navBottom: nav.bottom,
    }
  })
  await page.screenshot({ path: `${screenshotDir}/train-visual-polish.png` })

  await page.getByRole('button', { name: /Add exercise/ }).click()
  await page.evaluate(() => {
    document.querySelector('.screen-area').scrollTop = 120
  })
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${screenshotDir}/train-visual-polish-scrolled.png` })

  await page.goto(`${baseUrl}#/settings`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.settings-row')
  const settings = await page.evaluate(() => {
    const row = document.querySelector('.settings-row')
    const label = row.querySelector('.settings-row__label').getBoundingClientRect()
    const control = row.querySelector('.segmented').getBoundingClientRect()
    const details = getComputedStyle(document.querySelector('.settings-page .details'))
    return {
      themeLabelOffset: Math.abs(label.top + label.height / 2 - (control.top + control.height / 2)),
      detailsBorderTop: details.borderTopWidth,
    }
  })
  await page.screenshot({ path: `${screenshotDir}/settings-visual-polish.png` })

  const checks = {
    'sticky header is opaque': train.headerBackgroundImage === 'none' && train.headerBackgroundAlpha === 1,
    'day and mode selectors share one track style':
      train.dayTrackBackground === train.modeTrackBackground && train.dayTrackRadius === train.modeTrackRadius,
    'active card has no inset rail': train.activeCardShadow === 'none',
    'disabled finish stays legible': train.finishDisabledOpacity >= 0.6,
    'entry wells and primary action share a radius': train.primaryRadius === train.wellRadius,
    'nav labels use sentence case in the body font':
      train.navLabelTransform === 'none' && !/mono/i.test(train.navLabelFont),
    'bottom nav stays pinned to the viewport bottom': Math.abs(train.navBottom - 844) < 1,
    'theme label centers on its control': settings.themeLabelOffset <= 2,
    'backup section has a single divider': settings.detailsBorderTop === '0px',
    'no console warnings or errors': consoleProblems.length === 0,
  }

  console.log('TRAIN_METRICS', JSON.stringify(train))
  console.log('SETTINGS_METRICS', JSON.stringify(settings))
  console.log('CONSOLE_PROBLEMS', JSON.stringify(consoleProblems))
  for (const [name, passed] of Object.entries(checks)) console.log(passed ? 'PASS' : 'FAIL', name)

  await browser.close()
  if (Object.values(checks).some((passed) => !passed)) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
