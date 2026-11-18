import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';

/**
 * One-series bar chart on the shadcn ChartContainer: theme-coloured bars and the chart
 * tooltip (ChartTooltipContent) instead of recharts' default one. `data` rows carry a
 * `count` and the category under `categoryKey`.
 */
export function DashboardBarChart({
    data,
    categoryKey,
    label,
    color,
    tickFormatter,
}: {
    data: Array<Record<string, unknown>>;
    categoryKey: string;
    label: string;
    color: string;
    tickFormatter?: (value: string) => string;
}) {
    const chartConfig = { count: { label, color } } satisfies ChartConfig;

    return (
        <ChartContainer
            config={chartConfig}
            className="aspect-auto h-full w-full"
        >
            <BarChart data={data} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey={categoryKey}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={tickFormatter}
                />
                <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                />
                <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent />}
                />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
        </ChartContainer>
    );
}
