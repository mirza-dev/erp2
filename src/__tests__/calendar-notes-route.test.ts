import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockActor = vi.fn();
const mockRequirePermission = vi.fn();
const mockList = vi.fn();
const mockGet = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/auth/calendar-note-access", () => ({
    getCalendarNoteActor: () => mockActor(),
}));
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));
vi.mock("@/lib/supabase/calendar-notes", () => ({
    dbListVisibleCalendarNotes: (...args: unknown[]) => mockList(...args),
    dbGetCalendarNote: (...args: unknown[]) => mockGet(...args),
    dbCreateCalendarNote: (...args: unknown[]) => mockCreate(...args),
    dbUpdateCalendarNote: (...args: unknown[]) => mockUpdate(...args),
    dbDeleteCalendarNote: (...args: unknown[]) => mockDelete(...args),
}));

import { GET as listGET, POST } from "@/app/api/calendar-notes/route";
import { GET as idGET, PATCH, DELETE } from "@/app/api/calendar-notes/[id]/route";

const ACTOR = { id: "11111111-1111-4111-8111-111111111111", label: "Ayşe Yılmaz", isAdmin: false };
const OTHER = "22222222-2222-4222-8222-222222222222";
const ROW = {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Tedarikçi toplantısı",
    description: "Numuneler konuşulacak",
    note_date: "2026-06-01",
    note_time: "09:30:00",
    visibility: "company" as const,
    owner_id: ACTOR.id,
    owner_label: ACTOR.label,
    legacy_alert_id: null,
    created_at: "2026-05-20T08:00:00Z",
    updated_at: "2026-05-20T08:00:00Z",
};

function req(url: string, method = "GET", body?: unknown) {
    return new NextRequest(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}
const params = (id = ROW.id) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    vi.clearAllMocks();
    mockActor.mockResolvedValue(ACTOR);
    mockRequirePermission.mockResolvedValue(null);
    mockList.mockResolvedValue([ROW]);
    mockGet.mockResolvedValue(ROW);
    mockCreate.mockResolvedValue(ROW);
    mockUpdate.mockResolvedValue(ROW);
    mockDelete.mockResolvedValue(undefined);
});

describe("GET /api/calendar-notes", () => {
    it("yalnız oturum kullanıcısı görünürlük sorgusuyla tarih aralığını listeler", async () => {
        const res = await listGET(req("http://localhost/api/calendar-notes?from=2026-06-01&to=2026-06-30"));
        expect(res.status).toBe(200);
        expect(mockList).toHaveBeenCalledWith(ACTOR.id, "2026-06-01", "2026-06-30");
        expect((await res.json())[0]).toMatchObject({ noteDate: "2026-06-01", noteTime: "09:30", canManage: true });
    });

    it("oturumsuz 401; view_alerts olmayan 403", async () => {
        mockActor.mockResolvedValueOnce(null);
        expect((await listGET(req("http://localhost/api/calendar-notes?from=2026-06-01&to=2026-06-30"))).status).toBe(401);
        mockRequirePermission.mockResolvedValueOnce(NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }));
        expect((await listGET(req("http://localhost/api/calendar-notes?from=2026-06-01&to=2026-06-30"))).status).toBe(403);
    });

    it("bozuk veya ters tarih aralığı 400", async () => {
        expect((await listGET(req("http://localhost/api/calendar-notes?from=x&to=2026-06-30"))).status).toBe(400);
        expect((await listGET(req("http://localhost/api/calendar-notes?from=2026-07-01&to=2026-06-30"))).status).toBe(400);
        expect(mockList).not.toHaveBeenCalled();
    });
});

describe("POST /api/calendar-notes", () => {
    it("geçmiş tarih + opsiyonel saat kabul edilir; varsayılan personal ve sahip server-side", async () => {
        const res = await POST(req("http://localhost/api/calendar-notes", "POST", {
            title: "  Geçmiş karar  ", description: "  Kayıt  ", note_date: "2025-01-02", note_time: "14:15",
        }));
        expect(res.status).toBe(201);
        expect(mockCreate).toHaveBeenCalledWith({
            title: "Geçmiş karar",
            description: "Kayıt",
            noteDate: "2025-01-02",
            noteTime: "14:15",
            visibility: "personal",
            ownerId: ACTOR.id,
            ownerLabel: ACTOR.label,
        });
    });

    it("geçersiz saat/görünürlük ve boş başlık 400", async () => {
        expect((await POST(req("http://localhost/api/calendar-notes", "POST", { title: "N", note_date: "2026-01-01", note_time: "25:00" }))).status).toBe(400);
        expect((await POST(req("http://localhost/api/calendar-notes", "POST", { title: "N", note_date: "2026-01-01", visibility: "public" }))).status).toBe(400);
        expect((await POST(req("http://localhost/api/calendar-notes", "POST", { title: " ", note_date: "2026-01-01" }))).status).toBe(400);
    });
});

describe("/api/calendar-notes/[id] görünürlük ve yönetim", () => {
    it("başka kullanıcının kişisel notu GET'te 404 ile gizlenir", async () => {
        mockGet.mockResolvedValue({ ...ROW, visibility: "personal", owner_id: OTHER });
        expect((await idGET(req(`http://localhost/api/calendar-notes/${ROW.id}`), params())).status).toBe(404);
    });

    it("sahip kendi notunu düzenler ve kalıcı siler", async () => {
        const patchRes = await PATCH(req(`http://localhost/api/calendar-notes/${ROW.id}`, "PATCH", { title: "Yeni", note_time: null }), params());
        expect(patchRes.status).toBe(200);
        expect(mockUpdate).toHaveBeenCalledWith(ROW.id, { title: "Yeni", noteTime: null });

        const deleteRes = await DELETE(req(`http://localhost/api/calendar-notes/${ROW.id}`, "DELETE"), params());
        expect(deleteRes.status).toBe(200);
        expect(mockDelete).toHaveBeenCalledWith(ROW.id);
    });

    it("şirket notunu gören ama sahibi olmayan kullanıcı yönetemez; 404 döner", async () => {
        mockGet.mockResolvedValue({ ...ROW, owner_id: OTHER });
        expect((await PATCH(req(`http://localhost/api/calendar-notes/${ROW.id}`, "PATCH", { title: "X" }), params())).status).toBe(404);
        expect((await DELETE(req(`http://localhost/api/calendar-notes/${ROW.id}`, "DELETE"), params())).status).toBe(404);
    });

    it("admin sahipsiz legacy şirket notunu yönetebilir", async () => {
        mockActor.mockResolvedValue({ ...ACTOR, isAdmin: true });
        mockGet.mockResolvedValue({ ...ROW, owner_id: null, legacy_alert_id: "legacy-1" });
        expect((await PATCH(req(`http://localhost/api/calendar-notes/${ROW.id}`, "PATCH", { title: "Arşiv notu" }), params())).status).toBe(200);
        expect((await DELETE(req(`http://localhost/api/calendar-notes/${ROW.id}`, "DELETE"), params())).status).toBe(200);
    });

    it("sahipsiz legacy not kişisele çevrilip yönetilemez hale getirilemez", async () => {
        mockActor.mockResolvedValue({ ...ACTOR, isAdmin: true });
        mockGet.mockResolvedValue({ ...ROW, owner_id: null, legacy_alert_id: "legacy-1" });
        expect((await PATCH(req(`http://localhost/api/calendar-notes/${ROW.id}`, "PATCH", { visibility: "personal" }), params())).status).toBe(400);
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});
