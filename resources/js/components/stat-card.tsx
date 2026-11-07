import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardAction,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type StatTrend = {
    /** Change against the previous period: positive, negative or zero. */
    delta: number;
    /** Text of the badge, e.g. "+12.5%" or "+3". */
    label: string;
};

/**
 * A key number, copied from the shadcn `dashboard-01` block (`section-cards.tsx`): the label
 * as CardDescription, the value as a large tabular CardTitle, the change as an outline Badge
 * in CardAction, and a two-line footer (a headline, then muted context). Lucide trend icons
 * stand in for the block's Tabler ones.
 */
export function StatCard({
    label,
    value,
    trend,
    headline,
    context,
    className,
}: {
    label: string;
    value: string;
    trend?: StatTrend | null;
    headline?: ReactNode;
    context?: ReactNode;
    className?: string;
}) {
    const TrendIcon =
        trend === null || trend === undefined || trend.delta === 0
            ? Minus
            : trend.delta > 0
              ? TrendingUp
              : TrendingDown;

    return (
        <Card
            className={cn(
                '@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs dark:bg-card',
                className,
            )}
        >
            <CardHeader>
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {value}
                </CardTitle>
                {trend ? (
                    <CardAction>
                        <Badge variant="outline">
                            <TrendIcon />
                            {trend.label}
                        </Badge>
                    </CardAction>
                ) : null}
            </CardHeader>
            {headline || context ? (
                <CardFooter className="flex-col items-start gap-1.5 text-sm">
                    {headline ? (
                        <div className="line-clamp-1 flex gap-2 font-medium">
                            {headline}
                        </div>
                    ) : null}
                    {context ? (
                        <div className="text-muted-foreground">{context}</div>
                    ) : null}
                </CardFooter>
            ) : null}
        </Card>
    );
}

/**
 * The badge text for a change: a percentage when there is a previous value, otherwise the
 * absolute change.
 */
export function trendOf(
    value: number,
    previous: number | null,
): StatTrend | null {
    if (previous === null) {
        return null;
    }

    const delta = value - previous;

    if (previous === 0) {
        return {
            delta,
            label: delta === 0 ? '0' : `${delta > 0 ? '+' : ''}${delta}`,
        };
    }

    const percent = (delta / previous) * 100;

    return {
        delta,
        label: `${percent > 0 ? '+' : ''}${percent.toFixed(Math.abs(percent) < 10 ? 1 : 0)}%`,
    };
}
