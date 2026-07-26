import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type AppErrorBoundaryProps = {
    children: ReactNode;
};

type AppErrorBoundaryState = {
    hasError: boolean;
    error: Error | null;
};

/**
 * Catches JavaScript errors in the child tree during render (class boundary per React docs).
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
                <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
                    <div className="max-w-md space-y-2 text-center">
                        <h1 className="text-xl font-semibold tracking-tight">
                            Something went wrong
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            The interface hit an unexpected error. You can try
                            reloading the page.
                        </p>
                        {import.meta.env.DEV && (
                            <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-muted p-3 text-left text-xs">
                                {this.state.error.message}
                            </pre>
                        )}
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                        <Button
                            type="button"
                            onClick={() => {
                                this.setState({ hasError: false, error: null });
                            }}
                        >
                            Try again
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                window.location.reload();
                            }}
                        >
                            Reload page
                        </Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
