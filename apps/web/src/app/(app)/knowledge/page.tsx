"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { Plus, Trash2, FileText, Globe, Upload, Pencil } from "lucide-react";
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from "@beast/shared";
import { cn } from "@/lib/utils";
import { StateChip } from "@/components/state-chip";

const CRAWL_INFLIGHT_TTL_MS = 90_000;

const CATEGORY_LABEL: Record<KnowledgeCategory, string> = {
  company_overview: "Company overview",
  products: "Products",
  audience: "Audience",
  brand_voice: "Brand voice",
  competitors: "Competitors",
  team: "Team",
  processes: "Processes",
  historical_outputs: "Past outputs",
};

const SOURCE_LABEL: Record<string, string> = {
  interview: "Onboarding",
  document: "Upload",
  url_crawl: "Web crawl",
  feedback_learned: "Feedback",
};

const INPUT_CLASS =
  "mt-1.5 block w-full border border-hairline bg-bg px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

type FilterValue = "all" | KnowledgeCategory;

interface CrawlInFlight {
  url: string;
  queuedAt: number;
}

export default function KnowledgePage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [crawlsInFlight, setCrawlsInFlight] = useState<CrawlInFlight[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const items = useQuery({
    ...trpc.knowledge.list.queryOptions(
      filter === "all" ? {} : { category: filter as KnowledgeCategory },
    ),
    refetchInterval: crawlsInFlight.length > 0 ? 5000 : false,
  });

  const data = useMemo(() => items.data ?? [], [items.data]);

  // Drop selection for ids that no longer appear in data (filter switch
  // or background re-fetch removed them) so the action bar count stays
  // honest.
  useEffect(() => {
    if (selected.size === 0) return;
    const visibleIds = new Set(data.map((item) => item.id));
    const next = new Set<string>();
    for (const id of selected) {
      if (visibleIds.has(id)) next.add(id);
    }
    if (next.size !== selected.size) setSelected(next);
  }, [data, selected]);

  const bulkDelete = useMutation(trpc.knowledge.delete.mutationOptions());
  const bulkUpdate = useMutation(trpc.knowledge.update.mutationOptions());
  const [bulkCategory, setBulkCategory] = useState<KnowledgeCategory | "">("");

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} ${ids.length === 1 ? "item" : "items"}? Linked embeddings are removed for each. This cannot be undone.`,
      )
    ) {
      return;
    }
    let failed = 0;
    for (const id of ids) {
      try {
        await bulkDelete.mutateAsync({ id });
      } catch {
        failed++;
      }
    }
    setSelected(new Set());
    queryClient.invalidateQueries({
      queryKey: trpc.knowledge.list.queryOptions({}).queryKey,
    });
    if (failed > 0) {
      alert(`${failed} of ${ids.length} deletions failed. Refresh to see the current state.`);
    }
  }

  async function handleBulkRecategorise() {
    const ids = Array.from(selected);
    if (ids.length === 0 || !bulkCategory) return;
    let failed = 0;
    for (const id of ids) {
      try {
        await bulkUpdate.mutateAsync({ id, category: bulkCategory });
      } catch {
        failed++;
      }
    }
    setSelected(new Set());
    setBulkCategory("");
    queryClient.invalidateQueries({
      queryKey: trpc.knowledge.list.queryOptions({}).queryKey,
    });
    if (failed > 0) {
      alert(`${failed} of ${ids.length} updates failed. Refresh to see the current state.`);
    }
  }

  // Drop in-flight rows whose URL hostname now appears as a url_crawl
  // knowledge_items title, and rows older than the TTL (in case the worker
  // failed silently or the list query missed the match).
  useEffect(() => {
    if (crawlsInFlight.length === 0) return;
    const now = Date.now();
    const seenHosts = new Set(
      data
        .filter((item) => item.sourceType === "url_crawl")
        .map((item) => safeHostname(item.title)),
    );
    const next = crawlsInFlight.filter((row) => {
      if (now - row.queuedAt > CRAWL_INFLIGHT_TTL_MS) return false;
      const host = safeHostname(row.url);
      if (host && seenHosts.has(host)) return false;
      return true;
    });
    if (next.length !== crawlsInFlight.length) {
      setCrawlsInFlight(next);
    }
  }, [data, crawlsInFlight]);

  // TTL sweep: even when items.data does not change, drop expired rows.
  useEffect(() => {
    if (crawlsInFlight.length === 0) return;
    const interval = setInterval(() => {
      setCrawlsInFlight((prev) => {
        const now = Date.now();
        const next = prev.filter((row) => now - row.queuedAt < CRAWL_INFLIGHT_TTL_MS);
        return next.length === prev.length ? prev : next;
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, [crawlsInFlight.length]);

  function registerInFlightCrawl(url: string) {
    setCrawlsInFlight((prev) => [
      ...prev.filter((p) => p.url !== url),
      { url, queuedAt: Date.now() },
    ]);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="rule-b pb-4">
        <h1 className="display text-3xl">Knowledge</h1>
        <p className="spec mt-1.5 text-ink-muted">
          the company library · searched at task time · {data.length} item
          {data.length === 1 ? "" : "s"} on file
        </p>
      </header>

      <div className="mt-5 space-y-6">
        <AddKnowledgeBlock
          onCreated={() => {
            queryClient.invalidateQueries({
              queryKey: trpc.knowledge.list.queryOptions({}).queryKey,
            });
            queryClient.invalidateQueries({
              queryKey: trpc.knowledge.listFiles.queryOptions().queryKey,
            });
          }}
          onCrawlQueued={registerInFlightCrawl}
        />

        <CrawlsInFlightSection rows={crawlsInFlight} />

        <UploadedFilesSection />

        <section aria-label="Library">
          <div className="rule-t flex flex-wrap items-center gap-1.5 pt-2.5">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              All{data.length > 0 && filter === "all" ? ` ${data.length}` : ""}
            </FilterChip>
            {KNOWLEDGE_CATEGORIES.map((cat) => (
              <FilterChip key={cat} active={filter === cat} onClick={() => setFilter(cat)}>
                {CATEGORY_LABEL[cat]}
              </FilterChip>
            ))}
          </div>

          {items.isLoading && (
            <div className="mt-3 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="hairline-b pb-3 last:border-b-0">
                  <div className="h-4 w-2/3 bg-panel" />
                  <div className="mt-2 h-3.5 w-full bg-panel" />
                </div>
              ))}
            </div>
          )}

          {!items.isLoading && data.length === 0 && (
            <p className="mt-3 max-w-lg text-[13px] leading-snug text-ink-muted">
              {filter === "all"
                ? "The library is empty. Write a note, upload a document, or crawl the homepage: everything here is retrieved by the roster at task time."
                : `Nothing filed under ${CATEGORY_LABEL[filter as KnowledgeCategory]}.`}
            </p>
          )}

          {selected.size > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-ink bg-panel px-4 py-2.5">
              <p className="spec text-ink">
                {selected.size} selected
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value as KnowledgeCategory | "")}
                  disabled={bulkUpdate.isPending}
                  aria-label="Move selected items to category"
                  className="border border-hairline bg-bg px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                >
                  <option value="">Move to category…</option>
                  {KNOWLEDGE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABEL[cat]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleBulkRecategorise}
                  disabled={bulkUpdate.isPending || !bulkCategory}
                  className="btn-ghost px-3 py-1.5 text-[12.5px] disabled:opacity-50"
                >
                  {bulkUpdate.isPending ? "Moving…" : "Apply"}
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="spec text-ink-muted underline underline-offset-2 hover:text-ink"
                >
                  Clear
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDelete.isPending}
                  className="bg-state-failed px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-state-failed/90 disabled:opacity-50"
                >
                  {bulkDelete.isPending ? "Deleting…" : `Delete ${selected.size}`}
                </button>
              </div>
            </div>
          )}

          <ul className="mt-1">
            {data.map((item) => (
              <KnowledgeItemRow
                key={item.id}
                item={item}
                isSelected={selected.has(item.id)}
                onToggleSelect={() => toggleSelect(item.id)}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

interface KnowledgeItem {
  id: string;
  category: string;
  title: string;
  content: string;
  sourceType: string;
}

function KnowledgeItemRow({
  item,
  isSelected,
  onToggleSelect,
}: {
  item: KnowledgeItem;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [category, setCategory] = useState(item.category);

  const update = useMutation({
    ...trpc.knowledge.update.mutationOptions(),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({
        queryKey: trpc.knowledge.list.queryOptions({}).queryKey,
      });
    },
  });
  const remove = useMutation({
    ...trpc.knowledge.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.knowledge.list.queryOptions({}).queryKey,
      });
    },
  });

  const sourceLabel = SOURCE_LABEL[item.sourceType] ?? item.sourceType;

  if (editing) {
    return (
      <li className="hairline-b py-3.5 last:border-b-0">
        <div className="panel-tinted space-y-3 p-4">
          <label className="block">
            <span className="spec-label">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={INPUT_CLASS}
            >
              {KNOWLEDGE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABEL[cat]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="spec-label">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <label className="block">
            <span className="spec-label">Content</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className={`${INPUT_CLASS} resize-none`}
            />
            <span className="spec mt-1 block text-ink-muted">
              Edits update the title, body, and category. Linked embeddings stay untouched until
              the next ingest run touches the same item.
            </span>
          </label>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => {
                setTitle(item.title);
                setContent(item.content);
                setCategory(item.category);
                setEditing(false);
              }}
              disabled={update.isPending}
              className="btn-ghost disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (title.trim().length < 3 || content.trim().length < 5) return;
                update.mutate({
                  id: item.id,
                  title: title.trim(),
                  content: content.trim(),
                  category,
                });
              }}
              disabled={update.isPending || title.trim().length < 3 || content.trim().length < 5}
              className="btn-ink disabled:opacity-50"
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
          {update.error && (
            <p className="text-[13px] text-state-failed">{update.error.message}</p>
          )}
        </div>
      </li>
    );
  }

  return (
    <li className="hairline-b py-3.5 last:border-b-0">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Select ${item.title}`}
          className="mt-1 h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none border border-hairline bg-bg checked:border-ink checked:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
        <div className="min-w-0 flex-1">
          <p className="spec-label flex flex-wrap items-center gap-x-2">
            <span>{CATEGORY_LABEL[item.category as KnowledgeCategory] ?? item.category}</span>
            <span aria-hidden>·</span>
            <span>via {sourceLabel.toLowerCase()}</span>
          </p>
          <p className="mt-1 text-[14px] leading-snug font-semibold">{item.title}</p>
          <p className="mt-1 line-clamp-3 text-[13px] leading-snug whitespace-pre-wrap text-ink-secondary">
            {item.content}
          </p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] text-ink-muted transition-colors hover:bg-panel hover:text-ink"
          aria-label={`Edit ${item.title}`}
        >
          <Pencil size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete "${item.title}"? Linked embeddings will also be removed.`)) {
              remove.mutate({ id: item.id });
            }
          }}
          disabled={remove.isPending}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] text-ink-muted transition-colors hover:bg-panel hover:text-state-failed disabled:opacity-50"
          aria-label={`Delete ${item.title}`}
        >
          <Trash2 size={14} strokeWidth={1.5} />
        </button>
      </div>
    </li>
  );
}

function safeHostname(input: string): string | null {
  try {
    return new URL(input).hostname;
  } catch {
    return null;
  }
}

function CrawlsInFlightSection({ rows }: { rows: Array<{ url: string; queuedAt: number }> }) {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Crawls in flight">
      <div className="rule-t flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 pt-2.5">
        <h2 className="text-[15px] font-semibold">Crawls in flight</h2>
        <span className="spec-label">clears once the page lands, about a minute</span>
      </div>
      <ul className="mt-1">
        {rows.map((row) => {
          const elapsedSeconds = Math.max(0, Math.round((Date.now() - row.queuedAt) / 1000));
          return (
            <li key={row.url} className="hairline-b flex items-center gap-3 py-2.5 last:border-b-0">
              <Globe size={16} strokeWidth={1.5} className="shrink-0 text-ink-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{row.url}</p>
                <p className="spec mt-0.5 text-ink-muted">queued {elapsedSeconds}s ago</p>
              </div>
              <StateChip status="running" label="Crawling" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const FILE_STATUS: Record<string, { label: string; status: string }> = {
  pending: { label: "Queued", status: "queued" },
  processing: { label: "Processing", status: "running" },
  complete: { label: "Indexed", status: "accepted" },
  failed: { label: "Failed", status: "failed" },
};

function UploadedFilesSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const files = useQuery({
    ...trpc.knowledge.listFiles.queryOptions(),
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      const stillProcessing = data.some(
        (f) => f.processingStatus === "pending" || f.processingStatus === "processing",
      );
      return stillProcessing ? 5000 : false;
    },
  });

  const remove = useMutation({
    ...trpc.knowledge.deleteFile.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.knowledge.listFiles.queryOptions().queryKey,
      });
    },
  });

  const rows = files.data ?? [];
  if (rows.length === 0) return null;

  return (
    <section aria-label="Uploaded files">
      <div className="rule-t flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 pt-2.5">
        <h2 className="text-[15px] font-semibold">Uploaded files</h2>
        <span className="spec-label">checked every 5s while processing</span>
      </div>
      <ul className="mt-1">
        {rows.map((file) => {
          const entry = FILE_STATUS[file.processingStatus] ?? FILE_STATUS.pending!;
          return (
            <li key={file.id} className="hairline-b flex items-center gap-3 py-2.5 last:border-b-0">
              <FileText size={16} strokeWidth={1.5} className="shrink-0 text-ink-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{file.filename}</p>
                <p className="spec mt-0.5 text-ink-muted">
                  {formatBytes(file.sizeBytes)}
                  {file.pageCount ? ` · ${file.pageCount} pages` : ""}
                  {" · "}
                  {new Date(file.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <StateChip status={entry.status} label={entry.label} />
              <button
                onClick={() => {
                  if (
                    confirm(
                      `Remove ${file.filename}? Indexed chunks stay until you delete the related knowledge entry.`,
                    )
                  ) {
                    remove.mutate({ fileId: file.id });
                  }
                }}
                disabled={remove.isPending}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] text-ink-muted transition-colors hover:bg-panel hover:text-state-failed disabled:opacity-50"
                aria-label={`Remove ${file.filename}`}
              >
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "chip cursor-pointer transition-colors duration-150",
        active
          ? "border-ink bg-ink text-white"
          : "border-hairline bg-transparent text-ink-secondary hover:border-ink hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

type AddMode = "note" | "url" | "file";

function AddKnowledgeBlock({
  onCreated,
  onCrawlQueued,
}: {
  onCreated: () => void;
  onCrawlQueued: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AddMode>("note");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 border border-dashed border-hairline bg-bg px-4 py-3 text-[13.5px] font-medium text-ink-secondary transition-colors hover:border-ink hover:text-ink"
      >
        <Plus size={16} strokeWidth={1.5} />
        Add to the library
      </button>
    );
  }

  return (
    <div className="panel space-y-4 p-5">
      <div role="radiogroup" aria-label="Source" className="grid grid-cols-3 gap-1.5">
        <ModeButton
          active={mode === "note"}
          onClick={() => setMode("note")}
          icon={<FileText size={14} strokeWidth={1.5} />}
          label="Write a note"
        />
        <ModeButton
          active={mode === "url"}
          onClick={() => setMode("url")}
          icon={<Globe size={14} strokeWidth={1.5} />}
          label="Crawl a URL"
        />
        <ModeButton
          active={mode === "file"}
          onClick={() => setMode("file")}
          icon={<Upload size={14} strokeWidth={1.5} />}
          label="Upload a file"
        />
      </div>

      {mode === "note" && (
        <NoteForm
          onDone={() => {
            onCreated();
            setOpen(false);
          }}
        />
      )}
      {mode === "url" && (
        <UrlForm
          onQueued={onCrawlQueued}
          onDone={() => {
            onCreated();
            setOpen(false);
          }}
        />
      )}
      {mode === "file" && (
        <FileForm
          onDone={() => {
            onCreated();
            setOpen(false);
          }}
        />
      )}

      <button
        onClick={() => setOpen(false)}
        className="spec text-ink-muted underline underline-offset-2 transition-colors hover:text-ink"
      >
        Cancel
      </button>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 border px-3 py-2 text-[12.5px] font-medium transition-colors duration-150",
        active
          ? "border-ink bg-ink text-white"
          : "border-hairline bg-bg text-ink-secondary hover:border-ink hover:text-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function NoteForm({ onDone }: { onDone: () => void }) {
  const trpc = useTRPC();
  const [category, setCategory] = useState<KnowledgeCategory>("company_overview");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const create = useMutation({
    ...trpc.knowledge.create.mutationOptions(),
    onSuccess: () => {
      setTitle("");
      setContent("");
      onDone();
    },
  });

  function handleSave() {
    if (title.trim().length < 3 || content.trim().length < 5) return;
    create.mutate({
      category,
      title: title.trim(),
      content: content.trim(),
      sourceType: "interview",
    });
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="spec-label">Category</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}
          className={INPUT_CLASS}
        >
          {KNOWLEDGE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABEL[cat]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="spec-label">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Tone of voice for customer-facing copy"
          className={INPUT_CLASS}
        />
      </label>
      <label className="block">
        <span className="spec-label">Content</span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder="Write what the roster should know. Plain prose works fine."
          className={`${INPUT_CLASS} resize-none`}
        />
      </label>
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={create.isPending || title.trim().length < 3 || content.trim().length < 5}
          className="btn-ink disabled:opacity-50"
        >
          {create.isPending ? "Saving…" : "File the note"}
        </button>
      </div>
      {create.error && <p className="text-[13px] text-state-failed">{create.error.message}</p>}
    </div>
  );
}

function UrlForm({
  onDone,
  onQueued,
}: {
  onDone: () => void;
  onQueued: (url: string) => void;
}) {
  const trpc = useTRPC();
  const [url, setUrl] = useState("");

  const crawl = useMutation({
    ...trpc.knowledge.crawlUrl.mutationOptions(),
  });

  function handleCrawl() {
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      return;
    }
    const finalUrl = parsed.toString();
    crawl.mutate(
      { url: finalUrl },
      {
        onSuccess: () => {
          onQueued(finalUrl);
          setUrl("");
          onDone();
        },
      },
    );
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="spec-label">URL</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-company.com/about"
          className={INPUT_CLASS}
        />
        <span className="spec mt-1.5 block text-ink-muted">
          The crawler runs in the background; the page becomes searchable in about a minute.
        </span>
      </label>
      <div className="flex justify-end">
        <button
          onClick={handleCrawl}
          disabled={crawl.isPending || url.trim().length < 8}
          className="btn-ink disabled:opacity-50"
        >
          {crawl.isPending ? "Queueing…" : "Queue the crawl"}
        </button>
      </div>
      {crawl.error && <p className="text-[13px] text-state-failed">{crawl.error.message}</p>}
    </div>
  );
}

function FileForm({ onDone }: { onDone: () => void }) {
  const trpc = useTRPC();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const requestUpload = useMutation(trpc.knowledge.uploadFile.mutationOptions());
  const triggerProcess = useMutation(trpc.knowledge.processFile.mutationOptions());

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setErrorMsg(null);
    try {
      const { fileId, uploadUrl } = await requestUpload.mutateAsync({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }
      await triggerProcess.mutateAsync({ fileId });
      setFile(null);
      onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setErrorMsg(msg);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="spec-label">File</span>
        <input
          type="file"
          accept=".pdf,.txt,.md,.docx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1.5 block w-full text-[13px] text-ink-secondary file:mr-3 file:border-0 file:bg-ink file:px-4 file:py-2 file:text-[12.5px] file:font-semibold file:text-white hover:file:bg-[#2C2C29] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
        <span className="spec mt-1.5 block text-ink-muted">
          PDF, txt, md, or docx. Text is extracted and embedded for retrieval.
        </span>
      </label>
      <div className="flex justify-end">
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="btn-ink disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload and process"}
        </button>
      </div>
      {errorMsg && <p className="text-[13px] text-state-failed">{errorMsg}</p>}
    </div>
  );
}
