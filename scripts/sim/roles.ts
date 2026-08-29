/**
 * KOBİ simülasyonu — dört çalışan.
 *
 * Kimlik e-postaları `.test` TLD'sinde (RFC 2606 — asla yönlendirilmez).
 * Şifre KODA YAZILMAZ: `SIM_PASSWORD` env'inden okunur (create-admin.ts kalıbı).
 */

export interface SimRole {
    /** CLI anahtarı — ajanın kendi adı. */
    key: string;
    /** Görünen ad (audit ve rapor için). */
    person: string;
    title: string;
    email: string;
    /** ERP rolleri — app_metadata.roles'a yazılır. */
    roles: string[];
    /** Kalıcı tarayıcı profili + CDP portu. */
    port: number;
}

export const SIM_ROLES: SimRole[] = [
    {
        key: "kerem",
        person: "Kerem Aydın",
        title: "Makine Mühendisi",
        email: "sim.kerem@pmt-sim.test",
        roles: ["admin"],
        port: 9741,
    },
    {
        key: "sibel",
        person: "Sibel Toprak",
        title: "Mali İşler / Patron Asistanı",
        email: "sim.sibel@pmt-sim.test",
        roles: ["admin"],
        port: 9742,
    },
    {
        key: "hasan",
        person: "Hasan Çelik",
        title: "Üretim Vardiya Sorumlusu",
        email: "sim.hasan@pmt-sim.test",
        roles: ["production"],
        port: 9743,
    },
    {
        key: "deniz",
        person: "Deniz Arslan",
        title: "Satış ve Satın Alma Sorumlusu",
        email: "sim.deniz@pmt-sim.test",
        roles: ["sales", "purchasing"],
        port: 9744,
    },
];

export function roleByKey(key: string): SimRole | undefined {
    return SIM_ROLES.find(r => r.key === key.toLowerCase());
}

/** Sim'in ürettiği kayıtların imzası — temizlik bu deseni arar. */
export const SIM_TAG = "SIM";

/** Daemon'un dinlediği yer. */
export const DAEMON_PORT = 9713;
export const DAEMON_URL = `http://127.0.0.1:${DAEMON_PORT}`;

export const APP_URL = process.env.SIM_APP_URL ?? "http://localhost:3000";
