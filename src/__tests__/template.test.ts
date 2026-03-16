import { describe, it, expect } from "vitest";
import { render } from "../lib/template.js";

describe("template", () => {
  it("substitutes simple variables", () => {
    expect(render("Hello {{name}}", { name: "world" })).toBe("Hello world");
  });

  it("substitutes multiple variables", () => {
    expect(render("{{a}} and {{b}}", { a: "1", b: "2" })).toBe("1 and 2");
  });

  it("leaves unmatched placeholders as-is", () => {
    expect(render("Hello {{unknown}}", {})).toBe("Hello {{unknown}}");
  });

  it("handles variable precedence (item > task > global)", () => {
    const global = { url: "global", name: "global-name" };
    const task = { url: "task" };
    const item = { url: "item" };
    expect(render("{{url}} {{name}}", global, task, item)).toBe("item global-name");
  });

  it("handles empty template", () => {
    expect(render("", { name: "test" })).toBe("");
  });
});
