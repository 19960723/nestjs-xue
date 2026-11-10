-- CreateTable
CREATE TABLE `sys_refresh_token` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_id` INTEGER NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sys_refresh_token_token_hash_key`(`token_hash`),
    INDEX `sys_refresh_token_session_id_expires_at_idx`(`session_id`, `expires_at`),
    INDEX `sys_refresh_token_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sys_refresh_token` ADD CONSTRAINT `sys_refresh_token_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `sys_user_session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 回填现有会话的当前摘要，迁移前发出的 Refresh 仍可轮换一次。不修改会话表。
INSERT INTO `sys_refresh_token` (`session_id`, `token_hash`, `expires_at`, `created_at`)
SELECT `id`, `refresh_token_hash`, `expires_at`, `created_at`
FROM `sys_user_session`
WHERE `refresh_token_hash` REGEXP '^[0-9a-f]{64}$';
