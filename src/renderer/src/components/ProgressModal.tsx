import { useEffect, useState } from 'react'
import { Button, Group, Modal, Progress, Stack, Text } from '@mantine/core'
import { IconFolderOpen } from '@tabler/icons-react'

type Props = {
  opened: boolean
  jobId: string | null
  feature: 'compression' | 'cutting'
  onCancel: () => void
  onClose: () => void
}

export function ProgressModal({ opened, jobId, feature, onCancel, onClose }: Props) {
  const [progress, setProgress] = useState(0)
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const done = outputDir !== null

  useEffect(() => {
    if (!opened || !jobId) return
    setProgress(0)
    setOutputDir(null)

    const api = window.api[feature]
    const offProgress = api.onProgress((jid, value) => {
      if (jid === jobId) setProgress(value)
    })
    const offDone = api.onDone((jid, dir) => {
      if (jid === jobId) {
        setProgress(1)
        setOutputDir(dir || null)
      }
    })
    return () => {
      offProgress()
      offDone()
    }
  }, [opened, jobId, feature])

  return (
    <Modal
      opened={opened}
      onClose={() => {}}
      withCloseButton={false}
      title={done ? 'Done!' : feature === 'compression' ? 'Compressing…' : 'Processing…'}
      centered
      size="sm"
    >
      <Stack gap="md">
        <Progress value={progress * 100} animated={!done} size="lg" />
        <Text size="sm" c="dimmed" ta="center">
          {Math.round(progress * 100)}%
        </Text>

        {done ? (
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
            Cancel
          </Button>
        )}
      </Stack>
    </Modal>
  )
}
