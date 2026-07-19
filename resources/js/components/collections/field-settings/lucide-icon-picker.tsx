import {
    AtSign,
    Bell,
    Calendar,
    Check,
    ChevronDown,
    Clock,
    Code2,
    Eye,
    EyeOff,
    FileText,
    Globe,
    Hash,
    Heart,
    Home,
    Image,
    Link2,
    Lock,
    Mail,
    MapPin,
    Phone,
    Search,
    Settings,
    Star,
    Tag,
    Type,
    User
    
} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** Curated Lucide icons available in collection field settings. */
export const LUCIDE_ICON_OPTIONS: { name: string; icon: LucideIcon }[] = [
    { name: 'Type', icon: Type },
    { name: 'Search', icon: Search },
    { name: 'Mail', icon: Mail },
    { name: 'User', icon: User },
    { name: 'Lock', icon: Lock },
    { name: 'Eye', icon: Eye },
    { name: 'EyeOff', icon: EyeOff },
    { name: 'Hash', icon: Hash },
    { name: 'Tag', icon: Tag },
    { name: 'Link2', icon: Link2 },
    { name: 'Globe', icon: Globe },
    { name: 'Home', icon: Home },
    { name: 'Calendar', icon: Calendar },
    { name: 'Clock', icon: Clock },
    { name: 'MapPin', icon: MapPin },
    { name: 'Phone', icon: Phone },
    { name: 'AtSign', icon: AtSign },
    { name: 'Star', icon: Star },
    { name: 'Heart', icon: Heart },
    { name: 'Bell', icon: Bell },
    { name: 'Image', icon: Image },
    { name: 'FileText', icon: FileText },
    { name: 'Code2', icon: Code2 },
    { name: 'Settings', icon: Settings },
    { name: 'ChevronDown', icon: ChevronDown },
];

const ICON_MAP = Object.fromEntries(
    LUCIDE_ICON_OPTIONS.map((option) => [option.name, option.icon]),
);

/**
 * Renders a Lucide icon by its string name.
 * @returns {JSX.Element}
 */
export function LucideIconByName({
    name,
    className,
}: {
    name: string;
    className?: string;
}) {
    const Icon = ICON_MAP[name];

    if (!Icon) {
        return null;
    }

    return <Icon className={className} />;
}

type LucideIconPickerProps = {
    id: string;
    label: string;
    value: string;
    onChange: (next: string) => void;
};

/**
 * Searchable picker for Lucide icons on collection fields.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function LucideIconPicker({
    id,
    label,
    value,
    onChange,
}: LucideIconPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const filteredIcons = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        if (!normalizedQuery) {
            return LUCIDE_ICON_OPTIONS;
        }

        return LUCIDE_ICON_OPTIONS.filter((option) =>
            option.name.toLowerCase().includes(normalizedQuery),
        );
    }, [query]);

    return (
        <div className="grid gap-2">
            <Label htmlFor={id}>{label}</Label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id={id}
                        type="button"
                        variant="outline"
                        className="justify-start gap-2"
                    >
                        {value ? (
                            <LucideIconByName name={value} className="size-4" />
                        ) : null}
                        {value || 'Choose icon…'}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="start">
                    <Input
                        placeholder="Search icons…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="mb-3"
                    />
                    <div className="grid max-h-56 grid-cols-5 gap-2 overflow-y-auto">
                        {filteredIcons.map((option) => {
                            const Icon = option.icon;
                            const selected = value === option.name;

                            return (
                                <button
                                    key={option.name}
                                    type="button"
                                    title={option.name}
                                    className={cn(
                                        'flex size-10 items-center justify-center rounded-md border transition-colors hover:bg-muted',
                                        selected && 'border-primary bg-primary/10',
                                    )}
                                    onClick={() => {
                                        onChange(option.name);
                                        setOpen(false);
                                    }}
                                >
                                    <Icon className="size-4" />
                                    {selected ? (
                                        <Check className="sr-only" />
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                    {value ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-3 w-full"
                            onClick={() => {
                                onChange('');
                                setOpen(false);
                            }}
                        >
                            Clear icon
                        </Button>
                    ) : null}
                </PopoverContent>
            </Popover>
        </div>
    );
}
