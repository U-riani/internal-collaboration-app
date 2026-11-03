// @vitest-environment jsdom
import React, { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterMultiSelect from "../src/components/FilterMultiSelect.jsx";
import { api, fetchAvatarImage } from "../src/lib/api.js";
import { clearAvatarImageCache } from "../src/lib/avatar-cache.js";

vi.mock("../src/lib/api.js", () => ({
  api: vi.fn(),
  downloadFile: vi.fn(),
  fetchAvatarImage: vi.fn(),
}));

const exampleUserId = "af46bebe-a963-4eb0-a54e-7e7f9792b31f";
const exampleAvatarUrl = "/api/v1/users/" + exampleUserId + "/avatar?v=0";

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

beforeEach(() => {
  vi.clearAllMocks();
  clearAvatarImageCache();
  vi.mocked(fetchAvatarImage).mockResolvedValue(new Blob(["test photo"], { type: "image/png" }));
  vi.mocked(api).mockResolvedValue({ data: { [exampleUserId]: exampleAvatarUrl } });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:task-avatar"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

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

  it("renders real photos in user rows and keeps the Unassigned option as an icon", async () => {
    const id = exampleUserId;
    const { container } = render(<Harness options={[
      { value: "unassigned", label: "Unassigned" },
      { value: id, label: "Alice Example", userId: id },
    ]} />);

    await waitFor(() => expect(container.querySelectorAll(".filter-multiselect-avatar .avatar-image")).toHaveLength(1));
    expect(api).toHaveBeenCalledWith("/users/avatars");
    expect(fetchAvatarImage).toHaveBeenCalledWith(exampleAvatarUrl);
    expect(screen.getByRole("checkbox", { name: "Assigned to: Alice Example" })).not.toBeNull();
    expect(screen.getByText("Unassigned").closest("label").querySelector(".filter-multiselect-icon svg")).not.toBeNull();
  });
});
