import {
  AppShell,
  Burger,
  Group,
  Menu,
  NavLink,
  Title,
  UnstyledButton,
  useMantineColorScheme
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useState } from 'react'
import {
  IconChevronDown,
  IconMovie,
  IconScissors,
  IconSettings,
  IconInfoCircle,
  IconRefresh,
  IconLogout,
  IconSun,
  IconMoon,
  IconDeviceDesktop,
  IconCheck
} from '@tabler/icons-react'
import { SettingsDialog } from './components/SettingsDialog'
import { AboutDialog } from './components/AboutDialog'
import { Compression } from './pages/Compression'
import { Cutting } from './pages/Cutting'

type Section = 'compression' | 'cutting'
type ColorScheme = 'light' | 'dark' | 'auto'

export default function App() {
  const [navOpened, { toggle: toggleNav }] = useDisclosure()
  const [section, setSection] = useState<Section>('compression')
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false)
  const [aboutOpened, { open: openAbout, close: closeAbout }] = useDisclosure(false)
  const { colorScheme, setColorScheme } = useMantineColorScheme()

  const THEMES: { value: ColorScheme; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Light', icon: <IconSun size={16} /> },
    { value: 'dark', label: 'Dark', icon: <IconMoon size={16} /> },
    { value: 'auto', label: 'System', icon: <IconDeviceDesktop size={16} /> }
  ]

  return (
    <>
      <AppShell
        header={{ height: 56 }}
        navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !navOpened } }}
        padding="md"
      >
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between">
            <Group>
              <Burger opened={navOpened} onClick={toggleNav} hiddenFrom="sm" size="sm" />
              <img
                src="./icon.png"
                width={32}
                height={32}
                style={{ borderRadius: 6, display: 'block' }}
              />
              <Title order={4}>DogyMpegApp</Title>
            </Group>

            <Group gap="xs">
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <UnstyledButton>
                    <Group gap={4}>
                      File
                      <IconChevronDown size={14} />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconSettings size={16} />} onClick={openSettings}>
                    Settings
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Label>Theme</Menu.Label>
                  {THEMES.map(({ value, label, icon }) => (
                    <Menu.Item
                      key={value}
                      leftSection={icon}
                      rightSection={colorScheme === value ? <IconCheck size={14} /> : null}
                      onClick={() => setColorScheme(value)}
                    >
                      {label}
                    </Menu.Item>
                  ))}
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<IconLogout size={16} />}
                    color="red"
                    onClick={() => window.api.app.quit()}
                  >
                    Exit
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>

              <Menu shadow="md" width={160}>
                <Menu.Target>
                  <UnstyledButton>
                    <Group gap={4}>
                      Help
                      <IconChevronDown size={14} />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconRefresh size={16} />}
                    onClick={() => window.api.app.checkForUpdates()}
                  >
                    Check for Updates
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item leftSection={<IconInfoCircle size={16} />} onClick={openAbout}>
                    About
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <NavLink
            label="Video Compression"
            leftSection={<IconMovie size={18} />}
            active={section === 'compression'}
            onClick={() => setSection('compression')}
            mb="xs"
          />
          <NavLink
            label="Video Cutting"
            leftSection={<IconScissors size={18} />}
            active={section === 'cutting'}
            onClick={() => setSection('cutting')}
          />
        </AppShell.Navbar>

        <AppShell.Main>
          {section === 'compression' && <Compression />}
          {section === 'cutting' && <Cutting />}
        </AppShell.Main>
      </AppShell>

      <SettingsDialog opened={settingsOpened} onClose={closeSettings} />
      <AboutDialog opened={aboutOpened} onClose={closeAbout} />
    </>
  )
}
