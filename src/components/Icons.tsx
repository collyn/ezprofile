import React from 'react';
import {
  ArrowLeft as ArrowLeftIcon,
  Check as CheckIcon,
  CheckCircle as CheckCircleIcon,
  XCircle as XCircleIcon,
  X as XIcon,
  AlertTriangle as AlertTriangleIcon,
  Lightbulb as LightbulbIcon,
  RotateCcw as ResetIcon,
  Folder as FolderIcon,
  Info as InfoIcon,
  Loader2,
  Download as DownloadIcon,
  Upload as UploadIcon,
  ArrowDown as ArrowDownIcon,
  Sparkles as SparklesIcon,
  Keyboard as KeyboardIcon,
  Cloud as CloudIcon,
  Lock as LockIcon,
  Clock as ClockIcon,
  Slash as SlashIcon,
  ChevronRight as ChevronRightIcon,
  Trash2 as TrashIcon,
  Globe as GlobeIcon,
  Settings as SettingsIcon,
  Minus as MinusIcon,
  Square as SquareIcon,
  Shield as ShieldIcon,
  Plus as PlusIcon,
  ClipboardList as ClipboardIcon,
  Play as PlayIcon,
  Pause as PauseIcon,
  Copy as CopyIcon,
  CloudDownload as CloudDownloadIcon,
  Database as DatabaseIcon,
  Pencil as EditIcon,
  FileUp as FileUpIcon,
  Grid as GridIcon,
  Search as SearchIcon,
  Users as UsersIcon,
  MoreVertical as MoreVerticalIcon,
  PlusCircle as LogoIcon,
  Monitor,
  Laptop as LaptopIcon,
  Apple as AppleIcon,
  Terminal as TerminalIcon,
  ChevronDown as ChevronDownIcon,
  LayoutGrid as LayoutGridIcon,
  StopCircle as StopCircleIcon,
  ToggleLeft as ToggleLeftIcon,
  ToggleRight as ToggleRightIcon,
  Puzzle as PuzzleIcon,
  RefreshCw as RefreshCwIcon,
} from 'lucide-react';

export interface IconProps {
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number | string;
  color?: string;
}

export {
  ArrowLeftIcon,
  CheckIcon,
  CheckCircleIcon,
  XCircleIcon,
  XIcon,
  AlertTriangleIcon,
  LightbulbIcon,
  ResetIcon,
  FolderIcon,
  InfoIcon,

  DownloadIcon,
  UploadIcon,
  ArrowDownIcon,
  SparklesIcon,
  KeyboardIcon,
  CloudIcon,
  LockIcon,
  ClockIcon,
  SlashIcon,
  ChevronRightIcon,
  TrashIcon,
  GlobeIcon,
  SettingsIcon,
  MinusIcon,
  SquareIcon,
  ShieldIcon,
  PlusIcon,
  ClipboardIcon,
  PlayIcon,
  PauseIcon,
  CopyIcon,
  CloudDownloadIcon,
  DatabaseIcon,
  EditIcon,
  FileUpIcon,
  GridIcon,
  SearchIcon,
  UsersIcon,
  MoreVerticalIcon,
  LogoIcon,
  Monitor,
  LaptopIcon,
  AppleIcon,
  TerminalIcon,
  ChevronDownIcon,
  LayoutGridIcon,
  StopCircleIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  PuzzleIcon,
  RefreshCwIcon,
};

// --- Custom Icons ---

export function ChromeIcon({ size = 16, className, style, strokeWidth = 2 }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} width={size} height={size} className={className} style={style}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="21.17" y1="8" x2="12" y2="8" /><line x1="3.95" y1="6.06" x2="8.54" y2="14" /><line x1="10.88" y1="21.94" x2="15.46" y2="14" /></svg>;
}

export function GDriveIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg viewBox="0 0 87.3 78" width={size} height={size} fill="none" className={className} style={style}>
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  );
}

export function S3Icon({ size = 20, className, style }: IconProps) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#ff9900" strokeWidth="1.5" className={className} style={style}><path d="M12 2L2 7l10 5 10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>;
}

export function EmptyStateIcon({ size = 16, className, style, strokeWidth = 1.5 }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" width={size} height={size} className={className} style={style}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v4M12 16h.01" /></svg>;
}

export function SpinnerIcon({ size = 16, className = '', style, strokeWidth = 2, color }: IconProps) {
  return <Loader2 size={size} className={`animate-spin ${className}`} style={style} strokeWidth={strokeWidth} color={color} />;
}
