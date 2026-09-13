<?php

use App\Support\Api\PublicApiIncludeParser;

it('parses csv include into sorted unique tokens', function (): void {
    $parser = new PublicApiIncludeParser;

    expect($parser->parse('files,author,files, categories'))
        ->toBe(['author', 'categories', 'files'])
        ->and($parser->parse(null))->toBe([])
        ->and($parser->parse(''))->toBe([])
        ->and($parser->parse(['users', ' files ', 'users']))->toBe(['files', 'users']);
});

it('is case-sensitive and ignores unknown-looking empty parts', function (): void {
    $parser = new PublicApiIncludeParser;

    expect($parser->parse('Files,files, ,Users'))
        ->toBe(['Files', 'Users', 'files'])
        ->and($parser->has(['files', 'author'], PublicApiIncludeParser::TOKEN_FILES))->toBeTrue()
        ->and($parser->has(['files', 'author'], PublicApiIncludeParser::TOKEN_USERS))->toBeFalse();
});
