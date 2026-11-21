-- 도움요청 카드: 이용자가 직접 쓴 문구 모음
--
-- 지금까지는 고른 문구 하나(helpRequestMessage)만 저장해서, 직접 쓴 문구가 있어도
-- 기본 문구를 고르면 사라졌다. 직접 쓴 문구를 카드처럼 쌓아 두고 고치거나 지울 수 있게
-- 목록을 JSON 배열로 따로 남긴다. (예: ["저는 말을 잘 못해요", "버스 타는 곳을 알려주세요"])

ALTER TABLE USER_SETTINGS
    ADD COLUMN IF NOT EXISTS customHelpMessages TEXT NULL COMMENT '직접 쓴 도움요청 문구 모음 (JSON 배열)' AFTER helpRequestMessage;
