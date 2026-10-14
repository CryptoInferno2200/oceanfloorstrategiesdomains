// "Push to GitHub" panel shared by Workspace and Sauce. Each push creates a new repository on the customer's account.
// The token stays in this panel: it is sent with the push request and never saved, in the browser or on OFS.
const STYLE = `
.gh-push { margin-top:14px; padding:14px 16px; border-radius:12px; box-shadow:0 0 0 1px var(--line, rgba(238,244,242,.12)); }
.gh-push .gh-k { font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted, #9bb0aa); }
.gh-push p { margin:6px 0; font-size:14px; color:var(--muted, #9bb0aa); }
.gh-push label { display:block; margin-top:10px; font-size:13px; color:var(--muted, #9bb0aa); }
.gh-push input[type=text], .gh-push input[type=password] { display:block; width:100%; margin-top:4px; border:0; border-radius:12px; padding:10px 12px; background:#07161c; color:var(--fg, #eef4f2); box-shadow:0 0 0 1px var(--line, rgba(238,244,242,.12)); font:inherit; }
.gh-push label.gh-check { display:flex; gap:8px; align-items:center; }
.gh-push .gh-row { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.gh-push .gh-bad { color:#ff9b8a; }
.gh-push a { color:var(--fg, #eef4f2); }
`;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

function addStyle() {
  if (document.getElementById("gh-push-style")) return;
  document.head.append(el("style", { id: "gh-push-style", textContent: STYLE }));
}

// kind is "workspace" (id = project domain) or "sauce" (id = launch slug). ghostClass matches the host page's secondary button.
export function githubButton({ kind, id, repo, ghostClass = "ghost", note = "" }) {
  addStyle();
  const toggle = el("button", { type: "button", className: ghostClass, textContent: "Push to GitHub" });
  const name = el("input", { type: "text", value: repo, maxLength: 100, autocomplete: "off", spellcheck: false });
  const token = el("input", { type: "password", autocomplete: "off", spellcheck: false, placeholder: "github_pat_… or ghp_…" });
  const privacy = el("input", { type: "checkbox", checked: true });
  const push = el("button", { type: "button", textContent: "Create repo + push" });
  const close = el("button", { type: "button", className: ghostClass, textContent: "Cancel" });
  const status = el("p", { role: "status" });
  const help = el("a", {
    href: "https://github.com/settings/personal-access-tokens/new",
    target: "_blank",
    rel: "noopener",
    textContent: "Create a fine-grained token",
  });
  const panel = el("div", { className: "gh-push", hidden: true },
    el("div", { className: "gh-k", textContent: "Push to GitHub" }),
    el("p", { textContent: "Creates a new repository on your GitHub account with this project's files, so you can keep, edit, or deploy it anywhere — published or not." }),
    note ? el("p", { textContent: note }) : null,
    el("label", {}, "New repository name", name),
    el("label", {}, "GitHub token", token),
    el("p", {}, help, " with “All repositories”, Administration: read & write and Contents: read & write (classic tokens need the repo scope). It's used for this push only and never saved."),
    el("label", { className: "gh-check" }, privacy, "Private repository"),
    el("div", { className: "gh-row" }, push, close),
    status);

  const say = (text, bad = false) => {
    status.replaceChildren(text);
    status.classList.toggle("gh-bad", bad);
  };
  toggle.addEventListener("click", () => { panel.hidden = false; toggle.hidden = true; name.focus(); });
  close.addEventListener("click", () => { panel.hidden = true; toggle.hidden = false; token.value = ""; say(""); });
  push.addEventListener("click", async () => {
    if (!name.value.trim()) return say("Name the new repository.", true);
    if (!token.value.trim()) return say("Paste a GitHub token.", true);
    push.disabled = true;
    say("Creating " + name.value.trim() + " on GitHub…");
    try {
      const response = await fetch("/api/github-push", {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ kind, id, repo: name.value, token: token.value, private: privacy.checked }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Your OFS session ended. Sign in again, then push.");
      if (!response.ok) throw new Error(result.error || "The push didn't go through.");
      token.value = "";
      status.classList.remove("gh-bad");
      status.replaceChildren(
        "Pushed to ",
        el("a", { href: result.repo.url, target: "_blank", rel: "noopener", textContent: result.repo.fullName }),
        " (" + (result.repo.private ? "private" : "public") + ", " + result.repo.branch + "). Push again any time to create another copy.",
      );
    } catch (error) {
      say(error.message, true);
    } finally {
      push.disabled = false;
    }
  });
  return { toggle, panel };
}
