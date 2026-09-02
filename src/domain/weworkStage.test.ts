import { describe, expect, it } from "vitest";
import { cycleSeatIndex } from "./weworkStage";

describe("cycleSeatIndex", () => {
  it("cycles right indefinitely", () => {
    let index = 0;
    for (let step = 0; step < 23; step += 1) index = cycleSeatIndex(index, 5, 1);
    expect(index).toBe(3);
  });

  it("cycles left indefinitely", () => {
    let index = 0;
    for (let step = 0; step < 23; step += 1) index = cycleSeatIndex(index, 5, -1);
    expect(index).toBe(2);
  });

  it("enters the employee ring from an unselected non-employee seat", () => {
    expect(cycleSeatIndex(-1, 5, 1)).toBe(0);
    expect(cycleSeatIndex(-1, 5, -1)).toBe(4);
  });
});
