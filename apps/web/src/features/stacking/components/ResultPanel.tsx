import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type {
  ClientCompositeStatus,
  CompositeProgress,
  RawCompositeStatus,
  SourceExportFormat,
} from "../model/types";
import {
  clientCompositeStatusText,
  rawCompositeStatusText,
  type Language,
  type UploadCopy,
} from "../model/i18n";
import { classNames } from "../model/utils";
import { useStackingWorkspace } from "../state/StackingWorkspaceContext";
import workspaceStyles from "../StackingWorkspace.module.css";
import sharedStyles from "./shared.module.css";
import styles from "./ResultPanel.module.css";

type ViewMode = "composite" | "reference" | "sideBySide";
type ResultPhase = "preview" | "source";

type ImageSize = {
  width: number;
  height: number;
};

type InspectPoint = {
  xRatio: number;
  yRatio: number;
  panelX: number;
  panelY: number;
  panelWidth: number;
  panelHeight: number;
};

type InspectorPosition = {
  left: number;
  top: number;
};

type ResultPanelProps = {
  phase: ResultPhase;
};

export function ResultPanel({ phase }: ResultPanelProps) {
  const {
    clientCompositeStatus,
    copy,
    language,
    rawCompositeProgress,
    rawCompositeStatus,
    referencePreviewUrl,
    resultDownloadFileName,
    resultDownloadUrl,
    resultLabel,
    resultPreviewUrl,
  } = useStackingWorkspace();
  const [viewMode, setViewMode] = useState<ViewMode>("composite");
  const [inspectPoint, setInspectPoint] = useState<InspectPoint | null>(null);
  const [compositeSize, setCompositeSize] = useState<ImageSize | null>(null);
  const [referenceSize, setReferenceSize] = useState<ImageSize | null>(null);
  const downloadFileName = resultDownloadFileName;
  const downloadUrl = resultDownloadUrl;
  const previewUrl = resultPreviewUrl;
  const hasPreview = Boolean(previewUrl);
  const hasDownload = Boolean(downloadUrl);
  const hasReference = Boolean(referencePreviewUrl);
  const isSourcePhase = phase === "source";
  const canInspect = Boolean(hasPreview && hasReference && compositeSize && referenceSize);
  const inspectorPosition = inspectPoint ? inspectorPositionForPoint(inspectPoint) : null;
  const processingOverlay = processingOverlayForState({
    clientCompositeStatus,
    copy,
    language,
    phase,
    rawCompositeProgress,
    rawCompositeStatus,
  });

  useEffect(() => {
    if (!hasReference && viewMode !== "composite") {
      setViewMode("composite");
    }
  }, [hasReference, viewMode]);

  useEffect(() => {
    setInspectPoint(null);
  }, [previewUrl, referencePreviewUrl, viewMode]);

  useEffect(() => {
    setCompositeSize(null);
    if (!previewUrl) {
      return;
    }

    return loadImageSize(previewUrl, setCompositeSize);
  }, [previewUrl]);

  useEffect(() => {
    setReferenceSize(null);
    if (!referencePreviewUrl) {
      return;
    }

    return loadImageSize(referencePreviewUrl, setReferenceSize);
  }, [referencePreviewUrl]);

  const modeOptions = useMemo(
    () =>
      [
        { mode: "composite" as const, label: copy.result.viewComposite },
        { mode: "reference" as const, label: copy.result.viewReference },
        { mode: "sideBySide" as const, label: copy.result.viewSideBySide },
      ],
    [copy],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>, size: ImageSize | null) => {
      if (!canInspect || !size) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const fitted = containedImageRect(rect.width, rect.height, size.width, size.height);
      const localX = event.clientX - rect.left - fitted.left;
      const localY = event.clientY - rect.top - fitted.top;

      if (localX < 0 || localY < 0 || localX > fitted.width || localY > fitted.height) {
        setInspectPoint(null);
        return;
      }

      setInspectPoint({
        xRatio: fitted.width > 0 ? localX / fitted.width : 0,
        yRatio: fitted.height > 0 ? localY / fitted.height : 0,
        ...pointerPositionInViewer(event),
      });
    },
    [canInspect],
  );

  const inspectCoordinate = inspectPoint
    ? `${Math.round(inspectPoint.xRatio * 100)}%, ${Math.round(inspectPoint.yRatio * 100)}%`
    : copy.result.inspectUnavailable;

  return (
    <section className={classNames(sharedStyles.panel, workspaceStyles["panel-results"], styles["panel-results"])}>
      <header className={sharedStyles["panel-header"]}>
        <div>
          <p className={sharedStyles["panel-kicker"]}>{copy.result.kicker}</p>
          <h2>{copy.result.title}</h2>
        </div>
        <div className={styles["result-header-controls"]}>
          <div className={styles["result-view-toggle"]} aria-label={copy.result.viewModeLabel}>
            {modeOptions.map((option) => (
              <button
                type="button"
                key={option.mode}
                className={classNames(
                  styles["result-view-option"],
                  viewMode === option.mode && styles["result-view-option-active"],
                )}
                disabled={!hasReference && option.mode !== "composite"}
                onClick={() => setViewMode(option.mode)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <ResultActions
            compact={!isSourcePhase}
            copy={copy}
            downloadFileName={downloadFileName}
            downloadUrl={downloadUrl}
            hasDownload={hasDownload}
            hasPreview={hasPreview}
            previewUrl={previewUrl}
            resultLabel={resultLabel}
          />
        </div>
      </header>
      <div className={styles["result-preview"]}>
        {previewUrl ? (
          <div
            className={classNames(
              styles["result-viewer"],
              styles[`result-viewer-${viewMode}`],
              processingOverlay && styles["result-viewer-processing"],
            )}
            onPointerLeave={() => setInspectPoint(null)}
          >
            {viewMode === "reference" ? (
              <ImageFrame
                alt={copy.result.referenceAlt}
                label={copy.result.viewReference}
                showLabel={false}
                onLoadSize={setReferenceSize}
                onPointerMove={(event) => handlePointerMove(event, referenceSize)}
                src={referencePreviewUrl}
              />
            ) : null}
            {viewMode === "composite" ? (
              <ImageFrame
                alt={copy.result.compositeAlt}
                label={copy.result.viewComposite}
                showLabel={false}
                onLoadSize={setCompositeSize}
                onPointerMove={(event) => handlePointerMove(event, compositeSize)}
                src={previewUrl}
              />
            ) : null}
            {viewMode === "sideBySide" ? (
              <div className={styles["result-compare-grid"]}>
                <ImageFrame
                  alt={copy.result.referenceAlt}
                  label={copy.result.viewReference}
                  showLabel
                  onLoadSize={setReferenceSize}
                  onPointerMove={(event) => handlePointerMove(event, referenceSize)}
                  src={referencePreviewUrl}
                />
                <ImageFrame
                  alt={copy.result.compositeAlt}
                  label={copy.result.viewComposite}
                  showLabel
                  onLoadSize={setCompositeSize}
                  onPointerMove={(event) => handlePointerMove(event, compositeSize)}
                  src={previewUrl}
                />
              </div>
            ) : null}
            {canInspect && inspectPoint ? (
              <div
                className={styles["pixel-inspector"]}
                style={inspectorPosition ?? undefined}
                aria-label={copy.result.pixelInspectTitle}
              >
                <div className={styles["pixel-inspector-header"]}>
                  <span>{copy.result.pixelInspectTitle}</span>
                  <strong>{inspectCoordinate}</strong>
                </div>
                <div className={styles["pixel-inspector-grid"]}>
                  <PixelCrop
                    label={copy.result.viewReference}
                    point={inspectPoint}
                    scaleSize={referenceSize}
                    size={referenceSize}
                    src={referencePreviewUrl}
                  />
                  <PixelCrop
                    label={copy.result.viewComposite}
                    point={inspectPoint}
                    scaleSize={referenceSize}
                    size={compositeSize}
                    src={previewUrl}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <span>{clientCompositeStatusText(clientCompositeStatus, language)}</span>
        )}
        {processingOverlay ? <ProcessingOverlay overlay={processingOverlay} /> : null}
      </div>
    </section>
  );
}

type ProcessingOverlayState = {
  detail: string | null;
  progress: CompositeProgress | null;
  title: string;
};

function processingOverlayForState({
  clientCompositeStatus,
  copy,
  language,
  phase,
  rawCompositeProgress,
  rawCompositeStatus,
}: {
  clientCompositeStatus: ClientCompositeStatus;
  copy: UploadCopy;
  language: Language;
  phase: ResultPhase;
  rawCompositeProgress: CompositeProgress | null;
  rawCompositeStatus: RawCompositeStatus;
}): ProcessingOverlayState | null {
  if (
    phase === "preview" &&
    (clientCompositeStatus === "uploading" ||
      clientCompositeStatus === "estimating" ||
      clientCompositeStatus === "stacking")
  ) {
    return {
      detail: copy.result.processingPreviewDetail,
      progress: null,
      title: clientCompositeStatusText(clientCompositeStatus, language),
    };
  }

  if (
    phase === "source" &&
    (rawCompositeStatus === "developing" || rawCompositeStatus === "stacking")
  ) {
    return {
      detail: rawCompositeProgress?.label ?? copy.result.processingSourceDetail,
      progress: rawCompositeProgress,
      title: rawCompositeStatusText(rawCompositeStatus, language),
    };
  }

  return null;
}

function ProcessingOverlay({ overlay }: { overlay: ProcessingOverlayState }) {
  const progressPercent = overlay.progress ? progressPercentFor(overlay.progress) : null;

  return (
    <div className={styles["result-processing-overlay"]} aria-live="polite" aria-busy="true">
      <div className={styles["result-processing-card"]}>
        <div className={styles["result-processing-spinner"]} aria-hidden="true" />
        <div className={styles["result-processing-copy"]}>
          <strong>{overlay.title}</strong>
          {overlay.detail ? <span>{overlay.detail}</span> : null}
        </div>
        {overlay.progress ? (
          <div
            className={styles["result-processing-progress"]}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent ?? 0}
            aria-valuetext={`${progressPercent ?? 0}%`}
          >
            <div className={styles["result-processing-progress-header"]}>
              <span>{progressPercent}%</span>
            </div>
            <div className={styles["result-processing-progress-bar"]} aria-hidden="true">
              <div
                className={styles["result-processing-progress-value"]}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function progressPercentFor(progress: CompositeProgress) {
  if (progress.total <= 0) {
    return 0;
  }

  const percent = Math.round((progress.current / progress.total) * 100);
  return Math.min(Math.max(percent, 0), 100);
}

function ResultActions({
  compact = false,
  copy,
  downloadFileName,
  downloadUrl,
  hasDownload,
  hasPreview,
  previewUrl,
  resultLabel,
}: {
  compact?: boolean;
  copy: UploadCopy;
  downloadFileName: string | null;
  downloadUrl: string | null;
  hasDownload: boolean;
  hasPreview: boolean;
  previewUrl: string | null;
  resultLabel: SourceExportFormat | null;
}) {
  return (
    <div
      className={classNames(
        styles["result-actions"],
        compact && styles["result-actions-compact"],
        !compact && styles["result-actions-source"],
      )}
    >
      <a
        className={classNames(
          sharedStyles["secondary-action"],
          sharedStyles["step-back-action"],
          styles["secondary-action"],
          !hasPreview && sharedStyles["link-disabled"],
        )}
        href={previewUrl ?? undefined}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!hasPreview}
      >
        {copy.result.openPreview}
      </a>
      <a
        className={classNames(
          sharedStyles["primary-action"],
          styles["primary-action"],
          styles["download-action"],
          !hasDownload && sharedStyles["link-disabled"],
        )}
        href={downloadUrl ?? undefined}
        download={downloadFileName ?? undefined}
        aria-disabled={!hasDownload}
      >
        {resultLabel ? copy.result.downloadFormat(formatLabel(resultLabel)) : copy.result.downloadOutput}
      </a>
    </div>
  );
}

function formatLabel(format: SourceExportFormat) {
  return format === "jpeg" ? "JPEG" : format.toUpperCase();
}

function ImageFrame({
  alt,
  label,
  showLabel,
  onLoadSize,
  onPointerMove,
  src,
}: {
  alt: string;
  label: string;
  showLabel: boolean;
  onLoadSize: (size: ImageSize) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  src: string | null;
}) {
  if (!src) {
    return (
      <div className={classNames(styles["result-image-frame"], styles["result-image-empty"])}>
        {showLabel ? <div className={styles["result-image-frame-header"]}>{label}</div> : null}
      </div>
    );
  }

  return (
    <div
      className={classNames(
        styles["result-image-frame"],
        !showLabel && styles["result-image-frame-unlabeled"],
      )}
    >
      {showLabel ? <div className={styles["result-image-frame-header"]}>{label}</div> : null}
      <div className={styles["result-image-viewport"]} onPointerMove={onPointerMove}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onLoad={(event) => {
            onLoadSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            });
          }}
        />
      </div>
    </div>
  );
}

function PixelCrop({
  label,
  point,
  scaleSize,
  size,
  src,
}: {
  label: string;
  point: InspectPoint;
  scaleSize: ImageSize | null;
  size: ImageSize | null;
  src: string | null;
}) {
  const cropSize = 116;
  const style = useMemo<CSSProperties>(() => {
    if (!src || !size || !scaleSize) {
      return {};
    }

    const x = Math.round(point.xRatio * size.width);
    const y = Math.round(point.yRatio * size.height);
    const widthScale = scaleSize.width / size.width;
    const heightScale = scaleSize.height / size.height;
    const scaledWidth = Math.round(size.width * widthScale);
    const scaledHeight = Math.round(size.height * heightScale);
    const scaledX = Math.round(x * widthScale);
    const scaledY = Math.round(y * heightScale);

    return {
      backgroundImage: `url("${src}")`,
      backgroundPosition: `${Math.round(cropSize / 2 - scaledX)}px ${Math.round(cropSize / 2 - scaledY)}px`,
      backgroundSize: `${scaledWidth}px ${scaledHeight}px`,
    };
  }, [point, scaleSize, size, src]);

  return (
    <div className={styles["pixel-crop"]}>
      <span>{label}</span>
      <div className={styles["pixel-crop-image"]} style={style} />
    </div>
  );
}

function containedImageRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
) {
  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

function loadImageSize(src: string, onLoad: (size: ImageSize) => void) {
  let isCurrent = true;
  const image = new Image();
  image.onload = () => {
    if (isCurrent) {
      onLoad({ width: image.naturalWidth, height: image.naturalHeight });
    }
  };
  image.src = src;

  return () => {
    isCurrent = false;
  };
}

function pointerPositionInViewer(event: PointerEvent<HTMLDivElement>) {
  const viewer = event.currentTarget.closest(".result-viewer");
  const rect = viewer?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();

  return {
    panelX: event.clientX - rect.left,
    panelY: event.clientY - rect.top,
    panelWidth: rect.width,
    panelHeight: rect.height,
  };
}

function inspectorPositionForPoint(point: InspectPoint): InspectorPosition {
  const gap = 18;
  const width = Math.min(286, Math.max(220, point.panelWidth - gap * 2));
  const height = width < 270 ? 176 : 188;
  const placeLeft = point.panelX > width + gap * 2;
  const placeAbove = point.panelY > height + gap * 2;
  const preferredLeft = placeLeft ? point.panelX - width - gap : point.panelX + gap;
  const preferredTop = placeAbove ? point.panelY - height - gap : point.panelY + gap;

  return {
    left: clamp(preferredLeft, gap, Math.max(gap, point.panelWidth - width - gap)),
    top: clamp(preferredTop, gap, Math.max(gap, point.panelHeight - height - gap)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
