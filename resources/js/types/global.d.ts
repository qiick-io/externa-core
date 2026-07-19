import type { ProjectAppearance } from '@/types/appearance';
import type { Auth } from '@/types/auth';
import type { SharedProjectSettings } from '@/types/project-settings';

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            auth: Auth;
            locale: string;
            availableLocales: Record<string, string>;
            sidebarOpen: boolean;
            collectionLocales: string[];
            notifications: {
                unread_count: number;
            };
            projectAppearance: ProjectAppearance;
            projectSettings: SharedProjectSettings;
            [key: string]: unknown;
        };
    }
}
