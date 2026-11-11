<?php

declare(strict_types=1);

use Symfony\Component\Finder\Finder;

/**
 * Controllers validate input through Form Requests, not inline (#597).
 *
 * Pest's arch expectations cannot see method calls, so this reads the controller
 * sources. Each exception names the method and why it keeps inline validation.
 */
test('controllers do not validate requests inline', function (): void {
    /** @var array<string, list<string>> $allowedInline relative path => methods that may call $request->validate() */
    $allowedInline = [
        // Runs after the unknown-folder redirect, which a Form Request would turn into a 422; revisit with #598.
        'Admin/FileController.php' => ['index'],
        // Runs after the chat, attachment and item-write checks (403/404 before 422); moves with #598.
        'Chat/ChatMessageController.php' => ['addToField'],
    ];

    $offenders = [];

    $controllers = Finder::create()->files()->name('*.php')->in(app_path('Http/Controllers'));

    foreach ($controllers as $file) {
        $relativePath = str_replace('\\', '/', $file->getRelativePathname());
        $source = $file->getContents();

        if (preg_match_all('/->validate\(|Validator::make\(|->validateWithBag\(/', $source, $matches, PREG_OFFSET_CAPTURE) === 0) {
            continue;
        }

        foreach ($matches[0] as [, $offset]) {
            $before = substr($source, 0, $offset);
            preg_match_all('/function\s+(\w+)\s*\(/', $before, $functions);
            $method = end($functions[1]) ?: '(file scope)';

            if (in_array($method, $allowedInline[$relativePath] ?? [], true)) {
                continue;
            }

            $offenders[] = "{$relativePath}::{$method}";
        }
    }

    expect($offenders)->toBe([], 'Move this validation into a Form Request: '.implode(', ', $offenders));
});
