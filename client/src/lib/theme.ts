/**
 * Reads design tokens (src/styles/tokens.css) for code that needs literal colour
 * values — e.g. Recharts, whose SVG attributes can't resolve CSS var().
 */
function readVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function chartTheme() {
  return {
    sales: readVar('--chart-sales', '#2d5c94'),
    purchases: readVar('--chart-purchases', '#c8634c'),
    axis: readVar('--chart-axis', '#66717c'),
    grid: readVar('--chart-grid', '#ede2d8'),
    cursor: readVar('--chart-cursor', '#dccdc0'),
    surface: readVar('--chart-surface', '#fffdfb'),
  };
}
