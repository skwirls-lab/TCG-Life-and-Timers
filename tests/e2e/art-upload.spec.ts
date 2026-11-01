// Uploads (T5.3 UI) and the My images library.
// @req ART-020 @req ART-021 @req ART-022 @req ART-023 @req ART-025 @req LEG-005
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { hasExif, readExif } from "../../src/lib/image/exif";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { readArtRows } from "./support/artRoutes";
import { gotoHarness, openSeatMenu } from "./support/seatHarness";

/** A 300×200 camera-style JPEG stored sideways (EXIF Orientation 6) with GPS tags. */
async function cameraJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 300, height: 200, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .composite([
      {
        input: {
          create: { width: 300, height: 100, channels: 3, background: { r: 30, g: 60, b: 210 } },
        },
        left: 0,
        top: 100,
      },
    ])
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: { Make: "TestCam", Model: "Fixture 1" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "51/1 30/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "0/1 7/1 0/1",
      },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

test.describe("uploads", () => {
  // @req ART-020 @req ART-021 @req ART-022
  test("upload an EXIF-rotated JPEG: stored oriented, resized, without EXIF/GPS", async ({
    page,
  }) => {
    const input = await cameraJpeg();
    const exifIn = readExif(input);
    expect(exifIn?.orientation).toBe(6);
    expect(exifIn?.hasGps).toBe(true);

    await gotoHarness(page);
    await openSeatMenu(page, 0);
    const fileInput = page.getByTestId("art-upload-input");
    await expect(fileInput).toHaveAttribute("accept", "image/*");
    await fileInput.setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: input });
    await expect(page.getByTestId("art-focal-frame")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.getByTestId("art-focal-save").click();

    const seat = page.getByTestId("harness-seat-0");
    await expect(seat).toHaveAttribute("data-art-kind", "upload");
    const id = await seat.getAttribute("data-art-value");
    const rows = await readArtRows(page);
    const row = rows.find((r) => r.id === id)!;
    expect(row).toBeTruthy();
    const bytes = new Uint8Array(row.bytes);
    expect(hasExif(bytes)).toBe(false); // privacy: EXIF/GPS stripped (ART-021)
    const meta = await sharp(Buffer.from(bytes)).metadata();
    expect([meta.width, meta.height]).toEqual([200, 300]); // orientation applied
    expect(meta.orientation ?? 1).toBe(1);
    expect(row.type).toMatch(/^image\/(webp|jpeg)$/);
    expect(row.meta).toMatchObject({
      source: "upload",
      name: "photo",
      width: 200,
      height: 300,
      bytes: bytes.length,
      contentType: row.type,
    });
    expect(row.meta.storagePath).toBeUndefined(); // guests: local only (ART-022)
    // the seat preview renders from the local blob
    await expect(page.getByTestId("art-current-preview")).toHaveAttribute("data-art-src", "blob");
  });

  // @req ART-025
  test("non-images are rejected with a message", async ({ page }) => {
    await gotoHarness(page);
    await openSeatMenu(page, 0);
    await page.getByTestId("art-upload-input").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });
    await expect(page.getByTestId("art-upload-error")).toHaveText("That file is not an image.");
    await expect(page.getByTestId("harness-seat-0")).toHaveAttribute("data-art-kind", "none");
  });

  // @req ART-023 @req LEG-005
  test("My images: list, rename, use on a seat, delete", async ({ page }) => {
    await page.goto("/images?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany");
    await expect(page.getByTestId("images-page")).toBeVisible();
    await expect(page.getByTestId("images-empty")).toBeVisible();
    await expect(page.getByTestId("images-quota")).toContainText("stored on this device");
    await page
      .getByTestId("images-upload-input")
      .setInputFiles({ name: "dragon.jpg", mimeType: "image/jpeg", buffer: await cameraJpeg() });
    const item = page.getByTestId("images-item-0");
    await expect(item).toHaveAttribute("data-name", "dragon");
    await expect(item).toContainText("200×300");
    await expect(page.getByTestId("images-status-0")).toHaveText("On this device");
    await expect(page.getByTestId("images-preview-0")).toHaveAttribute("data-art-src", "blob");
    await expectNoSeriousA11yViolations(page);

    await page.getByTestId("images-rename-0").click();
    await page.getByTestId("images-rename-input-0").fill("Ancient Dragon");
    await page.getByTestId("images-rename-save-0").click();
    await expect(item).toHaveAttribute("data-name", "Ancient Dragon");
    await expect(item.getByRole("heading")).toHaveText("Ancient Dragon");

    await page.getByTestId("images-use-0").click();
    await page.getByTestId("images-use-seat-0-1").click();
    await expect(item).toContainText("Background set for Josh");
    const art = await page.evaluate(() => window.__tcg?.getState().session?.game.seats[1]?.art);
    expect(art).toMatchObject({ kind: "upload", value: await item.getAttribute("data-id") });

    await page.getByTestId("images-delete-0").click();
    await page.getByTestId("images-delete-confirm-0").click();
    await expect(page.getByTestId("images-empty")).toBeVisible();
    expect((await readArtRows(page)).length).toBe(0);
  });
});
