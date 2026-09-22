export default function PageHeader({ title, description, action }) {
  return (
    <div className="page-header sticky top-0 z-20 mb-3 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </div>
  );
}
