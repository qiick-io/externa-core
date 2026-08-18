import type { ProjectAppearance } from '@/types/appearance';
import type { Auth } from '@/types/auth';
import type { SharedProjectSettings } from '@/types/project-settings';

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            appVersion: string;
            auth: Auth;
            locale: string;
            availableLocales: Record<string, string>;
            sidebarOpen: boolean;
            collectionLocales: string[];
            collectionLocaleMeta: Array<{
                code: string;
                name: string;
                flag: string;
            }>;
            defaultContentLocale: string;
            notifications: {
                unread_count: number;
            };
            chat: {
                unread_count: number;
                unread_private: number;
                unread_collection: number;
            };
            healthBadge: {
                status: 'ok' | 'warn' | 'fail';
                label: string;
            } | null;
            realtime: {
                enabled: boolean;
                broadcaster: string;
            };
            projectAppearance: ProjectAppearance;
            projectSettings: SharedProjectSettings;
            [key: string]: unknown;
        };
    }
}
