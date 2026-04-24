import { ParasutError } from "@/lib/parasut-adapter";
import type { ParasutStep } from "@/lib/parasut-constants";

export interface ApiCallContext {
    op:       string;
    orderId?: string;
    step?:    ParasutStep;
    attempt?: number;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function parasutApiCall<T>(ctx: ApiCallContext, fn: () => Promise<T>): Promise<T> {
    if (process.env.PARASUT_ENABLED !== "true") {
        throw new ParasutError("validation", "Paraşüt entegrasyonu devre dışı (PARASUT_ENABLED).");
    }

    const t0 = Date.now();
    let attempt = 1;

    try {
        const result = await fn();
        console.log(JSON.stringify({
            parasut_api:  ctx.op,
            attempt,
            duration_ms:  Date.now() - t0,
            orderId:      ctx.orderId,
            step:         ctx.step,
            status:       "success",
        }));
        return result;
    } catch (err) {
        if (err instanceof ParasutError && err.kind === "rate_limit") {
            const wait = Math.min(err.retryAfterSec ?? 5, 30);
            console.log(JSON.stringify({
                parasut_api:  ctx.op,
                attempt,
                rate_limited: true,
                wait_sec:     wait,
                orderId:      ctx.orderId,
                step:         ctx.step,
            }));
            await sleep(wait * 1000);
            attempt = 2;
            try {
                const result = await fn();
                console.log(JSON.stringify({
                    parasut_api:  ctx.op,
                    attempt,
                    duration_ms:  Date.now() - t0,
                    orderId:      ctx.orderId,
                    step:         ctx.step,
                    status:       "success_after_retry",
                }));
                return result;
            } catch (err2) {
                const e = err2 instanceof ParasutError ? err2 : new ParasutError("server", String(err2));
                console.log(JSON.stringify({
                    parasut_api:  ctx.op,
                    attempt,
                    duration_ms:  Date.now() - t0,
                    orderId:      ctx.orderId,
                    step:         ctx.step,
                    status:       "error_after_retry",
                    error_kind:   e.kind,
                    error:        e.message,
                }));
                throw err2;
            }
        }
        const e = err instanceof ParasutError ? err : new ParasutError("server", String(err));
        console.log(JSON.stringify({
            parasut_api:  ctx.op,
            attempt,
            duration_ms:  Date.now() - t0,
            orderId:      ctx.orderId,
            step:         ctx.step,
            status:       "error",
            error_kind:   e.kind,
            error:        e.message,
        }));
        throw err;
    }
}
