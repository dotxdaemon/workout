import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { buildCsvExport, buildJsonExport, applyJsonImport, triggerDownload } from '../lib/exportImport'
import { readPreferences, writePreferences } from '../lib/preferences'
import type { AppPreferences, Unit } from '../types'

export function SettingsScreen() {
  const [preferences, setPreferences] = useState<AppPreferences>(readPreferences())
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    setPreferences(readPreferences())
  }, [])

  function handleSavePreferences(): void {
    writePreferences(preferences)
    setMessage('Settings saved.')
    setError('')
  }

  async function handleExportJson(): Promise<void> {
    const json = await buildJsonExport(preferences)
    await triggerDownload(
      `workout-export-${Date.now()}.json`,
      json,
      'application/json;charset=utf-8',
    )
  }

  async function handleExportCsv(): Promise<void> {
    const csv = await buildCsvExport()
    await triggerDownload(
      `workout-sessions-${Date.now()}.csv`,
      csv,
      'text/csv;charset=utf-8',
    )
  }

  async function handleImportJson(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!window.confirm('Import will overwrite current data. Continue?')) {
      event.target.value = ''
      return
    }

    setIsImporting(true)
    setMessage('')
    setError('')

    try {
      const text = await file.text()
      await applyJsonImport(text)
      const nextPreferences = readPreferences()
      setPreferences(nextPreferences)
      setMessage('Import completed.')
    } catch (caughtError) {
      const text =
        caughtError instanceof Error
          ? caughtError.message
          : 'Import failed for an unknown reason.'
      setError(text)
    } finally {
      setIsImporting(false)
      event.target.value = ''
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <p>Defaults, rest timer, and data export/import.</p>
      </header>

      {message ? <p className="success-banner">{message}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      <div className="panel">
        <h2>Defaults</h2>
        <label className="stack stack--tight">
          <span>Default unit</span>
          <select
            value={preferences.defaultUnit}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                defaultUnit: event.target.value as Unit,
              }))
            }
          >
            <option value="lb">lb</option>
            <option value="kg">kg</option>
          </select>
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={preferences.restTimerEnabled}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                restTimerEnabled: event.target.checked,
              }))
            }
          />
          Enable rest timer by default
        </label>

        <label className="stack stack--tight">
          <span>Default rest timer (seconds)</span>
          <input
            type="number"
            min="0"
            value={preferences.restSeconds}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                restSeconds: Math.max(0, Number(event.target.value) || 0),
              }))
            }
          />
        </label>

        <button type="button" className="button button--primary" onClick={handleSavePreferences}>
          Save defaults
        </button>
      </div>

      <div className="panel">
        <h2>Export</h2>
        <div className="button-row">
          <button type="button" className="button" onClick={() => void handleExportJson()}>
            Export JSON (full database)
          </button>
          <button type="button" className="button" onClick={() => void handleExportCsv()}>
            Export CSV (sessions + sets)
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Import</h2>
        <label className="stack stack--tight">
          <span>Import JSON</span>
          <input
            type="file"
            accept="application/json"
            onChange={(event) => void handleImportJson(event)}
            disabled={isImporting}
          />
        </label>
      </div>
    </section>
  )
}
