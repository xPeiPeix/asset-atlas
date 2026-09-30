(() => {
  "use strict";

  const minScale = 0.25;
  const maxScale = 4;
  const visibleEdge = 80;
  const wheelSensitivity = 0.0006;
  const maxWheelDelta = 120;

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function normalizeSize(size) {
    return {
      width: Math.max(1, Number(size?.width) || 1),
      height: Math.max(1, Number(size?.height) || 1),
    };
  }

  function normalizePoint(point) {
    return {
      x: Number(point?.x) || 0,
      y: Number(point?.y) || 0,
    };
  }

  function constrainAxis(offset, viewportSize, scaledContentSize) {
    if (scaledContentSize <= viewportSize) {
      const centered = (viewportSize - scaledContentSize) / 2;
      const slack = Math.min(visibleEdge, Math.max(0, centered));
      return clamp(offset, centered - slack, centered + slack);
    }
    return clamp(offset, visibleEdge - scaledContentSize, viewportSize - visibleEdge);
  }

  function constrainTransform(transform, viewportSize, contentSize) {
    const viewport = normalizeSize(viewportSize);
    const content = normalizeSize(contentSize);
    const scale = clamp(Number(transform?.scale) || 1, minScale, maxScale);
    return {
      scale,
      x: constrainAxis(
        Number(transform?.x) || 0,
        viewport.width,
        content.width * scale,
      ),
      y: constrainAxis(
        Number(transform?.y) || 0,
        viewport.height,
        content.height * scale,
      ),
    };
  }

  function fitTransform(viewportSize, contentSize, padding = 48) {
    const viewport = normalizeSize(viewportSize);
    const content = normalizeSize(contentSize);
    const safePadding = Math.max(0, Number(padding) || 0);
    const availableWidth = Math.max(1, viewport.width - safePadding * 2);
    const availableHeight = Math.max(1, viewport.height - safePadding * 2);
    const scale = clamp(
      Math.min(1, availableWidth / content.width, availableHeight / content.height),
      minScale,
      maxScale,
    );
    return {
      scale,
      x: (viewport.width - content.width * scale) / 2,
      y: (viewport.height - content.height * scale) / 2,
    };
  }

  function zoomAtPoint(transform, nextScale, anchorPoint) {
    const anchor = normalizePoint(anchorPoint);
    const currentScale = clamp(
      Number(transform?.scale) || 1,
      minScale,
      maxScale,
    );
    const scale = clamp(Number(nextScale) || currentScale, minScale, maxScale);
    const x = Number(transform?.x) || 0;
    const y = Number(transform?.y) || 0;
    const ratio = scale / currentScale;
    return {
      scale,
      x: anchor.x - (anchor.x - x) * ratio,
      y: anchor.y - (anchor.y - y) * ratio,
    };
  }

  function panTransform(transform, delta) {
    const movement = normalizePoint(delta);
    return {
      scale: clamp(Number(transform?.scale) || 1, minScale, maxScale),
      x: (Number(transform?.x) || 0) + movement.x,
      y: (Number(transform?.y) || 0) + movement.y,
    };
  }

  function wheelScaleFactor(deltaY, deltaMode = 0, pageSize = 800) {
    let pixelDelta = Number(deltaY) || 0;
    if (Number(deltaMode) === 1) {
      pixelDelta *= 16;
    } else if (Number(deltaMode) === 2) {
      pixelDelta *= Math.max(1, Number(pageSize) || 800);
    }
    const boundedDelta = clamp(pixelDelta, -maxWheelDelta, maxWheelDelta);
    return Math.exp(-boundedDelta * wheelSensitivity);
  }

  function pinchTransform(
    transform,
    startMidpoint,
    currentMidpoint,
    startDistance,
    currentDistance,
  ) {
    const start = normalizePoint(startMidpoint);
    const current = normalizePoint(currentMidpoint);
    const safeStartDistance = Math.max(1, Number(startDistance) || 1);
    const safeCurrentDistance = Math.max(1, Number(currentDistance) || 1);
    const currentScale = clamp(
      Number(transform?.scale) || 1,
      minScale,
      maxScale,
    );
    const scale = clamp(
      currentScale * (safeCurrentDistance / safeStartDistance),
      minScale,
      maxScale,
    );
    const contentX = (start.x - (Number(transform?.x) || 0)) / currentScale;
    const contentY = (start.y - (Number(transform?.y) || 0)) / currentScale;
    return {
      scale,
      x: current.x - contentX * scale,
      y: current.y - contentY * scale,
    };
  }

  globalThis.AssetAtlasViewport = Object.freeze({
    minScale,
    maxScale,
    constrainTransform,
    fitTransform,
    zoomAtPoint,
    panTransform,
    wheelScaleFactor,
    pinchTransform,
  });
})();
