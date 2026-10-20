"use strict";
const DOWNLOAD_BASE = "download/";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 120) : ms));
function detectOS() {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "win";
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return "mac-arm";
  }
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
  const render = () => {
    const label = $(".os-label", btn);
    if (os === "win") label.textContent = "Download for Windows";
    else if (os.startsWith("mac")) label.textContent = "Download for Mac";
    else label.textContent = "Download Knov";
  };
  render();
  if (pick) btn.href = pick.href;
})();
$$("[data-copy]").forEach((b) =>
  b.addEventListener("click", async () => {
    const text = $("#" + b.dataset.copy).textContent;
    try { await navigator.clipboard.writeText(text); } catch (_) {}
    const original = b.textContent;
    b.textContent = "Copied";
    setTimeout(() => (b.textContent = original), 1500);
  })
);
const FOLDERS = [
  {
    id: "blog",
    name: () => "Blog posts",
    agent: "Claude",
    ask: () => "Fix the spelling in all 10 posts",
    script: [
      ["did", () => "Read 10 posts"],
      ["did", () => "Edited 'autumn-trip.md'"],
      ["did", () => "Edited 'first-camping.md'"],
      ["ask", () => "Wants to edit 'jeju-cafes.md'"],
      ["did", () => "Edited 'jeju-cafes.md'"],
      ["done", () => "Fixed 14 typos across 10 posts. Your tone is untouched."],
    ],
  },
  {
    id: "budget",
    name: () => "Budget",
    agent: "Codex",
    ask: () => "Total October spending by category",
    script: [
      ["did", () => "Read 'october-card.csv'"],
      ["did", () => "Grouped 182 payments"],
      ["ask", () => "Wants to create 'october-summary.xlsx'"],
      ["did", () => "Created 'october-summary.xlsx'"],
      ["done", () => "Food $412 · Transport $98 · Shopping $266"],
    ],
  },
  {
    id: "photos",
    name: () => "Photos",
    agent: "Claude",
    ask: () => "Sort photos into folders by date",
    script: [
      ["did", () => "Looked around the folder"],
      ["did", () => "Created 12 date folders"],
      ["did", () => "Moved 214 photos"],
      ["done", () => "214 photos are now in 12 folders, from 2026-01 to 2026-12."],
    ],
  },
];

const demo = {
  runId: 0,
  state: {},
  started: false,
};

function folderList() {
  const ul = $("#d-folder-list");
  ul.innerHTML = "";
  for (const f of FOLDERS) {
    const s = demo.state[f.id] || { phase: "idle" };
    const li = document.createElement("li");
    li.className = s.phase === "working" || s.phase === "waiting" ? "is-busy" : "";
    li.innerHTML = `<span class="dot ${dotClass(s.phase)}"></span><span></span>`;
    li.lastChild.textContent = f.name();
    ul.append(li);
  }
}
const dotClass = (phase) => ({ working: "working", waiting: "waiting", done: "done" }[phase] || "");

function phaseLabel(phase) {
  return {
    idle: "Not started",
    working: "Working…",
    waiting: "Waiting for your OK",
    done: "Done",
  }[phase];
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
      card.querySelector(".task-title span:last-child").textContent = f.name();
      card.querySelector(".task-empty").textContent = "Waiting for a request";
    } else {
      card.innerHTML = `<div class="task-title"><span class="dot ${dotClass(s.phase)}"></span><span></span></div>
        <div class="task-sub"></div><ul class="task-lines"></ul>`;
      card.querySelector(".task-title span:last-child").textContent = s.title;
      card.querySelector(".task-sub").textContent = `${f.name()} · ${f.agent} · ${phaseLabel(s.phase)}`;
      const ul = card.querySelector(".task-lines");
      for (const line of s.lines) {
        const li = document.createElement("li");
        if (line.kind === "done") li.className = "said";
        li.textContent = line.text();
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
    p.textContent = "Nothing is waiting for you.";
    list.append(p);
    return;
  }
  for (const f of waiting) {
    const s = demo.state[f.id];
    const card = document.createElement("div");
    card.className = "ask";
    card.innerHTML = `<div class="ask-from"></div><div class="ask-what"></div>
      <div class="ask-row"><button type="button" class="allow"></button><button type="button" class="deny"></button></div>`;
    card.querySelector(".ask-from").textContent = `${f.name()} · ${f.agent}`;
    card.querySelector(".ask-what").textContent = s.pending();
    const allow = card.querySelector(".allow");
    const deny = card.querySelector(".deny");
    allow.textContent = "Allow";
    deny.textContent = "Deny";
    allow.addEventListener("click", () => s.resume(true));
    deny.addEventListener("click", () => s.resume(false));
    list.append(card);
  }
}

function setHint(text, yours = false) {
  const hint = $("#d-hint");
  hint.classList.toggle("is-yours", yours);
  hint.textContent = text;
}

function refresh() {
  renderTasks();
  renderInbox();
  const anyWaiting = FOLDERS.some((f) => demo.state[f.id] && demo.state[f.id].phase === "waiting");
  const allDone = demo.started && FOLDERS.every((f) => demo.state[f.id] && demo.state[f.id].phase === "done");
  if (anyWaiting) setHint("Your turn: an agent is waiting for your OK in the inbox.", true);
  else if (allDone) setHint("All three finished while you approved two things. Press Start to run it again.");
  else if (demo.started) setHint("Three agents are working at the same time, each in its own folder.");
}

async function runFolder(f, runId, typedTitle) {
  const s = { phase: "working", lines: [], title: typedTitle || f.ask(), resume: null, pending: null };
  demo.state[f.id] = s;
  refresh();
  await sleep(500 + Math.random() * 600);
  for (const [kind, text] of f.script) {
    if (runId !== demo.runId) return;
    if (kind === "ask") {
      s.phase = "waiting";
      s.pending = text;
      refresh();
      const allowed = await new Promise((resolve) => (s.resume = resolve));
      if (runId !== demo.runId) return;
      s.phase = "working";
      s.lines.push({ kind: "did", text: allowed ? () => "You allowed it" : () => "You declined — it skipped that step" });
      refresh();
      await sleep(700);
      if (!allowed) continue;
      continue;
    }
    if (kind === "done") {
      s.phase = "done";
      s.lines.push({ kind, text });
      refresh();
      return;
    }
    s.lines.push({ kind, text });
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
  const updatePlaceholder = () => (input.placeholder = "Ask all three folders, or type your own request for the first one");
  updatePlaceholder();
  $("#d-composer").addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(demo.auto);
    startDemo(input.value.trim() || null);
    input.value = "";
  });
  renderTasks();
  renderInbox();
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
  ["done", () => "Blog spelling", () => "Done · 2 min ago"],
  ["waiting", () => "October budget", () => "Waiting for your OK"],
  ["working", () => "Photo sorting", () => "Working…"],
  ["working", () => "Shop product page", () => "Working…"],
  ["done", () => "Resume update", () => "Done · 12 min ago"],
  ["working", () => "Class handouts", () => "Working…"],
];

(function initCompare() {
  const grid = $("#term-grid");
  const terms = [];
  for (let i = 0; i < 6; i++) {
    const t = document.createElement("div");
    t.className = "term";
    const pre = document.createElement("pre");
    t.append(pre);
    grid.append(t);
    terms.push({ pre, lines: [] });
  }
  terms[1].stuck = true;
  const tick = () => {
    terms.forEach((t, i) => {
      if (t.stuck && t.lines.length > 5) {
        t.pre.innerHTML = "";
        t.pre.textContent = t.lines.slice(-6).join("\n") + "\n";
        const s = document.createElement("span");
        s.className = "stuck";
        s.textContent = STUCK;
        t.pre.append(s);
        return;
      }
      if (Math.random() < 0.6) t.lines.push(TERMINAL_NOISE[(Math.random() * TERMINAL_NOISE.length) | 0]);
      t.pre.textContent = t.lines.slice(-14).join("\n");
    });
  };
  for (let i = 0; i < 8; i++) tick();
  if (!reduceMotion) setInterval(tick, 700);

  const board = $("#board");
  const renderBoard = () => {
    board.innerHTML = "";
    for (const [phase, title, sub] of BOARD) {
      const c = document.createElement("div");
      c.className = "card";
      c.innerHTML = `<span class="dot ${phase}"></span><b></b><span></span>`;
      c.querySelector("b").textContent = title();
      c.querySelector("span:last-child").textContent = sub();
      board.append(c);
    }
  };
  renderBoard();
  $$(".tog").forEach((b) =>
    b.addEventListener("click", () => {
      $("#compare").dataset.view = b.dataset.view;
      $$(".tog").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    })
  );
})();
const TRANSLATIONS = [
  ["caution", () => "Wants to edit 'report.docx'",
    '{"type":"control_request","request":{"subtype":"can_use_tool","tool_name":"Edit","input":{"file_path":"C:\\\\Users\\\\me\\\\Documents\\\\report.docx","old_string":"…"}}}'],
  ["safe", () => "Read 'october-card.csv'",
    '"C:\\\\WINDOWS\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -Command \'Get-Content -Raw -LiteralPath october-card.csv\''],
  ["danger", () => "Wants to delete 'old-drafts'",
    '{"method":"item/commandExecution/requestApproval","params":{"command":"Remove-Item -Recurse -Force old-drafts"}}'],
  ["caution", () => "Wants to search the web: “jeju cafe opening hours”",
    '{"type":"tool_use","name":"WebSearch","input":{"query":"jeju cafe opening hours"}}'],
];
(function initTranslate() {
  const ol = $("#translate");
  const render = () => {
    const open = new Set($$("li.is-raw", ol).map((li) => li.dataset.i));
    ol.innerHTML = "";
    TRANSLATIONS.forEach(([risk, human, raw], i) => {
      const li = document.createElement("li");
      li.dataset.i = String(i);
      if (open.has(String(i))) li.classList.add("is-raw");
      li.innerHTML = `<button type="button" aria-expanded="false"><span class="tr-human"><span class="risk ${risk}"></span><span></span></span><span class="tr-toggle"></span><code class="tr-raw"></code></button>`;
      const btn = li.querySelector("button");
      li.querySelector(".tr-human span:last-child").textContent = human();
      li.querySelector(".tr-raw").textContent = raw;
      const label = () => (li.querySelector(".tr-toggle").textContent = li.classList.contains("is-raw") ? "Hide what the agent sent" : "Show what the agent sent");
      label();
      btn.setAttribute("aria-expanded", String(li.classList.contains("is-raw")));
      btn.addEventListener("click", () => {
        li.classList.toggle("is-raw");
        btn.setAttribute("aria-expanded", String(li.classList.contains("is-raw")));
        label();
      });
      ol.append(li);
    });
  };
  render();
})();
(function initUndo() {
  const body = $("#doc-body");
  const doc = $("#doc");
  const btn = $("#undo-btn");
  const status = $("#undo-status");
  let restored = false;
  const edited = () =>
    `# Autumn trip\n\nWe left early <del>in the moring</del> <ins>in the morning</ins> and drove <del>along side</del> <ins>alongside</ins> the river.\nThe leaves had <del>allready</del> <ins>already</ins> turned red.\n\n<ins>## Summary\nA two-day drive through the valley in late October.</ins>`;
  const original = () =>
    `# Autumn trip\n\nWe left early in the moring and drove along side the river.\nThe leaves had allready turned red.`;
  const render = () => {
    body.innerHTML = restored ? "" : edited();
    if (restored) body.textContent = original();
    doc.classList.toggle("is-restored", restored);
    btn.textContent = restored
      ? "Show the AI's version again"
      : "Undo this request";
    status.textContent = restored
      ? "Restored 1 file and moved 1 new file to the safe box."
      : "";
  };
  render();
  btn.addEventListener("click", () => { restored = !restored; render(); });
})();
(function initModes() {
  const timeline = $("#timeline");
  let mode = "ask";
  let run = 0;
  const STEPS = {
    ask: [
      ["", () => "Read 10 posts"],
      ["wait", () => "Asks: edit 'autumn-trip.md'?"],
      ["", () => "You allow it"],
      ["wait", () => "Asks: run the spell checker?"],
      ["", () => "You allow it"],
      ["end", () => "Done — you approved 2 steps"],
    ],
    all: [
      ["", () => "Read 10 posts"],
      ["", () => "Edited 'autumn-trip.md'"],
      ["", () => "Ran the spell checker"],
      ["", () => "Edited 9 more posts"],
      ["end", () => "Done — nothing to approve, undo still available"],
    ],
  };
  const play = async () => {
    const me = ++run;
    timeline.innerHTML = "";
    for (const [kind, text] of STEPS[mode]) {
      if (me !== run) return;
      const li = document.createElement("li");
      li.className = kind;
      li.textContent = text();
      timeline.append(li);
      await sleep(kind === "wait" ? 900 : 450);
    }
  };
  $$(".mode").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      $$(".mode").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      play();
    })
  );
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { play(); io.disconnect(); }
  }, { threshold: 0.4 });
  io.observe(timeline);
})();
