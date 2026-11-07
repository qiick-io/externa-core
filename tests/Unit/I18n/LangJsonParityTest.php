<?php

/**
 * Ensures Laravel JSON lang files (server __() strings) stay in key parity across it/de.
 */
test('server lang json keys match across it and de', function (): void {
    $itPath = langJsonPath('it.json');
    $dePath = langJsonPath('de.json');

    expect(file_exists($itPath))->toBeTrue()
        ->and(file_exists($dePath))->toBeTrue();

    /** @var array<string, string> $it */
    $it = json_decode((string) file_get_contents($itPath), true, 512, JSON_THROW_ON_ERROR);
    /** @var array<string, string> $de */
    $de = json_decode((string) file_get_contents($dePath), true, 512, JSON_THROW_ON_ERROR);

    $itKeys = array_keys($it);
    $deKeys = array_keys($de);
    sort($itKeys);
    sort($deKeys);

    expect($deKeys)->toBe($itKeys)
        ->and(count($itKeys))->toBeGreaterThan(100);

    foreach ($it as $key => $value) {
        expect($value)->toBeString()->not->toBe('')
            ->and($de[$key])->toBeString()->not->toBe('');
    }
});

test('server lang json covers extracted __() keys from app', function (): void {
    $it = array_keys(json_decode((string) file_get_contents(langJsonPath('it.json')), true, 512, JSON_THROW_ON_ERROR));

    $keys = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator(dirname(__DIR__, 3).'/app', FilesystemIterator::SKIP_DOTS)
    );

    foreach ($iterator as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'php') {
            continue;
        }

        $contents = (string) file_get_contents($file->getPathname());
        if (preg_match_all("/__\(\s*'((?:\\\\'|[^'])*)'/", $contents, $matches) > 0) {
            foreach ($matches[1] as $match) {
                $keys[] = str_replace("\\'", "'", $match);
            }
        }
        if (preg_match_all('/__\(\s*"((?:\\\\"|[^"])*)"/', $contents, $matches) > 0) {
            foreach ($matches[1] as $match) {
                $keys[] = str_replace('\\"', '"', $match);
            }
        }
    }

    $keys = array_values(array_unique($keys));
    sort($keys);

    $missing = array_values(array_diff($keys, $it));

    expect($missing)->toBe([]);
});

function langJsonPath(string $file): string
{
    return dirname(__DIR__, 3).'/lang/'.$file;
}
