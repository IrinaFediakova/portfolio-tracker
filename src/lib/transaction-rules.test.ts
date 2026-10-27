import { describe, expect, it } from "vitest";

import type { PortfolioTransaction } from "./portfolio";
import {
  NEW_TRANSACTION_ID,
  applyChange,
  checkTransactionChange,
  findNewOversells,
  unitsHeldOn,
  type TransactionDraft,
} from "./transaction-rules";

const AAPL = "asset-aapl";
const BTC = "asset-btc";
const symbolFor = (id: string) => (id === AAPL ? "AAPL" : "BTC");

function tx(
  id: string,
  type: "buy" | "sell",
  quantity: number,
  executedAt: string,
  assetId = AAPL,
): PortfolioTransaction {
  return { id, assetId, type, quantity, price: 100, executedAt };
}

function draft(
  type: "buy" | "sell",
  quantity: number,
  executedAt: string,
  assetId = AAPL,
): TransactionDraft {
  return { assetId, type, quantity, price: 100, executedAt };
}

// Hold 10 AAPL from Jan 1; sell 4 on Feb 1 => 6 left.
const ledger = [
  tx("b1", "buy", 10, "2026-01-01"),
  tx("s1", "sell", 4, "2026-02-01"),
];

describe("applyChange", () => {
  it("adds, replaces and removes without mutating the input", () => {
    const snapshot = structuredClone(ledger);

    expect(
      applyChange(ledger, {
        kind: "create",
        draft: draft("buy", 1, "2026-03-01"),
      }),
    ).toHaveLength(3);
    expect(
      applyChange(ledger, {
        kind: "update",
        id: "b1",
        draft: draft("buy", 99, "2026-01-01"),
      }).find((t) => t.id === "b1")?.quantity,
    ).toBe(99);
    expect(applyChange(ledger, { kind: "delete", id: "s1" })).toHaveLength(1);

    expect(ledger).toEqual(snapshot);
  });

  it("gives a new transaction a placeholder id", () => {
    const next = applyChange(ledger, {
      kind: "create",
      draft: draft("buy", 1, "2026-03-01"),
    });
    expect(next.at(-1)?.id).toBe(NEW_TRANSACTION_ID);
  });
});

describe("add", () => {
  it("allows a buy", () => {
    const result = checkTransactionChange(
      ledger,
      { kind: "create", draft: draft("buy", 5, "2026-03-01") },
      symbolFor,
    );
    expect(result.ok).toBe(true);
  });

  it("allows selling exactly what is held", () => {
    const result = checkTransactionChange(
      ledger,
      { kind: "create", draft: draft("sell", 6, "2026-03-01") },
      symbolFor,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects selling more than is held, with a friendly message", () => {
    const result = checkTransactionChange(
      ledger,
      { kind: "create", draft: draft("sell", 6.5, "2026-03-01") },
      symbolFor,
    );
    expect(result).toMatchObject({ ok: false, own: true });
    if (!result.ok) {
      expect(result.message).toBe(
        "You only hold 6 units of AAPL on Mar 1, 2026.",
      );
    }
  });

  it("rejects selling before the position was opened", () => {
    const result = checkTransactionChange(
      ledger,
      { kind: "create", draft: draft("sell", 1, "2025-12-31") },
      symbolFor,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("0 units of AAPL");
  });

  it("rejects a back-dated sell that would strand a later sell", () => {
    // Selling 8 on Jan 15 leaves only 2, so the existing Feb 1 sale of 4 is short.
    const result = checkTransactionChange(
      ledger,
      { kind: "create", draft: draft("sell", 8, "2026-01-15") },
      symbolFor,
    );
    expect(result.ok).toBe(false);
  });

  it("treats a same-day buy and sell as valid (buys are processed first)", () => {
    const result = checkTransactionChange(
      [],
      { kind: "create", draft: draft("sell", 3, "2026-01-01") },
      symbolFor,
    );
    expect(result.ok).toBe(false);

    const both = applyChange([], {
      kind: "create",
      draft: draft("buy", 3, "2026-01-01"),
    });
    const sellSameDay = checkTransactionChange(
      both.map((t, i) => ({ ...t, id: `x${i}` })),
      { kind: "create", draft: draft("sell", 3, "2026-01-01") },
      symbolFor,
    );
    expect(sellSameDay.ok).toBe(true);
  });

  it("tracks each asset separately", () => {
    const result = checkTransactionChange(
      ledger,
      { kind: "create", draft: draft("sell", 1, "2026-03-01", BTC) },
      symbolFor,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("BTC");
  });
});

describe("edit", () => {
  it("allows a harmless edit", () => {
    const result = checkTransactionChange(
      ledger,
      { kind: "update", id: "s1", draft: draft("sell", 6, "2026-02-01") },
      symbolFor,
    );
    expect(result.ok).toBe(true);
  });

  it("does not count the old version of the edited transaction", () => {
    // Raising the sell from 4 to 10 is fine; the old 4 must not be double counted.
    expect(
      checkTransactionChange(
        ledger,
        { kind: "update", id: "s1", draft: draft("sell", 10, "2026-02-01") },
        symbolFor,
      ).ok,
    ).toBe(true);
    expect(
      checkTransactionChange(
        ledger,
        { kind: "update", id: "s1", draft: draft("sell", 10.5, "2026-02-01") },
        symbolFor,
      ).ok,
    ).toBe(false);
  });

  it("rejects shrinking a buy below what was later sold", () => {
    const result = checkTransactionChange(
      ledger,
      { kind: "update", id: "b1", draft: draft("buy", 3, "2026-01-01") },
      symbolFor,
    );
    expect(result).toMatchObject({ ok: false, own: false });
    if (!result.ok) {
      expect(result.message).toContain("later sale of AAPL on Feb 1, 2026");
    }
  });

  it("rejects moving a buy to after the sell", () => {
    const result = checkTransactionChange(
      ledger,
      { kind: "update", id: "b1", draft: draft("buy", 10, "2026-03-01") },
      symbolFor,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects switching a buy to a sell that cannot be covered", () => {
    const result = checkTransactionChange(
      ledger,
      { kind: "update", id: "b1", draft: draft("sell", 10, "2026-01-01") },
      symbolFor,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects moving a sell to a different asset the user does not hold", () => {
    const result = checkTransactionChange(
      ledger,
      { kind: "update", id: "s1", draft: draft("sell", 4, "2026-02-01", BTC) },
      symbolFor,
    );
    expect(result.ok).toBe(false);
  });

  it("allows moving a sell later in time", () => {
    expect(
      checkTransactionChange(
        ledger,
        { kind: "update", id: "s1", draft: draft("sell", 4, "2026-05-01") },
        symbolFor,
      ).ok,
    ).toBe(true);
  });
});

describe("delete", () => {
  it("allows deleting a sell", () => {
    expect(
      checkTransactionChange(ledger, { kind: "delete", id: "s1" }, symbolFor)
        .ok,
    ).toBe(true);
  });

  it("rejects deleting a buy that later sells depend on", () => {
    const result = checkTransactionChange(
      ledger,
      { kind: "delete", id: "b1" },
      symbolFor,
    );
    expect(result).toMatchObject({ ok: false, own: false });
    if (!result.ok) {
      expect(result.message).toMatch(
        /^Deleting this transaction would leave a later sale of AAPL/,
      );
    }
  });

  it("allows deleting a buy when another buy still covers the sells", () => {
    const covered = [...ledger, tx("b2", "buy", 10, "2026-01-02")];
    expect(
      checkTransactionChange(covered, { kind: "delete", id: "b1" }, symbolFor)
        .ok,
    ).toBe(true);
  });

  it("allows deleting an unknown id (nothing changes)", () => {
    expect(
      checkTransactionChange(ledger, { kind: "delete", id: "nope" }, symbolFor)
        .ok,
    ).toBe(true);
  });
});

describe("legacy bad data", () => {
  // s2 already oversells (only 6 held, sells 9). That must not block unrelated changes.
  const dirty = [...ledger, tx("s2", "sell", 9, "2026-03-01")];

  it("does not block an unrelated buy of another asset", () => {
    expect(
      checkTransactionChange(
        dirty,
        { kind: "create", draft: draft("buy", 1, "2026-04-01", BTC) },
        symbolFor,
      ).ok,
    ).toBe(true);
  });

  it("does not report the pre-existing oversell as new", () => {
    expect(findNewOversells(dirty, { kind: "delete", id: "nope" })).toEqual([]);
  });

  it("still blocks an edit that leaves the edited sale oversold", () => {
    const result = checkTransactionChange(
      dirty,
      { kind: "update", id: "s2", draft: draft("sell", 9, "2026-03-01") },
      symbolFor,
    );
    expect(result.ok).toBe(false);
  });
});

describe("unitsHeldOn", () => {
  it("sums buys and sells up to and including the date", () => {
    expect(unitsHeldOn(ledger, AAPL, "2025-12-31")).toBe(0);
    expect(unitsHeldOn(ledger, AAPL, "2026-01-31")).toBe(10);
    expect(unitsHeldOn(ledger, AAPL, "2026-02-01")).toBe(6);
    expect(unitsHeldOn(ledger, BTC, "2026-02-01")).toBe(0);
  });

  it("can ignore the transaction being edited", () => {
    expect(unitsHeldOn(ledger, AAPL, "2026-03-01", "s1")).toBe(10);
  });

  it("avoids floating point noise", () => {
    const small = [
      tx("a", "buy", 0.1, "2026-01-01"),
      tx("b", "buy", 0.2, "2026-01-01"),
    ];
    expect(unitsHeldOn(small, AAPL, "2026-01-01")).toBe(0.3);
  });
});
