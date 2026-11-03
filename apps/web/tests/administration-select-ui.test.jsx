// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import AppSelect from "../src/components/AppSelect.jsx";

const adminSource = readFileSync(
  new URL("../src/pages/AdminPage.jsx", import.meta.url),
  "utf8",
);
const adminStyles = readFileSync(
  new URL("../src/pages/administration-users.css", import.meta.url),
  "utf8",
);

function SelectHarness() {
  const [value, setValue] = useState("");
  return (
    <>
      <AppSelect
        ariaLabel="Department"
        value={value}
        onChange={setValue}
        options={[
          { value: "", label: "No department" },
          { value: "it", label: "Information Technology" },
          { value: "hr", label: "Human Resources" },
        ]}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("palette-aware Administration dropdowns", () => {
  it("selects options with pointer and closes on outside clicks", async () => {
    const user = userEvent.setup();
    render(<SelectHarness />);
    const trigger = screen.getByRole("combobox", { name: "Department" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await user.click(trigger);
    expect((await screen.findByRole("listbox", { name: "Department" })).getAttribute("role")).toBe("listbox");
    await user.click(screen.getByRole("option", { name: "Information Technology" }));
    expect(screen.getByTestId("value").textContent).toBe("it");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await user.click(trigger);
    await user.click(document.body);
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("false"));
  });

  it("supports arrow keys, Enter, Escape and active selection", async () => {
    const user = userEvent.setup();
    render(<SelectHarness />);
    const trigger = screen.getByRole("combobox", { name: "Department" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByTestId("value").textContent).toBe("it");

    await user.keyboard("{ArrowDown}{Escape}");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("removes native select popups, keeps header aligned and preserves theme tokens", () => {
    expect(adminSource).not.toContain("<select");
    expect(adminSource).toContain("<AppSelect");
    expect(adminSource).not.toContain('subtitle="Update directory information and account access"');
    expect(adminStyles).toContain(".admin-edit-modal .modal-head-copy");
    expect(adminStyles).toContain("text-align: left;");
    expect(adminStyles).toContain("border: 1px solid var(--app-interactive-focus) !important");
  });
});
