<?php

test('admin locale files share the same key set', function () {
    $en = localeKeys(localeFilePath('en.json'));
    $it = localeKeys(localeFilePath('it.json'));
    $de = localeKeys(localeFilePath('de.json'));

    expect($it)->toEqual($en)
        ->and($de)->toEqual($en);
});

test('a11y locale keys exist in en, de, and it', function () {
    $en = array_keys(localeSubtree(localeFilePath('en.json'), 'a11y'));
    $it = array_keys(localeSubtree(localeFilePath('it.json'), 'a11y'));
    $de = array_keys(localeSubtree(localeFilePath('de.json'), 'a11y'));

    sort($en);
    sort($it);
    sort($de);

    expect($en)->not->toBeEmpty()
        ->and($it)->toEqual($en)
        ->and($de)->toEqual($en);

    foreach ([
        'close',
        'toggleSidebar',
        'loading',
        'notifications',
        'moreActions',
        'mainNav',
        'breadcrumb',
        'chatThreadList',
        'skipToContent',
    ] as $required) {
        expect($en)->toContain($required);
    }
});

function localeFilePath(string $file): string
{
    return dirname(__DIR__, 2).'/resources/js/locales/'.$file;
}

/**
 * @return list<string>
 */
function localeKeys(string $path): array
{
    $decoded = json_decode((string) file_get_contents($path), true);
    expect($decoded)->toBeArray();

    $keys = [];
    $walk = function (array $node, string $prefix = '') use (&$walk, &$keys): void {
        foreach ($node as $key => $value) {
            $path = $prefix === '' ? (string) $key : $prefix.'.'.$key;
            if (is_array($value)) {
                $walk($value, $path);
            } else {
                $keys[] = $path;
            }
        }
    };
    $walk($decoded);
    sort($keys);

    return $keys;
}

/**
 * @return array<string, mixed>
 */
function localeSubtree(string $path, string $root): array
{
    $decoded = json_decode((string) file_get_contents($path), true);
    expect($decoded)->toBeArray()
        ->and($decoded)->toHaveKey($root)
        ->and($decoded[$root])->toBeArray();

    /** @var array<string, mixed> $subtree */
    $subtree = $decoded[$root];

    return $subtree;
}
