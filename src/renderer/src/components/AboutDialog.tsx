import { Button, Group, Modal, Stack, Text, Title } from '@mantine/core'

type Props = {
  opened: boolean
  onClose: () => void
}

export function AboutDialog({ opened, onClose }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="About" size="sm" centered>
      <Stack gap="xs" align="center" py="sm">
        <Title order={3}>DogyMpegApp</Title>
        <Text size="sm" c="dimmed">
          Version 0.1.0
        </Text>
        <Text size="sm" c="dimmed">
          Dogy Inc.
        </Text>
        <Text size="sm" ta="center" mt="xs">
          Desktop video utility for batch compression and intelligent video cutting powered by FFmpeg
          and ResNet18 similarity matching.
        </Text>
        <Group mt="md">
          <Button onClick={onClose}>Close</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
