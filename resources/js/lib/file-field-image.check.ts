// ponytail: self-check — run: node --experimental-strip-types resources/js/lib/file-field-image.check.ts
import assert from 'node:assert/strict';

import {
    fileFieldImageSources,
    withSearchParam,
} from './file-field-image.ts';

assert.equal(
    withSearchParam('/files/1/thumbnail', 'size', '256'),
    '/files/1/thumbnail?size=256',
);
assert.equal(
    withSearchParam('/files/1/thumbnail?size=64', 'size', '256'),
    '/files/1/thumbnail?size=256',
);

const sources = fileFieldImageSources({
    type: 'file',
    url: '/storage/assets/x/logo.png',
    storage_path: 'x/logo.png',
    thumbnail_url: '/admin/files/1/thumbnail',
});

assert.ok(sources);
assert.equal(sources.src, '/admin/files/1/thumbnail?size=256');
assert.match(sources.srcSet ?? '', /128w/);
assert.match(sources.srcSet ?? '', /256w/);
assert.match(sources.srcSet ?? '', /logo\.png 1600w/);

console.log('file-field-image.check: ok');
