import sharp from "sharp";
import { describe, expect, it } from "vitest";

const { savePublicImage, InvalidImageError } = await import("@/lib/storage");

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 40, g: 80, b: 160 } } }).png().toBuffer();

describe("uploaded images", () => {
  it("refuses images larger than any camera before decoding them", async () => {
    // A tiny file can declare a huge image; the header alone decides.
    const huge = await png(6001, 200);
    const err = await savePublicImage(huge).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidImageError);
    expect((err as InstanceType<typeof InvalidImageError>).code).toBe("tooLarge");
  });

  it("still processes every upload when more arrive than may decode at once", async () => {
    const inputs = await Promise.all(Array.from({ length: 5 }, () => png(400, 300)));
    const saved = await Promise.all(inputs.map((b) => savePublicImage(b)));
    expect(saved.map((s) => [s.width, s.height])).toEqual(Array(5).fill([400, 300]));
  });
});
