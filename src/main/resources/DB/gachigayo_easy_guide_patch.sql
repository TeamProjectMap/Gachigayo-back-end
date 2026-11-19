-- Gachigayo easy guidance (AI) patch
-- 카카오 길안내 문구를 AI(Gemini)로 바꾼 쉬운 문장을 저장해 두고 다시 쓴다.
-- 같은 문장은 한 번만 AI를 부르게 하려는 저장소. 기존 테이블·데이터는 건드리지 않는다.

CREATE TABLE IF NOT EXISTS EASY_GUIDE_TEXTS (
    easyGuideTextId BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'easy guide text id',
    originalHash    CHAR(64)     NOT NULL COMMENT 'SHA-256 hex of originalText',
    originalText    TEXT         NOT NULL COMMENT 'Kakao guidance text',
    easyText        TEXT         NOT NULL COMMENT 'easy Korean text made by AI',
    model           VARCHAR(100) NULL     COMMENT 'AI model that made easyText',
    regDt           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'created at',
    PRIMARY KEY (easyGuideTextId),
    UNIQUE KEY UK_EASY_GUIDE_TEXTS_originalHash (originalHash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='easy Korean guidance cache';
