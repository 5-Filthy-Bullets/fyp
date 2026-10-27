ALTER TABLE "ticket" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "last_reminder_at" timestamp;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;