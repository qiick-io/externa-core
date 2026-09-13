<?php

/**
 * Ensures the File Manager `files.*` i18n namespace stays in parity across locales.
 */
test('files locale keys match across en it de', function (): void {
    $localesPath = resource_path('js/locales');

    $en = json_decode((string) file_get_contents("{$localesPath}/en.json"), true, 512, JSON_THROW_ON_ERROR);
    $it = json_decode((string) file_get_contents("{$localesPath}/it.json"), true, 512, JSON_THROW_ON_ERROR);
    $de = json_decode((string) file_get_contents("{$localesPath}/de.json"), true, 512, JSON_THROW_ON_ERROR);

    expect($en)->toHaveKey('files');
    expect($it)->toHaveKey('files');
    expect($de)->toHaveKey('files');

    $flatten = function (mixed $value, string $prefix = '') use (&$flatten): array {
        if (! is_array($value)) {
            return [$prefix => $value];
        }

        $keys = [];

        foreach ($value as $key => $child) {
            $path = $prefix === '' ? (string) $key : "{$prefix}.{$key}";
            $keys += $flatten($child, $path);
        }

        return $keys;
    };

    $enKeys = array_keys($flatten($en['files']));
    $itKeys = array_keys($flatten($it['files']));
    $deKeys = array_keys($flatten($de['files']));

    sort($enKeys);
    sort($itKeys);
    sort($deKeys);

    expect($itKeys)->toBe($enKeys);
    expect($deKeys)->toBe($enKeys);
    expect(count($enKeys))->toBeGreaterThan(80);
});
