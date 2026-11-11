import { bundledLanguages, codeToTokens } from 'shiki';
import type { BundledLanguage } from 'shiki';
import type {
    CodeHighlighterPlugin,
    HighlightResult,
    ThemeInput,
} from 'streamdown';
import { scalarToString } from '@/lib/scalar-to-string';

const THEMES: [ThemeInput, ThemeInput] = ['github-light', 'github-dark'];
const MAX_CACHED_RESULTS = 200;

/** Finished highlights, keyed by theme pair, language and code. */
const resultCache = new Map<string, HighlightResult>();

function cacheKey(
    language: string,
    code: string,
    themes: [ThemeInput, ThemeInput],
): string {
    return `${scalarToString(themes[0])}|${scalarToString(themes[1])}|${language}|${code}`;
}

/**
 * Streamdown code highlighting on `shiki`, with a light and a dark theme.
 * Grammars load on first use; a streaming (incomplete) block is not cached.
 *
 * ponytail: our own plugin instead of `@streamdown/code`, which would be one
 * more dependency for the same shiki call; swap it in if streamdown changes the
 * plugin contract.
 */
export const shikiCodePlugin: CodeHighlighterPlugin = {
    name: 'shiki',
    type: 'code-highlighter',
    getSupportedLanguages: () =>
        Object.keys(bundledLanguages) as BundledLanguage[],
    getThemes: () => THEMES,
    supportsLanguage: (language) => language in bundledLanguages,
    highlight({ code, language, themes, isIncomplete }, callback) {
        const key = cacheKey(language, code, themes);
        const cached = resultCache.get(key);

        if (cached) {
            return cached;
        }

        void codeToTokens(code, {
            lang: language as BundledLanguage,
            themes: {
                light: themes[0] as string,
                dark: themes[1] as string,
            },
        })
            .then((result) => {
                const highlighted: HighlightResult = {
                    bg: result.bg,
                    fg: result.fg,
                    rootStyle: result.rootStyle,
                    tokens: result.tokens,
                };

                if (!isIncomplete) {
                    if (resultCache.size >= MAX_CACHED_RESULTS) {
                        resultCache.delete(
                            resultCache.keys().next().value as string,
                        );
                    }

                    resultCache.set(key, highlighted);
                }

                callback?.(highlighted);
            })
            .catch(() => {
                // Unknown grammar: Streamdown keeps the plain block.
            });

        return null;
    },
};
