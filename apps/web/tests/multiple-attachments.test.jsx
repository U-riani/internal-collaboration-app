// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectedFiles, useSelectedFiles } from "../src/components/SelectedFiles.jsx";

function Harness({ limit = 10 }) {
  const { files, addFiles, removeFile, clearFiles, selectionError } = useSelectedFiles(limit);
  return (
    <>
      <input type="file" multiple aria-label="Add attachments" onChange={addFiles} />
      <SelectedFiles files={files} onRemove={removeFile} />
      {selectionError && <div role="alert">{selectionError}</div>}
      <output data-testid="names">{files.map((file) => file.name).join(",")}</output>
      <button type="button" onClick={clearFiles}>Clear</button>
    </>
  );
}

describe("native multi-file attachment selection", () => {
  it("keeps several selections, removes an item and allows reselecting it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const picker = screen.getByLabelText("Add attachments");
    const first = new File(["a"], "first.txt", { type: "text/plain" });
    const second = new File(["b"], "second.txt", { type: "text/plain" });
    const third = new File(["c"], "third.txt", { type: "text/plain" });

    await user.upload(picker, [first, second]);
    expect(screen.getByTestId("names").textContent).toBe("first.txt,second.txt");
    await user.upload(picker, [third]);
    expect(screen.getByTestId("names").textContent).toBe("first.txt,second.txt,third.txt");

    await user.click(screen.getByRole("button", { name: "Remove second.txt" }));
    expect(screen.getByTestId("names").textContent).toBe("first.txt,third.txt");
    await user.upload(picker, [second]);
    expect(screen.getByTestId("names").textContent).toBe("first.txt,third.txt,second.txt");

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByTestId("names").textContent).toBe("");
  });

  it("enforces the ten-file backend limit without losing earlier selections", async () => {
    const user = userEvent.setup();
    render(<Harness limit={2} />);
    const picker = screen.getByLabelText("Add attachments");
    await user.upload(picker, [
      new File(["a"], "a.txt"),
      new File(["b"], "b.txt"),
    ]);
    await user.upload(picker, [new File(["c"], "c.txt")]);
    expect(screen.getByRole("alert").textContent).toContain("up to 2 files");
    expect(screen.getByTestId("names").textContent).toBe("a.txt,b.txt");
  });
});
