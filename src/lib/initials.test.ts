import { describe, expect, it } from "vitest";

import { getInitials } from "./initials";

describe("getInitials", () => {
  it("uses the first two letters of a single-word local part", () => {
    expect(getInitials("demo@example.com")).toBe("DE");
    expect(getInitials("a@example.com")).toBe("A");
  });

  it("uses the first letter of the first two words when separated", () => {
    expect(getInitials("jane.doe@example.com")).toBe("JD");
    expect(getInitials("john_smith-jr@example.com")).toBe("JS");
  });

  it("ignores plus-addressing separators and extra words", () => {
    expect(getInitials("jane+news@example.com")).toBe("JN");
  });

  it("handles non-ASCII letters", () => {
    expect(getInitials("émile.zola@example.com")).toBe("ÉZ");
  });

  it("returns null when there is nothing usable", () => {
    expect(getInitials(undefined)).toBeNull();
    expect(getInitials(null)).toBeNull();
    expect(getInitials("")).toBeNull();
    expect(getInitials("+++@example.com")).toBeNull();
  });
});
