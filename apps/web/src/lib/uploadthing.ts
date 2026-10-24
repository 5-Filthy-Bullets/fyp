import { generateReactHelpers } from "@uploadthing/react";
import type { UploadRouter } from "../../../api/src/uploadthing";

/**
 * Typed UploadThing helpers for the conversation thread. The URL points at
 * the Workers route in apps/api/src/index.ts, built off the same
 * VITE_API_URL the oRPC client uses.
 */
const uploadthingUrl = `${import.meta.env.VITE_API_URL ?? "http://localhost:8787"}/api/uploadthing`;

export const { useUploadThing } = generateReactHelpers<UploadRouter>({
  url: uploadthingUrl,
});

export type ConversationAttachment = {
  readonly url: string;
  readonly type: "image" | "video";
  readonly name: string;
};
