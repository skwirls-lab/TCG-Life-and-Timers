import {
  Anchor,
  Award,
  Biohazard,
  Bolt,
  BookOpen,
  Castle,
  Circle,
  CircleDot,
  Clock,
  CloudLightning,
  Coins,
  Crown,
  Dices,
  Droplet,
  Flag,
  Flame,
  FlaskConical,
  Gauge,
  Gem,
  Heart,
  HeartCrack,
  Hexagon,
  Landmark,
  Layers,
  Leaf,
  Minus,
  Moon,
  Plus,
  Radiation,
  Shield,
  ShieldHalf,
  Skull,
  Sparkles,
  Star,
  Sun,
  SunMoon,
  Sword,
  Swords,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps engine icon ids (CounterDefinition.icon) to SVG icons. Unknown ids fall back to a circle,
 * so presets (including custom ones) can never crash the board.
 */
const ICONS: Record<string, LucideIcon> = {
  heart: Heart,
  life: Heart,
  poison: Biohazard,
  commander: Swords,
  tax: Castle,
  crown: Crown,
  monarch: Crown,
  initiative: ShieldHalf,
  sun: Sun,
  moon: Moon,
  daynight: SunMoon,
  energy: Zap,
  exp: Sparkles,
  treasure: Coins,
  rad: Radiation,
  ascend: Landmark,
  speed: Gauge,
  ring: CircleDot,
  storm: CloudLightning,
  ko: HeartCrack,
  skull: Skull,
  prize: Award,
  lore: Star,
  damage: Flame,
  don: Anchor,
  memory: Layers,
  shield: Shield,
  star: Star,
  coin: Coins,
  flame: Flame,
  droplet: Droplet,
  sword: Sword,
  potion: FlaskConical,
  clock: Clock,
  flag: Flag,
  gem: Gem,
  bolt: Bolt,
  leaf: Leaf,
  book: BookOpen,
  dice: Dices,
  plus: Plus,
  minus: Minus,
  trophy: Trophy,
  target: Target,
  hexagon: Hexagon,
};

export const GAME_ICON_IDS = Object.keys(ICONS);

interface Props {
  id: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function GameIcon({ id, size = 24, className, strokeWidth = 1.75 }: Props) {
  const Icon = ICONS[id] ?? Circle;
  return <Icon aria-hidden size={size} className={className} strokeWidth={strokeWidth} />;
}

export function hasGameIcon(id: string): boolean {
  return id in ICONS;
}
