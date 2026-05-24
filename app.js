import {
  buildDownloadName,
  cpaListToMergedSub2Api,
  cpaToSub2Api,
  detectFormat,
  parseJson,
  sub2ApiToCpaList,
  summarizeAccounts,
} from "./converter.js";

const EXAMPLE_CPA = `{
  "access_token": "your_access_token",
  "account_id": "",
  "disabled": false,
  "email": "demo@example.com",
  "expired": "2026-05-25T21:46:13+08:00",
  "id_token": "your_id_token",
  "last_refresh": "2026-05-15T21:46:13+08:00",
  "refresh_token": "your_refresh_token",
  "type": "codex"
}`;

const state = {
  detectedType: "unknown",
  parsedInput: null,
  convertedText: "",
  downloadList: [],
  downloadPayload: null,
  uploadedItems: [],
};

const elements = {
  clearButton: document.getElementById("clearButton"),
  convertButton: document.getElementById("convertButton"),
  copyButton: document.getElementById("copyButton"),
  cpaBatchMode: document.getElementById("cpaBatchMode"),
  detectButton: document.getElementById("detectButton"),
  detectedType: document.getElementById("detectedType"),
  downloadAllButton: document.getElementById("downloadAllButton"),
  downloadButton: document.getElementById("downloadButton"),
  fileInput: document.getElementById("fileInput"),
  fileSummary: document.getElementById("fileSummary"),
  loadExampleButton: document.getElementById("loadExampleButton"),
  resultOutput: document.getElementById("resultOutput"),
  sourceInput: document.getElementById("sourceInput"),
  summaryBox: document.getElementById("summaryBox"),
  targetFormat: document.getElementById("targetFormat"),
};

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function stripJsonExtension(name) {
  return String(name || "").replace(/\.json$/i, "");
}

function resolveAccountName(cpa, fallbackName, index) {
  return cpa.email || fallbackName || `imported-account-${index + 1}`;
}

function setSummary(message, isError = false) {
  elements.summaryBox.textContent = message;
  elements.summaryBox.style.background = isError ? "#fff0ef" : "var(--warn-bg)";
  elements.summaryBox.style.color = isError ? "#b83b2d" : "var(--warn-text)";
}

function setDownloadButtons({
  currentEnabled = false,
  allEnabled = false,
  currentLabel = "下载结果",
  allLabel = "批量下载全部",
} = {}) {
  elements.downloadButton.disabled = !currentEnabled;
  elements.downloadAllButton.disabled = !allEnabled;
  elements.downloadButton.textContent = currentLabel;
  elements.downloadAllButton.textContent = allLabel;
}

function syncBatchModeControl() {
  elements.cpaBatchMode.disabled = elements.targetFormat.value !== "sub2api";
}

function updateDetectedType(type) {
  state.detectedType = type;

  const labelMap = {
    cpa: "CPA / Codex 单账号文件",
    "cpa-batch": "多个 CPA / Codex 输入",
    sub2api: "Sub2API 导出文件",
    unknown: "未识别",
  };

  elements.detectedType.textContent = labelMap[type] || "未识别";
}

function updateFileSummary() {
  if (!state.uploadedItems.length) {
    elements.fileSummary.textContent =
      "未选择文件。文本输入与文件输入二选一，上传文件后会优先按文件处理。";
    return;
  }

  if (state.uploadedItems.length === 1) {
    elements.fileSummary.textContent = `已选择 1 个文件：${state.uploadedItems[0].name}`;
    return;
  }

  elements.fileSummary.textContent = `已选择 ${state.uploadedItems.length} 个文件，将按批量模式处理。`;
}

function resetOutputs() {
  state.convertedText = "";
  state.downloadList = [];
  state.downloadPayload = null;
  elements.resultOutput.value = "";
  setDownloadButtons();
}

function clearUploadedItems() {
  state.uploadedItems = [];
  elements.fileInput.value = "";
  updateFileSummary();
}

function parseTextInput() {
  const raw = elements.sourceInput.value.trim();
  if (!raw) {
    throw new Error("请先粘贴 JSON 或上传文件。");
  }

  const data = parseJson(raw);
  const type = detectFormat(data);
  if (type === "unknown") {
    throw new Error("无法识别当前 JSON 格式，请确认是 cpa/codex、sub2api，或 CPA 数组。");
  }

  return { type, data, items: [] };
}

function getInputContext() {
  if (state.uploadedItems.length) {
    if (state.uploadedItems.length === 1) {
      const [item] = state.uploadedItems;
      if (item.type === "cpa-batch") {
        return { type: item.type, data: item.data, items: [] };
      }

      return { type: item.type, data: item.data, items: state.uploadedItems };
    }

    const uniqueTypes = [...new Set(state.uploadedItems.map((item) => item.type))];

    if (uniqueTypes.length !== 1) {
      throw new Error("批量上传时请只选择同一种格式的文件。");
    }

    if (uniqueTypes[0] !== "cpa") {
      throw new Error("当前仅支持多个 CPA / Codex 文件批量转 Sub2API。");
    }

    return {
      type: "cpa-batch",
      data: state.uploadedItems.map((item) => item.data),
      items: state.uploadedItems,
    };
  }

  return parseTextInput();
}

function buildCpaRecords(context) {
  if (context.items.length && context.type !== "cpa-batch") {
    return context.items.map((item, index) => ({
      name: resolveAccountName(item.data, stripJsonExtension(item.name), index),
      data: item.data,
    }));
  }

  return context.data.map((cpa, index) => ({
    name: resolveAccountName(cpa, `account-${index + 1}`, index),
    data: cpa,
  }));
}

function downloadBlob(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function detectOnly() {
  try {
    resetOutputs();
    const context = getInputContext();
    state.parsedInput = context.data;
    updateDetectedType(context.type);

    if (context.type === "cpa") {
      const email = context.data.email || "unknown";
      elements.targetFormat.value = "sub2api";
      syncBatchModeControl();
      setSummary(`已识别为 CPA / Codex 单账号文件，邮箱：${email}`);
      return;
    }

    if (context.type === "cpa-batch") {
      const count = context.items.length || context.data.length;
      elements.targetFormat.value = "sub2api";
      syncBatchModeControl();
      setSummary(
        `已识别为 ${count} 个 CPA / Codex 输入，可选择合并成 1 个 Sub2API，或分别导出多个 Sub2API。`
      );
      return;
    }

    const summary = summarizeAccounts(context.data.accounts || []);
    elements.targetFormat.value = "cpa";
    syncBatchModeControl();
    setSummary(`已识别为 Sub2API 文件，OpenAI 账号数：${summary.length}`);
  } catch (error) {
    state.parsedInput = null;
    updateDetectedType("unknown");
    setSummary(error.message, true);
  }
}

function setSingleOutput(payload, summary) {
  state.downloadPayload = payload;
  state.convertedText = payload.text;
  elements.resultOutput.value = payload.text;
  setDownloadButtons({ currentEnabled: true });
  setSummary(summary);
}

function setBatchOutput(downloads, summary, allLabel) {
  state.downloadList = downloads;
  state.downloadPayload = downloads[0] || null;
  state.convertedText = state.downloadPayload?.text || "";
  elements.resultOutput.value = state.convertedText;
  setDownloadButtons({
    currentEnabled: Boolean(state.downloadPayload),
    allEnabled: downloads.length > 1,
    currentLabel: downloads.length > 1 ? "下载当前预览" : "下载结果",
    allLabel,
  });
  setSummary(summary);
}

function convertNow() {
  try {
    resetOutputs();
    const context = getInputContext();
    state.parsedInput = context.data;
    updateDetectedType(context.type);

    const target = elements.targetFormat.value;

    if (context.type === "cpa" && target === "sub2api") {
      const accountName = resolveAccountName(context.data, context.data.email, 0);
      const converted = cpaToSub2Api(context.data, { accountName });
      const output = pretty(converted);
      setSingleOutput(
        {
          filename: buildDownloadName("sub2api", { singleName: accountName }),
          text: output,
        },
        "已将 1 个 CPA / Codex 账号转换为 1 个 Sub2API 文件。"
      );
      return;
    }

    if (context.type === "cpa-batch" && target === "sub2api") {
      const records = buildCpaRecords(context);
      const batchMode = elements.cpaBatchMode.value;

      if (batchMode === "merge") {
        const merged = cpaListToMergedSub2Api(records.map((record) => record.data), {
          accountNames: records.map((record) => record.name),
        });
        const output = pretty(merged);
        setSingleOutput(
          {
            filename: buildDownloadName("sub2api", { merged: true }),
            text: output,
          },
          `已将 ${records.length} 个 CPA / Codex 输入合并为 1 个 Sub2API 导入文件。`
        );
        return;
      }

      const downloads = records.map((record) => {
        const converted = cpaToSub2Api(record.data, { accountName: record.name });
        return {
          filename: buildDownloadName("sub2api", { singleName: record.name }),
          text: pretty(converted),
        };
      });

      setBatchOutput(
        downloads,
        downloads.length === 1
          ? "已将 1 个 CPA / Codex 输入转换为 1 个 Sub2API 文件。"
          : `已生成 ${downloads.length} 个 Sub2API 文件，当前预览第 1 个，可批量下载全部。`,
        "批量下载全部 Sub2API"
      );
      return;
    }

    if (context.type === "sub2api" && target === "cpa") {
      const batch = sub2ApiToCpaList(context.data);
      if (!batch.length) {
        throw new Error("当前 Sub2API 文件里没有可转换的 OpenAI 账号。");
      }

      const downloads = batch.map((item, index) => ({
        filename: buildDownloadName("cpa", {
          singleName: item.name || `account-${index + 1}`,
        }),
        text: pretty(item.data),
      }));

      setBatchOutput(
        downloads,
        downloads.length === 1
          ? "已将 Sub2API 文件转换为 1 个 CPA / Codex 文件。"
          : `已识别 ${downloads.length} 个可转换账号，当前预览第 1 个，可批量下载全部。`,
        "批量下载全部 CPA"
      );
      return;
    }

    if (
      (context.type === "cpa" && target === "cpa") ||
      (context.type === "cpa-batch" && target === "cpa") ||
      (context.type === "sub2api" && target === "sub2api")
    ) {
      throw new Error("输入格式与目标格式相同，无需转换。");
    }

    throw new Error("当前组合暂不支持，请检查输入格式和目标格式。");
  } catch (error) {
    setSummary(error.message, true);
  }
}

async function copyResult() {
  const value = elements.resultOutput.value.trim();
  if (!value) {
    setSummary("当前没有可复制的结果。", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setSummary("转换结果已复制到剪贴板。");
  } catch {
    setSummary("复制失败，请手动选中后复制。", true);
  }
}

function downloadCurrent() {
  if (!state.downloadPayload) {
    setSummary("当前没有可下载的结果。", true);
    return;
  }

  downloadBlob(state.downloadPayload.filename, state.downloadPayload.text);
}

function downloadAll() {
  if (!state.downloadList.length) {
    setSummary("当前没有可批量下载的结果。", true);
    return;
  }

  state.downloadList.forEach((item) => {
    downloadBlob(item.filename, item.text);
  });
}

function clearAll() {
  elements.sourceInput.value = "";
  elements.resultOutput.value = "";
  clearUploadedItems();
  resetOutputs();
  state.parsedInput = null;
  updateDetectedType("unknown");
  setSummary("已清空输入和输出。");
}

async function handleFileUpload(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }

  resetOutputs();

  try {
    const items = await Promise.all(
      files.map(async (file) => {
        const text = await file.text();
        const data = parseJson(text);
        const type = detectFormat(data);

        if (type === "unknown") {
          throw new Error(`${file.name} 不是支持的 JSON 格式。`);
        }

        return {
          name: file.name,
          text,
          data,
          type,
        };
      })
    );

    state.uploadedItems = items;
    elements.sourceInput.value = items.length === 1 ? items[0].text : "";
    updateFileSummary();
    detectOnly();
  } catch (error) {
    clearUploadedItems();
    elements.sourceInput.value = "";
    updateDetectedType("unknown");
    setSummary(error.message, true);
  }
}

function handleSourceInput() {
  if (!state.uploadedItems.length) {
    return;
  }

  clearUploadedItems();
  resetOutputs();
  updateDetectedType("unknown");
  setSummary("已切换为文本输入模式。");
}

function loadExample() {
  clearUploadedItems();
  resetOutputs();
  updateDetectedType("unknown");
  elements.sourceInput.value = EXAMPLE_CPA;
  setSummary("已载入示例数据，可直接点“识别格式”或“执行转换”。");
}

function initEvents() {
  elements.detectButton.addEventListener("click", detectOnly);
  elements.convertButton.addEventListener("click", convertNow);
  elements.copyButton.addEventListener("click", copyResult);
  elements.clearButton.addEventListener("click", clearAll);
  elements.downloadButton.addEventListener("click", downloadCurrent);
  elements.downloadAllButton.addEventListener("click", downloadAll);
  elements.fileInput.addEventListener("change", handleFileUpload);
  elements.loadExampleButton.addEventListener("click", loadExample);
  elements.sourceInput.addEventListener("input", handleSourceInput);
  elements.targetFormat.addEventListener("change", syncBatchModeControl);
  syncBatchModeControl();
  updateFileSummary();
}

initEvents();
