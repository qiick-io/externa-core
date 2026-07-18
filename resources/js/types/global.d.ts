import type { Auth } from '@/types/auth';

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            auth: Auth;
            sidebarOpen: boolean;
            collectionLocales: string[];
            notifications: {
                unread_count: number;
            };
            [key: string]: unknown;
        };
    }
}
