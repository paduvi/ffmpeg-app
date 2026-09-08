import { useEffect, useRef, useState } from 'react'
import { Box, Button, Group, Modal, Progress, Stack, Text } from '@mantine/core'
import { IconCheck, IconFolderOpen } from '@tabler/icons-react'
import type { FileProgress } from '@shared/types'

type Props = {
  opened: boolean
  jobId: string | null
  feature: 'compression' | 'cutting'
  /** Pre-populate file rows immediately on open to avoid the race where the
   *  first IPC progress event arrives before useEffect registers its listener. */
  initialFiles: FileProgress[]
  onCancel: () => void
  onClose: () => void
}

/** Per-row progress-rate tracker for the remaining-time estimate. */
type RateInfo = { lastValue: number; lastTime: number; rate: number | null }

/**
 * Size change once a file is done, e.g. "−62%". Positive numbers mean the file
 * shrank. A grown file is shown too rather than hidden — it is the one case a
 * user most wants to notice.
 */
function formatSizeChange(fp: FileProgress): { label: string; grew: boolean } | null {
  if (!fp.inputBytes || fp.outputBytes === undefined) return null
  const change = 1 - fp.outputBytes / fp.inputBytes
  const percent = Math.round(Math.abs(change) * 100)
  if (percent === 0) return { label: 'same size', grew: false }
  return { label: `${change > 0 ? '−' : '+'}${percent}%`, grew: change < 0 }
}

function formatEta(ms: number): string {
  const totalS = Math.ceil(ms / 1000)
  if (totalS < 60) return `${totalS}s`
  const m = Math.floor(totalS / 60)
  if (m < 60) return `${m}m ${String(totalS % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export function ProgressModal({ opened, jobId, feature, initialFiles, onCancel, onClose }: Props) {
  const [files, setFiles] = useState<FileProgress[]>([])
  const [outputDir, setOutputDir] = useState<string | null>(null)
  // Estimated remaining time, derived renderer-side from value deltas — the
  // services only ever send FileProgress, never ETA fields.
  const rates = useRef<Map<number, RateInfo>>(new Map())

  const allDone = files.length > 0 && files.every((f) => f.done)
  const finished = outputDir !== null

  useEffect(() => {
    if (!opened || !jobId) return
    // Seed with known file names so rows appear immediately — before the first
    // IPC progress event arrives (which might come before this effect runs).
    setFiles(initialFiles.length > 0 ? initialFiles : [])
    setOutputDir(null)
    rates.current.clear()

    const api = window.api[feature]
    const offProgress = api.onProgress((jid, progress) => {
      if (jid !== jobId) return
      const now = Date.now()
      progress.forEach((fp, i) => {
        if (fp.done) {
          rates.current.delete(i)
          return
        }
        if (!fp.active || fp.value <= 0) return
        const prev = rates.current.get(i)
        if (!prev || fp.value < prev.lastValue) {
          // First sample, or value went backwards (software-retry reset) — start over
          rates.current.set(i, { lastValue: fp.value, lastTime: now, rate: null })
          return
        }
        const dv = fp.value - prev.lastValue
        const dt = now - prev.lastTime
        if (dv > 0 && dt > 0) {
          // EMA-smoothed progress rate (fraction per ms) absorbs the jitter of
          // per-frame and per-ffmpeg-line update cadences.
          const inst = dv / dt
          const rate = prev.rate === null ? inst : 0.3 * inst + 0.7 * prev.rate
          rates.current.set(i, { lastValue: fp.value, lastTime: now, rate })
        }
      })
      setFiles(progress)
    })
    const offDone = api.onDone((jid, dir) => {
      if (jid === jobId) {
        setFiles((prev) => prev.map((f) => ({ ...f, value: 1, done: true, active: false })))
        setOutputDir(dir || null)
      }
    })
    return () => {
      offProgress()
      offDone()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, jobId, feature]) // intentionally exclude initialFiles — it seeds once on open

  const title = finished
    ? 'Done!'
    : feature === 'compression'
      ? 'Compressing…'
      : 'Processing…'

  return (
    <Modal
      opened={opened}
      onClose={() => {}}
      withCloseButton={false}
      title={title}
      centered
      size="md"
    >
      <Stack gap="md">
        {/* A plain scroll box, not ScrollArea.Autosize: that component's inner
            flex wrapper keeps `min-width: auto`, so a single long file name
            sizes it past the modal's width and the row Text never ellipses. */}
        <Box mah={360} style={{ overflowY: 'auto', overflowX: 'hidden' }}>
          <Stack gap="sm" pr={4}>
            {files.map((fp, i) => {
              // Show an estimate only once there is enough signal: some real
              // progress, a smoothed rate, and a sane (<24 h) extrapolation.
              let eta: string | null = null
              if (fp.active && !fp.done && fp.value >= 0.05 && fp.value < 1) {
                const rate = rates.current.get(i)?.rate
                if (rate) {
                  const remainingMs = (1 - fp.value) / rate
                  if (isFinite(remainingMs) && remainingMs > 0 && remainingMs < 24 * 3600 * 1000) {
                    eta = formatEta(remainingMs)
                  }
                }
              }
              return (
              <Box key={i}>
                <Group justify="space-between" mb={4} gap="xs" wrap="nowrap">
                  <Text size="sm" truncate title={fp.name} style={{ flex: 1, minWidth: 0 }}>
                    {fp.name}
                  </Text>
                  {fp.done ? (
                    <Group gap={4} style={{ flexShrink: 0 }} wrap="nowrap">
                      <IconCheck size={14} color="var(--mantine-color-green-6)" />
                      <Text size="xs" c="green">Done</Text>
                      {(() => {
                        const change = formatSizeChange(fp)
                        return change ? (
                          <Text size="xs" c={change.grew ? 'orange' : 'dimmed'}>
                            · {change.label}
                          </Text>
                        ) : null
                      })()}
                    </Group>
                  ) : (
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      {fp.active && fp.value === 0
                        ? 'Preparing…'
                        : eta
                          ? `${Math.round(fp.value * 100)}% · ~${eta} left`
                          : `${Math.round(fp.value * 100)}%`}
                    </Text>
                  )}
                </Group>
                <Progress
                  value={fp.done ? 100 : fp.active ? Math.max(fp.value * 100, 2) : 0}
                  color={fp.done ? 'green' : undefined}
                  animated={fp.active && !fp.done}
                  striped={fp.active && fp.value < 0.02 && !fp.done}
                  size="sm"
                  radius="xl"
                />
              </Box>
              )
            })}

            {files.length === 0 && (
              <Text size="sm" c="dimmed" ta="center">
                Starting…
              </Text>
            )}
          </Stack>
        </Box>

        {allDone || finished ? (
          <Group justify="center">
            {outputDir && (
              <Button
                variant="light"
                leftSection={<IconFolderOpen size={16} />}
                onClick={() => window.api.dialog.showItemInFolder(outputDir)}
              >
                Show in Folder
              </Button>
            )}
            <Button onClick={onClose}>Close</Button>
          </Group>
        ) : (
          <Button color="red" fullWidth onClick={onCancel}>
            Cancel All
          </Button>
        )}
      </Stack>
    </Modal>
  )
}
