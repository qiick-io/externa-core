/**
 * Page or section heading with optional description.
 * @param {{ title: string, description?: string, variant?: 'default' | 'small' }} props - Component props.
 * @param {string} props.title - Heading text.
 * @param {string} [props.description] - Optional supporting text below the title.
 * @param {'default' | 'small'} [props.variant='default'] - Visual size preset.
 * @returns {JSX.Element}
 */
export default function Heading({
    title,
    description,
    variant = 'default',
}: {
    title: string;
    description?: string;
    variant?: 'default' | 'small';
}) {
    return (
        <header className={variant === 'small' ? '' : 'mb-8 space-y-0.5'}>
            <h2
                className={
                    variant === 'small'
                        ? 'mb-0.5 text-base font-medium'
                        : 'text-xl font-semibold tracking-tight'
                }
            >
                {title}
            </h2>
            {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
            )}
        </header>
    );
}
