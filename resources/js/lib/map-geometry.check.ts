// ponytail: self-check — run: node --experimental-strip-types resources/js/lib/map-geometry.check.ts
import assert from 'node:assert/strict';

import { normalizeLatLng, parseMapPositions } from './map-geometry.ts';

assert.deepEqual(normalizeLatLng(45.5, 9.2), { lat: 45.5, lng: 9.2 });
assert.deepEqual(normalizeLatLng(20.63, 260.15), {
    lat: 20.63,
    lng: 260.15 - 360,
});
assert.equal(normalizeLatLng(91, 0), null);
assert.equal(normalizeLatLng(0, Number.NaN), null);

assert.deepEqual(
    parseMapPositions({ type: 'Point', coordinates: [9.19, 45.46] }),
    [{ lat: 45.46, lng: 9.19 }],
);
assert.deepEqual(parseMapPositions({ lat: 1, lng: 2 }), [{ lat: 1, lng: 2 }]);
assert.deepEqual(
    parseMapPositions({
        type: 'MultiPoint',
        coordinates: [
            [1, 2],
            [3, 4],
        ],
    }),
    [
        { lat: 2, lng: 1 },
        { lat: 4, lng: 3 },
    ],
);
assert.deepEqual(parseMapPositions(null), []);

console.log('map-geometry.check.ts ok');
