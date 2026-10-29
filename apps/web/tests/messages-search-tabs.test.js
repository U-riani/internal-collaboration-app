import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCENT_OPTIONS, THEME_OPTIONS } from "../src/lib/appearance.js";

const chat = readFileSync(new URL("../src/pages/ChatPage.jsx", import.meta.url), "utf8");
const shared = readFileSync(new URL("../src/pages/messages-theme.css", import.meta.url), "utf8");
const palettes = readFileSync(new URL("../src/appearance-palettes.css", import.meta.url), "utf8");
const light = readFileSync(new URL("../src/light-theme.css", import.meta.url), "utf8");

const scope = ".app-theme-dark .messages-page";
const genericHover = ".messages-page .chat-conversation > header .absolute.z-40 button:not(.chat-search-tab):hover";

describe("Messages search tabs: shared UI behavior across appearances", () => {
  it("keeps the same tab selection logic and accessible pressed state", () => {
    expect(chat).toContain('className="chat-search-tabs flex');
    expect(chat).toContain("aria-pressed={searchType === id}");
    expect(chat).toContain('className="chat-search-tab flex');
    expect(chat).toContain("onClick={() => setSearchType(id)}");
    expect(chat).toContain("CHAT_SEARCH_TABS.map(");
    expect(chat).not.toMatch(/chat-search-tab[^\n]*\$\{/);
  });

  it.each(THEME_OPTIONS.map(({ id }) => [id]))(
    "uses shared spacing, active, inactive-hover and keyboard-focus rules in %s",
    () => {
      expect(shared).toContain(`${scope} .chat-search-tabs {\n  gap: 6px;`);
      expect(shared).toContain(`${scope} .chat-search-tab[aria-pressed="true"],`);
      expect(shared).toContain(`${scope} .chat-search-tab[aria-pressed="true"]:hover {`);
      expect(shared).toContain(`${scope} .chat-search-tab[aria-pressed="false"]:hover {`);
      expect(shared).toContain(`${scope} .chat-search-tab:focus-visible {`);
      expect(shared).toContain("var(--app-ui-selection-start, var(--palette-selection, var(--app-accent-soft)))");
      expect(shared).toContain("var(--chat-search-hover-bg, var(--app-surface-hover))");
      expect(shared).toContain("color: var(--app-focus-ring);");
    },
  );

  it.each(ACCENT_OPTIONS.map(({ id }) => [id]))(
    "keeps selected tab styling driven by semantic accent tokens (%s)",
    () => {
      expect(shared).not.toContain("bg-blue-50 text-blue-700");
      expect(shared).toContain("var(--app-focus-ring)");
      expect(chat).not.toContain('searchType === id\n                                  ? "bg-blue-50');
    },
  );

  it("prevents generic popup hover from repainting an active search tab in every theme", () => {
    expect(shared).toContain(genericHover);
    expect(shared).not.toContain(".absolute.z-40 button:hover");
    expect(palettes).toContain(
      '.app-theme-dark:is([data-appearance="oled"], [data-appearance="slate"]) ' +
        genericHover,
    );
    expect(palettes).not.toContain(".absolute.z-40 button:hover");
    expect(light).toContain(
      '.app-theme-dark[data-appearance="light"] ' + genericHover,
    );
  });

  it("uses Light-specific surface tokens only; does not duplicate tab state logic", () => {
    expect(light).toContain(
      '.app-theme-dark[data-appearance="light"] .messages-page .chat-search-tabs {\n' +
        "  --chat-search-hover-bg: var(--app-surface-raised);",
    );
    expect(light).not.toContain(".chat-search-tab[aria-pressed=");
    expect(light).not.toContain(".chat-search-tab:focus-visible");
  });
});
