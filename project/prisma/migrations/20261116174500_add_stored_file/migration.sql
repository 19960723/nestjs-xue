-- CreateTable
CREATE TABLE `stored_files` (
    `id` VARCHAR(36) NOT NULL,
    `owner_id` INTEGER NOT NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `stored_files_storage_key_key`(`storage_key`),
    INDEX `stored_files_owner_id_deleted_at_created_at_idx`(`owner_id`, `deleted_at`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `stored_files` ADD CONSTRAINT `stored_files_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
