import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

type AssistantMarkdownProps = {
    content: string;
    className?: string;
};

const markdownComponents: Components = {
    p: ({ children }) => (
        <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>
    ),
    ul: ({ children }) => (
        <ul className="my-2 list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
            {children}
        </ul>
    ),
    ol: ({ children }) => (
        <ol className="my-2 list-decimal space-y-1.5 pl-5 marker:text-muted-foreground">
            {children}
        </ol>
    ),
    li: ({ children }) => (
        <li className="leading-relaxed [&>ol]:mt-1.5 [&>ul]:mt-1.5">
            {children}
        </li>
    ),
    strong: ({ children }) => (
        <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    a: ({ href, children }) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
            {children}
        </a>
    ),
    code: ({ className, children, ...props }) => {
        const isBlock = Boolean(className?.includes('language-'));

        if (isBlock) {
            return (
                <code
                    className={cn(
                        'block font-mono text-[0.8rem] leading-relaxed text-foreground',
                        className,
                    )}
                    {...props}
                >
                    {children}
                </code>
            );
        }

        return (
            <code
                className="rounded-md border border-border/60 bg-muted/70 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
                {...props}
            >
                {children}
            </code>
        );
    },
    pre: ({ children }) => (
        <pre className="my-3 overflow-x-auto rounded-lg border border-border/60 bg-muted/50 p-3 text-[0.8rem] leading-relaxed [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0">
            {children}
        </pre>
    ),
    blockquote: ({ children }) => (
        <blockquote className="my-3 border-l-2 border-border pl-3 text-muted-foreground italic">
            {children}
        </blockquote>
    ),
    h1: ({ children }) => (
        <h1 className="mt-4 mb-2 text-base font-semibold tracking-tight">
            {children}
        </h1>
    ),
    h2: ({ children }) => (
        <h2 className="mt-3 mb-2 text-sm font-semibold tracking-tight">
            {children}
        </h2>
    ),
    h3: ({ children }) => (
        <h3 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h3>
    ),
    table: ({ children }) => (
        <div className="my-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[12rem] border-collapse text-xs">
                {children}
            </table>
        </div>
    ),
    thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
    th: ({ children }) => (
        <th className="border-b border-border px-2.5 py-1.5 text-left font-medium whitespace-nowrap">
            {children}
        </th>
    ),
    td: ({ children }) => (
        <td className="px-2.5 py-1.5 align-top">{children}</td>
    ),
    tr: ({ children }) => (
        <tr className="border-b border-border/70 last:border-b-0 even:bg-muted/30">
            {children}
        </tr>
    ),
    hr: () => <hr className="my-4 border-border" />,
};

/**
 * Renders assistant markdown with GFM + sanitized HTML output.
 * react-markdown does not execute scripts; rehype-sanitize hardens the AST.
 */
export function AssistantMarkdown({
    content,
    className,
}: AssistantMarkdownProps) {
    return (
        <div className={cn('max-w-none text-sm leading-relaxed', className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                components={markdownComponents}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
