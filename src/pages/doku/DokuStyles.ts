/**
 * Shared inline styles for GPANE Doku pages.
 * Using inline styles to avoid CSS file proliferation.
 */

export const colors = {
  bg: '#f8f9fb',
  bgCard: '#ffffff',
  bgCode: '#f1f3f5',
  bgHighlight: '#eef0ff',
  border: '#e2e5ea',
  borderActive: '#4f46e5',
  text: '#1e293b',
  textMuted: '#475569',
  textDim: '#94a3b8',
  accent: '#4f46e5',
  accentHover: '#6366f1',
  green: '#16a34a',
  greenDim: '#dcfce7',
  red: '#dc2626',
  redDim: '#fee2e2',
  orange: '#d97706',
  orangeDim: '#fef3c7',
  blue: '#2563eb',
  blueDim: '#dbeafe',
  purple: '#7c3aed',
  cyan: '#0891b2',
};

export const layout: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    height: '100vh',
    background: colors.bg,
    color: colors.text,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    fontSize: '13px',
  },
  sidebar: {
    width: '280px',
    minWidth: '280px',
    borderRight: `1px solid ${colors.border}`,
    overflowY: 'auto',
    padding: '20px 0',
    background: colors.bgCard,
  },
  main: {
    flex: 1,
    overflowY: 'auto',
    padding: '40px',
  },
  sidebarTitle: {
    padding: '0 20px 20px',
    fontSize: '18px',
    fontWeight: 700,
    color: colors.accent,
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: '10px',
  },
  sidebarGroup: {
    padding: '10px 20px 5px',
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
    color: colors.textDim,
    fontWeight: 600,
  },
};

export const card: Record<string, React.CSSProperties> = {
  container: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    marginBottom: '16px',
    color: colors.text,
  },
  subtitle: {
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '8px',
    color: colors.textMuted,
  },
};

export const table: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '12px',
  },
  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    borderBottom: `2px solid ${colors.border}`,
    color: colors.textMuted,
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  td: {
    padding: '8px 12px',
    borderBottom: `1px solid ${colors.border}`,
    verticalAlign: 'top' as const,
  },
};

export const badge = (color: string, bgColor: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 600,
  color,
  background: bgColor,
  marginRight: '4px',
});

export const button = (active = false): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: '6px',
  border: `1px solid ${active ? colors.borderActive : colors.border}`,
  background: active ? colors.bgHighlight : 'transparent',
  color: active ? colors.accent : colors.textMuted,
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500,
  fontFamily: 'inherit',
  transition: 'all 0.15s',
});

export const sidebarLink = (active = false): React.CSSProperties => ({
  display: 'block',
  padding: '6px 20px 6px 28px',
  fontSize: '12px',
  color: active ? colors.accent : colors.textMuted,
  background: active ? colors.bgHighlight : 'transparent',
  cursor: 'pointer',
  textDecoration: 'none',
  borderLeft: active ? `2px solid ${colors.accent}` : '2px solid transparent',
  fontWeight: active ? 600 : 400,
  transition: 'all 0.1s',
});

export const codeBlock: React.CSSProperties = {
  background: colors.bgCode,
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  padding: '12px 16px',
  fontSize: '12px',
  lineHeight: '1.6',
  overflowX: 'auto',
  fontFamily: "'JetBrains Mono', monospace",
  whiteSpace: 'pre',
  color: '#334155',
};

export const scoreBar = (value: number, maxValue = 1, color = colors.accent): React.CSSProperties => ({
  height: '6px',
  borderRadius: '3px',
  background: '#e2e5ea',
  position: 'relative' as const,
  overflow: 'hidden',
  width: '100%',
});

export const scoreBarFill = (value: number, maxValue = 1, color = colors.accent): React.CSSProperties => ({
  height: '100%',
  borderRadius: '3px',
  background: color,
  width: `${Math.min(100, (value / maxValue) * 100)}%`,
  transition: 'width 0.3s ease',
});
