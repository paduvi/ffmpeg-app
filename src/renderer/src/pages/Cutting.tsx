import { useEffect, useState } from 'react'
import { Button, Grid, Group, Image, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconPlus, IconScissors, IconPhoto } from '@tabler/icons-react'
import type { CutMode, FileProgress, SampleImage, VideoFile } from '@shared/types'
import { VideoTable } from '../components/VideoTable'
import { SampleImageTable } from '../components/SampleImageTable'
import { ProgressModal } from '../components/ProgressModal'

export function Cutting() {
  const [files, setFiles] = useState<VideoFile[]>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [samples, setSamples] = useState<SampleImage[]>([])
  const [selectedSampleId, setSelectedSampleId] = useState<number | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [initialFiles, setInitialFiles] = useState<FileProgress[]>([])
  const [cutMode, setCutMode] = useState<CutMode>('end')
  const [progressOpened, { open: openProgress, close: closeProgress }] = useDisclosure(false)

  useEffect(() => {
    window.api.samples.getAll().then(setSamples)
  }, [])

  const selectedSample = samples.find((s) => s.id === selectedSampleId) ?? null

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
    setSelectedSampleId(record.id)
  }

  const removeSample = async (id: number): Promise<void> => {
    await window.api.samples.remove(id)
    setSamples((prev) => prev.filter((s) => s.id !== id))
    if (selectedSampleId === id) setSelectedSampleId(null)
  }

  const toggle = (path: string): void =>
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })

  const toggleAll = (selectAll: boolean): void =>
    setSelectedPaths(selectAll ? new Set(files.map((f) => f.path)) : new Set())

  const process = async (): Promise<void> => {
    if (!selectedSampleId) return
    const targets = files.filter((f) => selectedPaths.has(f.path))
    if (!targets.length) return
    const jobs = targets.map((f) => ({ input: f.path, sampleImageId: selectedSampleId }))
    // Build the initial file list before start() so the modal can show all rows
    // immediately — without waiting for the first IPC progress event.
    setInitialFiles(targets.map((f) => ({ name: f.name, value: 0, done: false, active: false })))
    const id = await window.api.cutting.start(jobs, cutMode)
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

  const canProcess = selectedPaths.size > 0 && selectedSampleId !== null

  return (
    <Stack gap="md">
      <Title order={4}>Intelligent Video Cutting</Title>

      <Grid gutter="md">
        <Grid.Col span={7}>
          <Stack gap="xs">
            <Group align="center">
              <Button leftSection={<IconPlus size={16} />} onClick={addVideos}>
                Add Video
              </Button>
              <Button
                leftSection={<IconScissors size={16} />}
                disabled={!canProcess}
                onClick={process}
              >
                Process
              </Button>
              <Group gap={6} align="center">
                <Text size="xs" c="dimmed" fw={500}>Cut at:</Text>
                <SegmentedControl
                  value={cutMode}
                  onChange={(v) => setCutMode(v as CutMode)}
                  size="xs"
                  data={[
                    { value: 'end', label: 'End of match' },
                    { value: 'start', label: 'Start of match' },
                  ]}
                />
              </Group>
            </Group>
            <VideoTable
              files={files}
              selectedPaths={selectedPaths}
              onToggle={toggle}
              onToggleAll={toggleAll}
            />
          </Stack>
        </Grid.Col>

        <Grid.Col span={5}>
          <Stack gap="xs">
            <Group>
              <Button
                leftSection={<IconPhoto size={16} />}
                variant="light"
                onClick={addSample}
              >
                Add Sample
              </Button>
            </Group>
            <SampleImageTable
              samples={samples}
              selectedId={selectedSampleId}
              onSelect={setSelectedSampleId}
              onRemove={removeSample}
            />
            {selectedSample && (
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Selected sample
                </Text>
                <Image
                  src={`local-file://${selectedSample.path}`}
                  w="100%"
                  mah={300}
                  fit="contain"
                  radius="md"
                />
              </Stack>
            )}
          </Stack>
        </Grid.Col>
      </Grid>

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
