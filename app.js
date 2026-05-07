const fileInput = document.getElementById("fileInput");
const previewBox = document.getElementById("previewBox");
const statusText = document.getElementById("statusText");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");
const manualCopyWrap = document.getElementById("manualCopyWrap");
const manualCopyArea = document.getElementById("manualCopyArea");

const imageFiles = [];
let objectUrls = [];

function setStatus(text) {
  statusText.textContent = text;
}

function updateState() {
  copyBtn.disabled = imageFiles.length === 0;
  setStatus(imageFiles.length ? `已选择 ${imageFiles.length} 张图片` : "未选择图片");
}

function cleanupObjectUrls() {
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls = [];
}

function renderPreview() {
  cleanupObjectUrls();
  previewBox.innerHTML = "";
  imageFiles.forEach(file => {
    const url = URL.createObjectURL(file);
    objectUrls.push(url);
    const item = document.createElement("div");
    item.className = "item";
    const img = document.createElement("img");
    img.src = url;
    item.appendChild(img);
    previewBox.appendChild(item);
  });
  updateState();
}

function addFiles(files) {
  Array.from(files).filter(f => f.type.startsWith("image/")).forEach(f => imageFiles.push(f));
  renderPreview();
}

async function loadImageSource(file) {
  try { return await createImageBitmap(file); }
  catch {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(); };
      img.src = url;
    });
  }
}

function disposeImageSource(src) {
  if (src?.close) src.close();
}

// ======================
// 这里是清晰度关键设置
// ======================
async function compressFileToJpegDataUrl(file) {
  const src = await loadImageSource(file);
  try {
    const w0 = src.width || src.naturalWidth;
    const h0 = src.height || src.naturalHeight;

    // ========== 清晰度调整 ==========
    const maxWidth = 320;        // 电脑Excel清晰显示
    const quality = 0.9;         // 超高画质

    const scale = Math.min(1, maxWidth / w0);
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(src, 0,0,w,h);

    return {
      dataUrl: canvas.toDataURL("image/jpeg", quality),
      width: w,
      height: h
    };
  } finally {
    disposeImageSource(src);
  }
}

async function buildTableHtml() {
  let html = "<table><tr>";
  for (const file of imageFiles) {
    const { dataUrl, width, height } = await compressFileToJpegDataUrl(file);
    html += `<td><img src="${dataUrl}" width="${width}" height="${height}"></td>`;
  }
  html += "</tr></table>";
  return html;
}

function copyWithExecCommand(html) {
  const div = document.createElement("div");
  div.contentEditable = true;
  div.style.position = "fixed";
  div.style.left = "-9999px";
  div.innerHTML = html;
  document.body.appendChild(div);

  const r = document.createRange();
  r.selectNodeContents(div);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
  const ok = document.execCommand("copy");
  s.removeAllRanges();
  document.body.removeChild(div);
  return ok;
}

function showManualArea(html) {
  manualCopyArea.innerHTML = html;
  manualCopyWrap.style.display = "block";
}

async function copyImages() {
  if (!imageFiles.length) return;
  copyBtn.disabled = true;
  copyBtn.textContent = "复制中...";
  try {
    const html = await buildTableHtml();
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob(["图片"], { type: "text/plain" })
        })
      ]);
      alert("复制成功！电脑Excel清晰显示");
    } else if (copyWithExecCommand(html)) {
      alert("复制成功（兼容模式）");
    } else {
      showManualArea(html);
      alert("请手动复制");
    }
  } catch (e) {
    alert("复制失败");
  } finally {
    copyBtn.textContent = "复制到 Excel / WPS";
    copyBtn.disabled = imageFiles.length === 0;
  }
}

function clearAll() {
  imageFiles.length = 0;
  fileInput.value = "";
  cleanupObjectUrls();
  previewBox.innerHTML = "";
  manualCopyWrap.style.display = "none";
  updateState();
}

fileInput.addEventListener("change", e => {
  addFiles(e.target.files);
  e.target.value = "";
});
copyBtn.addEventListener("click", copyImages);
clearBtn.addEventListener("click", clearAll);
updateState();
