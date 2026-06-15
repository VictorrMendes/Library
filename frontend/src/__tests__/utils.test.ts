import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    const result = cn("text-sm", "font-medium");
    expect(result).toBe("text-sm font-medium");
  });

  it("resolves tailwind conflicts (last wins)", () => {
    const result = cn("text-sm", "text-lg");
    expect(result).toBe("text-lg");
  });

  it("handles undefined values gracefully", () => {
    const result = cn("text-sm", undefined, "font-bold");
    expect(result).toBe("text-sm font-bold");
  });

  it("handles conditional classes", () => {
    const active = false;
    const result = cn("base-class", active && "active-class");
    expect(result).toBe("base-class");
  });

  it("handles arrays of classes", () => {
    const result = cn(["text-sm", "font-medium"]);
    expect(result).toBe("text-sm font-medium");
  });

  it("resolves padding conflicts", () => {
    const result = cn("p-2", "p-4");
    expect(result).toBe("p-4");
  });
});
