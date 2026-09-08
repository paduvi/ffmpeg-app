import { useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput
} from '@mantine/core'
import type { AudioCodec, CompressionPreset, GpuStatus, Settings } from '@shared/types'

/**
 * Quality range offered to the user, in CRF.
 *
 * The full H.264 range is 0–51, but the useful band for compressing real
 * footage is narrow: below 18 the files balloon for a difference nobody can
 * see, and above 28 the picture visibly falls apart. Exposing 0–51 only
 * invited people to pick a number that would disappoint them.
 */
const QUALITY_MIN = 18
const QUALITY_MAX = 28

const clampQuality = (crf: number): number =>
  Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, Math.round(crf)))

/** Plain-language name for a CRF value, and what it means for the output. */
function describeQuality(crf: number): { name: string; detail: string } {
  if (crf <= 19)
    return {
      name: 'Near-original',
      detail: 'Practically indistinguishable from the original. Largest files.'
    }
  if (crf <= 21)
    return { name: 'High', detail: 'Very close to the original, and noticeably smaller.' }
  if (crf <= 24)
    return {
      name: 'Balanced',
      detail: 'Recommended. Looks good and saves a lot of space.'
    }
  if (crf <= 26)
    return { name: 'Compact', detail: 'Slight softening in busy scenes. Clearly smaller files.' }
  return { name: 'Smallest', detail: 'Visible quality loss. Use when file size matters most.' }
}

/**
 * A single unlabelled tick at the recommended value. Labelled marks at the ends
 * are centred on the track edge, so half of each label hangs outside the slider
 * and forces the whole modal to scroll sideways — the ends are captioned in
 * normal text underneath instead.
 */
const QUALITY_MARKS = [{ value: 23 }]

const AUDIO_CODECS: { value: AudioCodec; label: string }[] = [
  { value: 'aac', label: 'AAC — recommended' },
  { value: 'copy', label: 'Keep original — no re-encoding' },
  { value: 'mp3', label: 'MP3 — maximum compatibility' },
  { value: 'opus', label: 'Opus — smallest' }
]

// Ordered fastest → slowest, which is also largest → smallest output.
const PRESETS: { value: CompressionPreset; label: string }[] = [
  { value: 'ultrafast', label: 'Fastest — much larger files' },
  { value: 'superfast', label: 'Very fast' },
  { value: 'veryfast', label: 'Fast' },
  { value: 'faster', label: 'Fairly fast' },
  { value: 'fast', label: 'Slightly fast' },
  { value: 'medium', label: 'Balanced — recommended' },
  { value: 'slow', label: 'Slow — smaller files' },
  { value: 'slower', label: 'Slower' },
  { value: 'veryslow', label: 'Slowest — smallest files' }
]

/**
 * The one meaningful hardware spec, which differs by platform: dedicated VRAM
 * where there is any, GPU cores on Apple Silicon (unified memory, so there is
 * no separate VRAM figure to show). Null when neither was detected.
 */
function gpuSpec(gpu: GpuStatus['gpu']): string | null {
  if (gpu.vramMb) {
    // Rounding straight to whole GB turned a 256 MB card into "0 GB" and a
    // 1536 MB one into "2 GB". Stay in MB below a gigabyte, and keep one
    // decimal above it unless the number is large enough not to need it.
    if (gpu.vramMb < 1024) return `${gpu.vramMb} MB`
    const gb = gpu.vramMb / 1024
    return `${gb >= 10 ? Math.round(gb) : parseFloat(gb.toFixed(1))} GB`
  }
  if (gpu.cores) return `${gpu.cores}-core GPU`
  return null
}

const CONTAINERS = [
  { value: 'mp4', label: 'MP4 — plays almost everywhere' },
  { value: 'mkv', label: 'MKV' },
  { value: 'mov', label: 'MOV' },
  { value: 'avi', label: 'AVI' },
  { value: 'webm', label: 'WebM' },
  { value: 'ts', label: 'TS' }
]

type Props = {
  opened: boolean
  onClose: () => void
}

export function SettingsDialog({ opened, onClose }: Props) {
  const [draft, setDraft] = useState<Settings | null>(null)
  const [gpuStatus, setGpuStatus] = useState<GpuStatus | null>(null)
  const [reprobing, setReprobing] = useState(false)

  useEffect(() => {
    if (opened) {
      // Clamp on load: a value saved before the range narrowed would otherwise
      // sit off the slider, showing a position the user never chose.
      window.api.settings.getAll().then((s) => setDraft({ ...s, crf: clampQuality(s.crf) }))
      window.api.gpu.getStatus().then(setGpuStatus)
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

  const reprobe = async (): Promise<void> => {
    setReprobing(true)
    try {
      setGpuStatus(await window.api.gpu.reprobe())
    } finally {
      setReprobing(false)
    }
  }

  const resetDefaults = async (): Promise<void> => {
    await window.api.settings.reset()
    const defaults = await window.api.settings.getAll()
    setDraft({ ...defaults, crf: clampQuality(defaults.crf) })
  }

  if (!draft) return null

  const quality = describeQuality(draft.crf)

  return (
    <Modal opened={opened} onClose={onClose} title="Settings" size="md" centered>
      <Stack gap="lg">
        <Stack gap="md">
          <Divider label="Video" labelPosition="left" />

          <Stack gap={4}>
            <Group justify="space-between" align="baseline" wrap="nowrap">
              <Text size="sm" fw={500}>
                Quality
              </Text>
              <Group gap={8} align="baseline" wrap="nowrap">
                <Text size="sm" fw={600} c="pink">
                  {quality.name}
                </Text>
                <Text size="xs" c="dimmed">
                  CRF {draft.crf}
                </Text>
              </Group>
            </Group>
            {/* CRF runs backwards — a higher number is worse quality — so the
                marks and captions, not the scale, tell the user which way is
                which.

                label={null} disables the drag tooltip on purpose. It is
                centred on the thumb, so at the far-left end it started 18px
                outside the modal and was clipped by the modal's own
                `overflow: auto` (needed for vertical scrolling, so it cannot
                simply be turned off). It duplicated the level name in the
                header above, which is always visible and updates live while
                dragging — a fixed position reads better than a moving one. */}
            <Slider
              min={QUALITY_MIN}
              max={QUALITY_MAX}
              step={1}
              value={draft.crf}
              onChange={(v) => update('crf', v)}
              marks={QUALITY_MARKS}
              label={null}
            />
            <Group justify="space-between" gap="xs" wrap="nowrap" mt={2}>
              <Text size="xs" c="dimmed">
                Best quality
              </Text>
              <Text size="xs" c="dimmed">
                Smallest file
              </Text>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              {quality.detail}
            </Text>
          </Stack>

          <Select
            label="Encoding speed"
            description="Slower settings pack the same quality into a smaller file. They do not change how the video looks."
            data={PRESETS}
            value={draft.preset}
            onChange={(v) => update('preset', (v ?? 'medium') as CompressionPreset)}
            allowDeselect={false}
          />
        </Stack>

        <Stack gap="md">
          <Divider label="Output" labelPosition="left" />

          <Select
            label="File format"
            data={CONTAINERS}
            value={draft.videoExtension}
            onChange={(v) => update('videoExtension', v ?? 'mp4')}
            allowDeselect={false}
          />

          <Select
            label="Audio"
            data={AUDIO_CODECS}
            value={draft.audioCodec}
            onChange={(v) => update('audioCodec', (v ?? 'aac') as AudioCodec)}
            allowDeselect={false}
          />
        </Stack>

        <Stack gap="md">
          <Divider label="Performance" labelPosition="left" />

          {gpuStatus ? (
            <Stack gap="xs">
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" fw={500}>
                  Graphics
                </Text>
                <Text size="sm" truncate="end" title={gpuStatus.gpu.model}>
                  {gpuStatus.gpu.model}
                </Text>
                {gpuSpec(gpuStatus.gpu) ? (
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                    {gpuSpec(gpuStatus.gpu)}
                  </Text>
                ) : null}
              </Group>
              <Group gap="xs">
                {/* tt="none": Badge shouts in caps by default, which turns
                    "CoreML" into "COREML". */}
                <Badge variant="light" color="gray" tt="none">
                  Matching: {gpuStatus.inferenceBackend}
                </Badge>
                <Badge
                  variant="light"
                  tt="none"
                  color={gpuStatus.videoEncoder === 'libx264' ? 'gray' : 'teal'}
                >
                  Encoding: {gpuStatus.videoEncoder === 'libx264' ? 'CPU' : 'Hardware'}
                </Badge>
                <Button size="compact-xs" variant="subtle" loading={reprobing} onClick={reprobe}>
                  Re-detect
                </Button>
              </Group>
              <Text size="xs" c="dimmed">
                Hardware acceleration is used automatically when available, falling back to the
                CPU if it cannot handle a file.
              </Text>
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">
              Detecting hardware…
            </Text>
          )}
        </Stack>

        <Stack gap="md">
          <Divider label="Advanced" labelPosition="left" />

          <Switch
            label="Use the built-in FFmpeg"
            description="Turn this off only if you need a specific FFmpeg build"
            checked={draft.useDefaultFfmpeg}
            onChange={(e) => update('useDefaultFfmpeg', e.currentTarget.checked)}
          />

          {!draft.useDefaultFfmpeg && (
            <Group align="flex-end" gap="xs" wrap="nowrap">
              <TextInput
                label="FFmpeg location"
                placeholder="/usr/local/bin/ffmpeg"
                value={draft.ffmpegLocation}
                onChange={(e) => update('ffmpegLocation', e.currentTarget.value)}
                style={{ flex: 1, minWidth: 0 }}
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
        </Stack>

        <Group justify="space-between" mt="xs">
          <Button variant="subtle" color="gray" onClick={resetDefaults}>
            Reset to defaults
          </Button>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
