// Creates a brand-new GitHub repository on the token owner's account and commits the files in one commit.
// The token is used for these calls only; it is never stored or logged.
const API = "https://api.github.com";

export type RepoFile = { path: string; content: string; encoding?: "utf-8" | "base64" };

export class GitHubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// GitHub repository names: letters, digits, -, _ and . up to 100 characters.
export function repoName(value: unknown, fallback: string) {
  const name = String(value || fallback).trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "").slice(0, 100);
  return name && name !== "." && name !== ".." ? name : "ofs-project";
}

export const validToken = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_]{20,255}$/.test(value.trim());

async function call(token: string, method: string, path: string, body?: unknown) {
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ofs-domains",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok) throw new GitHubError(explain(response.status, path, result), response.status);
  return result;
}

function explain(status: number, path: string, result: Record<string, any>) {
  if (status === 401) return "GitHub rejected that token. Check it hasn't expired and paste it again.";
  if (status === 403 || status === 404) {
    return path === "/user/repos"
      ? "That token can't create repositories. Give it Administration and Contents read/write access (or the repo scope for a classic token)."
      : "That token can't write to the new repository. Give it Contents read/write access.";
  }
  if (status === 422 && path === "/user/repos") {
    const taken = (result.errors || []).some((e: any) => /already exists/i.test(String(e?.message || "")));
    if (taken) return "A repository with that name already exists on your GitHub account. Pick another name.";
  }
  return "GitHub couldn't complete the push" + (result.message ? `: ${String(result.message).slice(0, 200)}` : ".");
}

export async function pushNewRepo(token: string, repo: { name: string; description: string; private: boolean }, files: RepoFile[], message: string) {
  // auto_init gives the repo a first commit, which the Git Data API needs before it accepts trees.
  const created = await call(token, "POST", "/user/repos", {
    name: repo.name,
    description: repo.description.replace(/[\r\n]+/g, " ").slice(0, 350),
    private: repo.private,
    auto_init: true,
  });
  const full = String(created.full_name);
  const branch = String(created.default_branch || "main");
  const ref = await call(token, "GET", `/repos/${full}/git/ref/heads/${encodeURIComponent(branch)}`);
  const parent = String(ref.object.sha);

  const tree = [];
  for (const file of files) {
    const blob = await call(token, "POST", `/repos/${full}/git/blobs`, { content: file.content, encoding: file.encoding || "utf-8" });
    tree.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  // No base_tree: the commit holds exactly these files and replaces the placeholder README.
  const madeTree = await call(token, "POST", `/repos/${full}/git/trees`, { tree });
  const commit = await call(token, "POST", `/repos/${full}/git/commits`, { message, tree: madeTree.sha, parents: [parent] });
  await call(token, "PATCH", `/repos/${full}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });
  return { url: String(created.html_url), fullName: full, branch, private: Boolean(created.private) };
}
