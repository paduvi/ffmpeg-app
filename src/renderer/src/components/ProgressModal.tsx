import { useEffect, useState } from 'react'
import { Box, Button, Group, Modal, Progress, ScrollArea, Stack, Text } from '@mantine/core'
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

export function ProgressModal({ opened, jobId, feature, initialFiles, onCancel, onClose }: Props) {
  const [files, setFiles] = useState<FileProgress[]>([])
  const [outputDir, setOutputDir] = useState<string | null>(null)

  const allDone = files.length > 0 && files.every((f) => f.done)
  const finished = outputDir !== null

  useEffect(() => {
    if (!opened || !jobId) return
    // Seed with known file names so rows appear immediately — before the first
    // IPC progress event arrives (which might come before this effect runs).
    setFiles(initialFiles.length > 0 ? initialFiles : [])
    setOutputDir(null)

    const api = window.api[feature]
    const offProgress = api.onProgress((jid, progress) => {
      if (jid === jobId) setFiles(progress)
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
        <ScrollArea.Autosize mah={360}>
          <Stack gap="sm" pr={4}>
            {files.map((fp, i) => (
              <Box key={i}>
                <Group justify="space-between" mb={4} gap="xs" wrap="nowrap">
                  <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                    {fp.name}
                  </Text>
                  {fp.done ? (
                    <Group gap={4} c="green" style={{ flexShrink: 0 }}>
                      <IconCheck size={14} />
                      <Text size="xs" c="green">Done</Text>
                    </Group>
                  ) : (
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      {fp.active && fp.value === 0
                        ? 'Preparing…'
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
            ))}

            {files.length === 0 && (
              <Text size="sm" c="dimmed" ta="center">
                Starting…
              </Text>
            )}
          </Stack>
        </ScrollArea.Autosize>

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
