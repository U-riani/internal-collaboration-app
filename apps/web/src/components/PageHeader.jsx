export default function PageHeader({ title, description, action }) {
  return (
    <div className="page-header sticky top-0 z-20 mb-3 flex flex-row  items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action && (
        <div className="page-header-action flex justify-end items-center">
          {action}
        </div>
      )}
    </div>
  );
}
