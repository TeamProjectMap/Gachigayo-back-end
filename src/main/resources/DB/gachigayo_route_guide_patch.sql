-- 보호자가 고른 경로를 그대로 저장
--
-- 보호자가 새 경로를 등록할 때 고른 경로(버스·지하철·도보 단계, 노선, 정류장, 지나는 길 좌표)를
-- 통째로 JSON으로 남긴다. 이용자가 홈의 '보호자 경로'에서 이 경로를 고르면
-- 다시 검색하지 않고 이 경로 그대로 길안내를 한다.
--
-- 이 칸이 생기기 전에 등록한 경로는 비어 있어서, 보호자가 다시 등록해야 그대로 안내할 수 있다.

ALTER TABLE ROUTES
    ADD COLUMN IF NOT EXISTS routeJson LONGTEXT NULL COMMENT '보호자가 고른 경로 전체 (길안내용 JSON)' AFTER riskLevel;
