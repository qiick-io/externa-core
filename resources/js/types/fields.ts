/**
 * Minimal field definition shape shared by dynamic item field renderers.
 */
export type FieldDef = {
    id: number;
    name: string;
    type: string;
    translatable?: boolean;
    sort_order?: number;
    settings?: Record<string, unknown> | null;
};
