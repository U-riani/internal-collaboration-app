// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RoleManagement from "../src/components/RoleManagement.jsx";
import { api } from "../src/lib/api.js";

vi.mock("../src/context/AuthContext.jsx", () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
vi.mock("../src/lib/api.js", () => ({ api: vi.fn() }));

const permissionCatalog = [
  { id: "p1", code: "approvals.audit", description: "Read approval audit information" },
  { id: "p2", code: "drive.use", description: "Use shared files" },
  { id: "p3", code: "tasks.assign", description: "Assign tasks to colleagues" },
];
const mockedRoles = [
  { id: "auditor", code: "AUDITOR", name: "Auditor", description: "Audit records",
    permissions: [{ permission: { code: "approvals.audit" } }] },
  { id: "manager", code: "MANAGER", name: "Manager", description: "Team manager",
    permissions: [{ permission: { code: "drive.use" } }], createdAt: "2026-10-01T08:00:00Z" },
  { id: "admin", code: "SYSTEM_ADMIN", name: "System administrator", description: null,
    permissions: [] },
];

function renderRoles() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <RoleManagement />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path === "/roles" && options?.method === "POST") return { data: {} };
    if (path.startsWith("/roles/") && options?.method === "PATCH") return { data: {} };
    if (path === "/roles") return { data: mockedRoles };
    if (path === "/permissions") return { data: permissionCatalog };
    throw new Error("Unexpected request: " + path);
  });
});

describe("Administration Roles refresh", () => {
  it("filters role cards and preserves the protected administrator role", async () => {
    const user = userEvent.setup();
    renderRoles();
    const managerEdit = await screen.findByRole("button", { name: "Edit Manager" });
    expect(managerEdit.disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Edit System administrator" }).disabled).toBe(true);
    expect(screen.getByText(/cannot be downgraded/i)).not.toBeNull();

    const search = screen.getByRole("searchbox", { name: "Filter roles or permission codes" });
    await user.type(search, "audit records");
    expect(screen.getByRole("button", { name: "Edit Auditor" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Manager" })).toBeNull();
    await user.clear(search);
    await user.type(search, "drive.use");
    expect(screen.getByRole("button", { name: "Edit Manager" })).not.toBeNull();
  });

  it("creates a role with normalized code and selected permission codes", async () => {
    const user = userEvent.setup();
    renderRoles();
    const permissions = await screen.findByRole("region", { name: "Create role permissions" });
    await user.click(within(permissions).getByRole("button", { name: "Select all" }));
    expect(within(permissions).getAllByRole("checkbox").every((node) => node.checked)).toBe(true);
    await user.click(within(permissions).getByRole("button", { name: "Clear" }));
    expect(within(permissions).getAllByRole("checkbox").every((node) => !node.checked)).toBe(true);
    await user.click(within(permissions).getByRole("checkbox", { name: /drive.use/ }));
    await user.type(screen.getByLabelText("Role name"), "Quality inspector");
    await user.type(screen.getByLabelText("Role code"), "quality inspector");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    await waitFor(() => expect(api).toHaveBeenCalledWith("/roles", expect.objectContaining({ method: "POST" })));
    const request = vi.mocked(api).mock.calls.find(([path, options]) => path === "/roles" && options?.method === "POST");
    expect(JSON.parse(request[1].body)).toMatchObject({
      name: "Quality inspector", code: "QUALITY_INSPECTOR", permissionCodes: ["drive.use"],
    });
  });

  it("edits granular permissions locally and submits them only on Save changes", async () => {
    const user = userEvent.setup();
    renderRoles();
    await user.click(await screen.findByRole("button", { name: "Edit Manager" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Permissions matrix")).not.toBeNull();
    expect(within(dialog).getByDisplayValue("MANAGER").readOnly).toBe(true);

    const permissionSearch = within(dialog).getByRole("searchbox", { name: "Filter permissions" });
    await user.type(permissionSearch, "tasks");
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: "Select all" }));
    expect(vi.mocked(api).mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(0);
    await user.clear(permissionSearch);
    expect(within(dialog).getByRole("checkbox", { name: /tasks.assign/ }).checked).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api).toHaveBeenCalledWith("/roles/manager", expect.objectContaining({ method: "PATCH" })));
    const request = vi.mocked(api).mock.calls.find(([path, options]) => path === "/roles/manager" && options?.method === "PATCH");
    expect(JSON.parse(request[1].body)).toMatchObject({
      name: "Manager", permissionCodes: expect.arrayContaining(["drive.use", "tasks.assign"]),
    });
    expect(JSON.parse(request[1].body)).not.toHaveProperty("code");
  });
});
