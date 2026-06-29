"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import { Plus, Trash2, FileText, Globe, Upload, Pencil } from "lucide-react";
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from "@beast/shared";
import { statusMeta } from "@/lib/colors";

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

// Source has no dedicated namespace in the color module, so map each kind to the
// nearest on-system status palette to keep a distinct, AA-safe chip.
const SOURCE_STATUS: Record<string, string> = {
  interview: "queued",
  document: "in_progress",
  url_crawl: "completed",
  feedback_learned: "pending",
};

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

  const data = items.data ?? [];

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
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-display) text-2xl font-bold tracking-tight">
          Knowledge base
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          What your AI employees know about the company. Add notes, upload
          documents, or crawl a URL. Everything here is searched at task time.
        </p>
      </header>

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

      <section>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
            {data.length > 0 && (
              <span className="ml-1.5 text-text-muted">{data.length}</span>
            )}
          </FilterChip>
          {KNOWLEDGE_CATEGORIES.map((cat) => (
            <FilterChip
              key={cat}
              active={filter === cat}
              onClick={() => setFilter(cat)}
            >
              {CATEGORY_LABEL[cat]}
            </FilterChip>
          ))}
        </div>

        {items.isLoading && (
          <p className="text-xs text-text-muted">Loading...</p>
        )}

        {!items.isLoading && data.length === 0 && (
          <GlassCard hoverable={false} className="p-8 text-center">
            <p className="text-sm text-text-muted">
              {filter === "all"
                ? "No knowledge yet. Add a note, upload a document, or crawl your homepage to seed the agents."
                : `No items in ${CATEGORY_LABEL[filter as KnowledgeCategory]}.`}
            </p>
          </GlassCard>
        )}

        {selected.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
            <p className="text-xs font-medium text-red-900">
              {selected.size} {selected.size === 1 ? "item" : "items"} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value as KnowledgeCategory | "")}
                disabled={bulkUpdate.isPending}
                aria-label="Move selected items to category"
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-foreground hover:bg-gray-50 disabled:opacity-50"
              >
                <option value="">Move to category...</option>
                {KNOWLEDGE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABEL[cat]}
                  </option>
                ))}
              </select>
              <button
                onClick={handleBulkRecategorise}
                disabled={bulkUpdate.isPending || !bulkCategory}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 disabled:opacity-50"
              >
                {bulkUpdate.isPending ? "Moving..." : "Apply"}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs font-medium text-red-700 hover:underline"
              >
                Clear
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDelete.isPending}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDelete.isPending ? "Deleting..." : `Delete ${selected.size}`}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {data.map((item) => (
            <KnowledgeItemRow
              key={item.id}
              item={item}
              isSelected={selected.has(item.id)}
              onToggleSelect={() => toggleSelect(item.id)}
            />
          ))}
        </div>
      </section>
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

  const source = statusMeta(SOURCE_STATUS[item.sourceType]);
  const sourceLabel = SOURCE_LABEL[item.sourceType] ?? item.sourceType;

  if (editing) {
    return (
      <GlassCard hoverable={false} className="p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            {KNOWLEDGE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABEL[cat]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none"
          />
          <p className="mt-1 text-[11px] text-text-muted">
            Edits update the title, body, and category. Linked embeddings stay
            untouched until the next ingest worker run touches the same item.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => {
              setTitle(item.title);
              setContent(item.content);
              setCategory(item.category);
              setEditing(false);
            }}
            disabled={update.isPending}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-text-secondary hover:bg-gray-50 disabled:opacity-50"
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
            disabled={
              update.isPending ||
              title.trim().length < 3 ||
              content.trim().length < 5
            }
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {update.isPending ? "Saving..." : "Save changes"}
          </button>
        </div>
        {update.error && (
          <p className="text-xs text-error">{update.error.message}</p>
        )}
      </GlassCard>
    );
  }

  return (
    <GlassCard hoverable={false} className="p-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Select ${item.title}`}
          className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: source.bg, color: source.fg }}
            >
              {sourceLabel}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              {CATEGORY_LABEL[item.category as KnowledgeCategory] ?? item.category}
            </span>
          </div>
          <p className="text-sm font-medium">{item.title}</p>
          <p className="text-xs text-text-secondary mt-1 line-clamp-3 whitespace-pre-wrap">
            {item.content}
          </p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-gray-100 hover:text-text shrink-0"
          aria-label={`Edit ${item.title}`}
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => {
            if (
              confirm(
                `Delete "${item.title}"? Linked embeddings will also be removed.`,
              )
            ) {
              remove.mutate({ id: item.id });
            }
          }}
          disabled={remove.isPending}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-[oklch(0.97_0.05_25)] hover:text-error shrink-0"
          aria-label={`Delete ${item.title}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </GlassCard>
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
  const crawling = statusMeta("in_progress");
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold">Crawls in flight</h2>
        <p className="text-[11px] text-text-muted">
          Auto-clears once the page lands in the list (about a minute).
        </p>
      </div>
      <GlassCard hoverable={false} className="divide-y divide-[oklch(0.8_0.01_260/0.1)]">
        {rows.map((row) => {
          const elapsedSeconds = Math.max(0, Math.round((Date.now() - row.queuedAt) / 1000));
          return (
            <div key={row.url} className="flex items-center gap-3 px-4 py-3">
              <Globe size={16} className="text-text-muted shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.url}</p>
                <p className="text-[11px] text-text-muted">
                  queued {elapsedSeconds}s ago
                </p>
              </div>
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-medium shrink-0"
                style={{ backgroundColor: crawling.bg, color: crawling.fg }}
              >
                Crawling
              </span>
            </div>
          );
        })}
      </GlassCard>
    </section>
  );
}

const FILE_STATUS: Record<string, { label: string; status: string }> = {
  pending: { label: "Queued", status: "queued" },
  processing: { label: "Processing", status: "in_progress" },
  complete: { label: "Indexed", status: "completed" },
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
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold">Uploaded files</h2>
        <p className="text-[11px] text-text-muted">
          Polls every 5s while a file is still processing.
        </p>
      </div>
      <GlassCard hoverable={false} className="divide-y divide-[oklch(0.8_0.01_260/0.1)]">
        {rows.map((file) => {
          const entry =
            FILE_STATUS[file.processingStatus] ?? FILE_STATUS.pending!;
          const meta = statusMeta(entry.status);
          return (
            <div key={file.id} className="flex items-center gap-3 px-4 py-3">
              <FileText size={16} className="text-text-muted shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.filename}</p>
                <p className="text-[11px] text-text-muted">
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
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-medium shrink-0"
                style={{ backgroundColor: meta.bg, color: meta.fg }}
              >
                {entry.label}
              </span>
              <button
                onClick={() => {
                  if (confirm(`Remove ${file.filename}? Indexed chunks stay until you delete the related knowledge entry.`)) {
                    remove.mutate({ fileId: file.id });
                  }
                }}
                disabled={remove.isPending}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-[oklch(0.97_0.05_25)] hover:text-error shrink-0"
                aria-label={`Remove ${file.filename}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </GlassCard>
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
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-black bg-black text-white"
          : "border-gray-200 bg-white text-text-secondary hover:border-text-secondary"
      }`}
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
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[oklch(0.8_0.01_260/0.4)] bg-white px-4 py-3 text-sm font-medium text-text-secondary hover:border-brand hover:text-brand"
      >
        <Plus size={14} />
        Add knowledge
      </button>
    );
  }

  return (
    <GlassCard hoverable={false} className="p-5 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <ModeButton
          active={mode === "note"}
          onClick={() => setMode("note")}
          icon={<FileText size={14} />}
          label="Write a note"
        />
        <ModeButton
          active={mode === "url"}
          onClick={() => setMode("url")}
          icon={<Globe size={14} />}
          label="Crawl a URL"
        />
        <ModeButton
          active={mode === "file"}
          onClick={() => setMode("file")}
          icon={<Upload size={14} />}
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
        className="text-xs text-text-muted hover:text-text-secondary"
      >
        Cancel
      </button>
    </GlassCard>
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
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? "border-black bg-black text-white"
          : "border-gray-200 bg-white text-text-secondary hover:border-text-secondary"
      }`}
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
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          Category
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        >
          {KNOWLEDGE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABEL[cat]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          Title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Tone of voice for customer-facing copy"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          Content
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder="Write what the agent should know. Plain prose works fine."
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none"
        />
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={
            create.isPending ||
            title.trim().length < 3 ||
            content.trim().length < 5
          }
          className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {create.isPending ? "Saving..." : "Save note"}
        </button>
      </div>
      {create.error && (
        <p className="text-xs text-error">{create.error.message}</p>
      )}
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
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          URL
        </label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-company.com/about"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <p className="mt-1.5 text-[11px] text-text-muted">
          The crawler runs in the background. The page becomes searchable in
          about a minute.
        </p>
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleCrawl}
          disabled={crawl.isPending || url.trim().length < 8}
          className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {crawl.isPending ? "Queueing..." : "Queue crawl"}
        </button>
      </div>
      {crawl.error && (
        <p className="text-xs text-error">{crawl.error.message}</p>
      )}
    </div>
  );
}

function FileForm({ onDone }: { onDone: () => void }) {
  const trpc = useTRPC();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const requestUpload = useMutation(
    trpc.knowledge.uploadFile.mutationOptions(),
  );
  const triggerProcess = useMutation(
    trpc.knowledge.processFile.mutationOptions(),
  );

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
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          File
        </label>
        <input
          type="file"
          accept=".pdf,.txt,.md,.docx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-xl file:border-0 file:bg-black file:px-4 file:py-2 file:text-xs file:font-medium file:text-white hover:file:bg-gray-800"
        />
        <p className="mt-1.5 text-[11px] text-text-muted">
          PDF, txt, md, or docx. The processor extracts text and embeds it for
          retrieval.
        </p>
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload and process"}
        </button>
      </div>
      {errorMsg && <p className="text-xs text-error">{errorMsg}</p>}
    </div>
  );
}
