import { createUploadthing, type FileRouter } from "uploadthing/server";

/**
 * Conversation attachments live on UploadThing, not Postgres. The message
 * row keeps only the URL, type, and original name; the bytes stay with
 * UploadThing. Auth still runs on postMessage, which checks the ticket
 * org before the URL is ever saved.
 */
const f = createUploadthing();

export const uploadRouter = {
  conversationAttachment: f({
    image: { maxFileSize: "8MB", maxFileCount: 4 },
    video: { maxFileSize: "64MB", maxFileCount: 1 },
  }).onUploadComplete(({ file }) => ({
    url: file.url,
    name: file.name,
    type: file.type.startsWith("video/") ? ("video" as const) : ("image" as const),
  })),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
