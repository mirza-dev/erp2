import { vi } from "vitest";

// next/cache'i testlerde devre dışı bırak:
// - unstable_cache → fonksiyonu doğrudan çağır (cache yok)
// - revalidateTag, revalidatePath → no-op
vi.mock("next/cache", () => ({
    unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) =>
        (...args: Parameters<T>) => fn(...args),
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
}));
