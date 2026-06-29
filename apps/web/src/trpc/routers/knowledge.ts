import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { knowledgeItems, uploadedFiles } from "@beast/db";
import { KNOWLEDGE_CATEGORIES } from "@beast/shared";
import { getUploadUrl, getDownloadUrl } from "@/lib/r2";
import { triggerTask } from "@/lib/trigger";
import { createTRPCRouter, protectedProcedure, assertNotDemo } from "../init";

export const knowledgeRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({
      category: z.enum(KNOWLEDGE_CATEGORIES).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(knowledgeItems.companyId, ctx.companyId)];
      if (input.category) {
        conditions.push(eq(knowledgeItems.category, input.category));
      }
      return ctx.db.query.knowledgeItems.findMany({
        where: and(...conditions),
        orderBy: (items, { desc }) => [desc(items.createdAt)],
      });
    }),

  create: protectedProcedure
    .input(z.object({
      category: z.string(),
      title: z.string(),
      content: z.string(),
      sourceType: z.enum(["interview", "document", "url_crawl", "feedback_learned"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const [item] = await ctx.db.insert(knowledgeItems).values({
        companyId: ctx.companyId,
        ...input,
      }).returning();
      if (!item) throw new Error("Failed to create knowledge item");
      return item;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      content: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await ctx.db
        .update(knowledgeItems)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.companyId, ctx.companyId)));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(knowledgeItems)
        .where(and(eq(knowledgeItems.id, input.id), eq(knowledgeItems.companyId, ctx.companyId)));
    }),

  uploadFile: protectedProcedure
    .input(z.object({
      filename: z.string(),
      contentType: z.string(),
      sizeBytes: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertNotDemo("Uploading a file");
      // Generate the id up front so the R2 key path is known before the
      // DB insert. Single insert with r2Key populated, no follow-up update,
      // no chance of an orphan row with empty r2Key on presign failure.
      const fileId = crypto.randomUUID();

      const { uploadUrl, r2Key } = await getUploadUrl({
        companyId: ctx.companyId,
        fileId,
        filename: input.filename,
        contentType: input.contentType,
      });

      const [file] = await ctx.db.insert(uploadedFiles).values({
        id: fileId,
        companyId: ctx.companyId,
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        r2Key,
      }).returning();

      if (!file) throw new Error("Failed to create file record");

      return { fileId: file.id, uploadUrl };
    }),

  getFileUrl: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const file = await ctx.db.query.uploadedFiles.findFirst({
        where: and(eq(uploadedFiles.id, input.fileId), eq(uploadedFiles.companyId, ctx.companyId)),
      });
      if (!file) return null;
      const downloadUrl = await getDownloadUrl(file.r2Key);
      return { ...file, downloadUrl };
    }),

  processFile: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      assertNotDemo("Processing a file");
      const file = await ctx.db.query.uploadedFiles.findFirst({
        where: and(eq(uploadedFiles.id, input.fileId), eq(uploadedFiles.companyId, ctx.companyId)),
        columns: { id: true, r2Key: true, filename: true, contentType: true, sizeBytes: true },
      });
      if (!file) throw new Error("File not found");

      const downloadUrl = await getDownloadUrl(file.r2Key);

      // Dispatch the trigger task FIRST so a Trigger.dev failure can't
      // leave the file stuck at processingStatus="processing" with no
      // worker actually running. Only flip the status once we have a
      // handle confirming the job is queued.
      const handle = await triggerTask("ingest-document", {
        fileId: input.fileId,
        companyId: ctx.companyId,
        downloadUrl,
        filename: file.filename,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
      });

      await ctx.db
        .update(uploadedFiles)
        .set({ processingStatus: "processing" })
        .where(eq(uploadedFiles.id, input.fileId));

      return { triggerId: handle.id };
    }),

  listFiles: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      return ctx.db.query.uploadedFiles.findMany({
        where: eq(uploadedFiles.companyId, ctx.companyId),
        orderBy: [desc(uploadedFiles.createdAt)],
        limit,
      });
    }),

  deleteFile: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(uploadedFiles)
        .where(and(eq(uploadedFiles.id, input.fileId), eq(uploadedFiles.companyId, ctx.companyId)));
    }),

  crawlUrl: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      assertNotDemo("Crawling a website");
      const handle = await triggerTask("crawl-website", {
        url: input.url,
        companyId: ctx.companyId,
      });

      return { triggerId: handle.id };
    }),
});
