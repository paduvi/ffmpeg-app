import { Checkbox, Skeleton, Table, Text, TextInput, Tooltip } from '@mantine/core'
import type { VideoAnalysis, VideoFile } from '@shared/types'
import { formatDuration, formatEstimate, parseTimecode } from '../utils/time'

/** Raw text of one row's trim fields — kept as typed, not as parsed seconds,
 *  so a half-finished "1:2" isn't rewritten under the cursor. */
export type TrimText = { start: string; end: string }

export type TrimEditor = {
  values: Map<string, TrimText>
  onChange: (path: string, field: keyof TrimText, value: string) => void
}

type Props = {
  files: VideoFile[]
  selectedPaths: Set<string>
  onToggle: (path: string) => void
  onToggleAll: (selectAll: boolean) => void
  /** Probed duration + processing estimate per path; missing = not probed yet. */
  analyses?: Map<string, VideoAnalysis>
  /** True while a probe is in flight — shows a spinner instead of "—". */
  analyzing?: boolean
  /**
   * Show the "Est. time" column. Off on the Cutting page: its work is a stream
   * copy whose duration is dominated by process startup, so a per-file estimate
   * there is noise rather than information.
   */
  showEstimate?: boolean
  /** Present on the Cutting page; adds the per-video Start/End columns. */
  trim?: TrimEditor
  /**
   * Predicted output size for a row, shown as "1.2 GB → ~410 MB"; null shows
   * the input size alone. Only Cutting supplies it, where the size follows
   * directly from the trim window. Compression cannot know before encoding,
   * and reports the real reduction in the progress modal instead.
   */
  outputBytesFor?: (path: string) => number | null
}

export function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function fileExt(name: string): string {
  return name.split('.').pop()?.toUpperCase() ?? '—'
}

/**
 * Shimmer placeholder for a cell whose value is still being worked out.
 * Inline-block on purpose: Skeleton is a block element, and left as one it
 * wraps onto its own line and grows every row.
 */
function CellPlaceholder({ w }: { w: number }) {
  return (
    <Skeleton
      height={11}
      width={w}
      radius="xl"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    />
  )
}

/**
 * Validate one trim field against the clip. An empty start means 0 and an
 * empty end means "to the end of the video", so both are valid blanks.
 */
export function trimFieldError(
  text: TrimText,
  field: keyof TrimText,
  durationSec: number | null
): string | null {
  const raw = text[field].trim()
  if (!raw) return null
  const value = parseTimecode(raw)
  if (value === null) return 'Use ss, mm:ss or hh:mm:ss'
  if (durationSec !== null && value > durationSec) return 'Past the end of the video'
  if (field === 'end') {
    const start = parseTimecode(text.start.trim() || '0') ?? 0
    if (value <= start) return 'End must be after start'
  }
  return null
}

export function VideoTable({
  files,
  selectedPaths,
  onToggle,
  onToggleAll,
  analyses,
  analyzing = false,
  showEstimate = true,
  trim,
  outputBytesFor
}: Props) {
  const allSelected = files.length > 0 && files.every((f) => selectedPaths.has(f.path))
  const someSelected = files.some((f) => selectedPaths.has(f.path))
  const columnCount = 5 + (showEstimate ? 1 : 0) + (trim ? 2 : 0)

  const renderSize = (file: VideoFile): React.ReactNode => {
    const newBytes = outputBytesFor?.(file.path) ?? null
    return (
      <Text size="sm">
        {formatSize(file.size)}
        {newBytes !== null && (
          <Text span size="sm" c="dimmed">
            {' → ~'}
            {formatSize(newBytes)}
          </Text>
        )}
      </Text>
    )
  }

  const renderEstimate = (path: string): React.ReactNode => {
    const analysis = analyses?.get(path)
    if (!analysis) return analyzing ? <CellPlaceholder w={40} /> : <Text size="sm">—</Text>
    if (analysis.estimatedSec === null) return <Text size="sm">—</Text>
    return (
      <Tooltip label="Rough estimate — it sharpens as the app learns this machine's speed">
        <Text size="sm" c="dimmed">
          {formatEstimate(analysis.estimatedSec)}
        </Text>
      </Tooltip>
    )
  }

  const renderTrimField = (path: string, field: keyof TrimText): React.ReactNode => {
    if (!trim) return null
    const text = trim.values.get(path) ?? { start: '', end: '' }
    const error = trimFieldError(text, field, analyses?.get(path)?.durationSec ?? null)
    return (
      <TextInput
        size="xs"
        value={text[field]}
        placeholder={field === 'start' ? '0:00' : 'end'}
        error={error ? true : undefined}
        title={error ?? undefined}
        // The row's onClick toggles selection; editing must not flip it.
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => trim.onChange(path, field, e.currentTarget.value)}
      />
    )
  }

  return (
    <Table.ScrollContainer minWidth={trim ? 820 : 600}>
      {/* tableLayout: 'fixed' is what makes the Name cell truncate: in the
          default auto layout a long file name widens the column instead. */}
      <Table
        striped
        highlightOnHover
        withTableBorder
        withColumnBorders
        style={{ tableLayout: 'fixed' }}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={40}>
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onChange={(e) => onToggleAll(e.currentTarget.checked)}
              />
            </Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th w={150}>Size</Table.Th>
            <Table.Th w={70}>Type</Table.Th>
            <Table.Th w={80}>Length</Table.Th>
            {showEstimate && <Table.Th w={95}>Est. time</Table.Th>}
            {trim && <Table.Th w={110}>Trim start</Table.Th>}
            {trim && <Table.Th w={110}>Trim end</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {files.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={columnCount}>
                <Text c="dimmed" ta="center" py="md" size="sm">
                  No videos added. Click &ldquo;Add Video&rdquo; to get started.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            files.map((f) => {
              const durationSec = analyses?.get(f.path)?.durationSec ?? null
              return (
                <Table.Tr
                  key={f.path}
                  onClick={() => onToggle(f.path)}
                  style={{ cursor: 'pointer' }}
                  bg={selectedPaths.has(f.path) ? 'var(--mantine-color-pink-light)' : undefined}
                >
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedPaths.has(f.path)}
                      onChange={() => onToggle(f.path)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" truncate="end" title={f.path}>
                      {f.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>{renderSize(f)}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{fileExt(f.name)}</Text>
                  </Table.Td>
                  <Table.Td>
                    {durationSec !== null ? (
                      <Text size="sm">{formatDuration(durationSec)}</Text>
                    ) : analyzing ? (
                      <CellPlaceholder w={40} />
                    ) : (
                      <Text size="sm">—</Text>
                    )}
                  </Table.Td>
                  {showEstimate && <Table.Td>{renderEstimate(f.path)}</Table.Td>}
                  {trim && <Table.Td>{renderTrimField(f.path, 'start')}</Table.Td>}
                  {trim && <Table.Td>{renderTrimField(f.path, 'end')}</Table.Td>}
                </Table.Tr>
              )
            })
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
