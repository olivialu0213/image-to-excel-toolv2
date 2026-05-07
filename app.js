// 获取DOM元素
const fileInput = document.getElementById("fileInput");
const previewBox = document.getElementById("previewBox");
const statusText = document.getElementById("statusText");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");
const manualCopyWrap = document.getElementById("manualCopyWrap");
const manualCopyArea = document.getElementById("manualCopyArea");

// 全局变量
const imageFiles = [];
let objectUrls = [];

/**
 * 设置状态文本
 * @param {string} text - 状态文本内容
 */
function setStatus(text) {
  statusText.textContent = text;
}

/**
 * 更新页面状态（按钮禁用/启用、状态文本）
 */
function updateState() {
  copyBtn.disabled = imageFiles.length === 0;
  setStatus(imageFiles.length ? `已选择 ${imageFiles.length} 张图片` : "未选择图片");
}

/**
 * 清理Object URL，释放内存
 */
function cleanupObjectUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
}

/**
 * 渲染图片预览区域
 */
function renderPreview() {
  cleanupObjectUrls();
  previewBox.innerHTML = "";

  imageFiles.forEach((file) => {
    const url = URL.createObjectURL(file);
    objectUrls.push(url);
    const item = document.createElement("div");
    item.className = "item";
    const img = document.createElement("img");
    img.src = url;
    img.alt = "图片预览";
    item.appendChild(img);
    previewBox.appendChild(item);
  });

  updateState();
}

/**
 * 添加图片文件到数组
 * @param {FileList} files - 选择的文件列表
 */
function addFiles(files) {
  files
    .filter((file) => file.type && file.type.startsWith("image/"))
    .forEach((file) => imageFiles.push(file));
  renderPreview();
}

/**
 * 加载图片源（兼容ImageBitmap和Image）
 * @param {File} file - 图片文件
 * @returns {Promise<ImageBitmap|HTMLImageElement>} 图片源对象
 */
async function loadImageSource(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("图片加载失败"));
      };
      img.src = url;
    });
  }
}

/**
 * 释放图片源资源
 * @param {ImageBitmap|HTMLImageElement} src - 图片源对象
 */
function disposeImageSource(src) {
  if (src && typeof src.close === "function") {
    src.close();
  }
}

/**
 * 压缩图片为JPEG格式的DataURL
 * @param {File} file - 图片文件
 * @param {number} maxEdge - 最大边长
 * @param {number} jpegQuality - JPEG质量
 * @returns {Promise<{dataUrl: string, width: number, height: number}>} 压缩后的图片信息
 */
async function compressFileToJpegDataUrl(file, maxEdge, jpegQuality) {
  const src = await loadImageSource(file);
  try {
    const w0 = src.width != null ? src.width : src.naturalWidth;
    const h0 = src.height != null ? src.height : src.naturalHeight;
    if (!w0 || !h0) {
      throw new Error("无法读取图片尺寸");
    }
    const scale = Math.min(1, maxEdge / Math.max(w0, h0));
    const cw = Math.max(1, Math.round(w0 * scale));
    const ch = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(src, 0, 0, cw, ch);
    return {
      dataUrl: canvas.toDataURL("image/jpeg", jpegQuality),
      width: cw,
      height: ch
    };
  } finally {
    disposeImageSource(src);
  }
}

/**
 * 构建包含图片的Table HTML
 * @returns {Promise<string>} Table HTML字符串
 */
async function buildTableHtml() {
  const n = imageFiles.length;
  const maxEdge = Math.max(48, Math.min(80, Math.floor(1500 / Math.max(1, n))));
  const jpegQuality = n > 12 ? 0.72 : 0.78;

  let html = "<table><tr>";
  for (const file of imageFiles) {
    const { dataUrl, width, height } = await compressFileToJpegDataUrl(
      file,
      maxEdge,
      jpegQuality
    );
    html += `<td><img src="${dataUrl}" width="${width}" height="${height}"></td>`;
  }
  html += "</tr></table>";
  return html;
}

/**
 * 使用execCommand复制HTML内容（兼容旧浏览器）
 * @param {string} html - 要复制的HTML内容
 * @returns {boolean} 是否复制成功
 */
function copyWithExecCommand(html) {
  const temp = document.createElement("div");
  temp.contentEditable = "true";
  temp.style.position = "fixed";
  temp.style.left = "-9999px";
  temp.innerHTML = html;
  document.body.appendChild(temp);

  const range = document.createRange();
  range.selectNodeContents(temp);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (error) {
    ok = false;
  }

  selection.removeAllRanges();
  document.body.removeChild(temp);
  return ok;
}

/**
 * 显示手动复制区域
 * @param {string} html - 要显示的HTML内容
 */
function showManualArea(html) {
  manualCopyArea.innerHTML = html;
  manualCopyWrap.style.display = "block";

  manualCopyArea.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(manualCopyArea);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * 复制图片到剪贴板（核心逻辑）
 */
async function copyImages() {
  if (!imageFiles.length) {
    alert("请先选择图片");
    return;
  }

  copyBtn.disabled = true;
  copyBtn.textContent = "复制中...";
  manualCopyWrap.style.display = "none";
  manualCopyArea.innerHTML = "";

  try {
    const tableHtml = await buildTableHtml();

    // 现代浏览器剪贴板API
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([tableHtml], { type: "text/html" }),
          "text/plain": new Blob(["图片已复制"], { type: "text/plain" })
        })
      ]);
      alert("复制成功，可去 Excel / WPS 粘贴");
      return;
    }

    // 兼容模式execCommand
    if (copyWithExecCommand(tableHtml)) {
      alert("复制成功（兼容模式），可去 Excel / WPS 粘贴");
      return;
    }

    // 手动复制兜底
    showManualArea(tableHtml);
    alert("自动复制失败，请长按黄色区域手动复制");
  } catch (error) {
    // 异常兜底处理
    try {
      const html = await buildTableHtml();
      if (copyWithExecCommand(html)) {
        alert("复制成功（兼容模式），可去 Excel / WPS 粘贴");
      } else {
        showManualArea(html);
        alert("自动复制失败，请长按黄色区域手动复制");
      }
    } catch (fallbackError) {
      alert("复制失败：" + (fallbackError.message || error.message || "未知错误"));
    }
  } finally {
    copyBtn.textContent = "复制到 Excel / WPS";
    copyBtn.disabled = imageFiles.length === 0;
  }
}

/**
 * 清空所有选择的图片和状态
 */
function clearAll() {
  imageFiles.splice(0, imageFiles.length);
  fileInput.value = "";
  cleanupObjectUrls();
  previewBox.innerHTML = "";
  manualCopyWrap.style.display = "none";
  manualCopyArea.innerHTML = "";
  updateState();
}

// 事件监听
fileInput.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);
  addFiles(files);
  fileInput.value = "";
});

copyBtn.addEventListener("click", copyImages);
clearBtn.addEventListener("click", clearAll);

// 初始化状态
updateState();