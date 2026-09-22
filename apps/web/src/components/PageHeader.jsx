export default function PageHeader({ title, description, action }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-4 sticky top-0 z-10 bg-white px-4 py-3 border-b border-slate-200">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}
