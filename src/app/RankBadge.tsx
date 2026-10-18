import { rankStyle } from "./rankStyle";

// A shield in the rank's metal. Decorative: the rank name is always written next to it.
export default function RankBadge({ rank, size = 112 }: { rank: string; size?: number }) {
  const style = rankStyle(rank);
  const id = `rank-${rank.toLowerCase()}`;
  const top = 52 - (style.gems ? 0 : 6);
  return <svg className="app-rank-badge" data-rank={rank} width={size} height={size * 1.15} viewBox="0 0 100 115" aria-hidden="true" focusable="false" style={{ ["--rank-glow" as string]: style.color }}>
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={style.light} /><stop offset="1" stopColor={style.color} /></linearGradient>
    </defs>
    <path d="M50 4 L92 20 V58 C92 85 73 105 50 113 C27 105 8 85 8 58 V20 Z" fill={`url(#${id})`} />
    <path d="M50 12 L84 25 V57 C84 80 68 97 50 104 C32 97 16 80 16 57 V25 Z" fill="#07130e" opacity="0.88" />
    {Array.from({ length: style.gems }, (_, i) => {
      const x = 50 + (i - (style.gems - 1) / 2) * 14;
      return <path key={i} d={`M${x} 28 l5 6 l-5 6 l-5 -6 Z`} fill={style.light} />;
    })}
    {Array.from({ length: style.chevrons }, (_, i) => {
      const y = top + i * 14;
      return <path key={i} d={`M31 ${y + 12} L50 ${y} L69 ${y + 12}`} fill="none" stroke={`url(#${id})`} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />;
    })}
  </svg>;
}
