// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { SearchBar } from "../src/components/UI.jsx";

function SearchExample() {
  const [query, setQuery] = useState("");
  return (
    <SearchBar
      className="drive-member-search drive-permission-search"
      ariaLabel="Search people or departments"
      placeholder="Search people or departments"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
  );
}

describe("Drive permissions UI alignment", () => {
  it("uses the shared accessible SearchBar while preserving controlled typing", async () => {
    const user = userEvent.setup();
    const { container } = render(<SearchExample />);
    const search = screen.getByRole("searchbox", { name: "Search people or departments" });
    expect(search.getAttribute("placeholder")).toBe("Search people or departments");
    expect(container.querySelector(".drive-permission-search > svg")).not.toBeNull();
    await user.type(search, "finance");
    expect(search.value).toBe("finance");
  });

  it("reuses the same SearchBar in Drive, Members and Permissions without changing permissions text", () => {
    const page = readFileSync(new URL("../src/pages/DrivePage.jsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../src/pages/drive-personal.css", import.meta.url), "utf8");
    expect(page.split("<SearchBar").length - 1).toBe(3);
    expect(page).toContain('className="drive-member-search drive-permission-search min-w-52 flex-1"');
    expect(page).toContain('className="drive-member-search"');
    expect(page).toContain('className="drive-search-bar relative ml-auto w-full sm:w-64"');
    expect(page).toContain("Personal items stay private unless you explicitly share them.");
    expect(page).toContain("sharing is item-only by default.");
    expect(page).toContain("<strong>Restricted access.</strong>");
    expect(css).toContain(".drive-permission-note--personal");
    expect(css).toContain(".drive-permission-note--restricted");
    expect(css).toContain(".drive-permission-toolbar .drive-permission-search");
    expect(css).toContain("border-color: var(--app-ui-focus-ring, #7670dd)");
  });
});
