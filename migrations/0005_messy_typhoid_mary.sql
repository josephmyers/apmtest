CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"passage_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"name" varchar(255) DEFAULT '' NOT NULL,
	"selection_start" double precision NOT NULL,
	"selection_end" double precision NOT NULL,
	"audio_key" varchar(255),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE cascade ON UPDATE no action;