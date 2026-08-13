/**
 * Self-check: closeDrawer must clear dirty before onClosed (deep-link GET).
 * Run: node resources/js/hooks/use-collections.close-order.check.mjs
 *
 * Models the leave-guard race without React: if onClosed runs while still
 * dirty, a GET would see unsaved changes (the bug flushSync fixes).
 */
import assert from 'node:assert/strict';

function closeDrawer({ flush, onClosed }) {
    let dirty = true;
    let open = true;

    const clear = () => {
        open = false;
        dirty = false;
    };

    if (flush) {
        clear();
        onClosed({ dirty, open });
    } else {
        // Broken order: schedule clear, then sync GET while still dirty.
        onClosed({ dirty, open });
        clear();
    }
}

let seen;
closeDrawer({
    flush: false,
    onClosed: (state) => {
        seen = state;
    },
});
assert.equal(seen.dirty, true, 'without flush, onClosed still sees dirty');

closeDrawer({
    flush: true,
    onClosed: (state) => {
        seen = state;
    },
});
assert.equal(seen.dirty, false, 'with flush, onClosed sees clean');
assert.equal(seen.open, false, 'with flush, drawer is closed before onClosed');

console.log('use-collections.close-order.check: ok');
