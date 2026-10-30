import { describe, expect, it } from "vite-plus/test";
import { portraitCrop } from "./portrait";

describe("transparent character portraits", () => {
  it("frames the upper silhouette inside a large transparent render", () => {
    const pixels = new Uint8ClampedArray(100 * 100 * 4);
    for (let y = 20; y < 80; y++) for (let x = 40; x < 60; x++) pixels[(y * 100 + x) * 4 + 3] = 255;
    const crop = portraitCrop(pixels, 100, 100)!;
    expect(crop.size).toBeLessThan(20);
    expect(crop.x + crop.size / 2).toBe(50);
    expect(crop.y).toBeLessThan(20);
    expect(crop.y + crop.size).toBeLessThan(50);
  });
  it("rejects opaque backdrops and empty renders", () => {
    expect(portraitCrop(new Uint8ClampedArray(16).fill(255), 2, 2)).toBeNull();
    expect(portraitCrop(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });
});
