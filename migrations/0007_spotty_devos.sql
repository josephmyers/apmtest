CREATE TABLE "answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"speaker" varchar(255) DEFAULT '' NOT NULL,
	"audio_key" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "answers_question_id_unique" UNIQUE("question_id")
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;