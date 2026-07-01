"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useStackingWorkspace } from "../state/StackingWorkspaceContext";
import styles from "./BetaNoticeDialog.module.css";

const betaNoticeDismissedStorageKey = "stella-comp-beta-notice-dismissed";

export function BetaNoticeDialog() {
  const { copy } = useStackingWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [suppressFutureNotice, setSuppressFutureNotice] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    try {
      setIsOpen(window.localStorage.getItem(betaNoticeDismissedStorageKey) !== "true");
    } catch {
      setIsOpen(true);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      confirmButtonRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleConfirm = () => {
    if (suppressFutureNotice) {
      try {
        window.localStorage.setItem(betaNoticeDismissedStorageKey, "true");
      } catch {
        // Storage can be unavailable in private browsing or restricted contexts.
      }
    }

    setIsOpen(false);
  };

  return (
    <div className={styles.backdrop}>
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
      >
        <div className={styles.badge}>Beta</div>
        <h2 className={styles.title} id={titleId}>
          {copy.betaNotice.title}
        </h2>
        <p className={styles.body} id={descriptionId}>
          {copy.betaNotice.body}
        </p>

        <label className={styles.suppressionControl}>
          <input
            checked={suppressFutureNotice}
            onChange={(event) => setSuppressFutureNotice(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>{copy.betaNotice.suppressLabel}</span>
        </label>

        <div className={styles.actions}>
          <button
            className={styles.confirmButton}
            onClick={handleConfirm}
            ref={confirmButtonRef}
            type="button"
          >
            {copy.betaNotice.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}
