import type { ClientCompositeStatus, QueueNote, QueueStatus, RawCompositeStatus } from "./types";
import type { JobSummary } from "./uploadApi";

export const languages = ["ja", "en"] as const;

export type Language = (typeof languages)[number];

export const defaultLanguage: Language = "ja";

export const uploadCopy = {
  ja: {
    languageName: "日本語",
    languageToggleLabel: "表示言語",
    hero: {
      eyebrow: "星景写真の位置合わせ・コンポジット",
      title: "Stella Comp",
      description:
        "短時間露光の星景フレームを揃えて重ね、ノイズを抑えた星空画像づくりを支援します。",
      statusLabel: "プロジェクトの状態",
      selected: "選択済み",
      frames: (count: number) => `${count} フレーム`,
      previewPayload: "プレビュー容量",
      compression: "圧縮率",
      waiting: "待機中",
    },
    steps: {
      upload: "アップロード",
      preview: "プレビュー合成",
      source: "本画像合成",
      current: "現在のステップ",
      goBack: "戻る",
      startPreview: "プレビュー合成へ",
      startSource: "本画像合成へ",
      backToUpload: "アップロードに戻る",
      backToPreview: "プレビュー合成に戻る",
    },
    upload: {
      kicker: "取り込み",
      title: "アップロードキュー",
      referenceFrame: "基準フレーム",
      selectReference: "基準フレームを選択",
      clear: "クリア",
      selectFrames: "フレームを選択",
      dropTitle: "RAW、JPEG、PNG、WebPフレームをここにドロップ",
      dropDescription: "ブラウザで読み込める画像はプレビューJPEGに変換されます。",
      queuedImagesLabel: "キュー内の画像",
      empty: "フレームが選択されていません",
      sizeArrow: " -> ",
    },
    settings: {
      kicker: "設定",
      title: "プレビュー設定",
      referenceFrame: "基準フレーム",
      selectPreview: "プレビューを選択",
      previewSize: "プレビューサイズ",
      jpegQuality: "JPEG品質",
      uploadTarget: "アップロード対象",
      previewJpegOnly: "プレビューJPEGのみ",
      fullRawLater: "RAW合成は確認後に実行",
      note:
        "RAWはD&D直後には現像せず、まず埋め込みプレビューや軽量JPEGで位置合わせを確認します。RAW現像合成は実行パネルから開始します。",
    },
    preview: {
      kicker: "確認",
      title: "プレビュー確認",
      uploadPreviews: "プレビューをアップロード",
      selectFrames: "プレビューするフレームを選択",
      noFrame: "フレームなし",
      noDimensions: "サイズ情報なし",
      noPreviewJpeg: "プレビューJPEGなし",
      dimensionSeparator: " x ",
    },
    execution: {
      kicker: "実行",
      title: "プレビュー状態",
      runClientStack: "プレビュー合成を再実行",
      uploadAndStack: "プレビュー合成を実行",
      runRawStack: "RAW現像して合成",
      previewPayload: "プレビュー容量",
      rawProgressLabel: "本画像処理の進捗",
      uploadedSummary: (count: number, bytes: string) =>
        `${count} 件のプレビューファイルをアップロードしました（${bytes}）。`,
      warningsLabel: "位置合わせ警告",
      rawStackStatus: "RAW合成",
    },
    result: {
      kicker: "出力",
      title: "結果",
      compositeAlt: "合成結果",
      referenceAlt: "基準画像",
      viewModeLabel: "結果表示モード",
      viewComposite: "合成",
      viewReference: "基準",
      viewSideBySide: "左右比較",
      pixelInspectTitle: "等倍確認",
      inspectUnavailable: "画像外",
      openPreview: "プレビューを開く",
      downloadOutput: "結果をダウンロード",
      downloadTiff: "TIFFをダウンロード",
    },
    timeline: {
      selectedFrames: "選択フレーム",
      previewGeneration: "プレビュー生成",
      ready: (count: number) => `${count} 件準備完了`,
      rawExtraction: "RAW抽出",
      pending: (count: number) => `${count} 件保留中`,
      noPendingRaw: "保留中のRAWなし",
      previewUpload: "プレビューアップロード",
      uploaded: (count: number) => `${count} 件アップロード済み`,
      notUploaded: "未アップロード",
      clientStack: "ブラウザ合成",
      rawStack: "RAW合成",
    },
    resultRows: {
      resultPng: "結果形式",
      resultPreviewPng: "プレビューPNG",
      resultTiff: "本処理TIFF",
      generatedInBrowser: "ブラウザで生成済み",
      notGenerated: "未生成",
      stackStatus: "合成状態",
      warnings: "警告",
    },
    queueNotes: {
      queued: "キューに追加済み",
      developingRawWithLibRaw: "LibRaw WASMでRAWを現像中",
      rawPreviewDeveloped: (width: number, height: number, elapsedMs: number) =>
        `RAWをブラウザで現像しました（${width} x ${height}, ${elapsedMs}ms）`,
      rawPreviewUnavailable: (message?: string) =>
        message ? `RAW現像に失敗しました: ${message}` : "RAW現像に失敗しました",
      rawPreviewFallbackToEmbeddedJpeg: (message?: string) =>
        message
          ? `RAW現像に失敗したため埋め込みJPEGへ切り替えます: ${message}`
          : "RAW現像に失敗したため埋め込みJPEGへ切り替えます",
      extractingEmbeddedJpeg: "埋め込みJPEGを抽出中",
      cr3PreviewExtracted: (bytes: string) => `CR3プレビューを抽出しました（${bytes}）`,
      cr3PreviewUnavailable: (message?: string) =>
        message ? `CR3プレビューを利用できません: ${message}` : "CR3プレビューを利用できません",
      browserDecodeUnavailable: "ブラウザでプレビューをデコードできません",
      generatingJpegPreview: "JPEGプレビューを生成中",
      previewReady: "プレビュー準備完了",
      previewGenerationFailed: "プレビュー生成に失敗しました",
      uploadingPreviewJpeg: "プレビューJPEGをアップロード中",
      previewUploaded: "プレビューをアップロードしました",
      previewUploadFailed: "プレビューアップロードに失敗しました",
      clientCompositeFailed: "ブラウザ合成に失敗しました",
      rawCompositeFailed: "RAW合成に失敗しました",
    },
    statuses: {
      queue: {
        queued: "キュー済み",
        generating: "生成中",
        ready: "準備完了",
        "raw-pending": "RAW保留中",
        unsupported: "非対応",
        uploading: "アップロード中",
        uploaded: "アップロード済み",
        failed: "失敗",
      },
      job: {
        queued: "キュー済み",
        running: "実行中",
        completed: "完了",
        failed: "失敗",
      },
      client: {
        idle: "未開始",
        uploading: "アップロード中",
        estimating: "位置合わせを推定中",
        stacking: "ブラウザで合成中",
        completed: "完了",
        failed: "失敗",
      },
      raw: {
        idle: "未開始",
        developing: "RAW現像中",
        stacking: "RAW合成中",
        completed: "完了",
        failed: "失敗",
      },
    },
  },
  en: {
    languageName: "English",
    languageToggleLabel: "Display language",
    hero: {
      eyebrow: "Astrophoto alignment and compositing",
      title: "Stella Comp",
      description:
        "Align short-exposure night-sky frames and composite them into a cleaner astrophoto.",
      statusLabel: "Project status",
      selected: "Selected",
      frames: (count: number) => `${count} frames`,
      previewPayload: "Preview payload",
      compression: "Compression",
      waiting: "Waiting",
    },
    steps: {
      upload: "Upload",
      preview: "Preview Stack",
      source: "Source Stack",
      current: "Current step",
      goBack: "Back",
      startPreview: "Go to Preview Stack",
      startSource: "Go to Source Stack",
      backToUpload: "Back to Upload",
      backToPreview: "Back to Preview Stack",
    },
    upload: {
      kicker: "Ingest",
      title: "Upload Queue",
      referenceFrame: "Reference frame",
      selectReference: "Select reference frame",
      clear: "Clear",
      selectFrames: "Select Frames",
      dropTitle: "Drop RAW, JPEG, PNG, or WebP frames here",
      dropDescription: "Browser-readable images are converted to preview JPEGs.",
      queuedImagesLabel: "Queued images",
      empty: "No frames selected",
      sizeArrow: " -> ",
    },
    settings: {
      kicker: "Setup",
      title: "Preview Settings",
      referenceFrame: "Reference frame",
      selectPreview: "Select preview",
      previewSize: "Preview size",
      jpegQuality: "JPEG quality",
      uploadTarget: "Upload target",
      previewJpegOnly: "Preview JPEG only",
      fullRawLater: "RAW stack after review",
      note:
        "RAW files are not developed immediately after drop. Review alignment with embedded previews or lightweight JPEGs, then start RAW stacking from the execution panel.",
    },
    preview: {
      kicker: "Review",
      title: "Preview Check",
      uploadPreviews: "Upload Previews",
      selectFrames: "Select frames to preview",
      noFrame: "No frame",
      noDimensions: "No dimensions",
      noPreviewJpeg: "No preview JPEG",
      dimensionSeparator: " x ",
    },
    execution: {
      kicker: "Execution",
      title: "Preview Status",
      runClientStack: "Rerun Preview Stack",
      uploadAndStack: "Run Preview Stack",
      runRawStack: "Develop RAW and Stack",
      previewPayload: "Preview payload",
      rawProgressLabel: "Source image progress",
      uploadedSummary: (count: number, bytes: string) =>
        `Uploaded ${count} preview files (${bytes}).`,
      warningsLabel: "Alignment warnings",
      rawStackStatus: "RAW stack",
    },
    result: {
      kicker: "Output",
      title: "Result Bundle",
      compositeAlt: "Composite result",
      referenceAlt: "Reference image",
      viewModeLabel: "Result view mode",
      viewComposite: "Composite",
      viewReference: "Reference",
      viewSideBySide: "Compare",
      pixelInspectTitle: "Pixel check",
      inspectUnavailable: "Outside image",
      openPreview: "Open Preview",
      downloadOutput: "Download Output",
      downloadTiff: "Download TIFF",
    },
    timeline: {
      selectedFrames: "Selected frames",
      previewGeneration: "Preview generation",
      ready: (count: number) => `${count} ready`,
      rawExtraction: "RAW extraction",
      pending: (count: number) => `${count} pending`,
      noPendingRaw: "No pending RAW",
      previewUpload: "Preview upload",
      uploaded: (count: number) => `${count} uploaded`,
      notUploaded: "Not uploaded",
      clientStack: "Client stack",
      rawStack: "RAW stack",
    },
    resultRows: {
      resultPng: "Result format",
      resultPreviewPng: "Preview PNG",
      resultTiff: "Source TIFF",
      generatedInBrowser: "Generated in browser",
      notGenerated: "Not generated",
      stackStatus: "Stack status",
      warnings: "Warnings",
    },
    queueNotes: {
      queued: "Queued",
      developingRawWithLibRaw: "Developing RAW with LibRaw WASM",
      rawPreviewDeveloped: (width: number, height: number, elapsedMs: number) =>
        `RAW developed in browser (${width} x ${height}, ${elapsedMs}ms)`,
      rawPreviewUnavailable: (message?: string) =>
        message ? `RAW develop failed: ${message}` : "RAW develop failed",
      rawPreviewFallbackToEmbeddedJpeg: (message?: string) =>
        message
          ? `RAW develop failed; falling back to embedded JPEG: ${message}`
          : "RAW develop failed; falling back to embedded JPEG",
      extractingEmbeddedJpeg: "Extracting embedded JPEG",
      cr3PreviewExtracted: (bytes: string) => `CR3 preview extracted (${bytes})`,
      cr3PreviewUnavailable: (message?: string) =>
        message ? `CR3 preview unavailable: ${message}` : "CR3 preview unavailable",
      browserDecodeUnavailable: "Browser preview decode is unavailable",
      generatingJpegPreview: "Generating JPEG preview",
      previewReady: "Preview ready",
      previewGenerationFailed: "Preview generation failed",
      uploadingPreviewJpeg: "Uploading preview JPEG",
      previewUploaded: "Preview uploaded",
      previewUploadFailed: "Preview upload failed",
      clientCompositeFailed: "Client-side composite failed",
      rawCompositeFailed: "RAW composite failed",
    },
    statuses: {
      queue: {
        queued: "Queued",
        generating: "Generating",
        ready: "Ready",
        "raw-pending": "RAW pending",
        unsupported: "Unsupported",
        uploading: "Uploading",
        uploaded: "Uploaded",
        failed: "Failed",
      },
      job: {
        queued: "Queued",
        running: "Running",
        completed: "Completed",
        failed: "Failed",
      },
      client: {
        idle: "Not started",
        uploading: "Uploading",
        estimating: "Estimating alignment",
        stacking: "Stacking in browser",
        completed: "Completed",
        failed: "Failed",
      },
      raw: {
        idle: "Not started",
        developing: "Developing RAW",
        stacking: "Stacking RAW",
        completed: "Completed",
        failed: "Failed",
      },
    },
  },
} as const;

export type UploadCopy = (typeof uploadCopy)[Language];

export function queueStatusText(status: QueueStatus, language: Language) {
  return uploadCopy[language].statuses.queue[status];
}

export function jobStatusText(status: JobSummary["status"], language: Language) {
  return uploadCopy[language].statuses.job[status];
}

export function clientCompositeStatusText(status: ClientCompositeStatus, language: Language) {
  return uploadCopy[language].statuses.client[status];
}

export function rawCompositeStatusText(status: RawCompositeStatus, language: Language) {
  return uploadCopy[language].statuses.raw[status];
}

export function queueNoteText(note: QueueNote, language: Language) {
  const copy = uploadCopy[language].queueNotes;

  switch (note.code) {
    case "queued":
      return copy.queued;
    case "developingRawWithLibRaw":
      return copy.developingRawWithLibRaw;
    case "rawPreviewDeveloped":
      return copy.rawPreviewDeveloped(note.width, note.height, note.elapsedMs);
    case "rawPreviewUnavailable":
      return copy.rawPreviewUnavailable(note.detail);
    case "rawPreviewFallbackToEmbeddedJpeg":
      return copy.rawPreviewFallbackToEmbeddedJpeg(note.detail);
    case "extractingEmbeddedJpeg":
      return copy.extractingEmbeddedJpeg;
    case "cr3PreviewExtracted":
      return copy.cr3PreviewExtracted(note.bytes);
    case "cr3PreviewUnavailable":
      return copy.cr3PreviewUnavailable(note.detail);
    case "browserDecodeUnavailable":
      return copy.browserDecodeUnavailable;
    case "generatingJpegPreview":
      return copy.generatingJpegPreview;
    case "previewReady":
      return copy.previewReady;
    case "previewGenerationFailed":
      return note.detail ?? copy.previewGenerationFailed;
    case "uploadingPreviewJpeg":
      return copy.uploadingPreviewJpeg;
    case "previewUploaded":
      return copy.previewUploaded;
  }
}
