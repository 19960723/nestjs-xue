-- CreateTable
CREATE TABLE `auth_attempt_buckets` (
    `key_hash` CHAR(64) NOT NULL,
    `window_start` DATETIME(0) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 1,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `auth_attempt_buckets_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`key_hash`, `window_start`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
