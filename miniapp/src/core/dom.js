// ============================================================
// Custom avatar/cover picker — lets the person set their own photo
// (from the device's gallery/camera via Telegram's file picker) as a
// profile or playlist avatar. Images are downscaled + re-encoded to a
// small JPEG before being stored, so a multi-megapixel phone photo
// doesn't blow up localStorage (which has a small quota).
// ============================================================
function resizeImageFile(file, maxSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const size = Math.min(maxSize, side);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

var avatarFileInput = document.getElementById("avatar-file-input");
var avatarPickResolve = null;
if (avatarFileInput) {
  avatarFileInput.addEventListener("change", async () => {
    const file = avatarFileInput.files && avatarFileInput.files[0];
    avatarFileInput.value = "";
    if (!file || !avatarPickResolve) return;
    const resolve = avatarPickResolve;
    avatarPickResolve = null;
    try {
      resolve(await resizeImageFile(file, 480));
    } catch (e) {
      console.error(e);
      showToast("Не удалось загрузить фото");
      resolve(null);
    }
  });
}
function pickAvatarImage() {
  return new Promise((resolve) => {
    if (!avatarFileInput) { resolve(null); return; }
    avatarPickResolve = resolve;
    avatarFileInput.click();
  });
}

// ============================================================
// Helpers
// ============================================================
const $ = (id) => document.getElementById(id);

function hashString(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Covers without artwork get a small piece of the light, tinted by
// the item's name so neighbouring rows don't all look identical.
// The colours are the light's variables, not fixed values, so such a cover
// follows the theme and the playing track's light; the name only moves the
// highlight around.
function fallbackCover(seed) {
  const n = hashString(seed);
  const x = 22 + (n % 5) * 14;
  const y = 20 + (Math.floor(n / 5) % 4) * 12;
  return `radial-gradient(circle at ${x}% ${y}%, var(--c-core) 0 8%, var(--c-warm) 36%, var(--c-mid) 64%, var(--c-deep) 100%)`;
}

function proxyArtwork(url) {
  if (!url || typeof url !== "string") return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.includes("/artwork?url=")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const base = (API_BASE_URL || "https://94-156-179-229.sslip.io").replace(/\/$/, "");
    return `${base}/artwork?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function setCoverEl(el, url, seed) {
  if (!el) return;
  el.innerHTML = "";
  el.style.background = "";
  if (url) {
    const img = document.createElement("img");
    img.src = proxyArtwork(url);
    img.alt = "";
    img.loading = "lazy";
    img.onerror = () => { img.remove(); el.style.background = fallbackCover(seed); };
    el.appendChild(img);
  } else {
    el.style.background = fallbackCover(seed);
  }
}

// opts.action / opts.onAction add a button to the toast (an undo)
function showToast(text, opts) {
  opts = opts || {};
  const toast = $("toast");
  toast.textContent = text;
  toast.classList.toggle("has-action", !!opts.action);
  if (opts.action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = opts.action;
    btn.addEventListener("click", () => {
      toast.classList.remove("show");
      if (opts.onAction) opts.onAction();
    });
    toast.appendChild(btn);
  }
  toast.classList.add("show");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove("show"), opts.action ? 6000 : 2400);
}

function pluralTracks(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} трек`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${n} трека`;
  return `${n} треков`;
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function shuffled(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function icon(name, size) {
  const s = size || 22;
  return `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#${name}"/></svg>`;
}

