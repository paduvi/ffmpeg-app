import { useEffect, useMemo, useState } from 'react'
import { Button, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconPlus, IconScissors, IconTrash } from '@tabler/icons-react'
import type { CutJob, CutMode, FileProgress, SampleImage, TrimRange, VideoFile } from '@shared/types'
import { VideoTable, trimFieldError, type TrimText } from '../components/VideoTable'
import { SampleStepModal, type MatchMode } from '../components/SampleStepModal'
import { ProgressModal } from '../components/ProgressModal'
import { useVideoAnalyses } from '../hooks/useVideoAnalyses'
import { parseTimecode } from '../utils/time'

const EMPTY_TRIM: TrimText = { start: '', end: '' }

export function Cutting() {
  const [files, setFiles] = useState<VideoFile[]>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [samples, setSamples] = useState<SampleImage[]>([])
  const [selectedSampleId, setSelectedSampleId] = useState<number | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [initialFiles, setInitialFiles] = useState<FileProgress[]>([])
  const [matchMode, setMatchMode] = useState<MatchMode>('end')
  // Raw text per file path — see TrimText in VideoTable.
  const [trimText, setTrimText] = useState<Map<string, TrimText>>(new Map())
  const [bulkTrim, setBulkTrim] = useState<TrimText>(EMPTY_TRIM)
  const [sampleStepOpened, { open: openSampleStep, close: closeSampleStep }] = useDisclosure(false)
  const [progressOpened, { open: openProgress, close: closeProgress }] = useDisclosure(false)

  // Probed for durations only — they seed and validate the trim windows and
  // drive the output-size column. The Cutting table shows no time estimate
  // (see VideoTable's showEstimate).
  const task = useMemo(() => ({ kind: 'cutting' as const, cutMode: 'trim' as CutMode }), [])
  const { analyses, analyzing } = useVideoAnalyses(files, task)

  useEffect(() => {
    // Restore the last-used sample; fall back to the default (permanent) one.
    Promise.all([window.api.samples.getAll(), window.api.settings.get('lastSampleImageId')]).then(
      ([all, lastId]) => {
        setSamples(all)
        const stored = all.find((s) => s.id === lastId)
        const fallback = all.find((s) => s.isPermanent) ?? all[0]
        setSelectedSampleId((stored ?? fallback)?.id ?? null)
      }
    )
  }, [])

  const selectSample = (id: number): void => {
    setSelectedSampleId(id)
    void window.api.settings.set('lastSampleImageId', id)
  }

  const addVideos = async (): Promise<void> => {
    const picked = await window.api.dialog.openVideos()
    if (!picked.length) return
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.path))
      return [...prev, ...picked.filter((f) => !existing.has(f.path))]
    })
  }

  const addSample = async (): Promise<void> => {
    const path = await window.api.dialog.openImage()
    if (!path) return
    const name = path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'sample'
    const record = await window.api.samples.insert(name, path)
    setSamples((prev) => [...prev, record])
    selectSample(record.id)
  }

  const removeSample = async (id: number): Promise<void> => {
    await window.api.samples.remove(id)
    const remaining = samples.filter((s) => s.id !== id)
    setSamples(remaining)
    if (selectedSampleId === id) {
      // Removed the active sample — fall back to the default and persist it
      const fallback = remaining.find((s) => s.isPermanent) ?? remaining[0] ?? null
      setSelectedSampleId(fallback?.id ?? null)
      void window.api.settings.set('lastSampleImageId', fallback?.id ?? null)
    }
  }

  const removeSelected = (): void => {
    setFiles((prev) => prev.filter((f) => !selectedPaths.has(f.path)))
    setTrimText((prev) => {
      const next = new Map(prev)
      for (const path of selectedPaths) next.delete(path)
      return next
    })
    setSelectedPaths(new Set())
  }

  const toggle = (path: string): void =>
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const toggleAll = (selectAll: boolean): void =>
    setSelectedPaths(selectAll ? new Set(files.map((f) => f.path)) : new Set())

  const setTrimField = (path: string, field: keyof TrimText, value: string): void =>
    setTrimText((prev) => {
      const next = new Map(prev)
      next.set(path, { ...(next.get(path) ?? EMPTY_TRIM), [field]: value })
      return next
    })

  /** Copy the bulk start/end into every selected row — only the filled fields. */
  const applyBulkTrim = (): void =>
    setTrimText((prev) => {
      const next = new Map(prev)
      for (const path of selectedPaths) {
        const current = next.get(path) ?? EMPTY_TRIM
        next.set(path, {
          start: bulkTrim.start.trim() ? bulkTrim.start : current.start,
          end: bulkTrim.end.trim() ? bulkTrim.end : current.end
        })
      }
      return next
    })

  const trimRowInvalid = (path: string): boolean => {
    const text = trimText.get(path) ?? EMPTY_TRIM
    const durationSec = analyses.get(path)?.durationSec ?? null
    return (
      trimFieldError(text, 'start', durationSec) !== null ||
      trimFieldError(text, 'end', durationSec) !== null
    )
  }

  /** Blank start = 0; blank end = to the end of the video (null). */
  const trimRangeFor = (path: string): TrimRange => {
    const text = trimText.get(path) ?? EMPTY_TRIM
    return {
      startSec: text.start.trim() ? (parseTimecode(text.start) ?? 0) : 0,
      endSec: text.end.trim() ? parseTimecode(text.end) : null
    }
  }

  /**
   * Cutting is a stream copy, so the output keeps the input's bitrate and its
   * size scales with the kept fraction of the video. With a sample image the
   * search can only shorten it further, so this is an upper bound there.
   *
   * Returns null while the row still spans the whole video — the fields start
   * empty, and "734 MB → ~734 MB" is noise, not information.
   */
  const outputBytesFor = (path: string): number | null => {
    const analysis = analyses.get(path)
    const file = files.find((f) => f.path === path)
    if (!analysis?.durationSec || !file || trimRowInvalid(path)) return null
    const { startSec, endSec } = trimRangeFor(path)
    const kept = (endSec ?? analysis.durationSec) - startSec
    if (kept <= 0 || kept >= analysis.durationSec) return null
    return file.size * (kept / analysis.durationSec)
  }

  const targets = files.filter((f) => selectedPaths.has(f.path))

  const startJob = async (cutMode: CutMode): Promise<void> => {
    if (!targets.length) return
    const sampleImageId = cutMode === 'trim' ? null : selectedSampleId
    if (cutMode !== 'trim' && sampleImageId === null) return

    // The trim window rides along in every mode — main composes it with the
    // ML search rather than choosing one or the other.
    const jobs: CutJob[] = targets.map((f) => ({
      input: f.path,
      sampleImageId,
      trim: trimRangeFor(f.path)
    }))
    // Build the initial file list before start() so the modal can show all rows
    // immediately — without waiting for the first IPC progress event.
    setInitialFiles(targets.map((f) => ({ name: f.name, value: 0, done: false, active: false })))
    const id = await window.api.cutting.start(jobs, cutMode)
    closeSampleStep()
    setJobId(id)
    openProgress()
  }

  const handleCancel = (): void => {
    if (jobId) window.api.cutting.cancel(jobId)
  }

  const handleClose = (): void => {
    setJobId(null)
    closeProgress()
  }

  const canTrim = targets.length > 0 && targets.every((f) => !trimRowInvalid(f.path))

  return (
    <Stack gap="md">
      <Title order={4}>Intelligent Video Cutting</Title>

      <Stack gap="xs">
        <Group align="center">
          <Button leftSection={<IconPlus size={16} />} onClick={addVideos}>
            Add Video
          </Button>
          <Button
            leftSection={<IconTrash size={16} />}
            variant="light"
            color="red"
            disabled={selectedPaths.size === 0}
            onClick={removeSelected}
          >
            Remove
          </Button>
          <Button
            leftSection={<IconScissors size={16} />}
            disabled={!canTrim}
            onClick={openSampleStep}
          >
            Trim
          </Button>
        </Group>

        <Group gap="xs" align="center">
          <Text size="xs" c="dimmed" fw={500}>
            Set for selected:
          </Text>
          <TextInput
            size="xs"
            w={110}
            placeholder="start 0:00"
            value={bulkTrim.start}
            onChange={(e) => setBulkTrim((p) => ({ ...p, start: e.currentTarget.value }))}
          />
          <TextInput
            size="xs"
            w={110}
            placeholder="end"
            value={bulkTrim.end}
            onChange={(e) => setBulkTrim((p) => ({ ...p, end: e.currentTarget.value }))}
          />
          <Button
            size="xs"
            variant="light"
            disabled={selectedPaths.size === 0 || (!bulkTrim.start.trim() && !bulkTrim.end.trim())}
            onClick={applyBulkTrim}
          >
            Apply
          </Button>
          <Text size="xs" c="dimmed">
            Each video keeps its own range; times accept ss, mm:ss or hh:mm:ss.
          </Text>
        </Group>

        <VideoTable
          files={files}
          selectedPaths={selectedPaths}
          onToggle={toggle}
          onToggleAll={toggleAll}
          analyses={analyses}
          analyzing={analyzing}
          showEstimate={false}
          trim={{ values: trimText, onChange: setTrimField }}
          outputBytesFor={outputBytesFor}
        />
      </Stack>

      <SampleStepModal
        opened={sampleStepOpened}
        onClose={closeSampleStep}
        targetCount={targets.length}
        samples={samples}
        selectedId={selectedSampleId}
        onSelect={selectSample}
        onAddSample={addSample}
        onRemoveSample={removeSample}
        matchMode={matchMode}
        onMatchModeChange={setMatchMode}
        onProceedWithSample={() => void startJob(matchMode)}
        onProceedWithoutSample={() => void startJob('trim')}
      />

      <ProgressModal
        opened={progressOpened}
        jobId={jobId}
        feature="cutting"
        initialFiles={initialFiles}
        onCancel={handleCancel}
        onClose={handleClose}
      />
    </Stack>
  )
}
