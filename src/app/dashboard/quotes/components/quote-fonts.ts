import { Montserrat, Inter } from "next/font/google";

export const montserrat = Montserrat({
    subsets: ["latin", "latin-ext"],
    weight: ["600", "700", "800"],
    variable: "--font-doc-heading",
    display: "swap",
});

export const inter = Inter({
    subsets: ["latin", "latin-ext"],
    weight: ["400", "500", "600"],
    variable: "--font-doc-body",
    display: "swap",
});
