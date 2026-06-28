import type { ChangeEvent, DragEvent, KeyboardEvent, RefObject } from "react";
import {
  queueNoteText,
  queueStatusText,
  type Language,
  type UploadCopy,
} from "../i18n";
import type { AlignmentMethod, QueueItem, TransformModel } from "../types";

type UploadQueuePanelProps = {
  activeItem?: QueueItem;
  alignmentMethod: AlignmentMethod;
  transformModel: TransformModel;
  canStartPreview: boolean;
  clearQueue: () => void;
  copy: UploadCopy;
  enqueueFiles: (fileList: FileList | null) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  items: QueueItem[];
  language: Language;
  onSelectFrames: () => void;
  onStartPreview: () => void;
  setAlignmentMethod: (method: AlignmentMethod) => void;
  setTransformModel: (model: TransformModel) => void;
  setActiveId: (id: string) => void;
  setIsDragging: (isDragging: boolean) => void;
};

export function UploadQueuePanel({
  activeItem,
  alignmentMethod,
  transformModel,
  canStartPreview,
  clearQueue,
  copy,
  enqueueFiles,
  inputRef,
  isDragging,
  items,
  language,
  onSelectFrames,
  onStartPreview,
  setAlignmentMethod,
  setTransformModel,
  setActiveId,
  setIsDragging,
}: UploadQueuePanelProps) {
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
      onSelectFrames();
    }
  }

  return (
    <section
      className={`panel panel-upload${isDragging ? " panel-upload-dragging" : ""}`}
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
      <header className="panel-header">
        <div>
          <p className="panel-kicker">{copy.upload.kicker}</p>
          <h2>{copy.upload.title}</h2>
        </div>
        <div className="action-row">
          <button type="button" className="secondary-action" onClick={clearQueue}>
            {copy.upload.clear}
          </button>
          <button type="button" className="primary-action" onClick={onSelectFrames}>
            {copy.upload.selectFrames}
          </button>
        </div>
      </header>
      <input
        ref={inputRef}
        className="file-input"
        type="file"
        multiple
        accept=".cr2,.cr3,.dng,.nef,.arw,.raf,.orf,.rw2,.jpg,.jpeg,.png,.webp,.avif,.tif,.tiff,image/*"
        onChange={handleInputChange}
      />
      <div
        className={`dropzone${isDragging ? " dropzone-active" : ""}`}
        role="button"
        tabIndex={0}
        onClick={onSelectFrames}
        onKeyDown={handleDropzoneKeyDown}
      >
        <p>{copy.upload.dropTitle}</p>
        <span>{copy.upload.dropDescription}</span>
      </div>
      <div className="upload-controls">
        <label className="field upload-reference-control">
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
        <label className="field upload-method-control">
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
        <label className="field upload-method-control">
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
        <button
          type="button"
          className="primary-action step-forward-action"
          disabled={!canStartPreview}
          onClick={onStartPreview}
        >
          {copy.steps.startPreview}
        </button>
      </div>
      <div className="table-list" role="table" aria-label={copy.upload.queuedImagesLabel}>
        {items.length === 0 ? (
          <div className="empty-state">{copy.upload.empty}</div>
        ) : (
          items.map((item, index) => (
            <button
              type="button"
              className={`table-row table-button${activeItem?.id === item.id ? " table-row-active" : ""}`}
              role="row"
              key={item.id}
              onClick={() => setActiveId(item.id)}
            >
              <div className="row-main">
                <span className="queue-index">{index + 1}</span>
                <div>
                  <p className="row-title">{item.name}</p>
                </div>
              </div>
              <div className="row-state">
                <span className={`pill pill-${item.status}`}>
                  {queueStatusText(item.status, language)}
                </span>
                {shouldShowQueueNote(item) ? (
                  <span className="row-meta">{queueNoteText(item.note, language)}</span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function shouldShowQueueNote(item: QueueItem) {
  return !["queued", "ready", "uploading", "uploaded"].includes(item.status);
}
