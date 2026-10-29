-- Photos a guardian takes while walking a route with the user.
--
-- One walking leg can have several photos ("wait for the bus here",
-- "turn right after the bank"), so they cannot live on ROUTE_STEPS.
--
-- Each photo carries a short title and description shown next to it, and the
-- spot where it was taken so the photo markers can be drawn on the map.
--
-- The file itself is kept outside the database. Only its address is stored,
-- so the storage can change later without touching this table.

CREATE TABLE IF NOT EXISTS ROUTE_PHOTOS (
    routePhotoId BIGINT        NOT NULL AUTO_INCREMENT COMMENT 'Route photo ID',
    routeStepId  BIGINT        NOT NULL                COMMENT 'Walking leg this photo belongs to',
    photoUrl     VARCHAR(500)  NOT NULL                COMMENT 'Address of the stored image',
    storageKey   VARCHAR(255)  NULL                    COMMENT 'Key used by the storage, for deletion',
    title        VARCHAR(100)  NULL                    COMMENT 'Short name of the spot',
    description  VARCHAR(255)  NULL                    COMMENT 'What to do at this spot',
    lat          DECIMAL(10,7) NULL                    COMMENT 'Latitude where the photo was taken',
    lng          DECIMAL(10,7) NULL                    COMMENT 'Longitude where the photo was taken',
    photoOrder   INT           NOT NULL DEFAULT 1      COMMENT 'Display order within the leg',
    regDt        DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Created datetime',
    updDt        DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'Updated datetime',
    PRIMARY KEY (routePhotoId),
    KEY IDX_ROUTE_PHOTOS_step (routeStepId, photoOrder),
    CONSTRAINT FK_ROUTE_PHOTOS_step
        FOREIGN KEY (routeStepId) REFERENCES ROUTE_STEPS (routeStepId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Route leg photos';
