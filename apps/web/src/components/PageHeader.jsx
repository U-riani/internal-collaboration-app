import { Link } from "react-router-dom";
import { Table2 } from "lucide-react";

export default function PageHeader({ title, description, action }) {
  // const driveSpreadsheetAction =
  //   title === "Drive" ? (
  //     <Link to="/drive/sheets/new" className="btn-secondary">
  //       <Table2 size={17} />
  //       New spreadsheet
  //     </Link>
  //   ) : null;

  return (
    <div className="page-header sticky top-15 md:top-0 z-20 mb-3 overflow-hidden flex flex-row  items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="page-header-action flex flex-wrap justify-end items-center gap-2">
        {action}
      </div>
    </div>
  );
}
