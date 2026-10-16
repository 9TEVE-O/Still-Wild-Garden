/**
 * A view-only camera. These functions never modify a garden seed, its growth,
 * terrain positions or persistent event history.
 */
export type CameraView = { scale: number; x: number; y: number };
export type CameraSize = { width: number; height: number };
export type CameraPoint = { x: number; y: number };

export const MAX_CAMERA_ZOOM = 2.8;
export const INITIAL_CAMERA: CameraView = { scale: 1, x: 0, y: 0 };

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

export function clampCamera(view: CameraView, size: CameraSize): CameraView {
  const scale = Math.min(MAX_CAMERA_ZOOM, Math.max(1, finite(view.scale, 1)));
  const width = Math.max(0, finite(size.width, 0));
  const height = Math.max(0, finite(size.height, 0));
  const limitX = (scale - 1) * width / 2;
  const limitY = (scale - 1) * height / 2;
  return {
    scale,
    x: Math.max(-limitX, Math.min(limitX, finite(view.x, 0))),
    y: Math.max(-limitY, Math.min(limitY, finite(view.y, 0))),
  };
}

export function panCamera(view: CameraView, dx: number, dy: number, size: CameraSize): CameraView {
  return clampCamera({ scale: view.scale, x: view.x + dx, y: view.y + dy }, size);
}

/**
 * Anchor is expressed in pixels relative to the untransformed viewport centre.
 * The same scene point remains under the gesture midpoint unless clamped at an edge.
 */
export function zoomCamera(view: CameraView, nextScale: number, anchor: CameraPoint, size: CameraSize): CameraView {
  const old = clampCamera(view, size);
  const scale = Math.min(MAX_CAMERA_ZOOM, Math.max(1, finite(nextScale, old.scale)));
  if (scale === 1) return INITIAL_CAMERA;
  const ratio = scale / old.scale;
  return clampCamera({
    scale,
    x: anchor.x - (anchor.x - old.x) * ratio,
    y: anchor.y - (anchor.y - old.y) * ratio,
  }, size);
}
