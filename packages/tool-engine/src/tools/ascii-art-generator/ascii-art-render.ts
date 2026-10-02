import figlet from 'figlet';
import "./ascii-art-fonts.js";

export function renderAsciiArt(text: string, font: string): string {
  if (text.trim() === '') return '';

  try {
    return figlet.textSync(text, { font });
  } catch (error) {
    return `Could not render: ${error instanceof Error ? error.message : String(error)}`;
  }
}
