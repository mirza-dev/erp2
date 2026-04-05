import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

let cachedClient: SupabaseClient | null = null;

/**
 * Service-role client — bypasses RLS, use only in server-side API routes.
 * Never import this in client components.
 * Singleton: reuses the same client instance across calls to avoid
 * creating hundreds of instances during batch operations (e.g., alert scan).
 */
export function createServiceClient(): SupabaseClient {
    if (cachedClient) return cachedClient;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) throw new ConfigError("MISSING ENV: NEXT_PUBLIC_SUPABASE_URL");
    if (!key) throw new ConfigError("MISSING ENV: SUPABASE_SERVICE_ROLE_KEY");
    cachedClient = createClient(url, key);
    return cachedClient;
}
