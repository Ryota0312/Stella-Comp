import type { JobSummary } from "../api/uploadApi";
import type { ClientCompositeStatus, QueueNote, QueueStatus, RawCompositeStatus } from "./types";

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
      description: "星を揃えて重ね、低ノイズな星空に仕上げます。",
      selected: "選択済み",
      frames: (count: number) => `${count} フレーム`,
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
    navigation: {
      leaveConfirm: "選択済みの画像と処理途中の内容が失われます。ページを離れますか？",
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
      title: "合成設定",
      runClientStack: "プレビュー合成を再実行",
      uploadAndStack: "プレビュー合成を実行",
      runRawStack: "RAW現像して合成",
      alignmentMethod: "位置合わせ方式",
      alignmentMethods: {
        stars: "星検出（推奨）",
        akaze: "AKAZE（旧方式）",
      },
      transformModel: "変換モデル",
      transformModels: {
        affine: "互換（アフィン）",
        homography: "標準（ホモグラフィ）",
      },
      previewPayload: "プレビュー容量",
      rawProgressLabel: "本画像処理の進捗",
      outputFormat: "書き出し形式",
      outputDisplay: "表示",
      outputExport: "書き出し",
      outputDisplayPng: "PNG",
      outputFormatNote: "結果表示と等倍確認はPNGで行います。",
      outputFormats: {
        tiff: "TIFF（16bit・後処理向け）",
        png: "PNG（劣化なし・8bit）",
        jpeg: "JPEG（軽量・共有向け）",
      },
      uploadedSummary: (count: number, bytes: string) =>
        `${count} 件のプレビューファイルをアップロードしました（${bytes}）。`,
      warningsLabel: "位置合わせ警告",
      usedFrames: "使用フレーム",
      usedFramesSummary: (used: number, selected: number) => `${used} / ${selected} フレーム`,
      transformEstimateFailedWarning: (count: number) =>
        `変換行列を推定できなかった ${count} フレームを合成から除外しました。`,
      alignmentWarningSummary: (count: number) =>
        `位置合わせで ${count} 件の注意事項があります。詳細は staging debug で確認してください。`,
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
      downloadFormat: (format: string) => `${format}をダウンロード`,
      processingPreviewDetail: "結果を生成しています。完了するとこの領域に表示されます。",
      processingSourceDetail: "本画像の成果物を生成しています。前回のプレビューは参考表示です。",
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
      sourceOutput: "本処理成果物",
      tiffReady: "TIFF書き出し可能",
      outputReady: (format: string) => `${format}書き出し可能`,
      waiting: "待機中",
    },
    resultRows: {
      resultPng: "書き出し",
      resultPreviewPng: "プレビュー確認用",
      resultTiff: "TIFF準備完了",
      generatedInBrowser: "ブラウザで生成済み",
      notGenerated: "未生成",
      stackStatus: "位置合わせ",
      warnings: "警告",
    },
    debug: {
      title: "staging debug",
      previewPayload: "preview payload",
      compression: "compression",
      uploaded: "uploaded previews",
      alignmentJob: "alignment job",
      clientStatus: "preview status",
      rawStatus: "raw status",
      alignmentMethod: "alignment method",
      transformModel: "transform model",
      output: "output",
      warnings: "warnings",
      rawProgress: "raw progress",
      warningCodes: "warning codes",
      warningDetails: "warning details",
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
      extractingRawThumbnail: "RAWサムネイルを抽出中",
      rawThumbnailPreviewExtracted: (bytes: string, source: string) =>
        `RAWサムネイルプレビューを抽出しました（${bytes}, ${sourceLabel(source, "ja")}）`,
      rawThumbnailPreviewUnavailable: (message?: string) =>
        message
          ? `RAWサムネイルプレビューを利用できません: ${message}`
          : "RAWサムネイルプレビューを利用できません",
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
      description: "Align and stack stars into a cleaner night-sky image.",
      selected: "Selected",
      frames: (count: number) => `${count} frames`,
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
    navigation: {
      leaveConfirm: "Selected images and in-progress work will be lost. Leave this page?",
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
      title: "Stack Settings",
      runClientStack: "Rerun Preview Stack",
      uploadAndStack: "Run Preview Stack",
      runRawStack: "Develop RAW and Stack",
      alignmentMethod: "Alignment method",
      alignmentMethods: {
        stars: "Star detection (recommended)",
        akaze: "AKAZE (legacy)",
      },
      transformModel: "Transform model",
      transformModels: {
        affine: "Compatible (affine)",
        homography: "Default (homography)",
      },
      previewPayload: "Preview payload",
      rawProgressLabel: "Source image progress",
      outputFormat: "Export format",
      outputDisplay: "Display",
      outputExport: "Export",
      outputDisplayPng: "PNG",
      outputFormatNote: "Result display and pixel checks use PNG.",
      outputFormats: {
        tiff: "TIFF (16-bit, editing)",
        png: "PNG (lossless, 8-bit)",
        jpeg: "JPEG (small, sharing)",
      },
      uploadedSummary: (count: number, bytes: string) =>
        `Uploaded ${count} preview files (${bytes}).`,
      warningsLabel: "Alignment warnings",
      usedFrames: "Used frames",
      usedFramesSummary: (used: number, selected: number) => `${used} / ${selected} frames`,
      transformEstimateFailedWarning: (count: number) =>
        `Excluded ${count} frames because their transform could not be estimated.`,
      alignmentWarningSummary: (count: number) =>
        `${count} alignment warnings need attention. Details are available in staging debug.`,
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
      downloadFormat: (format: string) => `Download ${format}`,
      processingPreviewDetail: "Generating the result. It will appear here when complete.",
      processingSourceDetail:
        "Generating the source output. The previous preview remains visible for reference.",
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
      sourceOutput: "Source output",
      tiffReady: "TIFF ready",
      outputReady: (format: string) => `${format} ready`,
      waiting: "Waiting",
    },
    resultRows: {
      resultPng: "Export",
      resultPreviewPng: "Preview check",
      resultTiff: "TIFF ready",
      generatedInBrowser: "Generated in browser",
      notGenerated: "Not generated",
      stackStatus: "Alignment",
      warnings: "Warnings",
    },
    debug: {
      title: "staging debug",
      previewPayload: "preview payload",
      compression: "compression",
      uploaded: "uploaded previews",
      alignmentJob: "alignment job",
      clientStatus: "preview status",
      rawStatus: "raw status",
      alignmentMethod: "alignment method",
      transformModel: "transform model",
      output: "output",
      warnings: "warnings",
      rawProgress: "raw progress",
      warningCodes: "warning codes",
      warningDetails: "warning details",
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
      extractingRawThumbnail: "Extracting RAW thumbnail",
      rawThumbnailPreviewExtracted: (bytes: string, source: string) =>
        `RAW thumbnail preview extracted (${bytes}, ${sourceLabel(source, "en")})`,
      rawThumbnailPreviewUnavailable: (message?: string) =>
        message ? `RAW thumbnail preview unavailable: ${message}` : "RAW thumbnail preview unavailable",
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

function sourceLabel(source: string, language: Language) {
  if (source === "embedded-jpeg-scan") {
    return language === "ja" ? "best-effort JPEG scan fallback" : "best-effort JPEG scan fallback";
  }

  return "LibRaw thumbnail";
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
    case "extractingRawThumbnail":
      return copy.extractingRawThumbnail;
    case "rawThumbnailPreviewExtracted":
      return copy.rawThumbnailPreviewExtracted(note.bytes, note.source);
    case "rawThumbnailPreviewUnavailable":
      return copy.rawThumbnailPreviewUnavailable(note.detail);
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
