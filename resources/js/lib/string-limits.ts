/**
 * FE mirrors of App\Support\Validation\StringLimits (BE is source of truth).
 */
export const STRING_LIMITS = {
    SEARCH: 255,
    SEARCH_CHAT_HUB: 120,
    NAME: 255,
    EMAIL: 255,
    USERNAME: 255,
    DESCRIPTION: 5000,
    DESCRIPTION_SHORT: 1024,
    NOTE: 1024,
    CMS_STRING: 255,
    CMS_TEXTAREA: 10000,
    CMS_MARKDOWN: 65535,
    CMS_CODE: 65535,
    CMS_WYSIWYG: 65535,
    CHAT_MESSAGE: 20000,
    FILTER_VALUE: 1024,
    FILTER_MAX_KEYS: 32,
} as const;
