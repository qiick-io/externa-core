<?php

test('admin locale files share the same key set', function () {
    $en = localeKeys(resource_path('js/locales/en.json'));
    $it = localeKeys(resource_path('js/locales/it.json'));
    $de = localeKeys(resource_path('js/locales/de.json'));

    expect($it)->toEqual($en)
        ->and($de)->toEqual($en);
});

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
