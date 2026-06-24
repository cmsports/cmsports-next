export default function Loading() {
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200, margin: '0 auto' }}>
        <div className="cms-skeleton" style={{ width: 180, height: 24, borderRadius: 6, background: '#e2e8f0' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="cms-skeleton" style={{ height: 100, borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0' }} />
          ))}
        </div>
        <div className="cms-skeleton" style={{ height: 280, borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0' }} />
      </div>
      <style>{`
        .cms-skeleton { animation: cmsSkeletonPulse 1.4s ease-in-out infinite; }
        @keyframes cmsSkeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  )
}
