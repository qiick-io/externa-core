<?php

declare(strict_types=1);

/**
 * No new classes in `App\Support` (#600).
 *
 * The code standard has no `Support` role: a write is an `*Action`, an orchestrator or read
 * pipeline a `*Service`, a DTO a `*Data`. The classes below predate the rule and still use
 * invented role nouns; they move to the standard folders in #600 part 2. The list is a
 * ratchet: a class not on it fails, and an entry fails once its class is gone, so the list
 * only shrinks.
 */
test('app/Support holds only the classes still waiting for their rename', function (): void {
    $remainingSupportClasses = [
        'App\Support\Api\ApiAccess',
        'App\Support\Api\MiniUserMapper',
        'App\Support\Api\PublicApiIncludeParser',
        'App\Support\Api\PublicApiOrigin',
        'App\Support\Api\PublicItemSortParser',
        'App\Support\Auth\HomePath',
        'App\Support\Health\ReadinessChecks',
        'App\Support\Http\CurlMultiReadableStream',
        'App\Support\Http\CurlSseStreamer',
        'App\Support\Http\LmStudioSseNormalizer',
        'App\Support\Http\SafeReturnUrl',
        'App\Support\Http\UserContentResponse',
    ];
    $supportDirectory = dirname(__DIR__, 2).'/app/Support';
    $supportClasses = [];

    if (is_dir($supportDirectory)) {
        $supportFiles = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($supportDirectory, FilesystemIterator::SKIP_DOTS),
        );

        foreach ($supportFiles as $supportFile) {
            if ($supportFile->getExtension() !== 'php') {
                continue;
            }

            $relativeClassPath = substr($supportFile->getPathname(), strlen($supportDirectory) + 1, -4);
            $supportClasses[] = 'App\Support\\'.str_replace('/', '\\', $relativeClassPath);
        }
    }

    $newSupportClasses = array_values(array_diff($supportClasses, $remainingSupportClasses));
    $movedSupportClasses = array_values(array_diff($remainingSupportClasses, $supportClasses));
    $violations = [
        ...array_map(
            static fn (string $class): string => "{$class} is new in App\\Support: give it a role suffix and move it to the matching folder (Actions, Services, Data, ...).",
            $newSupportClasses,
        ),
        ...array_map(
            static fn (string $class): string => "{$class} left App\\Support: remove it from the list in this test.",
            $movedSupportClasses,
        ),
    ];

    expect($violations)->toBe([], implode("\n", $violations));
});
