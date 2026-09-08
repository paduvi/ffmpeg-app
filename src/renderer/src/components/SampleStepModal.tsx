import { Button, Group, Image, Modal, SegmentedControl, Stack, Text } from '@mantine/core'
import { IconPhoto } from '@tabler/icons-react'
import type { CutMode, SampleImage } from '@shared/types'
import { SampleImageTable } from './SampleImageTable'
import { localFileUrl } from '../utils/localFile'

/** The two ML cut modes. 'trim' is chosen by skipping this step, not here. */
export type MatchMode = Extract<CutMode, 'start' | 'end'>

type Props = {
  opened: boolean
  onClose: () => void
  /** How many videos the choice will apply to — shown on the action buttons. */
  targetCount: number
  samples: SampleImage[]
  selectedId: number | null
  onSelect: (id: number) => void
  onAddSample: () => void
  onRemoveSample: (id: number) => void
  matchMode: MatchMode
  onMatchModeChange: (mode: MatchMode) => void
  /** Cut with the ML search, then apply each video's trim window on top. */
  onProceedWithSample: () => void
  /** Skip the search entirely — trim windows only. */
  onProceedWithoutSample: () => void
}

/**
 * Optional refinement step shown after "Trim". Picking a sample image narrows
 * each video's start to the matched frame; skipping it trims to the window the
 * user typed and nothing more. Either way the per-video trim window applies.
 */
export function SampleStepModal({
  opened,
  onClose,
  targetCount,
  samples,
  selectedId,
  onSelect,
  onAddSample,
  onRemoveSample,
  matchMode,
  onMatchModeChange,
  onProceedWithSample,
  onProceedWithoutSample
}: Props) {
  const selectedSample = samples.find((s) => s.id === selectedId) ?? null
  const noun = `${targetCount} video${targetCount === 1 ? '' : 's'}`

  return (
    <Modal opened={opened} onClose={onClose} title="Use a sample image?" size="lg" centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Optional. Pick a sample image and {noun} will be cut at the frame that matches it. Each
          video&rsquo;s own trim window applies either way — skip this step to trim and nothing else.
        </Text>

        <Group justify="space-between" align="center">
          <Button leftSection={<IconPhoto size={16} />} variant="light" onClick={onAddSample}>
            Add sample image
          </Button>
          <Group gap={6} align="center">
            <Text size="xs" c="dimmed" fw={500}>
              Cut at:
            </Text>
            <SegmentedControl
              value={matchMode}
              onChange={(v) => onMatchModeChange(v as MatchMode)}
              size="xs"
              data={[
                { value: 'start', label: 'Start of match' },
                { value: 'end', label: 'End of match' }
              ]}
            />
          </Group>
        </Group>

        <SampleImageTable
          samples={samples}
          selectedId={selectedId}
          onSelect={onSelect}
          onRemove={onRemoveSample}
        />

        {selectedSample && (
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              Selected sample
            </Text>
            <Image
              src={localFileUrl(selectedSample.path)}
              w="100%"
              mah={240}
              fit="contain"
              radius="md"
            />
          </Stack>
        )}

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onProceedWithoutSample}>
            Trim without sample
          </Button>
          <Button disabled={selectedId === null} onClick={onProceedWithSample}>
            Trim with sample
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
