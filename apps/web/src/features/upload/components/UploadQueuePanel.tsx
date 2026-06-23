import type { ChangeEvent, DragEvent, KeyboardEvent, RefObject } from "react";
import type { QueueItem } from "../types";
import { formatBytes, statusLabel } from "../utils";

type UploadQueuePanelProps = {
  activeItem?: QueueItem;
  clearQueue: () => void;
  enqueueFiles: (fileList: FileList | null) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  items: QueueItem[];
  onSelectFrames: () => void;
  setActiveId: (id: string) => void;
  setIsDragging: (isDragging: boolean) => void;
};

export function UploadQueuePanel({
  activeItem,
  clearQueue,
  enqueueFiles,
  inputRef,
  isDragging,
  items,
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
          <p className="panel-kicker">Ingest</p>
          <h2>Upload Queue</h2>
        </div>
        <div className="action-row">
          <button type="button" className="secondary-action" onClick={clearQueue}>
            Clear
          </button>
          <button type="button" className="primary-action" onClick={onSelectFrames}>
            Select Frames
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
        <p>Drop RAW, JPEG, PNG, or WebP frames here</p>
        <span>Browser-readable images are converted to preview JPEGs.</span>
      </div>
      <div className="table-list" role="table" aria-label="Queued images">
        {items.length === 0 ? (
          <div className="empty-state">No frames selected</div>
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
                    {item.previewSize ? ` -> ${formatBytes(item.previewSize)}` : ""}
                  </span>
                </div>
              </div>
              <div className="row-state">
                <span className={`pill pill-${item.status}`}>{statusLabel(item.status)}</span>
                <span className="row-meta">{item.note}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
