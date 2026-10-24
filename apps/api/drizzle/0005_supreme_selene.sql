CREATE TYPE "public"."message_attachment_type" AS ENUM('image', 'video');--> statement-breakpoint
ALTER TABLE "ticket_message" ADD COLUMN "attachment_url" text;--> statement-breakpoint
ALTER TABLE "ticket_message" ADD COLUMN "attachment_type" "message_attachment_type";--> statement-breakpoint
ALTER TABLE "ticket_message" ADD COLUMN "attachment_name" text;