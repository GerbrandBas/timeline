const $ = (sel) => document.querySelector(sel);

const state = {
  all: [],
  filtered: [],
};

const fmt = new Intl.DateTimeFormat("nl-NL", { year: "numeric", month: "short", day: "2-digit" });

function safeText(s) {
  return (s ?? "").toString().trim();
}

function parseDate(s) {
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

function dateLabel(ev) {
  const start = ev.start ? fmt.format(parseDate(ev.start)) : "—";
  const end = ev.end ? fmt.format(parseDate(ev.end)) : null;
  return end ? `${start} → ${end}` : start;
}

function buildCategories(events) {
  const set = new Set();
  for (const e of events) if (e.category) set.add(e.category);
  return [...set].sort((a,b) => a.localeCompare(b, "nl"));
}

function applyFilters() {
  const q = safeText($("#search").value).toLowerCase();
  const cat = $("#category").value;
  const featuredOnly = $("#featured").checked;

  const filtered = state.all.filter(e => {
    if (featuredOnly && !e.featured) return false;
    if (cat && e.category !== cat) return false;
    if (!q) return true;
    const blob = `${e.title} ${e.description ?? ""} ${e.category ?? ""}`.toLowerCase();
    return blob.includes(q);
  });

  state.filtered = filtered;
  renderTimeline();
}

function renderTimeline() {
  const el = $("#timeline");
  const empty = $("#empty");
  el.innerHTML = "";

  if (!state.filtered.length) {
    empty.classList.remove("hidden");
    $("#activeDate").textContent = "—";
    return;
  }
  empty.classList.add("hidden");

  for (const ev of state.filtered) {
    const item = document.createElement("article");
    item.className = "item";
    item.dataset.id = ev.id;

    item.innerHTML = `
      <div class="dot" aria-hidden="true"></div>
      <div class="row">
        <h3 class="title">${escapeHtml(ev.title)}</h3>
        <div class="date">${escapeHtml(dateLabel(ev))}</div>
      </div>
      <p class="desc">${escapeHtml(ev.description ?? "")}</p>
      <div class="chips">
        ${ev.category ? `<span class="chip"><b>Cat</b> ${escapeHtml(ev.category)}</span>` : ""}
        ${ev.featured ? `<span class="chip"><b>★</b> Featured</span>` : ""}
        ${ev.link ? `<span class="chip"><b>↗</b> Link</span>` : ""}
      </div>
    `;

    item.addEventListener("click", () => openModal(ev));
    el.appendChild(item);
  }

  setupActiveMarker();
}

function setupActiveMarker() {
  const items = [...document.querySelectorAll(".item")];
  items.forEach(i => i.classList.remove("active"));

  const obs = new IntersectionObserver((entries) => {
    // Kies de entry die het meest in beeld is
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;

    items.forEach(i => i.classList.remove("active"));
    visible.target.classList.add("active");

    const id = visible.target.dataset.id;
    const ev = state.filtered.find(e => e.id === id);
    if (ev) $("#activeDate").textContent = dateLabel(ev);
  }, { root: null, threshold: [0.35, 0.55, 0.75] });

  items.forEach(i => obs.observe(i));

  // zet initieel
  const first = state.filtered[0];
  $("#activeDate").textContent = dateLabel(first);
  items[0]?.classList.add("active");
}

function openModal(ev) {
  const body = $("#modalBody");
  const img = ev.image ? `<img src="${escapeAttr(ev.image)}" alt="${escapeAttr(ev.title)}">` : "";
  const link = ev.link ? `<p><a href="${escapeAttr(ev.link)}" target="_blank" rel="noreferrer">Open link</a></p>` : "";
  body.innerHTML = `
    <h2>${escapeHtml(ev.title)}</h2>
    <p class="sub">${escapeHtml(dateLabel(ev))}${ev.category ? ` · ${escapeHtml(ev.category)}` : ""}</p>
    ${img}
    <p>${escapeHtml(ev.description ?? "")}</p>
    ${link}
  `;
  $("#modal").showModal();
}

function escapeHtml(str) {
  return safeText(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(str){ return escapeHtml(str); }

async function main() {
  const DATA_URL = new URL("data/events.json", document.baseURI);
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Kan data/events.json niet laden");
  const payload = await res.json();

  const events = (payload.events ?? [])
    .map(e => ({
      id: safeText(e.id),
      title: safeText(e.title) || "(zonder titel)",
      start: e.start ?? null,
      end: e.end ?? null,
      description: safeText(e.description),
      category: safeText(e.category),
      link: safeText(e.link),
      image: safeText(e.image),
      featured: !!e.featured,
      order: Number.isFinite(+e.order) ? +e.order : null,
    }))
    .sort((a,b) => {
      // sort: order -> start -> title
      if (a.order != null && b.order != null) return a.order - b.order;
      if (a.order != null) return -1;
      if (b.order != null) return 1;

      const ta = Date.parse(a.start ?? "") || 0;
      const tb = Date.parse(b.start ?? "") || 0;
      if (ta !== tb) return ta - tb;
      return a.title.localeCompare(b.title, "nl");
    });

  state.all = events;
  state.filtered = events;

  // category dropdown vullen
  const cats = buildCategories(events);
  const sel = $("#category");
  for (const c of cats) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }

  $("#search").addEventListener("input", applyFilters);
  $("#category").addEventListener("change", applyFilters);
  $("#featured").addEventListener("change", applyFilters);

  $("#meta").textContent = payload.updatedAt
    ? `Laatste sync: ${payload.updatedAt}`
    : `Items: ${events.length}`;

  renderTimeline();
}

main().catch(err => {
  console.error(err);
  $("#meta").textContent = "Fout bij laden van data.";
  $("#empty").classList.remove("hidden");
  $("#empty").textContent = "Kon events niet laden. Check data/events.json.";
});
