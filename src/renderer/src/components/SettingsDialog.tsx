import { useEffect, useState } from 'react'
import {
  Button,
  Group,
  Modal,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput
} from '@mantine/core'
import type { AudioCodec, CompressionPreset, Settings } from '@shared/types'

const AUDIO_CODECS: { value: AudioCodec; label: string }[] = [
  { value: 'aac', label: 'AAC (recommended)' },
  { value: 'copy', label: 'Copy (no re-encode)' },
  { value: 'mp3', label: 'MP3' },
  { value: 'opus', label: 'Opus' }
]

const PRESETS: { value: CompressionPreset; label: string }[] = [
  { value: 'ultrafast', label: 'Ultrafast' },
  { value: 'superfast', label: 'Superfast' },
  { value: 'veryfast', label: 'Very Fast' },
  { value: 'faster', label: 'Faster' },
  { value: 'fast', label: 'Fast' },
  { value: 'medium', label: 'Medium (default)' },
  { value: 'slow', label: 'Slow' },
  { value: 'slower', label: 'Slower' },
  { value: 'veryslow', label: 'Very Slow' }
]

const EXTENSIONS = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'ts']

const CRF_MARKS = [
  { value: 18, label: '18' },
  { value: 23, label: '23' },
  { value: 28, label: '28' }
]

type Props = {
  opened: boolean
  onClose: () => void
}

export function SettingsDialog({ opened, onClose }: Props) {
  const [draft, setDraft] = useState<Settings | null>(null)

  useEffect(() => {
    if (opened) {
      window.api.settings.getAll().then((s) => setDraft({ ...s }))
    }
  }, [opened])

  function update<K extends keyof Settings>(key: K, value: Settings[K]): void {
    setDraft((prev: Settings | null) => (prev ? { ...prev, [key]: value } : prev))
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    await Promise.all([
      window.api.settings.set('audioCodec', draft.audioCodec),
      window.api.settings.set('preset', draft.preset),
      window.api.settings.set('crf', draft.crf),
      window.api.settings.set('useDefaultFfmpeg', draft.useDefaultFfmpeg),
      window.api.settings.set('ffmpegLocation', draft.ffmpegLocation),
      window.api.settings.set('container', draft.container),
      window.api.settings.set('videoExtension', draft.videoExtension)
    ])
    onClose()
  }

  const resetDefaults = async (): Promise<void> => {
    await window.api.settings.reset()
    const defaults = await window.api.settings.getAll()
    setDraft({ ...defaults })
  }

  if (!draft) return null

  return (
    <Modal opened={opened} onClose={onClose} title="Settings" size="md">
      <Stack>
        <Switch
          label="Use bundled FFmpeg"
          description="Uncheck to specify a custom ffmpeg binary"
          checked={draft.useDefaultFfmpeg}
          onChange={(e) => update('useDefaultFfmpeg', e.currentTarget.checked)}
        />

        {!draft.useDefaultFfmpeg && (
          <Group align="flex-end">
            <TextInput
              label="FFmpeg binary path"
              placeholder="/usr/local/bin/ffmpeg"
              value={draft.ffmpegLocation}
              onChange={(e) => update('ffmpegLocation', e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button
              variant="light"
              onClick={async () => {
                const path = await window.api.dialog.openFile()
                if (path) update('ffmpegLocation', path)
              }}
            >
              Browse
            </Button>
          </Group>
        )}

        <Select
          label="Audio codec"
          data={AUDIO_CODECS}
          value={draft.audioCodec}
          onChange={(v) => update('audioCodec', (v ?? 'aac') as AudioCodec)}
        />

        <Select
          label="Encoding preset"
          description="Faster presets = larger files; slower = smaller"
          data={PRESETS}
          value={draft.preset}
          onChange={(v) => update('preset', (v ?? 'medium') as CompressionPreset)}
        />

        <Stack gap={8}>
          <Text size="sm" fw={500}>
            CRF (quality) — {draft.crf}
          </Text>
          <Slider
            min={0}
            max={51}
            step={1}
            value={draft.crf}
            onChange={(v) => update('crf', v)}
            marks={CRF_MARKS}
            mb="sm"
          />
          <Text size="xs" c="dimmed">
            Lower = better quality &amp; larger file. 23 is default. 18 is visually lossless.
          </Text>
        </Stack>

        <Select
          label="Output container"
          data={EXTENSIONS}
          value={draft.videoExtension}
          onChange={(v) => update('videoExtension', v ?? 'mp4')}
        />

        <Group justify="space-between" mt="md">
          <Button variant="subtle" color="gray" onClick={resetDefaults}>
            Reset to defaults
          </Button>
          <Group>
            <Button variant="light" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
