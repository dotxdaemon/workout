// ABOUTME: Replays the mobile routine edit screen and checks whether exercise row titles fit.
// ABOUTME: Captures screenshot evidence and width metrics for edit-row truncation regressions.
async function main() {
  const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173/#/routines'
  const screenshotPath = process.argv[3] ?? '/tmp/edit-row-title-width.png'

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
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.waitForSelector('.edit-exercise-row')

  const metrics = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.edit-exercise-row'))
    const row = rows.find((candidate) => candidate.querySelector('h3')?.textContent?.trim() === 'Barbell Bench Press')

    if (!(row instanceof HTMLElement)) {
      throw new Error('Barbell Bench Press edit row was not found.')
    }

    const title = row.querySelector('h3')
    const actions = row.querySelector('.edit-exercise-row__actions')
    const header = row.querySelector('.edit-exercise-row__header')

    if (!(title instanceof HTMLElement) || !(actions instanceof HTMLElement) || !(header instanceof HTMLElement)) {
      throw new Error('Required edit-row elements were not found.')
    }

    const titleRect = title.getBoundingClientRect()
    const actionsRect = actions.getBoundingClientRect()
    const headerStyle = getComputedStyle(header)

    return {
      titleClientWidth: title.clientWidth,
      titleScrollWidth: title.scrollWidth,
      titleLeft: titleRect.left,
      titleRight: titleRect.right,
      actionsLeft: actionsRect.left,
      actionsRight: actionsRect.right,
      rowWidth: row.getBoundingClientRect().width,
      headerGridTemplateColumns: headerStyle.gridTemplateColumns,
      titleFits: title.scrollWidth <= title.clientWidth + 1,
    }
  })

  await page.screenshot({ path: screenshotPath, fullPage: false })

  console.log('EDIT_ROW_TITLE_WIDTH', JSON.stringify(metrics))
  console.log('SCREENSHOT', screenshotPath)

  await browser.close()

  if (!metrics.titleFits) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
