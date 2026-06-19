// ABOUTME: App settings for training defaults, rest timer, theme, and data backup/restore.
// ABOUTME: Persists preferences immediately and exports JSON, CSV, and a readable text log.
import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { buildCsvExport, buildJsonExport, applyJsonImport, triggerDownload } from '../lib/exportImport'
import { buildTextLogExport } from '../lib/textLog'
import { readPreferences, writePreferences } from '../lib/preferences'
import type { AppPreferences, ThemeMode, Unit } from '../types'
import { Banner } from '../components/Banner'
import { SegmentedControl } from '../components/SegmentedControl'
import { DownloadIcon, FileTextIcon, UploadIcon } from '../components/icons'

const appVersion = '2.0'

export function SettingsScreen() {
  const [preferences, setPreferences] = useState<AppPreferences>(readPreferences())
  const [isDataOpen, setIsDataOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importFileName, setImportFileName] = useState('')

  useEffect(() => {
    setPreferences(readPreferences())
  }, [])

  function persist(next: AppPreferences): void {
    setPreferences(next)
    writePreferences(next)
  }

  function updatePreference<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]): void {
    persist({ ...readPreferences(), [key]: value })
    setMessage('')
    setError('')
  }

  async function handleExportJson(): Promise<void> {
    try {
      const json = await buildJsonExport(preferences)
      await triggerDownload(`workout-backup-${dateStamp()}.json`, json, 'application/json;charset=utf-8')
      setError('')
      setMessage('Exported full backup as JSON.')
    } catch {
      setError('Could not export JSON backup.')
    }
  }

  async function handleExportCsv(): Promise<void> {
    try {
      const csv = await buildCsvExport()
      await triggerDownload(`workout-sessions-${dateStamp()}.csv`, csv, 'text/csv;charset=utf-8')
      setError('')
      setMessage('Exported sessions and sets as CSV.')
    } catch {
      setError('Could not export CSV.')
    }
  }

  async function handleExportText(): Promise<void> {
    try {
      const text = await buildTextLogExport(preferences)
      await triggerDownload(`workout-log-${dateStamp()}.txt`, text, 'text/plain;charset=utf-8')
      setError('')
      setMessage('Exported a readable log of every set and rep.')
    } catch {
      setError('Could not export the text log.')
    }
  }

  async function handleImportJson(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) {
      setImportFileName('')
      return
    }

    setImportFileName(file.name)

    if (!window.confirm('Importing will replace all current data. Continue?')) {
      event.target.value = ''
      setImportFileName('')
      return
    }

    setIsImporting(true)
    setMessage('')
    setError('')

    try {
      const text = await file.text()
      await applyJsonImport(text)
      setPreferences(readPreferences())
      setMessage('Import completed. Your data has been restored.')
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Import failed for an unknown reason.',
      )
    } finally {
      setIsImporting(false)
      event.target.value = ''
      setImportFileName('')
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow eyebrow--jade">Configure</p>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Training defaults and data backup.</p>
      </header>

      {message ? <Banner tone="success">{message}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      <div className="panel">
        <h2 className="panel__title">Appearance</h2>
        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__label">Theme</span>
            <span className="settings-row__hint">Switch between the night and overcast looks.</span>
          </div>
          <SegmentedControl
            ariaLabel="Theme"
            value={preferences.theme}
            onChange={(theme: ThemeMode) => updatePreference('theme', theme)}
            options={[
              { value: 'dark', label: 'Night' },
              { value: 'light', label: 'Day' },
            ]}
          />
        </div>
      </div>

      <div className="panel">
        <h2 className="panel__title">Logging defaults</h2>
        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__label">Default unit</span>
            <span className="settings-row__hint">Used for new exercises.</span>
          </div>
          <SegmentedControl
            ariaLabel="Default unit"
            value={preferences.defaultUnit}
            onChange={(unit: Unit) => updatePreference('defaultUnit', unit)}
            options={[
              { value: 'lb', label: 'lb' },
              { value: 'kg', label: 'kg' },
            ]}
          />
        </div>

        <label className="field">
          <span className="field__label">Default weight increment</span>
          <input
            type="number"
            min="0.1"
            step="0.1"
            inputMode="decimal"
            value={preferences.defaultWeightIncrement}
            onChange={(event) =>
              updatePreference('defaultWeightIncrement', Math.max(0.1, Number(event.target.value) || 0.1))
            }
          />
          <span className="field__hint">Step size for the +/- buttons when logging.</span>
        </label>
      </div>

      <div className="panel">
        <h2 className="panel__title">Rest timer</h2>
        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__label">Auto-start after a set</span>
            <span className="settings-row__hint">Counts down your rest between sets.</span>
          </div>
          <SegmentedControl
            ariaLabel="Rest timer"
            value={preferences.restTimerEnabled ? 'on' : 'off'}
            onChange={(value) => updatePreference('restTimerEnabled', value === 'on')}
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </div>

        <label className="field">
          <span className="field__label">Rest length (seconds)</span>
          <input
            type="number"
            min="0"
            step="5"
            inputMode="numeric"
            value={preferences.restSeconds}
            disabled={!preferences.restTimerEnabled}
            onChange={(event) =>
              updatePreference('restSeconds', Math.max(0, Math.round(Number(event.target.value) || 0)))
            }
          />
        </label>
      </div>

      <details
        className="details"
        open={isDataOpen}
        onToggle={(event) => setIsDataOpen(event.currentTarget.open)}
      >
        <summary>Backup &amp; restore</summary>
        {isDataOpen ? (
          <div className="stack">
            <div className="stack stack--tight">
              <h3 className="field__label">Export</h3>
              <div className="export-actions">
                <button type="button" className="btn" onClick={() => void handleExportText()}>
                  <FileTextIcon width={18} height={18} />
                  Export log (readable .txt)
                </button>
                <button type="button" className="btn" onClick={() => void handleExportJson()}>
                  <DownloadIcon width={18} height={18} />
                  Export full backup (JSON)
                </button>
                <button type="button" className="btn" onClick={() => void handleExportCsv()}>
                  <DownloadIcon width={18} height={18} />
                  Export sessions (CSV)
                </button>
              </div>
              <p className="field__hint">
                The readable log lists every set and rep. JSON is a complete backup you can re-import.
              </p>
            </div>

            <div className="stack stack--tight">
              <h3 className="field__label">Import</h3>
              <div className="file-picker">
                <label
                  className={isImporting ? 'file-button file-button--disabled' : 'file-button'}
                  htmlFor="settings-import-json"
                >
                  <UploadIcon width={18} height={18} />
                  {isImporting ? 'Importing…' : 'Choose JSON file'}
                </label>
                <span className="file-name">{importFileName || 'No file selected'}</span>
                <input
                  id="settings-import-json"
                  className="visually-hidden"
                  type="file"
                  accept="application/json"
                  onChange={(event) => void handleImportJson(event)}
                  disabled={isImporting}
                />
              </div>
              <p className="field__hint">Importing replaces all current data with the backup file.</p>
            </div>
          </div>
        ) : null}
      </details>

      <p className="app-version">Workout Tracker · v{appVersion}</p>
    </section>
  )
}

function dateStamp(): string {
  const now = new Date()
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
}
