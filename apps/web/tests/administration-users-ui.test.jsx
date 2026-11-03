// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminPage from "../src/pages/AdminPage.jsx";
import { api } from "../src/lib/api.js";

vi.mock("../src/context/AuthContext.jsx", () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
vi.mock("../src/lib/api.js", () => ({
  api: vi.fn(),
  downloadFile: vi.fn(),
  fetchAvatarImage: vi.fn(),
}));

const employees = Array.from({ length: 9 }, (_, index) => {
  const name = "Employee " + String(index + 1).padStart(2, "0");
  return {
    id: "employee-" + (index + 1),
    displayName: name,
    firstName: "Employee",
    lastName: String(index + 1),
    email: "employee" + (index + 1) + "@example.com",
    phone: null,
    jobTitle: "Developer",
    departmentId: null,
    department: null,
    managerId: null,
    avatarUrl: null,
    roles: ["EMPLOYEE"],
    status: "ACTIVE",
  };
});

const managers = ["Alpha", "Beta"].map((name) => ({
  id: "manager-" + name.toLowerCase(),
  displayName: "Manager " + name,
  firstName: "Manager",
  lastName: name,
  email: name.toLowerCase() + "@example.com",
  phone: null,
  jobTitle: "Team lead",
  departmentId: null,
  department: null,
  managerId: null,
  avatarUrl: null,
  roles: ["MANAGER"],
  status: "ACTIVE",
}));

function renderAdmin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <AdminPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path === "/departments") return { data: [] };
    if (path === "/roles") return { data: [
      { code: "EMPLOYEE", name: "Employee" },
      { code: "MANAGER", name: "Manager" },
    ] };
    if (path.startsWith("/users/") && options?.method === "PATCH") {
      return { data: {} };
    }
    if (path.startsWith("/users")) {
      const query = new URL(path, "https://example.test").searchParams;
      const needle = (query.get("q") || "").toLowerCase();
      const role = query.get("role");
      const status = query.get("status");
      return {
        data: [...employees, ...managers].filter((person) =>
          (!needle || person.displayName.toLowerCase().includes(needle)) &&
          (!role || person.roles.includes(role)) &&
          (!status || person.status === status),
        ),
      };
    }
    throw new Error("Unexpected API request: " + path);
  });
});

describe("Administration Users redesign", () => {
  it("shows user cards with account status and navigates paginated directory results", async () => {
    const user = userEvent.setup();
    renderAdmin();

    expect(await screen.findByRole("button", { name: "Edit Employee 01" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Edit Employee 08" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Employee 09" })).toBeNull();
    expect(screen.getByText("Showing 1–8 of 11 directory accounts")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByRole("button", { name: "Edit Employee 09" })).not.toBeNull();
    expect(screen.getByText("Showing 9–11 of 11 directory accounts")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Next page" }).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await user.type(screen.getByRole("searchbox", { name: "Search users" }), "Employee 09");
    expect(await screen.findByRole("button", { name: "Edit Employee 09" })).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Edit Employee 01" })).toBeNull());
    expect(screen.getByText("Showing 1–1 of 1 directory accounts")).not.toBeNull();
  });

  it("keeps all directory filters visible and removes avatar presence indicators", async () => {
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByRole("button", { name: "Edit Employee 01" });

    expect(screen.getByRole("combobox", { name: "Filter users by department" })).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Filter users by role" })).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Filter users by status" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Filter" })).toBeNull();
    expect(document.querySelector(".admin-avatar-status")).toBeNull();

    await user.click(screen.getByRole("combobox", { name: "Filter users by role" }));
    await user.click(await screen.findByRole("option", { name: "Manager" }));
    expect(await screen.findByRole("button", { name: "Edit Manager Alpha" })).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Edit Employee 01" })).toBeNull());
  });

  it("reuses the task participant selector for a single Reports to manager", async () => {
    const user = userEvent.setup();
    renderAdmin();
    await user.click(await screen.findByRole("button", { name: "Edit Employee 01" }));

    const alpha = screen.getByRole("checkbox", { name: "Reports to: Manager Alpha" });
    const beta = screen.getByRole("checkbox", { name: "Reports to: Manager Beta" });
    expect(alpha.checked).toBe(false);
    await user.click(alpha);
    expect(alpha.checked).toBe(true);
    await user.click(beta);
    expect(alpha.checked).toBe(false);
    expect(beta.checked).toBe(true);

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith(
      "/users/employee-1",
      expect.objectContaining({ method: "PATCH" }),
    ));
    const editCall = vi.mocked(api).mock.calls.find(
      ([path, options]) => path === "/users/employee-1" && options?.method === "PATCH",
    );
    expect(JSON.parse(editCall[1].body).managerId).toBe("manager-beta");
  });
});
