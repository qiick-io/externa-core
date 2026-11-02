<!DOCTYPE html>
<html
        lang="{{ str_replace('_', '-', app()->getLocale()) }}"
        @class([
            'dark' => ($appearance ?? 'system') == 'dark',
            'high-contrast' => $accessibilityHighContrast ?? false,
            'reduce-motion' => $accessibilityReduceMotion ?? false,
        ])
    >
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        {{-- Inline script to detect system dark mode preference and apply it immediately --}}
        <script>
            (function() {
                const appearance = '{{ $appearance ?? "system" }}';

                if (appearance === 'system') {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

                    if (prefersDark) {
                        document.documentElement.classList.add('dark');
                    }
                }

                document.documentElement.style.colorScheme =
                    document.documentElement.classList.contains('dark') ? 'dark' : 'light';
            })();
        </script>

        {{-- FOUC: match ink surfaces from app.css (not default shadcn oklch) --}}
        <style>
            html {
                background-color: #ffffff;
            }

            html.dark {
                background-color: #0e171e;
            }
        </style>

        <title inertia>{{ $projectName ?? config('app.name', 'Laravel') }}</title>

        @if (! empty($projectFaviconUrl))
            <link rel="icon" href="{{ $projectFaviconUrl }}">
        @else
            <link rel="icon" href="/favicon.ico?v=3" sizes="any">
            <link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml">
            <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3">
        @endif

        @viteReactRefresh
        @vite(['resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        @inertiaHead

        {{-- Theme preset CSS variables (+ optional custom brand hex via --brand-primary).
             The id lets the Appearance live preview rewrite this block (resources/js/lib/theme-css.ts). --}}
        @php
            $themeCss = $projectThemeCss ?? null;
            $themeLight = is_array($themeCss['light'] ?? null) ? $themeCss['light'] : [];
            $themeDark = is_array($themeCss['dark'] ?? null) ? $themeCss['dark'] : [];
            $brandPrimary = $themeCss['brandPrimary'] ?? $projectColor ?? null;
            $brandPrimaryDark = $themeCss['brandPrimaryDark'] ?? $projectColorDark ?? $brandPrimary;
            $brandPrimaryForeground = $themeCss['brandPrimaryForeground'] ?? $projectColorForeground ?? null;
            $brandPrimaryDarkForeground = $themeCss['brandPrimaryDarkForeground'] ?? $projectColorDarkForeground ?? $brandPrimaryForeground;
        @endphp
        @if ($themeLight !== [] || $themeDark !== [] || ! empty($brandPrimary))
            <style id="externa-theme-css">
                :root {
                    @foreach ($themeLight as $cssVar => $cssValue)
                        --{{ $cssVar }}: {{ $cssValue }};
                    @endforeach
                    @if (! empty($brandPrimary))
                        --brand-primary: {{ $brandPrimary }};
                        --brand-primary-foreground: {{ $brandPrimaryForeground ?? '#ffffff' }};
                        --brand-primary-dark: {{ $brandPrimaryDark ?? $brandPrimary }};
                        --brand-primary-dark-foreground: {{ $brandPrimaryDarkForeground ?? $brandPrimaryForeground ?? '#ffffff' }};
                    @endif
                }
                @if ($themeDark !== [])
                .dark {
                    @foreach ($themeDark as $cssVar => $cssValue)
                        --{{ $cssVar }}: {{ $cssValue }};
                    @endforeach
                }
                @endif
            </style>
        @endif
    </head>
    <body class="font-sans antialiased">
        @inertia
    </body>
</html>
