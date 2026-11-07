import { Button } from '@/components/ui/button';

type ChatEmojiGridProps = {
    emojis: readonly string[];
    onSelect: (emoji: string) => void;
};

/** The composer's emoji picker grid: one ghost `Button` icon-sm per emoji. */
export function ChatEmojiGrid({ emojis, onSelect }: ChatEmojiGridProps) {
    return (
        <div className="grid grid-cols-8 gap-1" data-test="chat-emoji-grid">
            {emojis.map((emoji) => (
                <Button
                    key={emoji}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-lg"
                    onClick={() => onSelect(emoji)}
                >
                    {emoji}
                </Button>
            ))}
        </div>
    );
}
