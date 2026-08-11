/** Tokens visuales compartidos entre torneos club y torneo oficial. */

export const torneoUi = {
  card: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
  } as const,
  text: '#0f172a',
  muted: '#64748b',
  hint: '#94a3b8',
  accent: '#4f46e5',
  accentLight: '#ede9fe',
  accentBorder: '#c4b5fd',
  success: '#16a34a',
  danger: '#dc2626',
  overlay: 'rgba(0,0,0,0.35)',
} as const

export const tabUnderline = (activo: boolean) => ({
  background: 'transparent',
  border: 'none',
  color: activo ? torneoUi.accent : torneoUi.muted,
  borderBottom: activo ? `2px solid ${torneoUi.accent}` : '2px solid transparent',
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
} as const)

export const btnPrimaryIndigo = {
  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '8px 14px',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
} as const

export const btnOutlineIndigo = {
  background: '#ffffff',
  color: '#3730a3',
  border: `1px solid ${torneoUi.accentBorder}`,
  borderRadius: 8,
  padding: '7px 14px',
  fontSize: 12,
  cursor: 'pointer',
} as const

export const modalOverlay = {
  position: 'fixed' as const,
  inset: 0,
  background: torneoUi.overlay,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: 16,
}
