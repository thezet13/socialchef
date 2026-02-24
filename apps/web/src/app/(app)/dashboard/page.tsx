"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/getErrorMessage";

type PostType = "DISH" | "PROMO" | "BRAND_STORY" | "TEAM" | "SALES" | "STORY_CAPTION";

interface GeneratedPost {
  id: string;
  type: PostType;
  language: string;
  tone: string | null;
  mainText: string;
  hashtags: string;
  tenantId: string;
  createdAt: string;
}

interface PostsResponse {
  items: GeneratedPost[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UsageResponse {
  periodStart: string;
  periodEnd: string;
  plan: string | null;
  textCount: number;
  imageCount: number;
  planCount: number;
  textLimit: number;
}

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();

  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // форма генерации
  const [type, setType] = useState<PostType>("DISH");
  const [language, setLanguage] = useState<"en" | "ru" | "az">("en");
  const [tone, setTone] = useState("friendly");
  const [dishName, setDishName] = useState("");
  const [dishDescription, setDishDescription] = useState("");
  const [idea, setIdea] = useState("");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generatedText, setGeneratedText] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return;

    setPostsLoading(true);
    apiFetch<PostsResponse>("/posts?page=1&limit=20")
      .then((res) => setPosts(res.items))
      .catch((err) => setError(err.message ?? "Failed to load posts"))
      .finally(() => setPostsLoading(false));

    setUsageLoading(true);
    apiFetch<UsageResponse>("/ai/usage/current")
      .then((res) => setUsage(res))
      .catch((err) => setError(err.message ?? "Failed to load usage"))
      .finally(() => setUsageLoading(false));
  }, [loading, user?.id]);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    setGenerateLoading(true);
    setError(null);
    setGeneratedText(null);

    try {
      const res = await apiFetch<GeneratedPost>("/ai/posts/generate", {
        method: "POST",
        body: {
          type,
          language,
          tone,
          dishName: dishName || undefined,
          dishDescription: dishDescription || undefined,
          idea: idea || undefined,
        },
      });

      setGeneratedText(res.mainText);
      // обновим список постов (в идеале — prepend)
      setPosts((prev) => [res, ...prev]);
      // обновим usage
      if (usage) {
        setUsage({
          ...usage,
          textCount: usage.textCount + 1,
        });
      } else if (user) {
        // можно перезагрузить с бэка
        const u = await apiFetch<UsageResponse>("/ai/usage/current", {
        });
        setUsage(u);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setGenerateLoading(false);
    }
  }

  // if (loading) {
  //   return (
  //     <div className="min-h-screen flex items-center justify-center bg-slate-950">
  //       <div className="text-slate-300 text-sm">Loading...</div>
  //     </div>
  //   );
  // }

  if (!user) return null; // редирект уже запущен выше

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">SocialChef Dashboard</h1>
          <p className="text-xs text-slate-400">
            Welcome, {user?.fullName || user?.email}
          </p>
        </div>
        <div className="gap-2">
          <a href="/images/" className="text-xs px-3 py-1 rounded-md border border-slate-700 hover:bg-slate-800">Images</a>

          <button
            onClick={logout}
            className="text-xs px-3 py-1 rounded-md border border-slate-700 hover:bg-slate-800"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {/* Верхний ряд: генерация + usage */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr,1fr] gap-4">
          {/* Форма генерации */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h2 className="text-sm font-semibold mb-3">Generate new post</h2>

            <form onSubmit={handleGenerate} className="space-y-3 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs mb-1">Post type</label>
                  <select
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs"
                    value={type}
                    onChange={(e) => setType(e.target.value as PostType)}
                  >
                    <option value="DISH">Dish</option>
                    <option value="PROMO">Promo</option>
                    <option value="BRAND_STORY">Brand story</option>
                    <option value="TEAM">Team</option>
                    <option value="SALES">Sales</option>
                    <option value="STORY_CAPTION">Story caption</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs mb-1">Language</label>
                  <select
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs"
                    value={language}
                    onChange={(e) =>
                      setLanguage(e.target.value as "en" | "ru" | "az")
                    }
                  >
                    <option value="en">English</option>
                    <option value="ru">Russian</option>
                    <option value="az">Azerbaijani</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs mb-1">Tone</label>
                  <select
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                  >
                    <option value="friendly">Friendly</option>
                    <option value="premium">Premium</option>
                    <option value="fun">Fun</option>
                    <option value="minimal">Minimal</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1">Dish name</label>
                  <input
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs"
                    value={dishName}
                    onChange={(e) => setDishName(e.target.value)}
                    placeholder="e.g. Spicy Chicken Taco"
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1">
                    Idea / context (optional)
                  </label>
                  <input
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs"
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    placeholder="e.g. Taco Tuesday 20% off"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs mb-1">
                  Dish description (optional)
                </label>
                <textarea
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs min-h-[60px]"
                  value={dishDescription}
                  onChange={(e) => setDishDescription(e.target.value)}
                  placeholder="Short description of ingredients, taste, etc."
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={generateLoading}
                  className="rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-medium px-4 py-1.5 text-xs disabled:opacity-60"
                >
                  {generateLoading ? "Generating..." : "Generate post"}
                </button>
                <p className="text-[10px] text-slate-500">
                  Post will be saved to history automatically.
                </p>
              </div>
            </form>

            {generatedText && (
              <div className="mt-4 border-t border-slate-800 pt-3">
                <div className="text-xs font-semibold mb-1 text-slate-300">
                  Latest generated:
                </div>
                <div className="text-xs text-slate-200 whitespace-pre-line">
                  {generatedText}
                </div>
              </div>
            )}
          </section>

          {/* Usage карточка */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm">
            <h2 className="text-sm font-semibold mb-3">AI usage</h2>

            {usageLoading && (
              <div className="text-xs text-slate-400">Loading usage...</div>
            )}

            {usage && !usageLoading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Plan</span>
                  <span className="font-medium">
                    {usage.plan ?? "FREE"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Text generations</span>
                  <span className="font-medium">
                    {usage.textCount} / {usage.textLimit}
                  </span>
                </div>

                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: `${Math.min(
                        100,
                        (usage.textCount / usage.textLimit) * 100
                      )}%`,
                    }}
                  />
                </div>

                <div className="text-[10px] text-slate-500">
                  Period:{" "}
                  {new Date(usage.periodStart).toLocaleDateString()} –{" "}
                  {new Date(usage.periodEnd).toLocaleDateString()}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Таблица истории постов */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">History</h2>
            {postsLoading && (
              <span className="text-[10px] text-slate-500">
                Loading posts...
              </span>
            )}
          </div>

          {posts.length === 0 && !postsLoading ? (
            <div className="text-xs text-slate-500">
              No posts yet. Generate your first one!
            </div>
          ) : (
            <div className="border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/70 border-b border-slate-800">
                  <tr className="text-[11px] text-slate-400">
                    <th className="text-left px-3 py-2 w-28">Created</th>
                    <th className="text-left px-3 py-2 w-20">Type</th>
                    <th className="text-left px-3 py-2 w-16">Lang</th>
                    <th className="text-left px-3 py-2">Text</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-slate-800/60 hover:bg-slate-800/40"
                    >
                      <td className="px-3 py-2 align-top">
                        {new Date(p.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-top">{p.type}</td>
                      <td className="px-3 py-2 align-top">{p.language}</td>
                      <td className="px-3 py-2 align-top text-slate-200">
                        <div className="line-clamp-3 whitespace-pre-line">
                          {p.mainText}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
