/* 日间校园/社区矢量背景（原创 SVG）。 */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function building(x, base, w, h, seed, opts = {}) {
  const r = rng(seed), col = opts.color || '#e8dcc8', roof = opts.roof || '#c45c4a';
  let s = `<rect x="${x}" y="${base - h}" width="${w}" height="${h}" fill="${col}" stroke="#b9a890" stroke-width="2"/>
    <rect x="${x - 8}" y="${base - h - 18}" width="${w + 16}" height="20" fill="${roof}"/>`;
  const cols = Math.max(2, Math.floor(w / 42)), rows = Math.max(2, Math.floor(h / 48));
  const gx = w / cols, gy = (h - 28) / rows;
  for (let c = 0; c < cols; c++) for (let rr = 0; rr < rows; rr++) {
    const wx = x + c * gx + gx * .22, wy = base - h + 20 + rr * gy;
    s += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="${(gx * .55).toFixed(1)}" height="${(gy * .5).toFixed(1)}" rx="2" fill="${r() < .7 ? '#bfe6f5' : '#9fd0e4'}" stroke="#8ab0c0" stroke-width="1"/>`;
  }
  return s;
}
export function tree(x, base, s = 1) {
  return `<g transform="translate(${x} ${base}) scale(${s})"><rect x="-7" y="-70" width="14" height="70" fill="#7a5a3c"/>
    <circle cx="0" cy="-100" r="42" fill="#3f9a63"/><circle cx="-28" cy="-78" r="30" fill="#58b27a"/><circle cx="30" cy="-80" r="32" fill="#3f9a63"/></g>`;
}
export function cloud(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})" opacity=".85"><ellipse cx="0" cy="0" rx="46" ry="22" fill="#fff"/><ellipse cx="-28" cy="4" rx="28" ry="16" fill="#fff"/><ellipse cx="30" cy="2" rx="30" ry="18" fill="#fff"/></g>`;
}
/** 向导「小步」——简洁卡通机器人，原创 */
export function xiaobu(x = 0, y = 0, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="40" cy="94" rx="28" ry="5" fill="#000" opacity=".12"/>
    <rect x="16" y="20" width="48" height="36" rx="12" fill="#fff" stroke="#c9d8de" stroke-width="2"/>
    <rect x="22" y="26" width="36" height="22" rx="8" fill="#1a4a5c"/>
    <circle cx="32" cy="37" r="4" fill="#7fe6dc"/><circle cx="48" cy="37" r="4" fill="#7fe6dc"/>
    <rect x="24" y="58" width="32" height="20" rx="7" fill="#fff" stroke="#c9d8de" stroke-width="2"/>
    <rect x="10" y="60" width="10" height="14" rx="4" fill="#2a9d8f"/><rect x="60" y="60" width="10" height="14" rx="4" fill="#2a9d8f"/>
    <circle cx="30" cy="84" r="5" fill="#607984"/><circle cx="50" cy="84" r="5" fill="#607984"/>
    <circle cx="40" cy="10" r="5" fill="#ffb020"/></g>`;
}
