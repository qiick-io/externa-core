/**
 * App-wide toast notifications (Sonner).
 * Mount `<Toaster />` once in app.tsx; import `toast` from here everywhere else.
 *
 * Success/info stay polite (Sonner's region). Errors also push an assertive
 * live announcement. Toasts with actions keep `duration: Infinity` so they do
 * not dismiss while the action is reachable by keyboard.
 *
 * @example toast.success('Saved')
 * @example toast.error('Something went wrong')
 * @example toast.info('Heads up')
 * @example toast.warning('Check your input')
 */
import type { ReactNode } from 'react';
import { toast as sonnerToast } from 'sonner';
import type { ExternalToast, ToastT } from 'sonner';
import { announce } from '@/lib/live-announcer';

type ToastMessage = string | ReactNode;

function messageText(message: unknown): string {
    if (typeof message === 'string') {
        return message;
    }

    return '';
}

function withActionDuration(data?: ExternalToast): ExternalToast | undefined {
    if (!data?.action) {
        return data;
    }

    return {
        ...data,
        duration: data.duration ?? Infinity,
    };
}

function success(message: ToastMessage, data?: ExternalToast): string | number {
    return sonnerToast.success(message, withActionDuration(data));
}

function info(message: ToastMessage, data?: ExternalToast): string | number {
    return sonnerToast.info(message, withActionDuration(data));
}

function warning(message: ToastMessage, data?: ExternalToast): string | number {
    return sonnerToast.warning(message, withActionDuration(data));
}

function error(message: ToastMessage, data?: ExternalToast): string | number {
    const text = messageText(message);

    if (text !== '') {
        announce(text, { politeness: 'assertive' });
    }

    return sonnerToast.error(message, withActionDuration(data));
}

function message(message: ToastMessage, data?: ExternalToast): string | number {
    return sonnerToast(message, withActionDuration(data));
}

function dismiss(id?: string | number): void {
    sonnerToast.dismiss(id);
}

function promise<ToastData>(
    promiseInput: Promise<ToastData> | (() => Promise<ToastData>),
    messages: Parameters<typeof sonnerToast.promise<ToastData>>[1],
): ReturnType<typeof sonnerToast.promise<ToastData>> {
    return sonnerToast.promise(promiseInput, messages);
}

export const toast = Object.assign(message, {
    success,
    info,
    warning,
    error,
    dismiss,
    promise,
    message,
    loading: sonnerToast.loading,
    custom: sonnerToast.custom,
    getHistory: sonnerToast.getHistory,
    getToasts: sonnerToast.getToasts,
}) as typeof sonnerToast & {
    message: typeof message;
};

export type { ExternalToast, ToastT };
