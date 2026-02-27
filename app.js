// app.js
// ===== إعدادات =====
// API_BASE:
// - محليًا: wrangler dev غالبًا على :8787
// - نستخدم نفس hostname (localhost / 127.0.0.1 / IP) حتى لا نخسر الكوكيز/الجلسة
const API_BASE = (() => {
  if (window.__API_BASE__) return window.__API_BASE__;

  const host = location.hostname;
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

  // نفس hostname يقلل مشاكل Turnstile/session عند اختلاف localhost vs 127.0.0.1
  return isLocal ? `http://${host}:8787` : "";
})();

const LITE_TIMEOUT_MS = 18000;     // 18s
const DETAILS_TIMEOUT_MS = 45000;  // 45s
// ====================

const elIngredients = document.getElementById("ingredients");
const elImage = document.getElementById("image");
const elBtn = document.getElementById("btn");
const elClear = document.getElementById("clear");
const elStatus = document.getElementById("status");
const elResults = document.getElementById("results");
const elGrid = document.getElementById("grid");
const elDetected = document.getElementById("detected");
const elFileHint = document.getElementById("fileHint");
const elMissingLimit = document.getElementById("missingLimit");
const elNewDua = document.getElementById("newDua");
const elDuaText = document.getElementById("duaText");
const elLoadingOverlay = document.getElementById("loadingOverlay");
const elLoadingText = document.getElementById("loadingText");
const elTurnstileWrap = document.getElementById("turnstileWrap");
const elVerifiedBadge = document.getElementById("verifiedBadge");

// تفاصيل (Streaming)
const elDetails = document.getElementById("details");
const elDetailsTitle = document.getElementById("detailsTitle");
const elDetailsText = document.getElementById("detailsText");
const elDetailsFormatted = document.getElementById("detailsFormatted");
const elDetailsStatus = document.getElementById("detailsStatus");
const elDetailsYoutube = document.getElementById("detailsYoutube");
const elCloseDetails = document.getElementById("closeDetails");
const elCopyDetails = document.getElementById("copyDetails");

// تحميل Turnstile بعد ضبط site key (لتجنب أخطاء 4000... عند نسيان الـ key)
(function initTurnstile() {
  const widget = document.querySelector(".cf-turnstile");
  if (!widget) return;

  // يسمح لك تعيّني الـ site key من خارج الكود:
  // window.__TURNSTILE_SITE_KEY__ = "0x...";
  if (window.__TURNSTILE_SITE_KEY__) {
    widget.setAttribute("data-sitekey", String(window.__TURNSTILE_SITE_KEY__));
  }

  const key = String(widget.getAttribute("data-sitekey") || "").trim();
  if (!key) {
    // لا نحمّل السكربت إذا ما في key
    setStatus("Turnstile: ضعي Site Key صحيح في index.html أو عبر window.__TURNSTILE_SITE_KEY__", "error");
    elTurnstileWrap?.classList.add("hidden");
    return;
  }

  // لا تكرّري التحميل
  if (document.querySelector("script[data-turnstile]") || window.turnstile) return;
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  s.async = true;
  s.defer = true;
  s.dataset.turnstile = "1";
  document.head.appendChild(s);
})();

let selectedFile = null;
let category = "iftar"; // iftar | suhoor | dessert | drink

// فلاتر متعددة الاختيار
const filterTags = new Set(["balanced"]); // balanced | quick | easy | budget | light

// جلسة تحقق
window.__sessionVerified = false;

// لمنع تكدّس الطلبات
let suggestAbort = null;
let detailsAbort = null;

// كاش داخل الجلسة
const detailsCache = new Map(); // key => text
const liteCache = new Map();    // key => data

// آخر نص تفاصيل خام (لنسخ النص كما هو)
let currentDetailsRaw = "";

// أذكار/أدعية عامة
const DUAS = [
  "اللهم بلغنا رمضان وأعنا على الصيام والقيام وتلاوة القرآن.",
  "اللهم تقبل منا إنك أنت السميع العليم، وتب علينا إنك أنت التواب الرحيم.",
  "ربنا آتنا في الدنيا حسنة وفي الآخرة حسنة وقنا عذاب النار.",
  "اللهم إني أسألك العفو والعافية في ديني ودنياي وأهلي ومالي.",
  "سبحان الله وبحمده، سبحان الله العظيم.",
  "أستغفر الله العظيم وأتوب إليه.",
  "اللهم اجعلنا من عتقائك من النار في هذا الشهر الكريم.",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function setDua() {
  if (elDuaText) elDuaText.textContent = pickRandom(DUAS);
}
setDua();
elNewDua?.addEventListener("click", setDua);

function setStatus(msg, type = "") {
  if (!elStatus) return;
  elStatus.className = "status " + (type || "");
  elStatus.textContent = msg || "";
}

function canSubmit() {
  const hasText = (elIngredients?.value?.trim().length || 0) > 0;
  const hasFile = !!selectedFile;
  const hasToken = !!window.__turnstileToken;
  const okVerified = window.__sessionVerified || hasToken;
  return (hasText || hasFile) && okVerified;
}

document.addEventListener("turnstile-token", () => {
  if (elBtn) elBtn.disabled = !canSubmit();
});

elIngredients?.addEventListener("input", () => {
  if (elBtn) elBtn.disabled = !canSubmit();
});

elImage?.addEventListener("change", () => {
  selectedFile = elImage.files?.[0] || null;
  if (elFileHint) elFileHint.textContent = selectedFile ? `تم اختيار: ${selectedFile.name}` : "";
  if (elBtn) elBtn.disabled = !canSubmit();
});

elClear?.addEventListener("click", () => {
  try { suggestAbort?.abort(); } catch {}
  try { detailsAbort?.abort(); } catch {}
  suggestAbort = null;
  detailsAbort = null;

  if (elIngredients) elIngredients.value = "";
  if (elImage) elImage.value = "";
  selectedFile = null;
  if (elFileHint) elFileHint.textContent = "";

  elResults?.classList.add("hidden");
  if (elGrid) elGrid.innerHTML = "";
  if (elDetected) elDetected.textContent = "";

  setStatus("");
  // لا يوجد تفاصيل في هذه النسخة
  if (elBtn) elBtn.disabled = !canSubmit();
});

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    category = btn.dataset.category;
  });
});

document.querySelectorAll(".chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.filter;

    if (filterTags.has(key)) {
      filterTags.delete(key);
      btn.classList.remove("active");
      btn.setAttribute("aria-pressed", "false");
    } else {
      filterTags.add(key);
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
    }

    // لا نسمح أن تصبح فارغة
    if (filterTags.size === 0) {
      filterTags.add("balanced");
      const balancedBtn = document.querySelector('.chip[data-filter="balanced"]');
      if (balancedBtn) {
        balancedBtn.classList.add("active");
        balancedBtn.setAttribute("aria-pressed", "true");
      }
    }
  });
});

function setVerifiedUI(isVerified) {
  window.__sessionVerified = !!isVerified;

  if (isVerified) {
    elTurnstileWrap?.classList.add("hidden");
    elVerifiedBadge?.classList.remove("hidden");
    window.__turnstileToken = null;
  } else {
    elTurnstileWrap?.classList.remove("hidden");
    elVerifiedBadge?.classList.add("hidden");
  }

  if (elBtn) elBtn.disabled = !canSubmit();
}

// افحص الجلسة عند فتح الصفحة
(async () => {
  try {
    const r = await fetch(`${API_BASE}/session`, { credentials: "include" });
    if (r.ok) setVerifiedUI(true);
  } catch {}
})();

// ====== تحسين سرعة الصورة ======
async function downscaleToJpegBase64(file, maxW = 640, quality = 0.72) {
  const dataUrl = await fileToDataUrl(file);
  const img = document.createElement("img");
  img.src = dataUrl;

  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });

  const ratio = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  const outDataUrl = canvas.toDataURL("image/jpeg", quality);
  return { base64: outDataUrl.split(",")[1], mimeType: "image/jpeg" };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[c]));
}

function youtubeSearchUrl(title) {
  const q = `${title || ""} طريقة عمل وصفة`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

// ====== Fetch helpers: timeout + parse ======
function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const signal = options.signal || controller.signal;

  const timer = setTimeout(() => {
    try { controller.abort(); } catch {}
  }, timeoutMs);

  return fetch(url, { ...options, signal })
    .finally(() => clearTimeout(timer));
}

async function safeReadBody(res) {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      return { type: "json", value: await res.json() };
    } catch {
      const t = await res.text().catch(() => "");
      return { type: "text", value: t };
    }
  } else {
    const t = await res.text().catch(() => "");
    // أحيانًا السيرفر يرجّع JSON لكن content-type غلط
    try {
      const j = JSON.parse(t);
      return { type: "json", value: j };
    } catch {
      return { type: "text", value: t };
    }
  }
}

function formatServerError(payload, httpStatus) {
  // payload ممكن يكون string أو object
  if (typeof payload === "string") {
    return payload || `HTTP ${httpStatus}`;
  }

  if (!payload || typeof payload !== "object") {
    return `HTTP ${httpStatus}`;
  }

  let msg = payload.error || `HTTP ${httpStatus}`;

  // دعم debug القادم من worker
  const dbg = payload.debug;
  if (dbg?.promptFeedback?.blockReason) {
    msg += ` (Block: ${dbg.promptFeedback.blockReason})`;
  } else if (dbg?.finishReason) {
    msg += ` (Finish: ${dbg.finishReason})`;
  }

  // لو في تفاصيل أو raw
  if (payload.details) msg += ` — ${String(payload.details).slice(0, 180)}`;
  if (payload.raw) msg += ` — raw: ${String(payload.raw).slice(0, 180)}`;

  return msg;
}

// ====== واجهة التفاصيل ======
function openDetails(title) {
  if (!elDetails) return;
  if (elDetailsTitle) elDetailsTitle.textContent = title ? `تفاصيل: ${title}` : "تفاصيل الوصفة";
  currentDetailsRaw = "";
  if (elDetailsText) {
    elDetailsText.textContent = "";
    elDetailsText.classList.remove("hidden");
  }
  if (elDetailsFormatted) {
    elDetailsFormatted.innerHTML = "";
    elDetailsFormatted.classList.add("hidden");
  }
  if (elDetailsStatus) elDetailsStatus.textContent = "جاري تحميل التفاصيل…";
  if (elDetailsYoutube) {
    elDetailsYoutube.href = youtubeSearchUrl(title);
    elDetailsYoutube.style.pointerEvents = title ? "auto" : "none";
    elDetailsYoutube.style.opacity = title ? "1" : "0.6";
  }
  elDetails.classList.remove("hidden");
  elDetails.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeDetails() {
  elDetails?.classList.add("hidden");
  if (elDetailsTitle) elDetailsTitle.textContent = "تفاصيل الوصفة";
  if (elDetailsText) elDetailsText.textContent = "";
  if (elDetailsText) elDetailsText.classList.remove("hidden");
  if (elDetailsFormatted) {
    elDetailsFormatted.innerHTML = "";
    elDetailsFormatted.classList.add("hidden");
  }
  if (elDetailsYoutube) elDetailsYoutube.href = "#";
  if (elDetailsStatus) elDetailsStatus.textContent = "";
}

elCloseDetails?.addEventListener("click", () => {
  try { detailsAbort?.abort(); } catch {}
  detailsAbort = null;
  // لا يوجد تفاصيل في هذه النسخة
});

elCopyDetails?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentDetailsRaw || elDetailsText?.textContent || "");
    if (elDetailsStatus) elDetailsStatus.textContent = "تم النسخ ✅";
    setTimeout(() => { if (elDetailsStatus) elDetailsStatus.textContent = ""; }, 1200);
  } catch {
    if (elDetailsStatus) elDetailsStatus.textContent = "لم أستطع النسخ.";
  }
});

function parseDetailsText(raw) {
  const text = String(raw || "").replace(/\r/g, "").trim();
  if (!text) return { intro: "", ingredients: [], steps: [], tips: [], alternatives: "" };

  const findMarker = (n) => {
    const re = new RegExp(`(^|\\n)\\s*${n}\\)\\s*`, "m");
    const m = re.exec(text);
    return m ? { idx: m.index + m[0].length } : null;
  };

  const sliceBetween = (n, next) => {
    const s = findMarker(n);
    if (!s) return "";
    let end = text.length;
    if (next) {
      const re2 = new RegExp(`(^|\\n)\\s*${next}\\)\\s*`, "m");
      const m2 = re2.exec(text.slice(s.idx));
      if (m2) end = s.idx + m2.index;
    }
    return text.slice(s.idx, end).trim();
  };

  const intro = sliceBetween(1, 2);
  const ingRaw = sliceBetween(2, 3);
  const stepsRaw = sliceBetween(3, 4);
  const tipsRaw = sliceBetween(4, 5);
  const alternatives = sliceBetween(5, null);

  const cleanLine = (l) => l
    .replace(/^\s*[-•–—]\s*/g, "")
    .replace(/^\s*\d+\s*[)\-.]\s*/g, "")
    .trim();

  const toList = (block) => block
    .split("\n")
    .map(cleanLine)
    .filter((x) => x && x.length > 1)
    .slice(0, 60);

  return {
    intro,
    ingredients: toList(ingRaw),
    steps: toList(stepsRaw),
    tips: toList(tipsRaw),
    alternatives,
  };
}

function renderDetailsFormattedHtml(parsed) {
  const sec = (title, icon, inner) => `
    <div class="detailsSection">
      <div class="detailsSectionTitle">${icon} ${escapeHtml(title)}</div>
      ${inner}
    </div>
  `;

  const p = (t) => `<p class="detailsIntro">${escapeHtml(t || "").replace(/\n+/g, "<br>")}</p>`;

  const ul = (items) => `
    <ul class="detailsList">
      ${items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}
    </ul>
  `;

  const ol = (items) => `
    <ol class="detailsList">
      ${items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}
    </ol>
  `;

  const intro = parsed?.intro ? sec("وصفة قصيرة", "📝", p(parsed.intro)) : "";

  const grid = `
    <div class="detailsGrid">
      <div>
        ${sec("المكونات", "🥣", parsed?.ingredients?.length ? ul(parsed.ingredients) : p("لم يتم ذكر المكونات بشكل واضح."))}
      </div>
      <div>
        ${sec("الخطوات", "👩‍🍳", parsed?.steps?.length ? ol(parsed.steps) : p("لم يتم ذكر الخطوات بشكل واضح."))}
      </div>
    </div>
  `;

  const tips = parsed?.tips?.length ? sec("نصائح", "✨", ul(parsed.tips)) : "";
  const alt = parsed?.alternatives ? sec("بدائل/تعديلات", "🔁", p(parsed.alternatives)) : "";

  return `${intro}${grid}${tips}${alt}`.trim();
}

function finalizeDetailsView(title, rawText) {
  const raw = String(rawText || "").trim();
  currentDetailsRaw = raw;
  if (elDetailsText) elDetailsText.textContent = raw;
  if (elDetailsFormatted) {
    const parsed = parseDetailsText(raw);
    elDetailsFormatted.innerHTML = renderDetailsFormattedHtml(parsed);
    elDetailsFormatted.classList.remove("hidden");
  }
  if (elDetailsText) elDetailsText.classList.add("hidden");
  if (elDetailsYoutube) {
    elDetailsYoutube.href = youtubeSearchUrl(title);
    elDetailsYoutube.style.pointerEvents = title ? "auto" : "none";
    elDetailsYoutube.style.opacity = title ? "1" : "0.6";
  }
}

// ====== عرض نتائج Lite ======
function renderLiteRecipes(data, ingredientsText) {
  if (!elGrid || !elResults) return;

  elGrid.innerHTML = "";
  elResults.classList.remove("hidden");
  // لا يوجد تفاصيل في هذه النسخة

  if (elDetected) elDetected.textContent = "اقتراحات سريعة — اضغطي على (فيديو يوتيوب) لمشاهدة طريقة التحضير.";

  const recipes = Array.isArray(data?.recipes) ? data.recipes : [];
  if (!recipes.length) {
    elGrid.innerHTML = `<div class="card">لم يتم العثور على وصفات. جرّبي إضافة مكونات أكثر.</div>`;
    return;
  }

  for (const r of recipes) {
    const card = document.createElement("article");
    card.className = "card recipe-card";
    card.innerHTML = `
      <h3>${escapeHtml(r.title)}</h3>
      <div class="meta">
        <span class="badge">⏱ ${Number(r.timeMinutes) || 0} دقيقة</span>
        <span class="badge">⭐ ${escapeHtml(r.difficulty || "سهل")}</span>
        
      </div>
      <p class="muted">${escapeHtml(r.description || "")}</p>
      <div class="actions" style="margin-top:10px;">
        <a class="btn youtube" href="${youtubeSearchUrl(r.title)}" target="_blank" rel="noopener">فيديو يوتيوب</a>
      </div>
    `;

    // لا يوجد تفاصيل — فقط تحويل ليوتيوب
    card.addEventListener("click", (ev) => {
      // تجنب فتح الرابط مرتين لو ضغطتِ على نفس زر يوتيوب
      if (ev.target && ev.target.closest && ev.target.closest("a")) return;
      window.open(youtubeSearchUrl(r.title), "_blank", "noopener");
    });

    elGrid.appendChild(card);
  }
}

// ====== Streaming تفاصيل الوصفة ======
async function fetchDetailsStream({ title, ingredientsText }) {
  if (!title) return;

  // إلغاء ستريم سابق
  try { detailsAbort?.abort(); } catch {}
  detailsAbort = new AbortController();

  const cacheKey =
    `${title}||${category}||${Array.from(filterTags).sort().join(",")}||${(ingredientsText || "").trim().toLowerCase()}`;

  if (detailsCache.has(cacheKey)) {
    openDetails(title);
    if (elDetailsStatus) elDetailsStatus.textContent = "مخزّن من قبل ✅";
    finalizeDetailsView(title, detailsCache.get(cacheKey));
    return;
  }

  openDetails(title);

  let res;
  try {
    res = await fetchWithTimeout(
      `${API_BASE}/recipe-details-stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title,
          ingredientsText,
          category,
          filterTags: Array.from(filterTags),
          ramadanMode: true,
        }),
        signal: detailsAbort.signal,
      },
      DETAILS_TIMEOUT_MS
    );
  } catch (e) {
    if (elDetailsStatus) {
      elDetailsStatus.textContent = (e?.name === "AbortError") ? "تم إلغاء الطلب." : "تعذر الاتصال بالسيرفر.";
    }
    return;
  }

  if (!res.ok || !res.body) {
    const parsed = await safeReadBody(res);
    const msg = formatServerError(parsed.value, res.status);
    if (elDetailsStatus) elDetailsStatus.textContent = msg;
    return;
  }

  if (elDetailsStatus) elDetailsStatus.textContent = "يتم توليد التفاصيل…";

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // تحسين الأداء: flush مجمّع
  let uiBuf = "";
  let flushTimer = null;
  const flush = () => {
    if (!uiBuf) return;
    if (elDetailsText) elDetailsText.textContent += uiBuf;
    uiBuf = "";
  };
  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, 60);
  };

  let finalText = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const lines = part.split("\n");
        const evLine = lines.find((l) => l.startsWith("event:"));
        const dataLine = lines.find((l) => l.startsWith("data:"));
        const ev = evLine ? evLine.slice(6).trim() : "";
        const data = dataLine ? dataLine.slice(5).trim() : "";

        if (ev === "status") {
          if (elDetailsStatus) elDetailsStatus.textContent = data.replace(/^"|"$/g, "");
        } else if (ev === "chunk") {
          let chunk = "";
          try { chunk = JSON.parse(data); } catch { chunk = data; }
          uiBuf += chunk;
          finalText += chunk;
          scheduleFlush();
        } else if (ev === "done") {
          flush();
          if (elDetailsStatus) elDetailsStatus.textContent = "اكتملت التفاصيل ✅";
        } else if (ev === "error") {
          flush();
          // ممكن يكون data JSON فيها error/details
          let msg = "صار خطأ أثناء التوليد.";
          try {
            const j = JSON.parse(data);
            if (j?.error) msg = j.error;
          } catch {}
          if (elDetailsStatus) elDetailsStatus.textContent = msg;
        }
      }
    }

    const clean = finalText.trim();
    detailsCache.set(cacheKey, clean);
    if (clean) finalizeDetailsView(title, clean);
  } catch (e) {
    flush();
    if (elDetailsStatus) {
      elDetailsStatus.textContent =
        (e?.name === "AbortError") ? "تم إلغاء الطلب." : "انقطع الاتصال أثناء الستريم.";
    }
  } finally {
    if (flushTimer) clearTimeout(flushTimer);
  }
}

// ====== تذكيرات أثناء الانتظار ======
let reminderTimer = null;

function startReminders() {
  if (!elLoadingOverlay || !elLoadingText) return;
  elLoadingOverlay.classList.remove("hidden");

  const pool = [
    ...DUAS,
    "لا تنسي تسمية الله قبل الأكل.",
    "استغفري… الاستغفار يفتح الأبواب.",
    "صلاة على النبي ﷺ.",
  ];

  const next = () => {
    elLoadingText.style.opacity = "0";
    setTimeout(() => {
      elLoadingText.textContent = pickRandom(pool);
      elLoadingText.style.opacity = "1";
    }, 140);
  };

  next();
  reminderTimer = setInterval(next, 3200);
}

function stopReminders() {
  if (elLoadingOverlay) elLoadingOverlay.classList.add("hidden");
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}

// ====== زر الاقتراحات (Lite) ======
elBtn?.addEventListener("click", async () => {
  // إلغاء طلب سابق
  try { suggestAbort?.abort(); } catch {}
  suggestAbort = new AbortController();

  elBtn.disabled = true;
  setStatus("جاري إنشاء اقتراحات سريعة…", "");
  elResults?.classList.add("hidden");
  startReminders();

  try {
    const ingredientsText = elIngredients?.value?.trim() || "";
    const missingLimit = Number(elMissingLimit?.value || 2);

    let imageBase64 = null;
    let mimeType = null;

    if (selectedFile) {
      if (selectedFile.size > 4 * 1024 * 1024) {
        throw new Error("حجم الصورة كبير. اختاري صورة أصغر.");
      }
      const out = await downscaleToJpegBase64(selectedFile);
      imageBase64 = out.base64;
      mimeType = out.mimeType;
    }

    // Lite cache داخل الجلسة (نفس الإدخال = نفس النتيجة)
    const liteKey = JSON.stringify({
      t: ingredientsText.trim().toLowerCase(),
      i: imageBase64 ? `${imageBase64.slice(0, 120)}:${imageBase64.length}` : "",
      m: mimeType || "",
      cat: category,
      f: Array.from(filterTags).sort(),
      miss: missingLimit,
      r: true,
    });

    if (liteCache.has(liteKey)) {
      setVerifiedUI(true);
      setStatus("تم إنشاء اقتراحات سريعة ✅", "ok");
      renderLiteRecipes(liteCache.get(liteKey), ingredientsText);
      return;
    }

    const res = await fetchWithTimeout(
      `${API_BASE}/suggest-lite`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ingredientsText,
          imageBase64,
          mimeType,
          ramadanMode: true,
          category,
          filterTags: Array.from(filterTags),
          missingLimit,
          turnstileToken: window.__turnstileToken,
        }),
        signal: suggestAbort.signal,
      },
      LITE_TIMEOUT_MS
    );

    const parsed = await safeReadBody(res);

    if (!res.ok) {
      throw new Error(formatServerError(parsed.value, res.status));
    }

    if (parsed.type !== "json") {
      throw new Error("استجابة غير مفهومة من السيرفر: " + String(parsed.value || "").slice(0, 200));
    }

    const data = parsed.value;
    liteCache.set(liteKey, data);

    setVerifiedUI(true);
    setStatus("تم إنشاء اقتراحات سريعة ✅ ", "ok");
    renderLiteRecipes(data, ingredientsText);
  } catch (e) {
    const msg =
      e?.name === "AbortError"
        ? "تم إلغاء الطلب."
        : (e?.message || "صار خطأ");

    setStatus(msg, "error");

    if (String(msg).includes("Turnstile")) {
      window.__turnstileToken = null;
      setVerifiedUI(false);
      try { window.turnstile?.reset?.(); } catch {}
    }
  } finally {
    stopReminders();
    if (elBtn) elBtn.disabled = !canSubmit();
  }
});