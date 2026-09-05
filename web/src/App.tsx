import { useCallback, useEffect, useState } from "react";

type Post = {
  id: number;
  title: string;
  body: string;
  visibility: string;
  created_at: string;
  updated_at: string;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/posts?visibility=all");
      const data = await res.json();
      setPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, visibility }),
    });
    if (res.ok) {
      setTitle("");
      setBody("");
      load();
    }
  };

  const remove = async (id: number) => {
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <main className="wrap">
      <header>
        <h1>🎺 Bugle</h1>
        <p className="sub">Personal announcement board.</p>
      </header>

      <form className="compose" onSubmit={submit}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          maxLength={200}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Sound it — what's up?"
          rows={3}
        />
        <div className="row">
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "private" | "public")}
          >
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
          <button type="submit">Blow it</button>
        </div>
      </form>

      {loading && <p>Loading…</p>}
      {error && <p className="error">{error}</p>}

      <ul className="posts">
        {posts.map((p) => (
          <li key={p.id} className="post">
            <div className="post-head">
              <strong>{p.title || "Untitled"}</strong>
              <span className="tag">{p.visibility}</span>
            </div>
            {p.body && <div className="post-body">{p.body}</div>}
            <div className="post-foot">
              <time>{fmt(p.created_at)}</time>
              <button className="link" onClick={() => remove(p.id)}>
                delete
              </button>
            </div>
          </li>
        ))}
        {!loading && posts.length === 0 && <li className="empty">No bugles yet.</li>}
      </ul>
    </main>
  );
}