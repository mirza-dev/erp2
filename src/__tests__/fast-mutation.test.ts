import { describe, expect, it } from "vitest";
import {
  decrementCount,
  patchCountRecord,
  removeByIds,
  successfulResponseIds,
  upsertFirst,
} from "@/lib/fast-mutation";

describe("fast-mutation helpers", () => {
  it("successfulResponseIds yalnız fulfilled + ok response id'lerini döndürür", () => {
    const ok = new Response(null, { status: 200 });
    const fail = new Response(null, { status: 409 });
    const results: PromiseSettledResult<Response>[] = [
      { status: "fulfilled", value: ok },
      { status: "fulfilled", value: fail },
      { status: "rejected", reason: new Error("network") },
    ];

    expect(successfulResponseIds(["a", "b", "c"], results)).toEqual(["a"]);
  });

  it("count patch negatif sayıya düşmez", () => {
    expect(patchCountRecord({ all: 1, draft: 0 }, { all: -3, draft: 2 })).toEqual({
      all: 0,
      draft: 2,
    });
    expect(decrementCount(1, 5)).toBe(0);
  });

  it("satır silme ve upsert işlemlerini id bazlı yapar", () => {
    const rows = [{ id: "1", name: "A" }, { id: "2", name: "B" }];
    expect(removeByIds(rows, ["2"])).toEqual([{ id: "1", name: "A" }]);
    expect(upsertFirst(rows, { id: "2", name: "B2" })).toEqual([
      { id: "1", name: "A" },
      { id: "2", name: "B2" },
    ]);
    expect(upsertFirst(rows, { id: "3", name: "C" })).toEqual([
      { id: "3", name: "C" },
      { id: "1", name: "A" },
      { id: "2", name: "B" },
    ]);
  });
});
