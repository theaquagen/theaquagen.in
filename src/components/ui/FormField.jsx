export default function FormField({ label, error, children }) {
  return (
    <label className="block">
      <span className="block text-sm mb-1">{label}</span>
      {children}
      {error ? <span className="text-sm text-red-600">{error}</span> : null}
    </label>
  );
}