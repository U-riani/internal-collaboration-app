import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import "./AppSelect.css";

/**
 * Palette-aware single select. The menu is rendered next to the surrounding
 * dialog (or the workspace shell), avoiding clipping by scrolling form panels.
 * Keep the same controlled value/onChange contract as a native <select>.
 */
export default function AppSelect({
  value = "",
  onChange,
  options = [],
  ariaLabel,
  placeholder = "Select...",
  icon: Icon,
  className = "",
  disabled = false,
}) {
  const id = useId();
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [host, setHost] = useState(null);
  const [menuStyle, setMenuStyle] = useState({});
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex < 0 ? null : options[selectedIndex];

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return undefined;
    const root = rootRef.current;
    const container = root.closest("dialog") || root.closest(".app-theme-dark") || document.body;
    setHost(container);

    const placeMenu = () => {
      const trigger = root.getBoundingClientRect();
      const bounds = container.tagName === "DIALOG"
        ? container.getBoundingClientRect()
        : null;
      const topLimit = bounds ? Math.max(bounds.top + 10, 8) : 8;
      const bottomLimit = bounds
        ? Math.min(bounds.bottom - 10, window.innerHeight - 8)
        : window.innerHeight - 8;
      const desiredHeight = Math.min(240, Math.max(50, options.length * 40 + 10));
      const below = Math.max(0, bottomLimit - trigger.bottom - 5);
      const above = Math.max(0, trigger.top - topLimit - 5);
      const upward = below < desiredHeight && above > below;
      const height = Math.min(desiredHeight, Math.max(60, upward ? above : below));
      const top = upward ? trigger.top - height - 5 : trigger.bottom + 5;
      const left = Math.max(8, Math.min(trigger.left, window.innerWidth - trigger.width - 8));
      setMenuStyle({
        position: bounds ? "absolute" : "fixed",
        // dialog is a scroll container. Absolute coordinates must include its
        // scroll offsets, otherwise the popup moves twice as far as its anchor.
        top: (bounds ? top - bounds.top + container.scrollTop : top) + "px",
        left: (bounds ? left - bounds.left + container.scrollLeft : left) + "px",
        width: trigger.width + "px",
        maxHeight: height + "px",
      });
    };

    const handleOutside = (event) => {
      if (!root.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    placeMenu();
    const handleScroll = (event) => {
      // Scrolling options must not trigger repositioning of their own menu.
      if (menuRef.current?.contains(event.target)) return;
      placeMenu();
    };
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", placeMenu);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", placeMenu);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const active = menu?.querySelector("[data-active='true']");
    if (!active) return;
    // Scroll only the options panel. scrollIntoView() also scrolls the modal
    // and is responsible for unwanted jumps when moving through options.
    const menuBounds = menu.getBoundingClientRect();
    const itemBounds = active.getBoundingClientRect();
    if (itemBounds.top < menuBounds.top) {
      menu.scrollTop -= menuBounds.top - itemBounds.top;
    } else if (itemBounds.bottom > menuBounds.bottom) {
      menu.scrollTop += itemBounds.bottom - menuBounds.bottom;
    }
  }, [open, activeIndex, host]);

  const choose = (option) => {
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (disabled) return;
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
        return;
      }
      setActiveIndex((index) => {
        if (event.key === "Home") return 0;
        if (event.key === "End") return Math.max(0, options.length - 1);
        return (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
          (options.length || 1);
      });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(options[activeIndex]);
      else {
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
      }
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const found = options.findIndex((option) =>
        option.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()),
      );
      if (found >= 0) {
        setActiveIndex(found);
        if (!open) setOpen(true);
      }
    }
  };

  return (
    <div className={["app-select", className].filter(Boolean).join(" ")} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? id + "-option-" + activeIndex : undefined}
        className={"app-select-trigger " + (open ? "is-open" : "")}
        disabled={disabled}
        onClick={() => {
          if (!open) setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
          setOpen((previous) => !previous);
        }}
        onKeyDown={handleKeyDown}
      >
        {Icon && <Icon size={15} className="app-select-leading" aria-hidden="true" />}
        <span className={"app-select-value " + (!selected ? "is-placeholder" : "")}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={15} className="app-select-chevron" aria-hidden="true" />
      </button>
      {open && host && createPortal(
        <div
          ref={menuRef}
          id={id}
          role="listbox"
          aria-label={ariaLabel}
          className="app-select-menu"
          style={menuStyle}
          onKeyDown={handleKeyDown}
        >
          {options.length ? options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              id={id + "-option-" + index}
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              data-active={index === activeIndex ? "true" : undefined}
              disabled={option.disabled}
              className={[
                "app-select-option",
                index === activeIndex ? "is-active" : "",
                option.value === value ? "is-selected" : "",
              ].filter(Boolean).join(" ")}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} aria-hidden="true" />}
            </button>
          )) : <span className="app-select-empty">No options available</span>}
        </div>,
        host,
      )}
    </div>
  );
}
