import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FileDropzone from "../src/components/FileDropzone.jsx";

function Fixture(props) {
  const [files, setFiles] = useState([]);
  return <FileDropzone files={files} onChange={setFiles} label="Task attachments" {...props} />;
}

describe("FileDropzone", () => {
  it("selects multiple files and removes only the chosen file", () => {
    render(<Fixture />);
    const one = new File(["first"], "first.txt", { type: "text/plain" });
    const two = new File(["second"], "second.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Task attachments"), { target: { files: [one, two] } });
    expect(screen.getByText("first.txt")).toBeTruthy();
    expect(screen.getByText("second.txt")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove first.txt" }));
    expect(screen.queryByText("first.txt")).toBeNull();
    expect(screen.getByText("second.txt")).toBeTruthy();
  });

  it("accepts file drops and deduplicates repeated selections", () => {
    render(<Fixture />);
    const file = new File(["data"], "document.pdf", { type: "application/pdf" });
    const zone = screen.getByText(/choose files or drag & drop/).parentElement.parentElement;
    fireEvent.dragOver(zone, { dataTransfer: { types: ["Files"], dropEffect: "none" } });
    fireEvent.drop(zone, { dataTransfer: { types: ["Files"], files: [file, file] } });
    expect(screen.getAllByText("document.pdf")).toHaveLength(1);
  });

  it("hands dropped files to an immediate uploader", () => {
    const onFilesSelected = vi.fn();
    render(<FileDropzone label="Drive files" onFilesSelected={onFilesSelected} />);
    const file = new File(["data"], "budget.xlsx");
    const zone = screen.getByText(/choose files or drag & drop/).parentElement.parentElement;
    fireEvent.drop(zone, { dataTransfer: { types: ["Files"], files: [file] } });
    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });
});
