// Modern icon set powered by lucide-react.
// Kept behind an `Icons.*` facade so pages don't depend on lucide names directly.
// All icons share a 1.75 stroke for a refined, consistent weight.
import { ComponentType } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Settings,
  Megaphone,
  BarChart3,
  Plus,
  LogOut,
  Menu,
  X,
  GraduationCap,
  ChevronRight,
  KeyRound,
  Printer,
  Search,
  Clock,
  MapPin,
  Wallet,
  Download,
  UserCog,
  CircleCheck,
  Inbox,
} from 'lucide-react';

type IconProps = { size?: number; className?: string };

// Apply the shared stroke weight while keeping per-usage size/className overrides.
const styled = (C: ComponentType<any>) => (props: IconProps) => <C strokeWidth={1.75} {...props} />;

export const Icons = {
  dashboard: styled(LayoutDashboard),
  book: styled(BookOpen),
  users: styled(Users),
  calendar: styled(CalendarDays),
  check: styled(ClipboardCheck),
  clipboard: styled(ClipboardList),
  settings: styled(Settings),
  megaphone: styled(Megaphone),
  chart: styled(BarChart3),
  plus: styled(Plus),
  logout: styled(LogOut),
  menu: styled(Menu),
  close: styled(X),
  cap: styled(GraduationCap),
  chevronRight: styled(ChevronRight),
  key: styled(KeyRound),
  printer: styled(Printer),
  search: styled(Search),
  clock: styled(Clock),
  pin: styled(MapPin),
  wallet: styled(Wallet),
  download: styled(Download),
  userCog: styled(UserCog),
  circleCheck: styled(CircleCheck),
  inbox: styled(Inbox),
};
