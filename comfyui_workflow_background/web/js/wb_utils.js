/**
 * ComfyUI Workflow Background - pure helper module (no ComfyUI imports).
 *
 * Kept free of browser/ComfyUI dependencies so it can be unit-tested
 * with plain `node --test`.
 */

export const UPLOAD_SUBFOLDER = "backgrounds";

export const FIT_MODES = ["cover", "contain"];

export const POSITIONS = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

/** Clamp a value into [min, max]; non-numeric input yields `fallback`. */
export function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Fill in defaults and clamp values of a stored config object. */
export function normalizeConfig(cfg) {
  return {
    filename: cfg.filename,
    subfolder: typeof cfg.subfolder === "string" ? cfg.subfolder : UPLOAD_SUBFOLDER,
    type: typeof cfg.type === "string" ? cfg.type : "input",
    opacity: clampInt(cfg.opacity ?? 100, 0, 100, 100),
    fit: FIT_MODES.includes(cfg.fit) ? cfg.fit : "cover",
    position: POSITIONS.includes(cfg.position) ? cfg.position : "center",
  };
}

/** Unique upload name so every background is its own file (safe to delete on Clear). */
export function uniqueUploadName(name) {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const base = String(name || "background.png").split(/[\\/]/).pop();
  const clean = base.replace(/[^a-zA-Z0-9._-]+/g, "_") || "background.png";
  return `wb_${stamp}_${rand}_${clean}`;
}

/**
 * Map a 3x3 position name to leftover-space fractions.
 * Horizontal (left/center/right) is the fraction of the leftover space
 * on the x axis, vertical likewise on y. "center" maps to 0.5/0.5
 * ("top-left" to 0/0). Unknown values fall back to center.
 */
export function positionFractions(position) {
  const orientation = position || "center";
  let hx = 0.5; // 0 = left, 0.5 = center, 1 = right
  let hy = 0.5; // 0 = top, 0.5 = center, 1 = bottom
  if (orientation.includes("top")) hy = 0;
  else if (orientation.includes("bottom")) hy = 1;
  if (orientation.includes("left")) hx = 0;
  else if (orientation.includes("right")) hx = 1;
  return { hx, hy };
}
