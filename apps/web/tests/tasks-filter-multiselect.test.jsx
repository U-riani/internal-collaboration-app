// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterMultiSelect from "../src/components/FilterMultiSelect.jsx";

const people = [
  { value: "alice", label: "Alice Example" },
  { value: "bob", label: "Bob Example" },
  { value: "georgian", label: "ქეთევან მელაძე" },
];

function Harness({ options = people }) {
  const [values, setValues] = useState([]);
  return (
    <>
      <FilterMultiSelect
        label="Assigned to"
        options={options}
        values={values}
        onToggle={(value) =>
          setValues((previous) =>
            previous.includes(value)
              ? previous.filter((item) => item !== value)
              : [...previous, value],
          )
        }
      />
      <output data-testid="selected">{values.join(",")}</output>
      <button type="button" onClick={() => setValues([])}>Clear all</button>
    </>
  );
}

describe("searchable task filter multi-select", () => {
  it("keeps multiple selections without Ctrl/Cmd and clears them", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const alice = screen.getByRole("checkbox", { name: "Assigned to: Alice Example" });
    const bob = screen.getByRole("checkbox", { name: "Assigned to: Bob Example" });

    await user.click(alice);
    await user.click(bob);
    expect(alice.checked).toBe(true);
    expect(bob.checked).toBe(true);
    expect(screen.getByTestId("selected").textContent).toBe("alice,bob");

    await user.click(alice);
    expect(alice.checked).toBe(false);
    expect(bob.checked).toBe(true);

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(bob.checked).toBe(false);
    expect(screen.getByTestId("selected").textContent).toBe("");
  });

  it("searches locally without losing selections, including Georgian names", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("checkbox", { name: "Assigned to: Alice Example" }));

    const search = screen.getByRole("searchbox", { name: "Search assigned to" });
    await user.type(search, "ქეთევან");
    expect(screen.queryByRole("checkbox", { name: "Assigned to: Alice Example" })).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Assigned to: ქეთევან მელაძე" }));
    expect(screen.getByTestId("selected").textContent).toBe("alice,georgian");

    await user.clear(search);
    expect(screen.getByRole("checkbox", { name: "Assigned to: Alice Example" }).checked).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Assigned to: ქეთევან მელაძე" }).checked).toBe(true);

    await user.type(search, "no matching colleague");
    expect(screen.getByText("No matches found")).not.toBeNull();
  });
});
