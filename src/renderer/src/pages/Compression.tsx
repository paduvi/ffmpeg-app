import { useState } from 'react'
import { Button, Group, Stack, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { FileProgress, VideoFile } from '@shared/types'
import { VideoTable } from '../components/VideoTable'
import { ProgressModal } from '../components/ProgressModal'

export function Compression() {
  const [files, setFiles] = useState<VideoFile[]>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [jobId, setJobId] = useState<string | null>(null)
  const [initialFiles, setInitialFiles] = useState<FileProgress[]>([])
  const [progressOpened, { open: openProgress, close: closeProgress }] = useDisclosure(false)

  const addVideos = async (): Promise<void> => {
    const picked = await window.api.dialog.openVideos()
    if (!picked.length) return
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.path))
      return [...prev, ...picked.filter((f) => !existing.has(f.path))]
    })
  }

  const removeSelected = (): void => {
    setFiles((prev) => prev.filter((f) => !selectedPaths.has(f.path)))
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

  const convert = async (): Promise<void> => {
    const targets = files.filter((f) => selectedPaths.has(f.path))
    if (!targets.length) return
    const jobs = targets.map((f) => ({ input: f.path }))
    // Build the initial file list before start() so the modal can show all rows
    // immediately — without waiting for the first IPC progress event.
    setInitialFiles(targets.map((f) => ({ name: f.name, value: 0, done: false, active: false })))
    const id = await window.api.compression.start(jobs)
    setJobId(id)
    openProgress()
  }

  const handleCancel = (): void => {
    if (jobId) window.api.compression.cancel(jobId)
  }

  const handleClose = (): void => {
    setJobId(null)
    closeProgress()
  }

  const hasSelection = selectedPaths.size > 0

  return (
    <Stack gap="md">
      <Title order={4}>Video Compression</Title>

      <Group>
        <Button leftSection={<IconPlus size={16} />} onClick={addVideos}>
          Add Video
        </Button>
        <Button
          leftSection={<IconTrash size={16} />}
          variant="light"
          color="red"
          disabled={!hasSelection}
          onClick={removeSelected}
        >
          Remove
        </Button>
        <Button
          leftSection={<img src="./img/convert-icon.png" width={20} height={20} style={{ objectFit: 'contain' }} />}
          disabled={!hasSelection}
          onClick={convert}
        >
          Convert
        </Button>
      </Group>

      <VideoTable
        files={files}
        selectedPaths={selectedPaths}
        onToggle={toggle}
        onToggleAll={toggleAll}
      />

      <ProgressModal
        opened={progressOpened}
        jobId={jobId}
        feature="compression"
        initialFiles={initialFiles}
        onCancel={handleCancel}
        onClose={handleClose}
      />
    </Stack>
  )
}
