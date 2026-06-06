import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Giriş · Roven",
    description: "Roven kurumsal çalışma alanına güvenli giriş.",
};

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return children;
}
