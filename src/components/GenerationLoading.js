export default function GenerationLoading({ label = 'Generating your design' }) {
  return <div className="generation-loading" role="status" aria-live="polite" aria-label={label}>
    <div className="generation-loading__dots" aria-hidden="true" />
    <img src="/Syncraft Logo-14.svg" alt="" className="generation-loading__logo" />
  </div>;
}
