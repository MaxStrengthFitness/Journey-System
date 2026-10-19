/**
 * DOES HER NAME FIT A NARROW CARD? (the narrow cards round, Oct 18 2026.)
 * Pure: name-fit.test.ts.
 *
 * Two or three bookings that start together share their slot, so each card
 * is a half or a third of its column (HubGrid's data-lanes). On such a
 * narrow card her name is set in the lane head's narrower face, Saira
 * Condensed 700 at 14px (`NARROW_NAME_FACE`), broken only between words, and
 * a half-hour card holds TWO name lines above its time. A name that needs a
 * third line pushes the time off the bottom of the card, and a word wider
 * than the line breaks inside itself ("Hollings / worth"). So a name that
 * would do either shows her initials there instead, and the time stays
 * (AJ, Oct 18 2026: "Build it as you described, including initials for the
 * very long names"). Everywhere else the name is whole.
 *
 * The browser can't be asked: a card is not a container of its own (the iPad
 * round's W12), and a stylesheet can't measure text. So the card works it
 * out here, from the font's own advance widths, and says it as
 * `data-name-over`: the narrow lines, in px, that her name is too long for
 * ("60 62 64"). The stylesheet asks for the line its column gives a narrow
 * card (`[data-name-over~="62"]`) and never guesses from the text.
 *
 * A card with no profile, or one still loading, never shows initials
 * (HubCard writes this only on a client's card): it opens no peek, so its
 * name stays whole.
 */

/** The face a narrow card sets her name in: the lane head's (hub-card.css, the narrow form). */
export const NARROW_NAME_FACE = {
  family: "Saira Condensed",
  weight: 700,
  sizePx: 14,
  /** Added after every character, as the browser adds it. */
  letterSpacingEm: 0.005,
  /** A half-hour card holds two name lines above its time; a third pushes the time off. */
  lines: 2,
} as const;

/** Font units to the em in Saira Condensed (its head table). */
export const SAIRA_UNITS_PER_EM = 1000;

/**
 * Saira Condensed 700's advance widths, in font units, exactly as the
 * vendored fonts hold them (src/assets/fonts/saira-condensed, @fontsource
 * 5.3.0): the latin file's, and the latin-ext file's for the letters
 * index.css's unicode-range sends there (U+0100-017F, but for ı, Œ and œ).
 * name-fit.test.ts reads both font files and holds every entry. Against
 * the browser's own layout of the 2,500 realistic names the lanes round used
 * (headless Chrome, these fonts, Oct 18 2026), the sum of these is at most
 * 0.46px narrower than what Chrome draws ("Robert Martin": the face kerns a
 * little) and at most 1.3px wider ("Steven Young"), so `FIT_SLACK_PX` is a
 * whole pixel.
 */
export const SAIRA_700_UNITS: Readonly<Record<string, number>> = {
  " ": 179, "'": 216, "-": 297, ".": 242, "’": 235, "0": 477, "1": 310, "2": 450, "3": 437, "4": 469,
  "5": 453, "6": 473, "7": 421, "8": 487, "9": 473, "A": 501, "B": 488, "C": 396, "D": 496, "E": 421, "F": 392,
  "G": 487, "H": 519, "I": 243, "J": 296, "K": 492, "L": 379, "M": 703, "N": 523, "O": 506, "P": 475, "Q": 506,
  "R": 494, "S": 443, "T": 418, "U": 506, "V": 485, "W": 756, "X": 501, "Y": 463, "Z": 439, "a": 426, "b": 446,
  "c": 341, "d": 446, "e": 425, "f": 309, "g": 446, "h": 450, "i": 221, "j": 221, "k": 430, "l": 221, "m": 669,
  "n": 450, "o": 436, "p": 446, "q": 446, "r": 312, "s": 371, "t": 302, "u": 450, "v": 417, "w": 644, "x": 426,
  "y": 450, "z": 394, "À": 501, "Á": 501, "Â": 501, "Ã": 501, "Ä": 501, "Å": 501,
  "Æ": 677, "Ç": 396, "È": 421, "É": 421, "Ê": 421, "Ë": 421, "Ì": 243,
  "Í": 243, "Î": 243, "Ï": 243, "Ð": 496, "Ñ": 523, "Ò": 506, "Ó": 506,
  "Ô": 506, "Õ": 506, "Ö": 506, "Ø": 506, "Ù": 506, "Ú": 506, "Û": 506,
  "Ü": 506, "Ý": 463, "Þ": 475, "ß": 457, "à": 426, "á": 426, "â": 426,
  "ã": 426, "ä": 426, "å": 426, "æ": 643, "ç": 341, "è": 425, "é": 425,
  "ê": 425, "ë": 425, "ì": 221, "í": 221, "î": 221, "ï": 221, "ð": 439,
  "ñ": 450, "ò": 436, "ó": 436, "ô": 436, "õ": 436, "ö": 436, "ø": 436,
  "ù": 450, "ú": 450, "û": 450, "ü": 450, "ý": 450, "þ": 446, "ÿ": 450,
  "Ā": 501, "ā": 426, "Ă": 501, "ă": 426, "Ą": 501, "ą": 426, "Ć": 396,
  "ć": 341, "Ĉ": 396, "ĉ": 341, "Ċ": 396, "ċ": 341, "Č": 396, "č": 341,
  "Ď": 496, "ď": 512, "Đ": 496, "đ": 446, "Ē": 421, "ē": 425, "Ĕ": 421,
  "ĕ": 425, "Ė": 421, "ė": 425, "Ę": 421, "ę": 425, "Ě": 421, "ě": 425,
  "Ĝ": 487, "ĝ": 446, "Ğ": 487, "ğ": 446, "Ġ": 487, "ġ": 446, "Ģ": 487,
  "ģ": 446, "Ĥ": 519, "ĥ": 450, "Ħ": 519, "ħ": 450, "Ĩ": 243, "ĩ": 221,
  "Ī": 243, "ī": 221, "Ĭ": 243, "ĭ": 221, "Į": 243, "į": 221, "İ": 243,
  "ı": 221, "Ĳ": 539, "ĳ": 442, "Ĵ": 296, "ĵ": 221, "Ķ": 492, "ķ": 430,
  "ĸ": 430, "Ĺ": 379, "ĺ": 221, "Ļ": 379, "ļ": 221, "Ľ": 379, "ľ": 296,
  "Ŀ": 404, "ŀ": 315, "Ł": 379, "ł": 229, "Ń": 523, "ń": 450, "Ņ": 523,
  "ņ": 450, "Ň": 523, "ň": 450, "ŉ": 560, "Ŋ": 523, "ŋ": 450, "Ō": 506,
  "ō": 436, "Ŏ": 506, "ŏ": 436, "Ő": 506, "ő": 436, "Œ": 715, "œ": 665,
  "Ŕ": 494, "ŕ": 312, "Ŗ": 494, "ŗ": 312, "Ř": 494, "ř": 312, "Ś": 443,
  "ś": 371, "Ŝ": 443, "ŝ": 371, "Ş": 443, "ş": 371, "Š": 443, "š": 371,
  "Ţ": 418, "ţ": 302, "Ť": 418, "ť": 404, "Ŧ": 418, "ŧ": 302, "Ũ": 506,
  "ũ": 450, "Ū": 506, "ū": 450, "Ŭ": 506, "ŭ": 450, "Ů": 506, "ů": 450,
  "Ű": 506, "ű": 450, "Ų": 506, "ų": 450, "Ŵ": 756, "ŵ": 644, "Ŷ": 463,
  "ŷ": 450, "Ÿ": 463, "Ź": 439, "ź": 394, "Ż": 439, "ż": 394, "Ž": 438,
  "ž": 394, "ſ": 296,
};

/**
 * A character the table doesn't hold counts a whole em, wider than any
 * letter in it (the widest, W, is 0.756): an unknown name errs towards
 * initials, never towards a cut.
 */
const UNKNOWN_UNITS = SAIRA_UNITS_PER_EM;

/**
 * Room left for kerning and for the engines to differ: a line holds a name
 * only with a pixel to spare. The table can read up to 0.46px narrow, and
 * iPad WebKit is not measured; the tightest realistic name, "Zimmerman" at
 * 60.6px, still fits the commonest narrow line, 62px.
 */
export const FIT_SLACK_PX = 1;

/**
 * The narrow lines a card can be given, in px, every 2px. A narrow card is a
 * lane under 155px: two to a slot in a column under 310px, three under
 * 465px. Its line is the lane less the slot's 1.25px sides and the card's
 * 10px and 3px of padding, so the narrowest is about 60.5px (three to a slot
 * in a 229px column), the commonest 62px (two to a slot in an upright
 * column of 156px) and the widest just under 139.5px.
 */
export const NARROW_LINES: readonly number[] = Array.from({ length: 40 }, (_, i) => 60 + 2 * i);

/** The width, in px, of `text` set in the narrow face on one line. */
export function narrowWidth(text: string): number {
  const f = NARROW_NAME_FACE;
  let units = 0;
  let chars = 0;
  for (const ch of text) {
    units += SAIRA_700_UNITS[ch] ?? UNKNOWN_UNITS;
    chars += 1;
  }
  return (units / SAIRA_UNITS_PER_EM) * f.sizePx + chars * f.letterSpacingEm * f.sizePx;
}

/**
 * Where her name may break, as the browser breaks it: between words (the
 * space stays behind at the end of the line), and after a hyphen inside one
 * ("Szymanski-" / "Abernathy"). Each piece says whether a space comes before
 * it when it follows on the same line.
 */
function pieces(name: string): { text: string; space: boolean }[] {
  const out: { text: string; space: boolean }[] = [];
  for (const word of name.trim().split(/\s+/).filter(Boolean)) {
    // No lookbehind in the pattern: older iPad Safari can't parse one.
    let from = 0;
    for (let i = 1; i < word.length - 1; i += 1) {
      if (word[i] === "-" && word[i + 1] !== "-" && !/[0-9]/.test(word[i + 1])) {
        out.push({ text: word.slice(from, i + 1), space: from === 0 && out.length > 0 });
        from = i + 1;
      }
    }
    out.push({ text: word.slice(from), space: from === 0 && out.length > 0 });
  }
  return out;
}

const lineWidth = (ps: { text: string; space: boolean }[]) => narrowWidth(ps.map((p, i) => (i > 0 && p.space ? ` ${p.text}` : p.text)).join(""));

/**
 * The least line width, in px, at which her name sets on at most two lines
 * in the narrow face, broken only where the browser may break it. A line
 * narrower than this either breaks a word inside itself or needs a third
 * line. 0 for no name.
 */
export function nameNeed(name: string): number {
  const ps = pieces(name);
  if (ps.length === 0) return 0;
  let best = lineWidth(ps);
  for (let k = 1; k < ps.length; k += 1) {
    const first = lineWidth(ps.slice(0, k));
    const second = lineWidth(ps.slice(k).map((p, i) => (i === 0 ? { ...p, space: false } : p)));
    best = Math.min(best, Math.max(first, second));
  }
  return best;
}

/** The narrow lines (`NARROW_LINES`) her name is too long for, narrowest first. */
export function nameOverLines(name: string): number[] {
  const need = nameNeed(name) + FIT_SLACK_PX;
  return NARROW_LINES.filter((line) => need > line);
}

/**
 * HubCard's `data-name-over`: the narrow lines her name is too long for,
 * "60 62 64", or nothing when it fits every narrow line. Of the 2,500
 * realistic names none is over 60px but the fifty Zimmermans ("60"): the
 * stress names are ("Hollingsworth" over 60 to 72, "Mary Ellen
 * Szymanski-Abernathy" over 60 to 112).
 */
export function nameOverAttr(name: string): string | undefined {
  const over = nameOverLines(name);
  return over.length > 0 ? over.join(" ") : undefined;
}
