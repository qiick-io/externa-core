<?php

it('keeps post-create-project-cmd minimal without migrate or sqlite', function () {
    $composer = json_decode((string) file_get_contents(base_path('composer.json')), true, 512, JSON_THROW_ON_ERROR);
    $scripts = $composer['scripts']['post-create-project-cmd'] ?? [];
    $joined = implode("\n", $scripts);

    expect($scripts)->not->toBeEmpty()
        ->and($joined)->toContain('key:generate')
        ->and($joined)->toContain('externa:install')
        ->and($joined)->not->toMatch('/\bmigrate\b/')
        ->and($joined)->not->toContain('database.sqlite')
        ->and($joined)->not->toContain('touch(')
        ->and($joined)->not->toContain('db:seed');
});

it('keeps composer setup as the non-interactive CI path', function () {
    $composer = json_decode((string) file_get_contents(base_path('composer.json')), true, 512, JSON_THROW_ON_ERROR);
    $setup = $composer['scripts']['setup'] ?? [];
    $joined = implode("\n", $setup);

    expect($setup)->not->toBeEmpty()
        ->and($joined)->toContain('composer install')
        ->and($joined)->toContain('key:generate')
        ->and($joined)->toMatch('/\bmigrate\b/')
        ->and($joined)->toContain('npm install')
        ->and($joined)->toContain('npm run build');
});
