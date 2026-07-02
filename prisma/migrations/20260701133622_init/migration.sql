-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('PROFILE_IMAGE', 'DNI_PDF', 'MEDICAL_RECORD', 'CONTRACT', 'OTHER');

-- CreateTable
CREATE TABLE "user_files" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "FileType" NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT,
    "originalName" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_files_type_idx" ON "user_files"("type");

-- CreateIndex
CREATE INDEX "user_files_available_idx" ON "user_files"("available");
