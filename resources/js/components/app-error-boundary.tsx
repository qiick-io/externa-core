import { TriangleAlert } from 'lucide-react';
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import i18n from '@/lib/i18n';

type AppErrorBoundaryProps = {
    children: ReactNode;
};

type AppErrorBoundaryState = {
    hasError: boolean;
    error: Error | null;
};

/**
 * Catches JavaScript errors in the child tree during render (class boundary per React docs)
 * and shows the shadcn Empty state with Try again / Reload page. A class component cannot
 * use hooks, so the strings come from the i18n instance directly.
 * @see https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */
export class AppErrorBoundary extends Component<
    AppErrorBoundaryProps,
    AppErrorBoundaryState
> {
    constructor(props: AppErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(
        error: Error,
    ): Partial<AppErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[AppErrorBoundary]', error, info.componentStack);
    }

    render(): ReactNode {
        if (this.state.hasError && this.state.error) {
            return (
                <div className="flex min-h-screen bg-background p-6">
                    <Empty data-test="app-error-boundary">
                        <EmptyHeader>
                            <EmptyMedia
                                variant="icon"
                                className="bg-primary/10 text-primary"
                            >
                                <TriangleAlert />
                            </EmptyMedia>
                            <EmptyTitle>
                                <h1>{i18n.t('errors.boundary.title')}</h1>
                            </EmptyTitle>
                            <EmptyDescription>
                                {i18n.t('errors.boundary.description')}
                            </EmptyDescription>
                        </EmptyHeader>
                        <EmptyContent>
                            {import.meta.env.DEV && (
                                <pre className="max-h-40 w-full overflow-auto rounded-lg bg-muted p-3 text-left text-xs">
                                    {this.state.error.message}
                                </pre>
                            )}
                            <div className="flex flex-wrap justify-center gap-2">
                                <Button
                                    type="button"
                                    onClick={() => {
                                        this.setState({
                                            hasError: false,
                                            error: null,
                                        });
                                    }}
                                >
                                    {i18n.t('errors.boundary.tryAgain')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        window.location.reload();
                                    }}
                                >
                                    {i18n.t('errors.boundary.reload')}
                                </Button>
                            </div>
                        </EmptyContent>
                    </Empty>
                </div>
            );
        }

        return this.props.children;
    }
}
