-- Gachigayo place autocomplete/recent/favorite feature patch
-- Apply to an existing database. Do not drop existing tables or data.

ALTER TABLE FAVORITE_PLACES
    ADD COLUMN kakaoPlaceId VARCHAR(50) NULL AFTER userId,
    ADD COLUMN roadAddress VARCHAR(255) NULL AFTER address,
    ADD UNIQUE KEY UK_FAVORITE_PLACES_user_kakaoPlaceId (userId, kakaoPlaceId);

CREATE TABLE IF NOT EXISTS RECENT_PLACES (
    recentPlaceId BIGINT        NOT NULL AUTO_INCREMENT COMMENT 'recent place id',
    userId        BIGINT        NOT NULL COMMENT 'USERS.userId',
    kakaoPlaceId  VARCHAR(50)   NOT NULL COMMENT 'Kakao place id',
    placeName     VARCHAR(100)  NOT NULL COMMENT 'place name',
    address       VARCHAR(255)  NULL     COMMENT 'address',
    roadAddress   VARCHAR(255)  NULL     COMMENT 'road address',
    lat           DECIMAL(10,7) NOT NULL COMMENT 'latitude',
    lng           DECIMAL(10,7) NOT NULL COMMENT 'longitude',
    searchedAt    DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'selected at',
    PRIMARY KEY (recentPlaceId),
    UNIQUE KEY UK_RECENT_PLACES_user_kakaoPlaceId (userId, kakaoPlaceId),
    KEY IDX_RECENT_PLACES_user_searchedAt (userId, searchedAt),
    CONSTRAINT FK_RECENT_PLACES_user
        FOREIGN KEY (userId) REFERENCES USERS (userId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='recent selected places';

ALTER TABLE RECENT_PLACES
    MODIFY COLUMN searchedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'selected at';
