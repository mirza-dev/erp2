/**
 * SWR'lı komponent testleri için ortak wrapper — her render izole Map cache
 * alır (testler arası cache sızıntısı önlenir) + dedupingInterval 0 (her
 * render gerçek fetch tetikler, mock assert'leri deterministik kalır).
 *
 * Kullanım: render(<X />, { wrapper: SwrTestWrapper })
 */
import type { ReactNode } from "react";
import { SWRConfig } from "swr";

export function SwrTestWrapper({ children }: { children: ReactNode }) {
    return (
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            {children}
        </SWRConfig>
    );
}
