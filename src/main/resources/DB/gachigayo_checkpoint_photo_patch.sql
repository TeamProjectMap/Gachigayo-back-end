-- 경로 도착지 좌표
--
-- 이용자가 길안내를 시작하면 같은 목적지로 보호자가 등록한 경로를 찾아 이동에 잇는다.
-- 지금까지는 목적지 이름이 글자까지 같아야 찾았다.
-- ('발산역 5호선'으로 등록했는데 이용자가 '발산역'을 고르면 못 찾음)
-- 도착지 좌표를 남겨 두고, 가까우면(150m 안) 같은 목적지로 본다.
--
-- 이미 있는 경로는 좌표가 비어 있어서 예전처럼 이름으로 찾는다.

ALTER TABLE ROUTES
    ADD COLUMN IF NOT EXISTS endLat DECIMAL(10,7) NULL COMMENT '목적지 위도' AFTER endName,
    ADD COLUMN IF NOT EXISTS endLng DECIMAL(10,7) NULL COMMENT '목적지 경도' AFTER endLat;

-- 체크포인트 = 보호자가 사진을 찍은 곳
--
-- 사진 지점 하나하나를 체크포인트로 보고, 이용자가 지나가면 보호자에게 알린다.
-- 한 구간에 사진이 여러 장이라, 어느 사진 지점을 지났는지 따로 남긴다.
-- (같은 지점 알림이 한 이동에서 한 번만 가도록)

ALTER TABLE TRIP_EVENTS
    ADD COLUMN IF NOT EXISTS routePhotoId BIGINT NULL COMMENT '지나간 사진 지점 (사진 체크포인트일 때)' AFTER routeStepId,
    ADD INDEX IF NOT EXISTS IDX_TRIP_EVENTS_photo (tripId, routePhotoId);
