import { describe, expect, it } from "vitest";

import { DEFAULT_REDIRECT_PATH, safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("allows same-origin relative paths, including query strings", () => {
    expect(safeRedirectPath("/transactions?type=buy&page=2")).toBe(
      "/transactions?type=buy&page=2",
    );
  });

  it("falls back for missing or non-string values", () => {
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath(42)).toBe(DEFAULT_REDIRECT_PATH);
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeRedirectPath("https://evil.example")).toBe(
      DEFAULT_REDIRECT_PATH,
    );
    expect(safeRedirectPath("//evil.example")).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath("/\\evil.example")).toBe(DEFAULT_REDIRECT_PATH);
  });

  it("rejects control characters", () => {
    expect(safeRedirectPath("/dash\r\nboard")).toBe(DEFAULT_REDIRECT_PATH);
  });

  it("honours a custom fallback", () => {
    expect(safeRedirectPath("nope", "/login")).toBe("/login");
  });
});
