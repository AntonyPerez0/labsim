/**
 * LabSim UI kit — shared, engine-free React components styled by `src/ui/styles/kit.css`.
 * Used by the game UI (`src/ui`) and available to the workstation apps (`src/computer`).
 *
 *   import { Button, Panel, Kbd, Icon, Toggle, Tabs } from '@/ui/kit';
 *
 * Class names are prefixed `k-`. Sounds go through `setKitSoundHandler` (registered by the app).
 */
export { Icon, LabWordmark, type IconName } from './Icon';
export { Button, IconButton, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Kbd, keyLabel } from './Kbd';
export { Panel, Card, SectionTitle, EmptyState } from './Panel';
export { Modal, Drawer } from './Modal';
export { Toggle, Slider, Segmented, Select, TextField, FieldRow } from './controls';
export { ProgressBar, Meter, Stars, Chip, Avatar, Stat, Spinner, MedalBadge, IllustrativeBadge, StatusPill, type Tone } from './display';
export { Tabs, NavList, type TabDef, type NavItem } from './Tabs';
export { HoverCard } from './HoverCard';
export { kitSound, setKitSoundHandler, type KitSound } from './sound';
export { useArmed } from './useArmed';
