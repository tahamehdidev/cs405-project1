/**
 * The curve you traced over the painting, shipped as the default so the app
 * shows it on first load. Points are in NORMALISED painting coordinates
 * (u, v ∈ [0, 1], origin top-left, v down), the same as the exported JSON.
 *
 * Only the FREE control points are stored. The shared joints and the "mirror"
 * control point that makes each joint C¹ are recomputed at load (c1NextControl).
 *
 *   first : [P0, P1, P2, P3] of segment 0
 *   rest  : [P2, P3] of every further segment
 *
 * First-guess trace, written in IMAGE PIXELS (778 × 1280) and converted below.
 * Refine it by dragging the points, then export the JSON.
 */
const IMG_W = 778, IMG_H = 1280;
const px = (x, y) => [x / IMG_W, y / IMG_H];

/** The orange border of the tiled lunette above the doorway (left half), traced in 3 segments. */
export const DEFAULT_ARCH_UV = {
  first: [px(212, 262), px(218, 230), px(227, 193), px(240, 160)],
  rest: [
    [px(268, 99), px(287, 73)],
    [px(325, 27), px(347, 8)],
  ],
};

/* ---- Bonus: the marble column's profile ----------------------------------- */

/** Where the painted column's centre line is, in image pixels (x). It is the axis of revolution. */
export const COLUMN_AXIS_PX = 142;
export const COLUMN_AXIS_U = COLUMN_AXIS_PX / IMG_W;

/**
 * The RIGHT edge of the painted column, traced from the top of the capital down
 * to the base, in 5 segments (flared cup → neck → bulge → shaft → lower neck → base).
 * x is in image pixels, so  radius = x − COLUMN_AXIS_PX.
 */
export const DEFAULT_COLUMN_UV = {
  first: [px(184, 373), px(178, 392), px(155, 424), px(155, 446)],
  rest: [
    [px(173, 486), px(172, 510)],
    [px(174, 860), px(174, 884)],
    [px(156, 902), px(156, 920)],
    [px(178, 1010), px(182, 1045)],
  ],
};
