import type { ChangeEvent, DragEvent, KeyboardEvent, RefObject } from "react";
import {
  queueNoteText,
  queueStatusText,
  type Language,
  type UploadCopy,
} from "../i18n";
import type { QueueItem } from "../types";
import { formatBytes } from "../utils";

type UploadQueuePanelProps = {
  activeItem?: QueueItem;
  clearQueue: () => void;
  copy: UploadCopy;
  enqueueFiles: (fileList: FileList | null) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  items: QueueItem[];
  language: Language;
  onSelectFrames: () => void;
  setActiveId: (id: string) => void;
  setIsDragging: (isDragging: boolean) => void;
};

export function UploadQueuePanel({
  activeItem,
  clearQueue,
  copy,
  enqueueFiles,
  inputRef,
  isDragging,
  items,
  language,
  onSelectFrames,
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
    <section className="panel panel-upload">
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
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <p>{copy.upload.dropTitle}</p>
        <span>{copy.upload.dropDescription}</span>
      </div>
      <div className="table-list" role="table" aria-label={copy.upload.queuedImagesLabel}>
        {items.length === 0 ? (
          <div className="empty-state">{copy.upload.empty}</div>
        ) : (
          items.map((item) => (
            <button
              type="button"
              className={`table-row table-button${activeItem?.id === item.id ? " table-row-active" : ""}`}
              role="row"
              key={item.id}
              onClick={() => setActiveId(item.id)}
            >
              <div className="row-main">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="queue-thumb" src={item.previewUrl} alt="" />
                ) : (
                  <span className="queue-thumb queue-thumb-empty">{item.extension}</span>
                )}
                <div>
                  <p className="row-title">{item.name}</p>
                  <span className="row-meta">
                    {formatBytes(item.sourceSize)}
                    {item.previewSize ? `${copy.upload.sizeArrow}${formatBytes(item.previewSize)}` : ""}
                  </span>
                </div>
              </div>
              <div className="row-state">
                <span className={`pill pill-${item.status}`}>
                  {queueStatusText(item.status, language)}
                </span>
                <span className="row-meta">{queueNoteText(item.note, language)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
