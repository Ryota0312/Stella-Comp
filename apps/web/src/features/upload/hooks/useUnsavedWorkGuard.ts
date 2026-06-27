import { useEffect } from "react";

type UseUnsavedWorkGuardOptions = {
  enabled: boolean;
  message: string;
};

export function useUnsavedWorkGuard({ enabled, message }: UseUnsavedWorkGuardOptions) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      if (!(event.target instanceof Element)) {
        return;
      }

      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (anchor.target && anchor.target.toLowerCase() !== "_self") {
        return;
      }

      if (anchor.hasAttribute("download")) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href === "#") {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.protocol === "blob:" || url.protocol === "data:") {
        return;
      }

      const current = new URL(window.location.href);
      const isSameDocumentHash =
        url.origin === current.origin &&
        url.pathname === current.pathname &&
        url.search === current.search &&
        url.hash !== current.hash;
      if (isSameDocumentHash) {
        return;
      }

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("click", handleDocumentClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleDocumentClick, { capture: true });
    };
  }, [enabled, message]);
}
