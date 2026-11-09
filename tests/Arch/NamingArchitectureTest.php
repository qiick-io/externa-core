<?php

declare(strict_types=1);

/**
 * qiick naming and architecture guardrails, identical in every qiick repo.
 *
 * Generated from qiick-io/app-ui `standards/php/NamingArchitectureTest.php` by
 * `scripts/sync-standards.mjs`; CI fails when this copy differs. Do not edit it here:
 *
 * - framework / package scaffolding a rule must skip goes in `naming-architecture.php`
 *   next to this file (the repo's own list, with a reason per entry);
 * - repo-specific rules go in another test file in `tests/Arch/`.
 *
 * The rules are the "Role suffixes" and "Architecture" sections of the qiick code
 * standard. A namespace the repo does not have passes trivially.
 */

/**
 * @var array{
 *     namespace: string,
 *     ignoring?: array<string, list<string>>,
 *     suffixes?: array<string, string>,
 * } $namingArchitecture
 */
$namingArchitecture = require __DIR__.'/naming-architecture.php';
$rootNamespace = $namingArchitecture['namespace'];
$ignoredBy = static fn (string $rule): array => $namingArchitecture['ignoring'][$rule] ?? [];

/** Sub-namespace => role suffix every class in it must end with. */
$classSuffixes = [
    'Actions' => 'Action',
    'Builders' => 'Builder',
    'Console\Commands' => 'Command',
    'Data' => 'Data',
    'Events' => 'Event',
    'Exceptions' => 'Exception',
    'Http\Controllers' => 'Controller',
    'Http\Middleware' => 'Middleware',
    'Http\Requests' => 'Request',
    'Http\Resources' => 'Resource',
    'Http\Responses' => 'Response',
    'Jobs' => 'Job',
    'Listeners' => 'Listener',
    'Notifications' => 'Notification',
    'Observers' => 'Observer',
    'Policies' => 'Policy',
    'Rules' => 'Rule',
    'Services' => 'Service',
    ...($namingArchitecture['suffixes'] ?? []),
];

arch('strict types')
    ->expect($rootNamespace)
    ->toUseStrictTypes()
    ->ignoring($ignoredBy('strict types'));

arch('no debugging helpers')
    ->expect(['dd', 'dump', 'ray', 'var_dump'])
    ->not->toBeUsed();

arch('env() only in config')
    ->expect('env')
    ->not->toBeUsed()
    ->ignoring(['Config', ...$ignoredBy('env')]);

arch('controllers do not use the DB facade')
    ->expect("{$rootNamespace}\\Http\\Controllers")
    ->not->toUse('Illuminate\Support\Facades\DB');

arch('models use bare domain nouns')
    ->expect("{$rootNamespace}\\Models")
    ->classes()
    ->not->toHaveSuffix('Model');

arch('data objects are readonly')
    ->expect("{$rootNamespace}\\Data")
    ->classes()
    ->toBeReadonly()
    ->ignoring($ignoredBy('Data'));

foreach ($classSuffixes as $subNamespace => $suffix) {
    // Fortify's published actions keep their upstream names in every Laravel app.
    $scaffolding = $subNamespace === 'Actions' ? ["{$rootNamespace}\\Actions\\Fortify"] : [];

    arch("{$subNamespace} end with {$suffix}")
        ->expect("{$rootNamespace}\\{$subNamespace}")
        ->classes()
        ->toHaveSuffix($suffix)
        ->ignoring([...$scaffolding, ...$ignoredBy($subNamespace)]);
}

arch('Enums end with Enum')
    ->expect("{$rootNamespace}\\Enums")
    ->enums()
    ->toHaveSuffix('Enum')
    ->ignoring($ignoredBy('Enums'));

arch('Contracts are interfaces ending with Contract')
    ->expect("{$rootNamespace}\\Contracts")
    ->toBeInterfaces()
    ->toHaveSuffix('Contract')
    ->ignoring($ignoredBy('Contracts'));

arch('traits end with Trait')
    ->expect($rootNamespace)
    ->traits()
    ->toHaveSuffix('Trait')
    ->ignoring($ignoredBy('traits'));

/**
 * Thin controllers (code standard, "Architecture", rule 1): at most five public
 * methods of their own per controller. Controllers that already have more are
 * listed in `naming-architecture.php` under `controllerPublicMethods` with their
 * current count, a ratchet: the count may not grow, and an entry fails once the
 * controller shrinks, so it is lowered or removed and cannot grow back.
 */
test('controllers stay thin', function () use ($namingArchitecture, $rootNamespace): void {
    $maximumPublicMethods = 5;
    /** @var array<class-string, int> $allowedPublicMethodsByController */
    $allowedPublicMethodsByController = $namingArchitecture['controllerPublicMethods'] ?? [];
    /** @var array<string, list<string>> $sourceDirectoriesByNamespace */
    $sourceDirectoriesByNamespace = require dirname(__DIR__, 2).'/vendor/composer/autoload_psr4.php';
    $violations = [];

    foreach ($sourceDirectoriesByNamespace[$rootNamespace.'\\'] ?? [] as $sourceDirectory) {
        $controllersDirectory = $sourceDirectory.'/Http/Controllers';

        if (! is_dir($controllersDirectory)) {
            continue;
        }

        $controllerFiles = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($controllersDirectory, FilesystemIterator::SKIP_DOTS),
        );

        foreach ($controllerFiles as $controllerFile) {
            if ($controllerFile->getExtension() !== 'php') {
                continue;
            }

            $relativeClassPath = substr($controllerFile->getPathname(), strlen($sourceDirectory) + 1, -4);
            $controllerClass = $rootNamespace.'\\'.str_replace('/', '\\', $relativeClassPath);

            if (! class_exists($controllerClass) || (new ReflectionClass($controllerClass))->isAbstract()) {
                continue;
            }

            $publicMethodCount = count(array_filter(
                (new ReflectionClass($controllerClass))->getMethods(ReflectionMethod::IS_PUBLIC),
                static fn (ReflectionMethod $method): bool => $method->getDeclaringClass()->getName() === $controllerClass
                    && ! $method->isConstructor()
                    && ! $method->isStatic(),
            ));
            $allowedPublicMethods = $allowedPublicMethodsByController[$controllerClass] ?? $maximumPublicMethods;

            if ($publicMethodCount > $allowedPublicMethods) {
                $violations[] = "{$controllerClass} has {$publicMethodCount} public methods (allowed {$allowedPublicMethods}): split it, or move the logic into Actions / Services. Existing debt only, when adopting this rule: '{$controllerClass}' => {$publicMethodCount},";
            } elseif (isset($allowedPublicMethodsByController[$controllerClass]) && $publicMethodCount < $allowedPublicMethods) {
                $violations[] = $publicMethodCount <= $maximumPublicMethods
                    ? "{$controllerClass} is thin now: remove it from controllerPublicMethods."
                    : "{$controllerClass} shrank to {$publicMethodCount}: set '{$controllerClass}' => {$publicMethodCount} in controllerPublicMethods.";
            }
        }
    }

    expect($violations)->toBe([], implode("\n", $violations));
});
