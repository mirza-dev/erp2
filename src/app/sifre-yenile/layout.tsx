import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Yeni şifre · Roven",
    description: "Roven hesabınız için yeni bir şifre belirleyin.",
};

export default function RecoveryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return children;
}
