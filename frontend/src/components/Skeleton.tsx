import { C } from '../lib/colors';

function Block({ w, h, r }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div className="skeleton" style={{ width: w ?? '100%', height: h ?? 16, borderRadius: r ?? 6 }} />
  );
}

export function HeroPanelSkeleton() {
  return (
    <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: '32px 28px', boxShadow: C.s1 }}>
      <Block w={160} h={12} />
      <div style={{ marginTop: 16 }}><Block w={200} h={48} r={8} /></div>
    </div>
  );
}

export function SectorSkeleton() {
  return (
    <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', boxShadow: C.s1 }}>
      <div style={{ marginBottom: 16 }}><Block w={200} h={13} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 72px 50px', gap: 12, alignItems: 'center' }}>
            <Block w="48px" h={12} />
            <Block h={12} />
            <Block h={6} r={3} />
            <Block w="56px" h={12} />
            <Block w="36px" h={12} />
          </div>
        ))}
      </div>
    </div>
  );
}
