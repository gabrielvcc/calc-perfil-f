function visibleEnd(points, parameters) {
  // Only locate the end of the displayed polyline; the engineering values remain unchanged.
  for (let i = points.length - 1; i >= 0; i--) {
    const [x, y] = points[i];
    if (y >= parameters.y_min && y <= parameters.y_max) return [x, y];
    if (y < parameters.y_min && i > 0 && points[i - 1][1] > parameters.y_min) {
      const [previousX, previousY] = points[i - 1];
      return [previousX + (x - previousX) * (parameters.y_min - previousY) / (y - previousY), parameters.y_min];
    }
  }
  return null;
}

export function pressureLabels(data, { width, height, fontSize = 10, fontFamily = 'Poppins, sans-serif' }) {
  const p = data.parameters, occupied = [];
  const context = document.createElement('canvas').getContext('2d');
  context.font = `${fontSize}px ${fontFamily}`;
  return data.curves.map((curve) => {
    const point = visibleEnd(curve.points, p);
    if (!point || width <= 0 || height <= 0) return undefined;
    const value = curve.pressure.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const x = (point[0] - p.x_min) / (p.x_max - p.x_min) * width;
    const y = (p.y_max - point[1]) / (p.y_max - p.y_min) * height;
    const textWidth = context.measureText(value).width + 4, textHeight = fontSize + 4;
    const align = x >= textWidth + 8 ? 'right' : 'left', dx = align === 'right' ? -6 : 6;
    const left = x + dx - (align === 'right' ? textWidth : 0);
    const position = ['top', 'bottom'].find((side) => {
      const top = side === 'top' ? y - 5 - textHeight : y + 5;
      const rect = { left, right: left + textWidth, top, bottom: top + textHeight };
      if (rect.left < 0 || rect.right > width || rect.top < 0 || rect.bottom > height) return false;
      if (occupied.some((other) => rect.left < other.right + 2 && rect.right + 2 > other.left && rect.top < other.bottom + 2 && rect.bottom + 2 > other.top)) return false;
      occupied.push(rect);
      return true;
    });
    if (!position) return undefined;
    return {
      silent: true, animation: false, symbol: 'circle', symbolSize: 0,
      label: { show: true, formatter: () => value, position, align, verticalAlign: position === 'top' ? 'bottom' : 'top', distance: 5, offset: [dx, 0], fontSize, fontFamily, color: '#233640', backgroundColor: '#ffffff', padding: [1, 2] },
      data: [{ coord: point, value: curve.pressure }],
    };
  });
}
