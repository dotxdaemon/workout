// ABOUTME: Checks the Train redesign in a real browser at 390x844 and 320x693 against its acceptance criteria.
// ABOUTME: Fails when heading, entry, navigation, palette, or narrow-screen fit rules regress.
async function main() {
  const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173/'

  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    throw new Error('Missing `playwright` module. Run `npm install playwright --no-save --no-package-lock` first.')
  }

  const browser = await chromium.launch({ headless: true })
  const problems = []
  const checks = {}

  async function open(width, height) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true })
    const page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text())
    })
    page.on('pageerror', (error) => problems.push(String(error)))
    await page.goto(`${baseUrl}#/routines`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.exercise-card--active')
    return page
  }

  const page = await open(390, 844)
  const card = page.locator('.exercise-card--active')
  await card.locator('input[inputmode="decimal"]').fill('100')
  await card.locator('input[inputmode="numeric"]').fill('8')
  await card.getByRole('button', { name: 'Log set' }).tap()
  await page.waitForTimeout(900)
  const metrics = await page.evaluate(() => {
    const px = (selector, property) => parseFloat(getComputedStyle(document.querySelector(selector))[property])
    const card = document.querySelector('.exercise-card--active')
    const cardStyle = getComputedStyle(card)
    const contentWidth = card.clientWidth - parseFloat(cardStyle.paddingLeft) - parseFloat(cardStyle.paddingRight)
    const save = document.querySelector('.quick-entry__save').getBoundingClientRect()
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect()
    const activeNav = getComputedStyle(document.querySelector('.nav-link--active'))
    return {
      headings: [...document.querySelectorAll('h1')].map((heading) => heading.textContent),
      titleSize: px('.training-ledger__title', 'fontSize'),
      exerciseSize: px('.exercise-card--active .exercise-card__name', 'fontSize'),
      valueSize: px('.set-entry__input', 'fontSize'),
      saveHeight: save.height,
      saveFillsCard: Math.abs(save.width - contentWidth) < 1,
      dayChips: document.querySelectorAll('.day-chip').length,
      caption: document.querySelector('.entry-caption').textContent,
      loggedRows: document.querySelectorAll('.logged-set').length,
      canvas: getComputedStyle(document.body).backgroundColor,
      accent: getComputedStyle(document.querySelector('.quick-entry__save')).backgroundColor,
      gradients: [...document.querySelectorAll('body, .app-shell, .bottom-nav, .exercise-card--active, .btn--primary')].some(
        (element) => getComputedStyle(element).backgroundImage !== 'none',
      ),
      navLabelTransform: getComputedStyle(document.querySelector('.nav-link__label')).textTransform,
      activeNavBackground: activeNav.backgroundColor,
      navTop: nav.top,
      navBottom: nav.bottom,
    }
  })

  checks['workout name is the only page heading'] = metrics.headings.length === 1
  checks['workout title is 28-32px'] = metrics.titleSize >= 28 && metrics.titleSize <= 32
  checks['active exercise title is 18-20px'] = metrics.exerciseSize >= 18 && metrics.exerciseSize <= 20
  checks['entry values are 30-36px'] = metrics.valueSize >= 30 && metrics.valueSize <= 36
  checks['Log set is 48-52px and full width'] = metrics.saveHeight >= 48 && metrics.saveHeight <= 52 && metrics.saveFillsCard
  checks['numbered day chips are gone'] = metrics.dayChips === 0
  checks['one tap logs and prepares Set 2'] = metrics.caption === 'Set 2' && metrics.loggedRows === 1
  checks['graphite canvas and orange action'] = metrics.canvas === 'rgb(16, 17, 20)' && metrics.accent === 'rgb(255, 155, 84)'
  checks['no gradients on shell, nav, card, or primary action'] = !metrics.gradients
  checks['nav labels are sentence case without a filled block'] =
    metrics.navLabelTransform === 'none' && metrics.activeNavBackground === 'rgba(0, 0, 0, 0)'
  checks['bottom nav stays pinned to the viewport bottom'] = Math.abs(metrics.navBottom - 844) < 1

  const narrow = await open(320, 693)
  const narrowCard = narrow.locator('.exercise-card--active')
  await narrowCard.locator('input[inputmode="decimal"]').fill('102.5')
  await narrowCard.locator('input[inputmode="numeric"]').fill('12')
  await narrowCard.getByRole('button', { name: 'Log set' }).tap()
  await narrow.waitForTimeout(900)
  const clipped = await narrow.evaluate(() =>
    [...document.querySelectorAll('.training-ledger__title, .routine-menu-button, .exercise-card__name, .logged-set__value, .set-entry__input, .quick-entry__save')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.right > innerWidth + 0.5 || element.scrollWidth > element.clientWidth + 1
      })
      .map((element) => element.className),
  )
  checks['320px width fits entry values and logged rows'] = clipped.length === 0
  checks['no console warnings or errors'] = problems.length === 0

  console.log('METRICS', JSON.stringify(metrics))
  console.log('CLIPPED_AT_320', JSON.stringify(clipped))
  console.log('CONSOLE_PROBLEMS', JSON.stringify(problems))
  for (const [name, passed] of Object.entries(checks)) console.log(passed ? 'PASS' : 'FAIL', name)

  await browser.close()
  if (Object.values(checks).some((passed) => !passed)) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
