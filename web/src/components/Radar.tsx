// Ukrasni radar u zaglavlju početne stranice (aria-hidden). Točke su primjeri tri ishoda semafora, s tekstom uz boju.
export function Radar() {
  return (
    <div className="radar-wrap" aria-hidden="true">
      <div className="radar">
        <svg viewBox="0 0 400 400">
          {[60, 120, 180].map((r) => (
            <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="rgba(160,190,230,0.22)" strokeWidth="1" />
          ))}
          <line x1="200" y1="10" x2="200" y2="390" stroke="rgba(160,190,230,0.16)" />
          <line x1="10" y1="200" x2="390" y2="200" stroke="rgba(160,190,230,0.16)" />
          <circle cx="200" cy="200" r="3" fill="rgba(200,220,255,0.8)" />
        </svg>
        <div className="sweep" />
        <span className="blip n" style={{ left: "66%", top: "30%" }} />
        <span className="blip z" style={{ left: "30%", top: "62%" }} />
        <span className="blip r" style={{ left: "40%", top: "34%" }} />
        <span className="blip r" style={{ left: "72%", top: "64%" }} />
        <span className="blip r" style={{ left: "56%", top: "78%" }} />
        <span className="blip r" style={{ left: "22%", top: "42%" }} />
      </div>
      <span className="radar-oznaka" style={{ left: "60%", top: "17%" }}>
        ▼ Nedostaje
      </span>
      <span className="radar-oznaka" style={{ left: "6%", top: "70%" }}>
        ▲ Zasićeno
      </span>
      <span className="radar-oznaka" style={{ left: "52%", top: "86%" }}>
        ● U ravnoteži
      </span>
    </div>
  );
}
