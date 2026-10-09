import { describe, expect, it } from 'vitest';
import { intersects, popupPosition, scaleOf, toHostRect } from '../../packages/controlled-reader/src/geometry';

describe('iframe → host coordinates', () => {
  it('adds the iframe offset to the inner rect', () => {
    expect(toHostRect({ left: 30, top: 40, width: 50, height: 18 }, { left: 100, top: 60, width: 600, height: 400 }))
      .toEqual({ left: 130, top: 100, width: 50, height: 18 });
  });

  it('a later page of a paginated chapter: the iframe is shifted left, so inner rects past the viewport land on screen', () => {
    // epub.js lays all pages of a chapter side by side in one wide iframe and scrolls the container
    const frame = { left: -600, top: 0, width: 1200, height: 400 };
    expect(toHostRect({ left: 650, top: 100, width: 40, height: 18 }, frame).left).toBe(50);
  });

  it('applies the transform scale when the rendered size differs from the layout size', () => {
    const frameRect = { left: 10, top: 20, width: 300, height: 200 };
    const scale = scaleOf(frameRect, 600, 400);
    expect(scale).toEqual({ x: 0.5, y: 0.5 });
    expect(toHostRect({ left: 100, top: 100, width: 60, height: 20 }, frameRect, scale)).toEqual({ left: 60, top: 70, width: 30, height: 10 });
    expect(scaleOf(frameRect, 0, 0)).toEqual({ x: 1, y: 1 });
  });

  it('decides whether the rect is inside the reading area', () => {
    const box = { left: 0, top: 0, width: 600, height: 400 };
    expect(intersects({ left: 10, top: 10, width: 20, height: 10 }, box)).toBe(true);
    expect(intersects({ left: 640, top: 10, width: 20, height: 10 }, box)).toBe(false);
    expect(intersects({ left: -50, top: 10, width: 20, height: 10 }, box)).toBe(false);
  });

  it('places a popup below the word, above it when there is no room, and inside the viewport', () => {
    const vp = { width: 800, height: 600 };
    const size = { width: 300, height: 120 };
    expect(popupPosition({ left: 100, top: 100, width: 40, height: 18 }, vp, size)).toEqual({ left: 0, top: 126, placement: 'below' });
    expect(popupPosition({ left: 400, top: 560, width: 40, height: 18 }, vp, size).placement).toBe('above');
    expect(popupPosition({ left: 790, top: 100, width: 40, height: 18 }, vp, size).left).toBe(500);
  });
});
