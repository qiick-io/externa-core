import { useCallback, useRef, useState } from 'react';
import { qrCode, recoveryCodes, secretKey } from '@/routes/two-factor';
import type { TwoFactorSecretKey, TwoFactorSetupData } from '@/types';

export type UseTwoFactorAuthReturn = {
    qrCodeSvg: string | null;
    manualSetupKey: string | null;
    recoveryCodesList: string[];
    hasSetupData: boolean;
    errors: string[];
    clearErrors: () => void;
    clearSetupData: () => void;
    fetchQrCode: () => Promise<void>;
    fetchSetupKey: () => Promise<void>;
    fetchSetupData: () => Promise<void>;
    fetchRecoveryCodes: () => Promise<void>;
};

/** Maximum length for TOTP one-time password input fields. */
export const OTP_MAX_LENGTH = 6;

const fetchJson = async <T>(url: string): Promise<T> => {
    const response = await fetch(url, {
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
    }

    return response.json();
};

/**
 * Loads Fortify two-factor setup data (QR code, manual key, recovery codes) from JSON endpoints.
 *
 * @returns Setup state, fetch helpers, and accumulated error messages
 */
export const useTwoFactorAuth = (): UseTwoFactorAuthReturn => {
    const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
    const [manualSetupKey, setManualSetupKey] = useState<string | null>(null);
    const [recoveryCodesList, setRecoveryCodesList] = useState<string[]>([]);
    const [errors, setErrors] = useState<string[]>([]);

    // ponytail: coalesce parallel modal effect / StrictMode fetches; stale responses ignored via seq
    const setupSeqRef = useRef(0);
    const setupInflightRef = useRef<Promise<void> | null>(null);
    const setupDataRef = useRef({ qrCodeSvg, manualSetupKey });
    setupDataRef.current = { qrCodeSvg, manualSetupKey };

    const hasSetupData = qrCodeSvg !== null && manualSetupKey !== null;

    const clearErrors = useCallback((): void => {
        setErrors((prev) => (prev.length === 0 ? prev : []));
    }, []);

    const clearSetupData = useCallback((): void => {
        setupSeqRef.current += 1;
        setupInflightRef.current = null;
        setManualSetupKey(null);
        setQrCodeSvg(null);
        setErrors((prev) => (prev.length === 0 ? prev : []));
    }, []);

    const fetchQrCode = useCallback(async (): Promise<void> => {
        try {
            const { svg } = await fetchJson<TwoFactorSetupData>(qrCode.url());

            if (!svg) {
                throw new Error('QR code payload missing svg');
            }

            setQrCodeSvg(svg);
        } catch {
            setErrors((prev) => [...prev, 'Failed to fetch QR code']);
            // Keep any previously loaded QR — a stale/parallel failure must not wipe it.
        }
    }, []);

    const fetchSetupKey = useCallback(async (): Promise<void> => {
        try {
            const { secretKey: key } = await fetchJson<TwoFactorSecretKey>(
                secretKey.url(),
            );

            if (!key) {
                throw new Error('Setup key payload missing secretKey');
            }

            setManualSetupKey(key);
        } catch {
            setErrors((prev) => [...prev, 'Failed to fetch a setup key']);
            // Keep any previously loaded key — same stale-failure rule as QR.
        }
    }, []);

    const fetchRecoveryCodes = useCallback(async (): Promise<void> => {
        try {
            const codes = await fetchJson<string[]>(recoveryCodes.url());
            setRecoveryCodesList(codes);
            setErrors((prev) => (prev.length === 0 ? prev : []));
        } catch {
            setErrors((prev) => [...prev, 'Failed to fetch recovery codes']);
        }
    }, []);

    const fetchSetupData = useCallback(async (): Promise<void> => {
        const { qrCodeSvg: qr, manualSetupKey: key } = setupDataRef.current;

        if (qr && key) {
            return;
        }

        if (setupInflightRef.current) {
            return setupInflightRef.current;
        }

        const seq = ++setupSeqRef.current;

        const run = (async (): Promise<void> => {
            try {
                // Safe now: fetchSetupData is stable and coalesced, so clearing
                // errors cannot re-enter the modal effect in a fetch storm.
                setErrors((prev) => (prev.length === 0 ? prev : []));

                const [qrPayload, keyPayload] = await Promise.all([
                    fetchJson<TwoFactorSetupData>(qrCode.url()),
                    fetchJson<TwoFactorSecretKey>(secretKey.url()),
                ]);

                if (seq !== setupSeqRef.current) {
                    return;
                }

                if (!qrPayload.svg || !keyPayload.secretKey) {
                    setErrors(['Failed to load two-factor setup data']);
                    return;
                }

                setQrCodeSvg(qrPayload.svg);
                setManualSetupKey(keyPayload.secretKey);
                setErrors((prev) => (prev.length === 0 ? prev : []));
            } catch {
                if (seq !== setupSeqRef.current) {
                    return;
                }

                // Never clear a successful load; only surface an error when still empty.
                const current = setupDataRef.current;

                if (!current.qrCodeSvg || !current.manualSetupKey) {
                    setErrors(['Failed to load two-factor setup data']);
                } else {
                    setErrors(['Failed to refresh two-factor setup data']);
                }
            } finally {
                if (seq === setupSeqRef.current) {
                    setupInflightRef.current = null;
                }
            }
        })();

        setupInflightRef.current = run;

        return run;
    }, []);

    return {
        qrCodeSvg,
        manualSetupKey,
        recoveryCodesList,
        hasSetupData,
        errors,
        clearErrors,
        clearSetupData,
        fetchQrCode,
        fetchSetupKey,
        fetchSetupData,
        fetchRecoveryCodes,
    };
};
