// Automation risk classification for job titles.
// Three tiers based on AI's impact on the role type.

export type AutomationRisk = 'high' | 'evolving' | 'amplified';

export interface RiskProfile {
  level: AutomationRisk;
  label: string;
  shortLabel: string;
  reason: string;
  color: string;
  bg: string;
  border: string;
}

// Patterns that signal high displacement risk — rule-based, repetitive tasks
const HIGH: RegExp[] = [
  /data.?entr/i,
  /\bclerk\b/i,
  /transcri/i,
  /bookkeep/i,
  /accounts.?(payable|receivable)/i,
  /administrative.?assist/i,
  /office.?assist/i,
  /content.?moderat/i,
  /data.?tagger/i,
  /data.?labeler/i,
  /annotation/i,
  /qa.?tester/i,
  /manual.?test/i,
  /order.?process/i,
  /billing.?specialist/i,
  /invoice.?process/i,
];

// Patterns that signal AI-amplified roles — judgment, creativity, or technical depth
const AMPLIFIED: RegExp[] = [
  /software.?(engineer|develop|architect)/i,
  /machine.?learn/i,
  /\bml\b.*(engineer|research)/i,
  /\bai\b.*(engineer|research|develop)/i,
  /data.?scien/i,
  /research.?scientist/i,
  /full.?stack/i,
  /\bbackend\b/i,
  /\bfrontend\b/i,
  /cloud.?(engineer|architect)/i,
  /\bdevops\b/i,
  /\bsre\b/i,
  /\bquant(itative)?\b/i,
  /security.?(engineer|architect|research)/i,
  /cybersecurity/i,
  /investment.?bank/i,
  /m&a\b/i,
  /mergers?.and.acquisitions/i,
  /venture.?capital/i,
  /private.?equity/i,
  /strategy.?consult/i,
  /management.?consult/i,
  /ux.?research/i,
  /ux.?design/i,
  /product.?(manager|lead|director)/i,
  /deep.?learn/i,
  /\bnlp\b/i,
  /computer.?vision/i,
  /hardware.?engineer/i,
  /embedded.?(system|engineer)/i,
  /robotics/i,
  /firmware/i,
  /platform.?engineer/i,
  /infrastructure.?engineer/i,
  /site.?reliability/i,
];

export function getAutomationRisk(jobTitle: string): RiskProfile {
  const t = jobTitle || '';

  if (HIGH.some(r => r.test(t))) {
    return {
      level: 'high',
      label: 'High AI Risk',
      shortLabel: 'AI Risk',
      reason: 'This role involves rule-based tasks that AI is actively automating. Look for paths that build on top of AI rather than compete with it.',
      color: '#FF453A',
      bg: 'rgba(255,69,58,0.08)',
      border: 'rgba(255,69,58,0.2)',
    };
  }

  if (AMPLIFIED.some(r => r.test(t))) {
    return {
      level: 'amplified',
      label: 'AI-Amplified',
      shortLabel: 'AI+',
      reason: 'This role gets dramatically better with AI tools. People in this track are building on top of AI — not being replaced by it.',
      color: '#34d399',
      bg: 'rgba(52,211,153,0.08)',
      border: 'rgba(52,211,153,0.2)',
    };
  }

  return {
    level: 'evolving',
    label: 'Evolving Role',
    shortLabel: 'Evolving',
    reason: "AI is changing this role. The skills that make you valuable here in 2026 are different from 2024. Build toward judgment and AI-tool fluency to stay ahead.",
    color: '#FF9F0A',
    bg: 'rgba(255,159,10,0.08)',
    border: 'rgba(255,159,10,0.2)',
  };
}
