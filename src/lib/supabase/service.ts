import { createClient } from "@supabase/supabase-js";

/**
 * Thrown when a required environment variable is missing.
 * API routes catch this and return HTTP 503 (not 500) so callers can
 * distinguish deployment/config failures from runtime DB errors.
 */
export class ConfigError extends Error {
    readonly code = "CONFIG_ERROR";
    constructor(message: string) {
        super(message);
        this.name = "ConfigError";
    }
}

/**
 * Service-role client — bypasses RLS, use only in server-side API routes.
 * Never import this in client components.
 */
export function createServiceClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) throw new ConfigError("MISSING ENV: NEXT_PUBLIC_SUPABASE_URL");
    if (!key) throw new ConfigError("MISSING ENV: SUPABASE_SERVICE_ROLE_KEY");
    return createClient(url, key);
}
