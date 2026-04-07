/**
 * CountryFlag — renders a country's flag emoji from its ISO 3166-1 alpha-2 code.
 * Uses Unicode regional indicator symbol pairs (no image assets needed).
 *
 * Usage: <CountryFlag code="VN" name="Vietnam" />  →  🇻🇳
 */

interface CountryFlagProps {
  code: string | null | undefined;
  name?: string | null;
  size?: number;
}

/**
 * Convert ISO 3166-1 alpha-2 country code to flag emoji.
 * E.g. "VN" → 🇻🇳, "US" → 🇺🇸
 */
export function countryCodeToFlag(code: string): string {
  const upper = code.toUpperCase();
  if (upper.length !== 2) return '';
  const codePoints = [...upper].map(
    (c) => 0x1f1e6 + c.charCodeAt(0) - 65 // 'A' = 65, regional indicator A = 0x1F1E6
  );
  return String.fromCodePoint(...codePoints);
}

export default function CountryFlag({ code, name, size = 14 }: CountryFlagProps) {
  if (!code) return null;

  const flag = countryCodeToFlag(code);
  if (!flag) return null;

  const tooltip = name || code.toUpperCase();

  return (
    <span
      title={tooltip}
      style={{
        fontSize: size,
        lineHeight: 1,
        cursor: 'default',
        userSelect: 'none',
      }}
      role="img"
      aria-label={tooltip}
    >
      {flag}
    </span>
  );
}
