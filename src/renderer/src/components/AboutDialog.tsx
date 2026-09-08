import { useEffect, useState } from 'react'
import { Button, Group, Modal, Stack, Text, Title } from '@mantine/core'

type Props = {
  opened: boolean
  onClose: () => void
}

export function AboutDialog({ opened, onClose }: Props) {
  // The real version comes from app.getVersion() (the packaged build's baked
  // version), never a hardcoded string — CI bumps it from the release tag.
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    window.api.app
      .getVersion()
      .then(setVersion)
      .catch(() => setVersion(null))
  }, [])

  return (
    <Modal opened={opened} onClose={onClose} title="About" size="sm" centered>
      <Stack gap="xs" align="center" py="sm">
        <Title order={3}>DogyMpegApp</Title>
        <Text size="sm" c="dimmed">
          {version ? `Version ${version}` : 'Version…'}
        </Text>
        <Text size="sm" c="dimmed">
          Dogy Inc.
        </Text>
        <Text size="sm" ta="center" mt="xs">
          Desktop video utility for batch compression and intelligent video cutting powered by
          FFmpeg and ResNet18 similarity matching.
        </Text>
        <Group mt="md">
          <Button onClick={onClose}>Close</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
