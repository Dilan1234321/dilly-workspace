export type ScoreBand = { color: string; bg: string; border: string };

/** Aligns with recruiter dashboard score bands (green / amber / red). */
export function scoreBandForValue(value: number): ScoreBand {
  if (value >= 75) {
    return {
      color: '#34C759',
      bg: 'rgba(52, 199, 89, 0.08)',
      border: 'rgba(52, 199, 89, 0.22)',
    };
  }
  if (value >= 55) {
    return {
      color: '#FF9F0A',
      bg: 'rgba(255, 159, 10, 0.08)',
      border: 'rgba(255, 159, 10, 0.22)',
    };
  }
  return {
    color: '#FF453A',
    bg: 'rgba(255, 69, 58, 0.08)',
    border: 'rgba(255, 69, 58, 0.22)',
  };
}
