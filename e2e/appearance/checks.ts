import type { BrowserContext, Page } from '@playwright/test';

/*
 * Dependency-free, page-evaluated helpers for the appearance matrix. Everything that runs inside the
 * browser is a single self-contained function (Playwright serialises it), so no imports leak in.
 */

// ---------------------------------------------------------------------------------------------
// Pre-paint probe
// ---------------------------------------------------------------------------------------------

/*
 * How "the attributes were right before first paint" is verified:
 *
 * `addInitScript` runs before any page script, including the inline `dude-appearance-prepaint`
 * script in <head>, so it cannot observe that script's result directly. Instead the init script
 * installs a MutationObserver on `document` (subtree + childList). The HTML parser only creates the
 * first element inside <body> AFTER it has finished executing the head scripts (a parser-blocking
 * inline script runs synchronously, and MutationObserver callbacks are microtasks that fire once the
 * script yields). So the first observer callback that sees `document.body.firstElementChild` is the
 * earliest moment content could paint. At that instant we snapshot every `data-*` attribute on
 * <html> into `window.__dudeFirstPaintAttrs` and disconnect. If Angular's AppearanceService were the
 * only thing applying the attributes, this snapshot would show the defaults (or nothing), i.e. the
 * flash-of-default-theme regression this check exists to catch. `readPrepaint` additionally returns
 * the attributes after the app booted so a service/pre-paint disagreement is visible too.
 */
export async function installPrepaintProbe(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    if (window !== window.top) return;
    const snapshot = (): boolean => {
      const body = document.body;
      if (!body || !body.firstElementChild) return false;
      const out: Record<string, string> = {};
      for (const attr of Array.from(document.documentElement.attributes)) {
        if (attr.name.startsWith('data-')) out[attr.name] = attr.value;
      }
      (window as unknown as Record<string, unknown>)['__dudeFirstPaintAttrs'] = out;
      return true;
    };
    const observer = new MutationObserver(() => {
      if (snapshot()) observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
}

export interface PrepaintReading {
  first: Record<string, string> | null;
  final: Record<string, string>;
}

export async function readPrepaint(page: Page): Promise<PrepaintReading> {
  return page.evaluate(() => {
    const final: Record<string, string> = {};
    for (const attr of Array.from(document.documentElement.attributes)) {
      if (attr.name.startsWith('data-')) final[attr.name] = attr.value;
    }
    const first = (window as unknown as Record<string, unknown>)['__dudeFirstPaintAttrs'] as Record<string, string> | undefined;
    return { first: first ?? null, final };
  });
}

/**
 * Differences between `actual` and the expected `attrs`. `defaults` (attr -> default value) lets the
 * post-boot comparison treat an absent attribute as the default; the pre-paint comparison passes no
 * defaults, because the inline script writes every axis explicitly.
 */
export function attrMismatches(
  actual: Record<string, string> | null,
  attrs: Record<string, string>,
  defaults?: Record<string, string>,
): string[] {
  if (!actual) return ['no first-paint snapshot was recorded'];
  const problems: string[] = [];
  for (const [name, expected] of Object.entries(attrs)) {
    const got = actual[name] ?? (defaults ? defaults[name] : undefined);
    if (got !== expected) problems.push(`${name}: expected "${expected}", got ${actual[name] === undefined ? 'nothing' : `"${actual[name]}"`}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Console errors
// ---------------------------------------------------------------------------------------------

/*
 * Known-benign messages are filtered ONLY if actually observed and understood; each entry documents
 * why. (None observed yet -- keep this list empty until a run proves otherwise.)
 */
const BENIGN_CONSOLE: { pattern: RegExp; why: string }[] = [];

export interface ConsoleCollector {
  errors: string[];
  /** Forget everything seen so far (call between page states to attribute errors to a page). */
  drain(): string[];
}

export function collectConsoleErrors(page: Page): ConsoleCollector {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (BENIGN_CONSOLE.some((entry) => entry.pattern.test(text))) return;
    const loc = message.location();
    errors.push(`console.error: ${text}${loc.url ? ` (${loc.url}:${loc.lineNumber})` : ''}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  return {
    errors,
    drain: () => errors.splice(0, errors.length),
  };
}

// ---------------------------------------------------------------------------------------------
// Overflow
// ---------------------------------------------------------------------------------------------

export async function noHorizontalOverflow(page: Page): Promise<{ ok: boolean; scrollWidth: number; innerWidth: number; culprit: string }> {
  return page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const innerWidth = window.innerWidth;
    let culprit = '';
    if (scrollWidth > innerWidth + 1) {
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const r = el.getBoundingClientRect();
        if (r.right > innerWidth + 1 && r.width > 0) {
          culprit = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.getAttribute('class') ?? '').split(/\s+/).slice(0, 3).join('.')} (right=${Math.round(r.right)})`;
          break;
        }
      }
    }
    return { ok: scrollWidth <= innerWidth + 1, scrollWidth, innerWidth, culprit };
  });
}

// ---------------------------------------------------------------------------------------------
// Focus ring
// ---------------------------------------------------------------------------------------------

export interface FocusRingResult {
  ok: boolean;
  problems: string[];
  element: string;
}

/**
 * Tabs through the page and checks the focus indicator at each requested stop (1 = first Tab press,
 * which is usually the skip link; later stops reach real sidebar/toolbar controls).
 */
export async function focusRingVisible(page: Page, stops: number[] = [1, 4]): Promise<FocusRingResult> {
  // Start from a clean focus state so the Tab presses begin at the top of the document.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  const problems: string[] = [];
  const elements: string[] = [];
  let pressed = 0;
  for (const stop of stops) {
    while (pressed < stop) {
      await page.keyboard.press('Tab');
      pressed++;
    }
    // Let any focus-ring transition settle.
    await page.waitForTimeout(150);
    const one = await inspectActiveFocus(page);
    elements.push(one.element);
    problems.push(...one.problems.map((p) => `Tab #${stop} (${one.element}): ${p}`));
  }
  return { ok: problems.length === 0, problems, element: elements.join(' | ') };
}

async function inspectActiveFocus(page: Page): Promise<FocusRingResult> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) {
      return { ok: false, problems: ['Tab did not move focus to any element'], element: 'body' };
    }
    const hint = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 3).join('.')}`;

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const cache = new Map<string, [number, number, number, number]>();
    const parse = (css: string): [number, number, number, number] => {
      const hit = cache.get(css);
      if (hit) return hit;
      let out: [number, number, number, number];
      const m = css.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
      if (m) {
        const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        out = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), a];
      } else {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        out = [d[0], d[1], d[2], d[3] / 255];
      }
      cache.set(css, out);
      return out;
    };
    const over = (top: [number, number, number, number], bottom: [number, number, number]): [number, number, number] => [
      top[0] * top[3] + bottom[0] * (1 - top[3]),
      top[1] * top[3] + bottom[1] * (1 - top[3]),
      top[2] * top[3] + bottom[2] * (1 - top[3]),
    ];
    const lum = (c: [number, number, number]): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: [number, number, number], b: [number, number, number]): number => {
      const la = lum(a);
      const lb = lum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    /** Solid background behind `start` (blending translucent layers); null if a gradient/image intervenes. */
    const backdrop = (start: Element | null): [number, number, number] | null => {
      const layers: [number, number, number, number][] = [];
      for (let n: Element | null = start; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none') return null;
        const c = parse(cs.backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 0.999) break;
      }
      let acc: [number, number, number] = [255, 255, 255];
      for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
      return acc;
    };

    const cs = getComputedStyle(el);
    const problems: string[] = [];
    const outlineWidth = parseFloat(cs.outlineWidth) || 0;
    const outlineOk = cs.outlineStyle !== 'none' && cs.outlineStyle !== 'hidden' && outlineWidth >= 2;

    // Ring utilities render as box-shadow: split on top-level commas, keep visible spread/blur rings.
    const rings: { color: [number, number, number, number]; inset: boolean }[] = [];
    if (cs.boxShadow && cs.boxShadow !== 'none') {
      const parts: string[] = [];
      let depth = 0;
      let cur = '';
      for (const ch of cs.boxShadow) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
          parts.push(cur.trim());
          cur = '';
        } else cur += ch;
      }
      if (cur.trim()) parts.push(cur.trim());
      for (const part of parts) {
        const colorMatch = part.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|#[0-9a-f]{3,8})/i);
        if (!colorMatch) continue;
        const color = parse(colorMatch[1]);
        const nums = part.replace(colorMatch[1], '').replace('inset', '').trim().split(/\s+/).map((v) => parseFloat(v));
        const spread = nums[3] ?? 0;
        if (color[3] > 0.05 && spread >= 1) {
          rings.push({ color, inset: /inset/.test(part) });
        }
      }
    }
    const ringOk = rings.length > 0;

    if (!outlineOk && !ringOk) {
      problems.push(`no visible focus indicator (outline: ${cs.outlineStyle} ${cs.outlineWidth}; box-shadow: ${cs.boxShadow})`);
    } else {
      // Contrast of the indicator against what surrounds it (parent backdrop), or the element itself for inset rings.
      const candidates: { label: string; color: [number, number, number, number]; inset: boolean }[] = [];
      if (outlineOk) candidates.push({ label: 'outline', color: parse(cs.outlineColor), inset: false });
      for (const ring of rings) candidates.push({ label: 'ring', color: ring.color, inset: ring.inset });
      let best = 0;
      let measured = false;
      let bestLabel = '';
      for (const cand of candidates) {
        const bg = backdrop(cand.inset ? el : el.parentElement);
        if (!bg) continue;
        measured = true;
        const r = ratio(over(cand.color, bg), bg);
        if (r > best) {
          best = r;
          bestLabel = cand.label;
        }
      }
      if (measured && best < 3) problems.push(`focus indicator contrast ${best.toFixed(2)} (${bestLabel}) < 3:1`);
    }
    return { ok: problems.length === 0, problems, element: hint };
  });
}

// ---------------------------------------------------------------------------------------------
// Text contrast
// ---------------------------------------------------------------------------------------------

export interface ContrastFailure {
  selectorHint: string;
  text: string;
  fg: string;
  bg: string;
  ratio: number;
  required: number;
}

export interface ContrastResult {
  checked: number;
  skippedGradient: number;
  failureCount: number;
  failures: ContrastFailure[];
}

/**
 * Samples up to ~600 visible text-bearing elements and checks WCAG contrast. Skips disabled /
 * aria-hidden / translucent (opacity < 1) elements, replaced content, `[data-contrast-exempt]` and
 * `[data-motion-exempt]` previews, and anything whose backdrop involves a gradient/image (cannot be
 * resolved to one colour). `rootSelector` restricts sampling to a subtree (e.g. the open palette).
 */
export async function sampleTextContrast(page: Page, minNormal: number, minLarge: number, rootSelector?: string): Promise<ContrastResult> {
  return page.evaluate(
    ({ minNormal, minLarge, rootSelector }) => {
      const MAX_SAMPLE = 600;
      const MAX_FAILURES = 20;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const colorCache = new Map<string, [number, number, number, number]>();
      const parse = (css: string): [number, number, number, number] => {
        const hit = colorCache.get(css);
        if (hit) return hit;
        let out: [number, number, number, number];
        const m = css.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
        if (m) {
          const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
          out = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), a];
        } else {
          // color(srgb ...), oklch(), etc.: let the canvas resolve to sRGB.
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = '#000';
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          out = [d[0], d[1], d[2], d[3] / 255];
        }
        colorCache.set(css, out);
        return out;
      };
      const over = (top: [number, number, number, number], bottom: [number, number, number]): [number, number, number] => [
        top[0] * top[3] + bottom[0] * (1 - top[3]),
        top[1] * top[3] + bottom[1] * (1 - top[3]),
        top[2] * top[3] + bottom[2] * (1 - top[3]),
      ];
      const lum = (c: [number, number, number]): number => {
        const f = (v: number): number => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      };
      const ratioOf = (a: [number, number, number], b: [number, number, number]): number => {
        const la = lum(a);
        const lb = lum(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
      };
      const styleCache = new Map<Element, CSSStyleDeclaration>();
      const styleOf = (el: Element): CSSStyleDeclaration => {
        let s = styleCache.get(el);
        if (!s) {
          s = getComputedStyle(el);
          styleCache.set(el, s);
        }
        return s;
      };
      const hex = (c: [number, number, number]): string =>
        '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      const hint = (el: Element): string => {
        const one = (e: Element): string =>
          `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${String(e.getAttribute('class') ?? '')
            .split(/\s+/)
            .filter((c) => c && c.length < 32)
            .slice(0, 3)
            .map((c) => '.' + c)
            .join('')}`;
        const parent = el.parentElement;
        return parent && parent !== document.body ? `${one(parent)} > ${one(el)}` : one(el);
      };

      const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE', 'SVG', 'CANVAS', 'IFRAME', 'IMG', 'OPTION', 'HEAD', 'META', 'LINK', 'VIDEO', 'AUDIO', 'OBJECT']);
      const root = (rootSelector ? document.querySelector(rootSelector) : document.body) ?? document.body;

      // Candidate = element with a direct, non-whitespace text node.
      const candidates: HTMLElement[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (node) => (SKIP_TAGS.has((node as Element).tagName.toUpperCase()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      for (let n = walker.nextNode() as HTMLElement | null; n; n = walker.nextNode() as HTMLElement | null) {
        let has = false;
        for (const child of Array.from(n.childNodes)) {
          if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim().length > 0) {
            has = true;
            break;
          }
        }
        if (has) candidates.push(n);
      }
      // Evenly thin the list if it is larger than the cap so the whole page is represented.
      let sample = candidates;
      if (candidates.length > MAX_SAMPLE) {
        const step = candidates.length / MAX_SAMPLE;
        sample = Array.from({ length: MAX_SAMPLE }, (_, i) => candidates[Math.floor(i * step)]);
      }

      let checked = 0;
      let skippedGradient = 0;
      let failureCount = 0;
      const failures: ContrastFailure[] = [];
      const seen = new Set<string>();

      for (const el of sample) {
        if (el.closest('[aria-hidden="true"], :disabled, [aria-disabled="true"], [data-contrast-exempt], [data-motion-exempt], [hidden]')) continue;
        if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;

        // Walk ancestors: opacity, clipping, and backdrop layers in one pass.
        let opacityOk = true;
        let clipped = false;
        let gradient = false;
        const layers: [number, number, number, number][] = [];
        let solidFound = false;
        for (let n: Element | null = el; n; n = n.parentElement) {
          const cs = styleOf(n);
          if (parseFloat(cs.opacity) < 1) {
            opacityOk = false;
            break;
          }
          if (n !== el && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) {
            const r = n.getBoundingClientRect();
            if (rect.right <= r.left || rect.left >= r.right || rect.bottom <= r.top || rect.top >= r.bottom) {
              clipped = true;
              break;
            }
          }
          if (!solidFound) {
            if (cs.backgroundImage !== 'none') {
              gradient = true;
              break;
            }
            const c = parse(cs.backgroundColor);
            if (c[3] > 0) layers.push(c);
            if (c[3] >= 0.999) solidFound = true;
          }
        }
        if (!opacityOk || clipped) continue;
        if (gradient) {
          skippedGradient++;
          continue;
        }

        const cs = styleOf(el);
        const fillRaw = cs.getPropertyValue('-webkit-text-fill-color') || cs.color;
        const fgRaw = parse(fillRaw);
        if (fgRaw[3] === 0) continue; // transparent fill (background-clip:text etc.)
        let bg: [number, number, number] = [255, 255, 255];
        for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
        const fg = over(fgRaw, bg);

        const fontSize = parseFloat(cs.fontSize);
        const weight = parseInt(cs.fontWeight, 10) || 400;
        const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
        const required = large ? minLarge : minNormal;
        const ratio = ratioOf(fg, bg);
        checked++;
        if (ratio + 1e-9 < required) {
          failureCount++;
          const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
          const sel = hint(el);
          const key = `${sel}|${hex(fg)}|${hex(bg)}`;
          if (failures.length < MAX_FAILURES && !seen.has(key)) {
            seen.add(key);
            failures.push({ selectorHint: sel, text, fg: hex(fg), bg: hex(bg), ratio: Math.round(ratio * 100) / 100, required });
          }
        }
      }
      return { checked, skippedGradient, failureCount, failures };
    },
    { minNormal, minLarge, rootSelector },
  );
}

// ---------------------------------------------------------------------------------------------
// Navigation helper
// ---------------------------------------------------------------------------------------------

/** goto + wait until the shell has rendered and the network/fonts have settled. */
export async function gotoSettled(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.locator('app-sidebar').first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(200);
}
