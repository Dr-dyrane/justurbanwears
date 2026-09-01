ALTER TABLE "studio_collection_commands" DROP CONSTRAINT "studio_collection_commands_known";--> statement-breakpoint
ALTER TABLE "studio_collection_commands" ADD CONSTRAINT "studio_collection_commands_known" CHECK (
    "studio_collection_commands"."command" in (
      'CREATE_COLLECTION',
      'RENAME_COLLECTION',
      'ACTIVATE_COLLECTION',
      'ARCHIVE_COLLECTION',
      'CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP'
    )
  );