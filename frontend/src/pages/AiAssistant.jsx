import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AiApi } from '../api/endpoints';
import { useNetwork } from '../context/NetworkStatusContext';
import CompatibilityPanel from '../components/CompatibilityPanel';
import { AiBadge, ErrorAlert, OfflineHint } from '../components/ui';
import { formatPHP } from '../utils/currency';

const MAX = 500;
const EXAMPLES = [
  '1440p gaming PC around ₱70k, prefer AMD',
  'Budget school + light editing build under ₱40,000',
  'Small mATX build for a Baguio dorm, quiet, ₱55k',
];

function ProductRow({ p, reason, slot }) {
  // Name, price and stock come from the database record returned by the API – never from AI text.
  return (
    <li className="pick">
      <img src={p.imageUrl || '/images/accessory.webp'} alt="" width="72" height="54" loading="lazy" />
      <div className="grow">
        {slot && <p className="eyebrow">{slot}</p>}
        <Link to={`/products/${p.id}`} className="pick-name">{p.name}</Link>
        <p className="small"><strong>{formatPHP(p.priceCents)}</strong> · {p.stock} in stock</p>
        {reason && <p className="small muted">{reason}</p>}
      </div>
    </li>
  );
}

export default function AiAssistant() {
  const { online } = useNetwork();
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);
  const [fallback, setFallback] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const text = prompt.trim();
    if (text.length < 5) { setFormError('Describe what you need (at least 5 characters).'); return; }
    setFormError(''); setBusy(true); setError(null); setFallback(null); setResult(null);
    try {
      const { data } = await AiApi.buildAdvisor({ prompt: text });
      setResult(data);
    } catch (err) {
      setError(err);
      if (err.code === 'AI_UNAVAILABLE') setFallback(err.details?.fallback?.products || []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1>AI Build Advisor</h1>
      <p className="muted">Describe your use and budget. Suggestions are picked only from parts we actually have in stock.</p>

      <form onSubmit={submit} className="stack" noValidate>
        <div className={`field ${formError ? 'has-error' : ''}`}>
          <label htmlFor="ai-prompt">What do you want to build?</label>
          <textarea id="ai-prompt" rows={4} maxLength={MAX} value={prompt} placeholder="e.g. Valorant + streaming PC, ₱60k budget"
            aria-describedby="ai-count" onChange={(e) => setPrompt(e.target.value)} />
          <p id="ai-count" className="hint">{prompt.length}/{MAX} characters</p>
          {formError && <p className="field-error" role="alert">{formError}</p>}
        </div>
        <div className="chips-scroll" role="group" aria-label="Example prompts">
          {EXAMPLES.map((x) => <button type="button" key={x} className="chip" onClick={() => setPrompt(x)}>{x}</button>)}
        </div>
        <button type="submit" className="btn btn-block" disabled={busy || !online}>{busy ? 'Thinking…' : '✨ Get recommendations'}</button>
        <OfflineHint online={online} action="the AI advisor" />
      </form>

      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}

      {fallback && (
        <section aria-labelledby="fb-h" className="card">
          <h2 id="fb-h">Keyword search results</h2>
          {fallback.length === 0 ? <p className="muted">No matching parts – try <Link to="/products">browsing the shop</Link>.</p>
            : <ul className="picks">{fallback.map((p) => <ProductRow key={p.id} p={p} />)}</ul>}
        </section>
      )}

      {result && (
        <section aria-labelledby="ai-h" className="card ai-result" aria-live="polite">
          <div className="row between">
            <h2 id="ai-h">Suggested build</h2>
            <AiBadge />
          </div>
          {/* Rendered as plain text – React escapes it; no dangerouslySetInnerHTML anywhere */}
          <p>{result.summary}</p>
          {result.warnings?.length > 0 && <ul className="small">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          {result.picks.length > 0 ? (
            <>
              <ul className="picks">{result.picks.map((x) => <ProductRow key={x.product.id} p={x.product} reason={x.reason} slot={x.slot} />)}</ul>
              <p className="total-line">Total (from store prices): <strong>{formatPHP(result.totalCents)}</strong>
                {result.budgetCents && <span className={result.withinBudget ? 'ok-text' : 'warn-text'}> · budget {formatPHP(result.budgetCents)}</span>}
              </p>
              <CompatibilityPanel report={result.compatibility} />
            </>
          ) : (
            result.fallbackProducts?.length > 0 && <ul className="picks">{result.fallbackProducts.map((p) => <ProductRow key={p.id} p={p} />)}</ul>
          )}
          <p className="small muted">AI-assisted suggestion ({result.provider}). Always confirm specs before buying. Prices and stock shown are live store data.</p>
        </section>
      )}
    </div>
  );
}
