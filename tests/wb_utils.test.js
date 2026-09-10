import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampInt,
  normalizeConfig,
  positionFractions,
  uniqueUploadName,
} from "../comfyui_workflow_background/web/js/wb_utils.js";

describe("clampInt", () => {
  it("passes through in-range values", () => {
    assert.equal(clampInt(80, 0, 100, 100), 80);
  });

  it("clamps below min and above max", () => {
    assert.equal(clampInt(-5, 0, 100, 100), 0);
    assert.equal(clampInt(150, 0, 100, 100), 100);
  });

  it("falls back on non-numeric input", () => {
    assert.equal(clampInt(undefined, 0, 100, 100), 100);
    assert.equal(clampInt("abc", 0, 100, 100), 100);
    assert.equal(clampInt(NaN, 0, 100, 100), 100);
  });

  it("coerces numeric strings", () => {
    assert.equal(clampInt("42", 0, 100, 100), 42);
  });
});

describe("normalizeConfig", () => {
  it("keeps a complete valid config", () => {
    const cfg = normalizeConfig({
      filename: "a.png",
      subfolder: "backgrounds",
      type: "input",
      opacity: 70,
      fit: "contain",
      position: "top-left",
    });
    assert.deepEqual(cfg, {
      filename: "a.png",
      subfolder: "backgrounds",
      type: "input",
      opacity: 70,
      fit: "contain",
      position: "top-left",
    });
  });

  it("fills defaults for a bare filename", () => {
    const cfg = normalizeConfig({ filename: "a.png" });
    assert.equal(cfg.subfolder, "backgrounds");
    assert.equal(cfg.type, "input");
    assert.equal(cfg.opacity, 100);
    assert.equal(cfg.fit, "cover");
    assert.equal(cfg.position, "center");
  });

  it("clamps opacity and falls back on garbage", () => {
    assert.equal(normalizeConfig({ filename: "a.png", opacity: 999 }).opacity, 100);
    assert.equal(normalizeConfig({ filename: "a.png", opacity: -3 }).opacity, 0);
    assert.equal(normalizeConfig({ filename: "a.png", opacity: "xx" }).opacity, 100);
  });

  it("falls back on unknown fit/position", () => {
    const cfg = normalizeConfig({ filename: "a.png", fit: "stretch", position: "moon" });
    assert.equal(cfg.fit, "cover");
    assert.equal(cfg.position, "center");
  });
});

describe("positionFractions", () => {
  const expected = {
    "top-left": { hx: 0, hy: 0 },
    top: { hx: 0.5, hy: 0 },
    "top-right": { hx: 1, hy: 0 },
    left: { hx: 0, hy: 0.5 },
    center: { hx: 0.5, hy: 0.5 },
    right: { hx: 1, hy: 0.5 },
    "bottom-left": { hx: 0, hy: 1 },
    bottom: { hx: 0.5, hy: 1 },
    "bottom-right": { hx: 1, hy: 1 },
  };

  for (const [pos, want] of Object.entries(expected)) {
    it(`maps ${pos} to (${want.hx}, ${want.hy})`, () => {
      assert.deepEqual(positionFractions(pos), want);
    });
  }

  it("falls back to center on unknown/empty input", () => {
    assert.deepEqual(positionFractions("moon"), { hx: 0.5, hy: 0.5 });
    assert.deepEqual(positionFractions(undefined), { hx: 0.5, hy: 0.5 });
  });
});

describe("uniqueUploadName", () => {
  it("prefixes with wb_ and keeps a cleaned basename", () => {
    const name = uniqueUploadName("my pic(1).png");
    assert.match(name, /^wb_[a-z0-9]+_[a-z0-9]+_my_pic_1_\.png$/);
  });

  it("strips directory parts (no traversal)", () => {
    const name = uniqueUploadName("../../evil.png");
    assert.doesNotMatch(name, /[/\\]/);
    assert.match(name, /evil\.png$/);
  });

  it("falls back on empty input", () => {
    assert.match(uniqueUploadName(""), /background\.png$/);
  });

  it("generates unique names", () => {
    const names = new Set(Array.from({ length: 100 }, () => uniqueUploadName("a.png")));
    assert.equal(names.size, 100);
  });
});
