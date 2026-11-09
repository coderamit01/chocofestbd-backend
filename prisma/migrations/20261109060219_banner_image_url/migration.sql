ALTER TABLE "banners" ADD COLUMN "image" TEXT;

UPDATE "banners" SET "image" = 'http://localhost:5000/uploads/' || "imageKey";

ALTER TABLE "banners" ALTER COLUMN "image" SET NOT NULL;
