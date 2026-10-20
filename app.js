"use strict";
const DOWNLOAD_BASE = "download/";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 120) : ms));

let lang = "en";
const t = (key) => (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
const onLang = [];

function applyStatic() {
  $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $$("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml).replace("{v}", el.dataset.version || "");
  });
  $$("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  $$("[data-i18n-content]").forEach((el) => el.setAttribute("content", t(el.dataset.i18nContent)));
}

function setLang(next) {
  lang = I18N[next] ? next : "en";
  document.documentElement.lang = lang === "zh" ? "zh-Hans" : lang;
  $("#lang").value = lang;
  try { localStorage.setItem("knov-lang", lang); } catch (_) {}
  applyStatic();
  onLang.forEach((fn) => fn());
}

function guessLang() {
  let saved = null;
  try { saved = localStorage.getItem("knov-lang"); } catch (_) {}
  if (saved && I18N[saved]) return saved;
  for (const l of navigator.languages || [navigator.language || "en"]) {
    const code = l.toLowerCase().slice(0, 2);
    if (I18N[code]) return code;
  }
  return "en";
}

(function initLangPicker() {
  const select = $("#lang");
  for (const [code, name] of LANGS) {
    const o = document.createElement("option");
    o.value = code;
    o.textContent = name;
    o.lang = code;
    select.append(o);
  }
  select.addEventListener("change", () => setLang(select.value));
})();

function detectOS() {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "win";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac-arm";
  return "other";
}
const os = detectOS();
$$(".dl").forEach((a) => {
  a.href = DOWNLOAD_BASE + a.dataset.asset;
  if (a.dataset.os === os) a.classList.add("is-yours");
});
(function heroButton() {
  const btn = $("#hero-download");
  const pick = os === "other" ? null : $(`.dl[data-os="${os}"]`);
  const key = os === "win" ? "hero.dl.win" : os.startsWith("mac") ? "hero.dl.mac" : "hero.dl.any";
  onLang.push(() => ($(".os-label", btn).textContent = t(key)));
  if (pick) btn.href = pick.href;
  const openMacNote = () => { const d = $(".mac-note"); if (d) d.open = true; };
  $$('.dl[data-os^="mac"]').forEach((a) => a.addEventListener("click", openMacNote));
  if (os.startsWith("mac")) btn.addEventListener("click", openMacNote);
})();

$$("[data-copy]").forEach((b) =>
  b.addEventListener("click", async () => {
    const text = $("#" + b.dataset.copy).textContent;
    try { await navigator.clipboard.writeText(text); } catch (_) {}
    b.textContent = t("copied");
    setTimeout(() => (b.textContent = t("copy")), 1500);
  })
);

const FOLDERS = [
  { id: "blog", agent: "Claude", script: [["did", 1], ["did", 2], ["did", 3], ["ask", 4], ["did", 5], ["done", 6]] },
  { id: "budget", agent: "Codex", script: [["did", 1], ["did", 2], ["ask", 3], ["did", 4], ["done", 5]] },
  { id: "photos", agent: "Claude", script: [["did", 1], ["did", 2], ["did", 3], ["done", 4]] },
];
const fname = (f) => t(f.id + ".name");

const demo = { runId: 0, state: {}, started: false };
const dotClass = (phase) => ({ working: "working", waiting: "waiting", done: "done" }[phase] || "");

function folderList() {
  const ul = $("#d-folder-list");
  ul.innerHTML = "";
  for (const f of FOLDERS) {
    const s = demo.state[f.id] || { phase: "idle" };
    const li = document.createElement("li");
    li.className = s.phase === "working" || s.phase === "waiting" ? "is-busy" : "";
    li.innerHTML = `<span class="dot ${dotClass(s.phase)}"></span><span></span>`;
    li.lastChild.textContent = fname(f);
    ul.append(li);
  }
}

function renderTasks() {
  const wrap = $("#d-tasks");
  wrap.innerHTML = "";
  for (const f of FOLDERS) {
    const s = demo.state[f.id];
    const card = document.createElement("article");
    card.className = "task" + (s && s.phase === "waiting" ? " is-waiting" : "");
    if (!s) {
      card.innerHTML = `<div class="task-title"><span class="dot"></span><span></span></div><p class="task-empty"></p>`;
      card.querySelector(".task-title span:last-child").textContent = fname(f);
      card.querySelector(".task-empty").textContent = t("demo.waitingReq");
    } else {
      card.innerHTML = `<div class="task-title"><span class="dot ${dotClass(s.phase)}"></span><span></span></div>
        <div class="task-sub"></div><ul class="task-lines"></ul>`;
      card.querySelector(".task-title span:last-child").textContent = s.typed || t(f.id + ".ask");
      card.querySelector(".task-sub").textContent = `${fname(f)} · ${f.agent} · ${t("phase." + s.phase)}`;
      const ul = card.querySelector(".task-lines");
      for (const line of s.lines) {
        const li = document.createElement("li");
        if (line.kind === "done") li.className = "said";
        li.textContent = t(line.key);
        ul.append(li);
      }
    }
    wrap.append(card);
  }
  folderList();
}

function renderInbox() {
  const list = $("#d-inbox-list");
  const waiting = FOLDERS.filter((f) => demo.state[f.id] && demo.state[f.id].phase === "waiting");
  list.innerHTML = "";
  const badge = $("#d-badge");
  badge.hidden = waiting.length === 0;
  badge.textContent = String(waiting.length);
  if (waiting.length === 0) {
    const p = document.createElement("p");
    p.className = "d-empty";
    p.textContent = t("demo.empty");
    list.append(p);
    return;
  }
  for (const f of waiting) {
    const s = demo.state[f.id];
    const card = document.createElement("div");
    card.className = "ask";
    card.innerHTML = `<div class="ask-from"></div><div class="ask-what"></div>
      <div class="ask-row"><button type="button" class="allow"></button><button type="button" class="deny"></button></div>`;
    card.querySelector(".ask-from").textContent = `${fname(f)} · ${f.agent}`;
    card.querySelector(".ask-what").textContent = t(s.pending);
    const allow = card.querySelector(".allow");
    const deny = card.querySelector(".deny");
    allow.textContent = t("demo.allow");
    deny.textContent = t("demo.deny");
    allow.addEventListener("click", () => s.resume(true));
    deny.addEventListener("click", () => s.resume(false));
    list.append(card);
  }
}

function refresh() {
  renderTasks();
  renderInbox();
  const anyWaiting = FOLDERS.some((f) => demo.state[f.id] && demo.state[f.id].phase === "waiting");
  const allDone = demo.started && FOLDERS.every((f) => demo.state[f.id] && demo.state[f.id].phase === "done");
  const hint = $("#d-hint");
  const key = anyWaiting ? "hint.turn" : allDone ? "hint.done" : demo.started ? "hint.working" : "hint.start";
  hint.classList.toggle("is-yours", anyWaiting);
  hint.textContent = t(key);
}

async function runFolder(f, runId, typed) {
  const s = { phase: "working", lines: [], typed, resume: null, pending: null };
  demo.state[f.id] = s;
  refresh();
  await sleep(500 + Math.random() * 600);
  for (const [kind, n] of f.script) {
    if (runId !== demo.runId) return;
    const key = `${f.id}.${n}`;
    if (kind === "ask") {
      s.phase = "waiting";
      s.pending = key;
      refresh();
      const allowed = await new Promise((resolve) => (s.resume = resolve));
      if (runId !== demo.runId) return;
      s.phase = "working";
      s.lines.push({ kind: "did", key: allowed ? "demo.allowed" : "demo.declined" });
      refresh();
      await sleep(700);
      continue;
    }
    s.lines.push({ kind, key });
    if (kind === "done") {
      s.phase = "done";
      refresh();
      return;
    }
    refresh();
    await sleep(900 + Math.random() * 900);
  }
}

function startDemo(typed) {
  demo.runId += 1;
  demo.started = true;
  demo.state = {};
  const runId = demo.runId;
  FOLDERS.forEach((f, i) => runFolder(f, runId, i === 0 ? typed : null));
}

(function initDemo() {
  const input = $("#d-ask");
  onLang.push(() => { input.placeholder = t("demo.placeholder"); refresh(); });
  $("#d-composer").addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(demo.auto);
    startDemo(input.value.trim() || null);
    input.value = "";
  });
  demo.auto = setTimeout(() => { if (!demo.started) startDemo(null); }, 1600);
})();

const TERMINAL_NOISE = [
  "⏺ Read(src/posts/autumn-trip.md)", "  ⎿  Read 182 lines", "⏺ Bash(npm run lint --fix)", "  ⎿  > eslint . --ext .ts,.tsx",
  "✻ Thinking… (esc to interrupt)", "⏺ Update(src/components/Card.tsx)", "  ⎿  Updated with 3 additions and 1 removal",
  "warning: LF will be replaced by CRLF", "⏺ Bash(python scripts/resize.py --all)", "  ⎿  Running…", "tokens: 18.4k ↑ 2.1k ↓",
  "⏺ Grep(\"TODO\", path: \"./\")", "  ⎿  Found 41 matches", "⏺ Write(october-summary.xlsx)", "error: EPERM: operation not permitted",
];
const STUCK = "Do you want to proceed?\n❯ 1. Yes\n  2. No, and tell Claude what to do differently (esc)";
const BOARD = [
  ["done", "board.1", "board.ago2"],
  ["waiting", "board.2", "phase.waiting"],
  ["working", "board.3", "phase.working"],
  ["working", "board.4", "phase.working"],
  ["done", "board.5", "board.ago12"],
  ["working", "board.6", "phase.working"],
];

(function initCompare() {
  const grid = $("#term-grid");
  const terms = [];
  for (let i = 0; i < 6; i++) {
    const el = document.createElement("div");
    el.className = "term";
    const pre = document.createElement("pre");
    el.append(pre);
    grid.append(el);
    terms.push({ pre, lines: [] });
  }
  terms[1].stuck = true;
  const tick = () => {
    terms.forEach((term) => {
      if (term.stuck && term.lines.length > 5) {
        term.pre.textContent = term.lines.slice(-6).join("\n") + "\n";
        const s = document.createElement("span");
        s.className = "stuck";
        s.textContent = STUCK;
        term.pre.append(s);
        return;
      }
      if (Math.random() < 0.6) term.lines.push(TERMINAL_NOISE[(Math.random() * TERMINAL_NOISE.length) | 0]);
      term.pre.textContent = term.lines.slice(-14).join("\n");
    });
  };
  for (let i = 0; i < 8; i++) tick();
  if (!reduceMotion) setInterval(tick, 700);

  const board = $("#board");
  onLang.push(() => {
    board.innerHTML = "";
    for (const [phase, title, sub] of BOARD) {
      const c = document.createElement("div");
      c.className = "card";
      c.innerHTML = `<span class="dot ${phase}"></span><b></b><span></span>`;
      c.querySelector("b").textContent = t(title);
      c.querySelector("span:last-child").textContent = t(sub);
      board.append(c);
    }
  });
  $$(".tog").forEach((b) =>
    b.addEventListener("click", () => {
      $("#compare").dataset.view = b.dataset.view;
      $$(".tog").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    })
  );
})();

const TRANSLATIONS = [
  ["caution", "tr.1", '{"type":"control_request","request":{"subtype":"can_use_tool","tool_name":"Edit","input":{"file_path":"C:\\\\Users\\\\me\\\\Documents\\\\report.docx","old_string":"…"}}}'],
  ["safe", "tr.2", '"C:\\\\WINDOWS\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -Command \'Get-Content -Raw -LiteralPath october-card.csv\''],
  ["danger", "tr.3", '{"method":"item/commandExecution/requestApproval","params":{"command":"Remove-Item -Recurse -Force old-drafts"}}'],
  ["caution", "tr.4", '{"type":"tool_use","name":"WebSearch","input":{"query":"jeju cafe opening hours"}}'],
];
(function initTranslate() {
  const ol = $("#translate");
  onLang.push(() => {
    const open = new Set($$("li.is-raw", ol).map((li) => li.dataset.i));
    ol.innerHTML = "";
    TRANSLATIONS.forEach(([risk, human, raw], i) => {
      const li = document.createElement("li");
      li.dataset.i = String(i);
      if (open.has(String(i))) li.classList.add("is-raw");
      li.innerHTML = `<button type="button" aria-expanded="false"><span class="tr-human"><span class="risk ${risk}"></span><span></span></span><span class="tr-toggle"></span><code class="tr-raw"></code></button>`;
      const btn = li.querySelector("button");
      li.querySelector(".tr-human span:last-child").textContent = t(human);
      li.querySelector(".tr-raw").textContent = raw;
      const label = () => {
        const isRaw = li.classList.contains("is-raw");
        li.querySelector(".tr-toggle").textContent = t(isRaw ? "tr.hide" : "tr.show");
        btn.setAttribute("aria-expanded", String(isRaw));
      };
      label();
      btn.addEventListener("click", () => { li.classList.toggle("is-raw"); label(); });
      ol.append(li);
    });
  });
})();

(function initUndo() {
  const body = $("#doc-body");
  const doc = $("#doc");
  const btn = $("#undo-btn");
  const status = $("#undo-status");
  let restored = false;
  const render = () => {
    if (restored) body.textContent = t("doc.original");
    else body.innerHTML = t("doc.edited");
    doc.classList.toggle("is-restored", restored);
    btn.textContent = t(restored ? "undo.again" : "undo.btn");
    status.textContent = restored ? t("undo.status") : "";
  };
  onLang.push(render);
  btn.addEventListener("click", () => { restored = !restored; render(); });
})();

(function initModes() {
  const timeline = $("#timeline");
  let mode = "ask";
  let run = 0;
  let seen = false;
  const STEPS = {
    ask: [["", "tl.read"], ["wait", "tl.askEdit"], ["", "tl.allow"], ["wait", "tl.askSpell"], ["", "tl.allow"], ["end", "tl.doneAsk"]],
    all: [["", "tl.read"], ["", "tl.edited"], ["", "tl.ranSpell"], ["", "tl.edited9"], ["end", "tl.doneAll"]],
  };
  const play = async () => {
    const me = ++run;
    timeline.innerHTML = "";
    for (const [kind, key] of STEPS[mode]) {
      if (me !== run) return;
      const li = document.createElement("li");
      li.className = kind;
      li.textContent = t(key);
      timeline.append(li);
      await sleep(kind === "wait" ? 900 : 450);
    }
  };
  $$(".mode").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      $$(".mode").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      seen = true;
      play();
    })
  );
  onLang.push(() => { if (seen) play(); });
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { seen = true; play(); io.disconnect(); }
  }, { threshold: 0.4 });
  io.observe(timeline);
})();

setLang(guessLang());
