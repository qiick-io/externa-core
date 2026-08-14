/**
 * Self-check for the 2FA setup fetch coalesce / stale-response rules.
 * Run: node resources/js/hooks/use-two-factor-auth.check.mjs
 *
 * Mirrors the hook's seq + inflight behavior without React.
 */
import assert from 'node:assert/strict';

function createSetupFetcher(load) {
    let seq = 0;
    let inflight = null;
    let qr = null;
    let key = null;
    let errors = [];

    return {
        get state() {
            return { qr, key, errors: [...errors] };
        },
        clear() {
            seq += 1;
            inflight = null;
            qr = null;
            key = null;
            errors = [];
        },
        async fetchSetupData() {
            if (qr && key) {
                return;
            }

            if (inflight) {
                return inflight;
            }

            const mySeq = ++seq;

            inflight = (async () => {
                try {
                    const [qrPayload, keyPayload] = await load();

                    if (mySeq !== seq) {
                        return;
                    }

                    if (!qrPayload.svg || !keyPayload.secretKey) {
                        errors = ['Failed to load two-factor setup data'];

                        return;
                    }

                    qr = qrPayload.svg;
                    key = keyPayload.secretKey;
                    errors = [];
                } catch {
                    if (mySeq !== seq) {
                        return;
                    }

                    if (!qr || !key) {
                        errors = ['Failed to load two-factor setup data'];
                    } else {
                        errors = ['Failed to refresh two-factor setup data'];
                    }
                } finally {
                    if (mySeq === seq) {
                        inflight = null;
                    }
                }
            })();

            return inflight;
        },
        /** Simulate a late failure after data is already visible (old bug wiped QR). */
        applyStaleFailure() {
            // Fixed behavior: keep data, set refresh error only.
            if (qr && key) {
                errors = ['Failed to refresh two-factor setup data'];
            } else {
                qr = null;
                key = null;
                errors = ['Failed to load two-factor setup data'];
            }
        },
    };
}

let calls = 0;
const ok = createSetupFetcher(async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));

    return [{ svg: '<svg/>' }, { secretKey: 'ABC' }];
});

await Promise.all([ok.fetchSetupData(), ok.fetchSetupData(), ok.fetchSetupData()]);
assert.equal(calls, 1, 'parallel opens must coalesce to one network load');
assert.equal(ok.state.qr, '<svg/>');
assert.equal(ok.state.key, 'ABC');
assert.deepEqual(ok.state.errors, []);

ok.applyStaleFailure();
assert.equal(ok.state.qr, '<svg/>', 'stale failure must not clear QR');
assert.equal(ok.state.key, 'ABC', 'stale failure must not clear setup key');
assert.equal(ok.state.errors[0], 'Failed to refresh two-factor setup data');

let failCalls = 0;
const fail = createSetupFetcher(async () => {
    failCalls += 1;

    throw new Error('423');
});
await fail.fetchSetupData();
assert.equal(fail.state.qr, null);
assert.deepEqual(fail.state.errors, ['Failed to load two-factor setup data']);
assert.equal(failCalls, 1);

console.log('use-two-factor-auth.check: ok');
