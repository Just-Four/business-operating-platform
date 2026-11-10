export default function Notice({ error, saved }: { error?: string; saved?: string }) {
  if (error) return <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>;
  if (saved) return <p className="mb-4 rounded bg-green-50 p-3 text-sm text-green-800">Saved.</p>;
  return null;
}
