import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { queueNoteText, queueStatusText } from "../model/i18n";
import type { AlignmentMethod, QueueItem, TransformModel } from "../model/types";
import { classNames } from "../model/utils";
import { useStackingWorkspace } from "../state/StackingWorkspaceContext";
import workspaceStyles from "../StackingWorkspace.module.css";
import sharedStyles from "./shared.module.css";
import styles from "./UploadQueuePanel.module.css";

export function UploadQueuePanel() {
  const {
    activeItem,
    alignmentMethod,
    canStartPreview,
    clearQueue,
    copy,
    enqueueFiles,
    handleSelectFrames,
    inputRef,
    isDragging,
    items,
    language,
    setActiveId,
    setAlignmentMethod,
    setIsDragging,
    setTransformModel,
    startPreview,
    transformModel,
  } = useStackingWorkspace();

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    enqueueFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    enqueueFiles(event.dataTransfer.files);
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSelectFrames();
    }
  }

  return (
    <section
      className={classNames(
        sharedStyles.panel,
        workspaceStyles["panel-upload"],
        styles["panel-upload"],
        isDragging && styles["panel-upload-dragging"],
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      <header className={sharedStyles["panel-header"]}>
        <div>
          <p className={sharedStyles["panel-kicker"]}>{copy.upload.kicker}</p>
          <h2>{copy.upload.title}</h2>
        </div>
        <div className={styles["action-row"]}>
          {items.length > 0 ? (
            <button type="button" className={sharedStyles["primary-action"]} onClick={handleSelectFrames}>
              {copy.upload.selectFrames}
            </button>
          ) : null}
          <button type="button" className={sharedStyles["secondary-action"]} onClick={clearQueue}>
            {copy.upload.clear}
          </button>
        </div>
      </header>
      <input
        ref={inputRef}
        className={styles["file-input"]}
        type="file"
        multiple
        accept=".cr2,.cr3,.dng,.nef,.arw,.raf,.orf,.rw2,.jpg,.jpeg,.png,.webp,.avif,.tif,.tiff,image/*"
        onChange={handleInputChange}
      />
      {items.length === 0 ? (
        <div
          className={classNames(styles.dropzone, isDragging && styles["dropzone-active"])}
          role="button"
          tabIndex={0}
          onClick={handleSelectFrames}
          onKeyDown={handleDropzoneKeyDown}
        >
          <p>{copy.upload.dropTitle}</p>
          <span>{copy.upload.dropDescription}</span>
        </div>
      ) : null}
      <div className={styles["upload-controls"]}>
        <label className={classNames(sharedStyles.field, styles["upload-reference-control"])}>
          <span>{copy.upload.referenceFrame}</span>
          <select value={activeItem?.id ?? ""} onChange={(event) => setActiveId(event.target.value)}>
            <option value="" disabled>
              {copy.upload.selectReference}
            </option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className={classNames(sharedStyles.field, styles["upload-method-control"])}>
          <span>{copy.execution.alignmentMethod}</span>
          <select
            value={alignmentMethod}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setAlignmentMethod(event.currentTarget.value as AlignmentMethod)
            }
          >
            <option value="stars">{copy.execution.alignmentMethods.stars}</option>
            <option value="akaze">{copy.execution.alignmentMethods.akaze}</option>
          </select>
        </label>
        <label className={classNames(sharedStyles.field, styles["upload-method-control"])}>
          <span>{copy.execution.transformModel}</span>
          <select
            value={transformModel}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setTransformModel(event.currentTarget.value as TransformModel)
            }
          >
            <option value="affine">{copy.execution.transformModels.affine}</option>
            <option value="homography">{copy.execution.transformModels.homography}</option>
          </select>
        </label>
      </div>
      <div className={styles["table-list"]} role="table" aria-label={copy.upload.queuedImagesLabel}>
        {items.length === 0 ? (
          <div className={styles["empty-state"]}>{copy.upload.empty}</div>
        ) : (
          items.map((item, index) => (
            <button
              type="button"
              className={classNames(
                styles["table-row"],
                styles["table-button"],
                activeItem?.id === item.id && styles["table-row-active"],
              )}
              role="row"
              key={item.id}
              onClick={() => setActiveId(item.id)}
            >
              <div className={styles["row-main"]}>
                <span className={styles["queue-index"]}>{index + 1}</span>
                <div>
                  <p className={styles["row-title"]}>{item.name}</p>
                </div>
              </div>
              <div className={styles["row-state"]}>
                <span
                  className={classNames(
                    styles.pill,
                    styles[`pill-${item.status}`],
                  )}
                >
                  {queueStatusText(item.status, language)}
                </span>
                {shouldShowQueueNote(item) ? (
                  <span className={styles["row-meta"]}>{queueNoteText(item.note, language)}</span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
      <div className={sharedStyles["panel-step-actions"]}>
        <button
          type="button"
          className={classNames(sharedStyles["primary-action"], sharedStyles["step-forward-action"])}
          disabled={!canStartPreview}
          onClick={startPreview}
        >
          {copy.steps.startPreview}
        </button>
      </div>
    </section>
  );
}

function shouldShowQueueNote(item: QueueItem) {
  return !["queued", "ready", "uploading", "uploaded"].includes(item.status);
}
