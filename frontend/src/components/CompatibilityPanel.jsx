/** Shows the SERVER's compatibility report (Level 3 feature). */
export default function CompatibilityPanel({ report, compact = false }) {
  if (!report) return null;
  const { compatible, errors = [], warnings = [], estimatedWattage, recommendedPsuWatts } = report;
  if (compact && compatible && warnings.length === 0) return null;
  return (
    <section className={`compat ${compatible ? 'ok' : 'bad'}`} aria-label="Compatibility check">
      <h3>{compatible ? '✅ Parts are compatible' : '⚠️ Compatibility problems'}</h3>
      {errors.length > 0 && (
        <ul className="compat-list">
          {errors.map((e) => <li key={e.code + e.message} className="compat-error"><strong>{e.code.replace(/_/g, ' ')}</strong>: {e.message}</li>)}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="compat-list">
          {warnings.map((w) => <li key={w.code + w.message} className="compat-warning">{w.message}</li>)}
        </ul>
      )}
      {estimatedWattage && (
        <p className="small muted">Estimated draw ≈ {estimatedWattage} W · recommended PSU {recommendedPsuWatts} W</p>
      )}
    </section>
  );
}
