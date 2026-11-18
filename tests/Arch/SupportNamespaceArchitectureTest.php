<?php

declare(strict_types=1);

/**
 * No classes in `App\Support` (#600).
 *
 * The code standard has no `Support` role: a write is an `*Action`, an orchestrator or read
 * pipeline a `*Service`, a DTO a `*Data`. #600 moved every former `App\Support` class to the
 * standard folders with its role suffix, so a new class there fails.
 */
test('app/Support holds no classes', function (): void {
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

    $violations = array_map(
        static fn (string $class): string => "{$class} is in App\\Support: give it a role suffix and move it to the matching folder (Actions, Services, Data, ...).",
        $supportClasses,
    );

    expect($violations)->toBe([], implode("\n", $violations));
});
