<?php

declare(strict_types=1);

/**
 * Repo-only architecture ratchets (#281) on top of the shared `NamingArchitectureTest.php`.
 *
 * Every list here is existing debt: it may only shrink, and each test fails both ways, on a
 * new violation and on an entry that no longer needs to be listed. The shared test already
 * covers the `Policy` suffix for `App\Policies`; its suffix rules for namespaces this repo
 * does not have yet (`Builders`, `Exceptions`, `Observers`, `Rules`) are kept on purpose,
 * so the first class added there is checked.
 */

/**
 * Every class-like (class, trait, interface, enum) declared under `app/`, keyed by its file.
 *
 * @return array<string, string> class name => absolute file path
 */
$applicationClassFiles = static function (): array {
    $applicationDirectory = dirname(__DIR__, 2).'/app';
    $classFilesByName = [];
    $applicationFiles = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($applicationDirectory, FilesystemIterator::SKIP_DOTS),
    );

    foreach ($applicationFiles as $applicationFile) {
        if ($applicationFile->getExtension() !== 'php') {
            continue;
        }

        $relativeClassPath = substr($applicationFile->getPathname(), strlen($applicationDirectory) + 1, -4);
        $classFilesByName['App\\'.str_replace('/', '\\', $relativeClassPath)] = $applicationFile->getPathname();
    }

    ksort($classFilesByName);

    return $classFilesByName;
};

/**
 * Exact-match companion of the shared `strict types` rule: Pest ignores by class-name prefix,
 * so this test catches an unlisted file the prefix would hide, and stale entries.
 */
test('strict types ratchet only shrinks', function () use ($applicationClassFiles): void {
    /** @var list<string> $classesWithoutStrictTypes */
    $classesWithoutStrictTypes = require __DIR__.'/strict-types-baseline.php';
    $violations = [];

    foreach ($applicationClassFiles() as $className => $classFile) {
        // The same check as Pest's `toUseStrictTypes()`.
        $isDeclaringStrictTypes = (bool) preg_match(
            '/^<\?php\s*(\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$)|\s)*declare\s*\(\s*strict_types\s*=\s*1\s*\)\s*;/m',
            (string) file_get_contents($classFile),
        );
        $isListed = in_array($className, $classesWithoutStrictTypes, true);

        if (! $isDeclaringStrictTypes && ! $isListed) {
            $violations[] = "{$className} does not declare strict types: add declare(strict_types=1).";
        } elseif ($isDeclaringStrictTypes && $isListed) {
            $violations[] = "{$className} declares strict types now: remove it from strict-types-baseline.php.";
        }
    }

    foreach (array_diff($classesWithoutStrictTypes, array_keys($applicationClassFiles())) as $missingClassName) {
        $violations[] = "{$missingClassName} no longer exists: remove it from strict-types-baseline.php.";
    }

    expect($violations)->toBe([], implode("\n", $violations));
});

/**
 * An `*Action` is one write / use case with one public entry point, `execute(...)`
 * (code standard, role table). Fortify's published actions keep their upstream API.
 */
test('actions have a single public execute method', function () use ($applicationClassFiles): void {
    $scaffoldingNamespaces = ['App\Actions\Fortify\\'];
    $violations = [];

    foreach (array_keys($applicationClassFiles()) as $className) {
        if (! str_starts_with($className, 'App\Actions\\')) {
            continue;
        }

        foreach ($scaffoldingNamespaces as $scaffoldingNamespace) {
            if (str_starts_with($className, $scaffoldingNamespace)) {
                continue 2;
            }
        }

        $actionClass = new ReflectionClass($className);

        if (! $actionClass->isInstantiable()) {
            continue;
        }

        $publicMethodNames = array_values(array_map(
            static fn (ReflectionMethod $method): string => $method->getName(),
            array_filter(
                $actionClass->getMethods(ReflectionMethod::IS_PUBLIC),
                static fn (ReflectionMethod $method): bool => $method->getDeclaringClass()->getName() === $className
                    && ! $method->isConstructor(),
            ),
        ));

        if ($publicMethodNames !== ['execute']) {
            $violations[] = "{$className} must have exactly one public method, execute(); found: ".(implode(', ', $publicMethodNames) ?: 'none').'.';
        }
    }

    expect($violations)->toBe([], implode("\n", $violations));
});

/**
 * Traits live in one place, `App\Traits` (code standard, role table). The `*Trait` suffix
 * is checked by the shared test.
 */
test('traits live in App\Traits', function () use ($applicationClassFiles): void {
    // Starter-kit validation-rule traits, never moved (see naming-architecture.php).
    $scaffoldingNamespaces = ['App\Concerns\\'];

    // Existing debt (#281): traits in `Concerns` folders, to move into App\Traits in a later PR.
    // Remove an entry when its trait moves; never add one.
    $traitsOutsideTraitsNamespace = [
        'App\Ai\Concerns\ChecksAiPermissionsTrait',
        'App\Ai\Concerns\EnforcesAiCollectionPermissionsTrait',
        'App\Ai\Concerns\EnforcesAiFileAccessTrait',
        'App\Ai\Concerns\ImportsCollectionRecordsTrait',
        'App\Ai\Concerns\LogsAiToolUseTrait',
        'App\Ai\Concerns\RequiresDestructiveApprovalTrait',
        'App\Console\Concerns\ManagesDotEnvTrait',
        'App\GraphQL\Concerns\AuthorizesGraphqlCollectionTrait',
        'App\GraphQL\Concerns\SerializesGraphqlItemTrait',
        'App\Http\Controllers\Api\V1\Concerns\AuthorizesCollectionAccessTrait',
        'App\Http\Controllers\Api\V1\Concerns\AuthorizesFileAccessTrait',
        'App\Http\Controllers\Settings\Concerns\LogsProjectSettingsUpdateTrait',
        'App\Http\Requests\Collections\Concerns\ValidatesCollectionFieldSettingsTrait',
        'App\Http\Requests\Concerns\AuthorizesApiCollectionBatchTrait',
        'App\Http\Requests\Concerns\AuthorizesChatAccessTrait',
        'App\Http\Requests\Concerns\AuthorizesCollectionRouteAccessTrait',
        'App\Http\Requests\Concerns\AuthorizesWithPermissionTrait',
        'App\Http\Requests\Concerns\GuardsSuperAdminGrantsTrait',
        'App\Http\Requests\Concerns\ValidatesChatPickerPageTrait',
        'App\Http\Requests\Concerns\ValidatesFileManagerFieldsTrait',
        'App\Http\Requests\Concerns\ValidatesListPerPageTrait',
        'App\Http\Requests\Concerns\ValidatesSearchQueryTrait',
        'App\Http\Requests\Settings\Concerns\AuthorizesProjectSettingsTrait',
        'App\Mcp\Tools\Concerns\DelegatesToRegistryMcpToolTrait',
        'App\Notifications\Concerns\BroadcastsWithDatabaseTrait',
    ];
    $violations = [];

    foreach (array_keys($applicationClassFiles()) as $className) {
        if (! trait_exists($className) || str_starts_with($className, 'App\Traits\\')) {
            continue;
        }

        foreach ($scaffoldingNamespaces as $scaffoldingNamespace) {
            if (str_starts_with($className, $scaffoldingNamespace)) {
                continue 2;
            }
        }

        if (! in_array($className, $traitsOutsideTraitsNamespace, true)) {
            $violations[] = "{$className} is a trait outside App\\Traits: move it to app/Traits/.";
        }
    }

    foreach ($traitsOutsideTraitsNamespace as $listedTrait) {
        if (! trait_exists($listedTrait)) {
            $violations[] = "{$listedTrait} is gone or moved: remove it from the traits allow-list.";
        }
    }

    expect($violations)->toBe([], implode("\n", $violations));
});
