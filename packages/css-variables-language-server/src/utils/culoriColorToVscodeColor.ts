import { Color } from 'vscode-languageserver/node';
import * as culori from 'culori';

export function culoriColorToVscodeColor(color: culori.Color): Color {
  const toRgb = culori.converter('rgb');
  const rgb = toRgb(color);
  return { red: rgb.r, green: rgb.g, blue: rgb.b, alpha: rgb.alpha ?? 1 };
}

export function vsCodeColorToColoriColor(color: Color): culori.Color {
  return {
    mode: 'rgb',
    r: color.red,
    g: color.green,
    b: color.blue,
    alpha: color.alpha ?? 1,
  };
}

export function vscodeColorToHex(color: Color): string {
  const c = vsCodeColorToColoriColor(color);
  return culori.formatHex(c);
}
