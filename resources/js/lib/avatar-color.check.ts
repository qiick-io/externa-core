// ponytail: self-check — run: node --experimental-strip-types resources/js/lib/avatar-color.check.ts
import assert from 'node:assert/strict';

import {
    AVATAR_COLORS,
    avatarColorForId,
    avatarStyleForId,
} from './avatar-color.ts';

assert.ok(AVATAR_COLORS.length > 0);

for (const color of AVATAR_COLORS) {
    assert.match(color, /^#[0-9A-F]{6}$/i);
}

assert.equal(avatarColorForId(42), avatarColorForId(42));
assert.equal(avatarColorForId(-1), avatarColorForId(1));
assert.equal(avatarColorForId(0), AVATAR_COLORS[0]);
assert.equal(avatarColorForId(Number.NaN), AVATAR_COLORS[0]);
assert.equal(avatarColorForId(''), AVATAR_COLORS[0]);
assert.equal(avatarColorForId('7'), avatarColorForId(7));
assert.equal(avatarColorForId('ada'), avatarColorForId('ada'));
assert.notEqual(avatarColorForId('ada'), avatarColorForId('bob'));

const style = avatarStyleForId(1);
assert.equal(style.backgroundColor, avatarColorForId(1));
assert.match(style.color, /^#(?:ffffff|1f2937)$/i);

console.log('avatar-color.check.ts ok');
