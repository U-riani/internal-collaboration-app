import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chat = readFileSync(new URL("../src/pages/ChatPage.jsx", import.meta.url), "utf8");
const light = readFileSync(new URL("../src/light-theme.css", import.meta.url), "utf8");
const dark = readFileSync(new URL("../src/pages/messages-theme.css", import.meta.url), "utf8");

const scope = '.app-theme-dark[data-appearance="light"] .messages-page';

describe("Messages conversation search tabs in Light Theme", () => {
  it("exposes accessible active states without changing tab selection logic", () => {
    expect(chat).toContain('className="chat-search-tabs flex');
    expect(chat).toContain("aria-pressed={searchType === id}");
    expect(chat).toContain("chat-search-tab flex");
    expect(chat).toContain("onClick={() => setSearchType(id)}");
    expect(chat).toContain('const CHAT_SEARCH_TABS = [');
  });

  it("keeps active and adjacent hover states distinct with light-only spacing", () => {
    expect(light).toContain(`${scope} .chat-search-tabs {\n  gap: 6px;`);
    expect(light).toContain(`${scope} .chat-search-tab[aria-pressed="true"]:hover {`);
    expect(light).toContain("background: var(--app-ui-selection-start);");
    expect(light).toContain("color: var(--app-focus-ring);");
    expect(light).toContain(`${scope} .chat-search-tab[aria-pressed="false"]:hover {`);
    expect(light).toContain("background: var(--app-surface-raised);");
  });

  it("does not let a generic popup hover overwrite the selected tab", () => {
    expect(light).toContain(
      `${scope} .chat-conversation > header .absolute.z-40 button:not(.chat-search-tab):hover {`,
    );
    expect(light).not.toContain(
      `${scope} .chat-conversation > header .absolute.z-40 button:hover {`,
    );
    expect(light).toContain(`${scope} .chat-search-tab:focus-visible {`);
  });

  it("keeps the legacy dark popup rule outside the Light-only override", () => {
    expect(dark).toContain(
      ".messages-page .chat-conversation > header .absolute.z-40 button:hover",
    );
    expect(dark).not.toContain(".chat-search-tab");
  });
});
