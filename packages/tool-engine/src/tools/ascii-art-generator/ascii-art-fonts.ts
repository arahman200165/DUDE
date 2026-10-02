import figlet from 'figlet';
import banner from 'figlet/fonts/Banner';
import big from 'figlet/fonts/Big';
import block from 'figlet/fonts/Block';
import bubble from 'figlet/fonts/Bubble';
import digital from 'figlet/fonts/Digital';
import doom from 'figlet/fonts/Doom';
import ghost from 'figlet/fonts/Ghost';
import shadow from 'figlet/fonts/Shadow';
import slant from 'figlet/fonts/Slant';
import small from 'figlet/fonts/Small';
import speed from 'figlet/fonts/Speed';
import standard from 'figlet/fonts/Standard';

/**
 * A curated subset of figlet's 400+ bundled fonts, each imported individually
 * (rather than figlet's all-fonts entry point) so this lazy chunk only pays
 * for the fonts actually offered here.
 */
const CURATED_FONTS: readonly { readonly name: string; readonly data: string }[] = [
  { name: 'Standard', data: standard },
  { name: 'Slant', data: slant },
  { name: 'Small', data: small },
  { name: 'Big', data: big },
  { name: 'Banner', data: banner },
  { name: 'Block', data: block },
  { name: 'Bubble', data: bubble },
  { name: 'Digital', data: digital },
  { name: 'Doom', data: doom },
  { name: 'Ghost', data: ghost },
  { name: 'Shadow', data: shadow },
  { name: 'Speed', data: speed },
];

for (const font of CURATED_FONTS) {
  figlet.parseFont(font.name, font.data);
}

export const ASCII_ART_FONTS: readonly string[] = CURATED_FONTS.map((f) => f.name);
