import { ArrowLeft } from "lucide-react";
import type { ComponentProps } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";

/**
 * Kırıntı geri bağlantısı — bir üst listeye/belgeye dönüş.
 *
 * 2026-09-10 ölçümü: depoda BEŞ ayrı lehçe vardı ve dördü deponun kendi 44px
 * dokunma tabanının ALTINDAydı:
 *
 *   A  düz metin 13px  `--text-tertiary`      → `quotes/[id]` · `QuoteForm`
 *                                                · `product-types/[id]` ×2
 *   A′ düz metin 12px  aynı renk               → `products/[id]` · `purchase/orders/[id]`
 *   B  `ButtonLink secondary sm` + `ArrowLeft`  → `OrderForm` · `orders/[id]`
 *   C  elle `inline-flex` + `ArrowLeft 12|13`   → `developer/errors/[id]` · `import/excel`
 *   D  `Button` + programatik `router.push`     → `quotes/preview`
 *
 * Ölçüldü (390px): A 65.3×**16**, C 129.3×**16.5** — yani parmakla
 * dokunulacak yükseklik 16px. Yalnız B zaten 44'lük hit-area taşıyordu
 * (`Button` her iki render yolunda da `tap-44` yayıyor).
 *
 * Kullanıcı kararı (2026-09-10): **buton dili kazanır.** Sekiz yüzeyde düz
 * metin görünür biçimde butona döner; karşılığında tek dil, tek kaynak ve
 * her yüzeyde 44px hit-area.
 *
 * Bileşen KENDİ RENGİNİ YAZMAZ — `FilterChips` emsali: paleti `Button`'dan
 * alır ki buton dili bir yerde değişince burası da değişsin.
 *
 * `←` KARAKTERİ İKONA DÖNDÜ: metin oku ekran okuyucuda "sol ok" diye
 * seslendiriliyordu; `ArrowLeft` `aria-hidden` bir süs olarak geçiyor ve
 * erişilebilir ad yalnız hedefin adı oluyor.
 */
export interface BackLinkProps {
    /** Dönülecek rota. */
    href: ComponentProps<typeof Link>["href"];
    /** Hedefin adı — "Teklifler", "Sipariş", "Teknik Şablonlar"… */
    children: React.ReactNode;
    /**
     * Ön yükleme. Rota bir sayfa değil de belge ÜRETEN bir route handler ise
     * `false` verilir (`ButtonLink`in 2026-09-04 notu).
     */
    prefetch?: boolean;
}

export default function BackLink({ href, children, prefetch }: BackLinkProps) {
    return (
        <ButtonLink
            href={href}
            variant="secondary"
            size="sm"
            leftIcon={<ArrowLeft size={14} />}
            prefetch={prefetch}
        >
            {children}
        </ButtonLink>
    );
}
