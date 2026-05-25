import { Checkbox, Table, Text } from '@mantine/core'
import type { VideoFile } from '@shared/types'

type Props = {
  files: VideoFile[]
  selectedPaths: Set<string>
  onToggle: (path: string) => void
  onToggleAll: (selectAll: boolean) => void
}

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function fileExt(name: string): string {
  return name.split('.').pop()?.toUpperCase() ?? '—'
}

export function VideoTable({ files, selectedPaths, onToggle, onToggleAll }: Props) {
  const allSelected = files.length > 0 && files.every((f) => selectedPaths.has(f.path))
  const someSelected = files.some((f) => selectedPaths.has(f.path))

  return (
    <Table striped highlightOnHover withTableBorder withColumnBorders>
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
          <Table.Th w={100}>Size</Table.Th>
          <Table.Th w={70}>Type</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {files.length === 0 ? (
          <Table.Tr>
            <Table.Td colSpan={4}>
              <Text c="dimmed" ta="center" py="md" size="sm">
                No videos added. Click &ldquo;Add Video&rdquo; to get started.
              </Text>
            </Table.Td>
          </Table.Tr>
        ) : (
          files.map((f) => (
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
              <Table.Td>
                <Text size="sm">{formatSize(f.size)}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{fileExt(f.name)}</Text>
              </Table.Td>
            </Table.Tr>
          ))
        )}
      </Table.Tbody>
    </Table>
  )
}
