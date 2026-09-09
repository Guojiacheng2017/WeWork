import { describe, expect, it } from "vitest";
import { cycleSeatIndex, isStageCameraSettled, stageAnimationDelta, getAnimatedSeatPresentation, getCameraAzimuth } from "./weworkStage";

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

describe("isStageCameraSettled", () => {
  it("stops demand rendering only when every camera axis is within tolerance", () => {
    expect(isStageCameraSettled(
      { polar: 1.2205, radius: 7.8005, azimuth: Math.PI + 0.0005 },
      { polar: 1.22, radius: 7.8, azimuth: Math.PI },
    )).toBe(true);
    expect(isStageCameraSettled(
      { polar: 1.22, radius: 7.8, azimuth: Math.PI + 0.01 },
      { polar: 1.22, radius: 7.8, azimuth: Math.PI },
    )).toBe(false);
  });
});

describe('round-table animation continuity', () => {
  it('does not consume idle time on the first demand-rendered frame', () => {
    expect(stageAnimationDelta(5)).toBe(1 / 30);
    expect(stageAnimationDelta(1 / 60)).toBe(1 / 60);
  });
  it('changes seat scale and visibility continuously with the camera', () => {
    const angle = getCameraAzimuth(0, 6);
    const before = getAnimatedSeatPresentation(0, 6, angle, 1);
    const after = getAnimatedSeatPresentation(0, 6, angle + 0.001, 1);
    expect(before.scale).toBeCloseTo(1.34);
    expect(Math.abs(after.scale - before.scale)).toBeLessThan(0.001);
    const threshold = angle + Math.PI * 0.52;
    const a = getAnimatedSeatPresentation(0, 6, threshold - 0.001, 1);
    const b = getAnimatedSeatPresentation(0, 6, threshold + 0.001, 1);
    expect(Math.abs(a.opacity - b.opacity)).toBeLessThan(0.001);
  });
  it('keeps the overview uniform and handles full camera turns', () => {
    expect(getAnimatedSeatPresentation(3, 6, Math.PI, 0)).toEqual({ scale: 1, opacity: 1 });
    expect(getAnimatedSeatPresentation(0, 6, Math.PI * 3, 1).scale).toBeCloseTo(1.34);
  });
});
