import { Image, Radio, Table, Text, ActionIcon, Group } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import type { SampleImage } from '@shared/types'
import { localFileUrl } from '../utils/localFile'

type Props = {
  samples: SampleImage[]
  selectedId: number | null
  onSelect: (id: number) => void
  onRemove: (id: number) => void
}

export function SampleImageTable({ samples, selectedId, onSelect, onRemove }: Props) {
  return (
    <Table striped highlightOnHover withTableBorder withColumnBorders>
      <Table.Thead>
        <Table.Tr>
          <Table.Th w={40} />
          <Table.Th>Name</Table.Th>
          <Table.Th w={80}>Preview</Table.Th>
          <Table.Th w={50} />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {samples.length === 0 ? (
          <Table.Tr>
            <Table.Td colSpan={4}>
              <Text c="dimmed" ta="center" py="md" size="sm">
                No sample images. Click &ldquo;Add Sample&rdquo; to get started.
              </Text>
            </Table.Td>
          </Table.Tr>
        ) : (
          samples.map((s) => (
            <Table.Tr
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{ cursor: 'pointer' }}
              bg={selectedId === s.id ? 'var(--mantine-color-pink-light)' : undefined}
            >
              <Table.Td onClick={(e) => e.stopPropagation()}>
                <Radio
                  checked={selectedId === s.id}
                  onChange={() => onSelect(s.id)}
                  value={String(s.id)}
                />
              </Table.Td>
              <Table.Td>
                <Text size="sm" truncate="end" title={s.path}>
                  {s.name}
                </Text>
              </Table.Td>
              <Table.Td>
                <Image src={localFileUrl(s.path)} w={60} h={40} fit="contain" radius="sm" />
              </Table.Td>
              <Table.Td onClick={(e) => e.stopPropagation()}>
                {!s.isPermanent && (
                  <Group justify="center">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => onRemove(s.id)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                )}
              </Table.Td>
            </Table.Tr>
          ))
        )}
      </Table.Tbody>
    </Table>
  )
}
