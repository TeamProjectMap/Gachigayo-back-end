CREATE TABLE IF NOT EXISTS USER_SETTINGS (
    userId             BIGINT  NOT NULL COMMENT 'User ID',
    shareLocationYn    CHAR(1) NOT NULL DEFAULT 'Y' COMMENT 'Location sharing enabled',
    deviationAlarmYn   CHAR(1) NOT NULL DEFAULT 'Y' COMMENT 'Deviation alarm enabled',
    arrivalAlarmYn     CHAR(1) NOT NULL DEFAULT 'Y' COMMENT 'Arrival alarm enabled',
    voiceGuideYn       CHAR(1) NOT NULL DEFAULT 'Y' COMMENT 'Voice guide enabled',
    checkpointAlarmYn  CHAR(1) NOT NULL DEFAULT 'Y' COMMENT 'Checkpoint alarm enabled',
    helpRequestMessage TEXT    NULL     COMMENT 'Help request card message',
    regDt              DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Created datetime',
    updDt              DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'Updated datetime',
    PRIMARY KEY (userId),
    CONSTRAINT FK_USER_SETTINGS_user
        FOREIGN KEY (userId) REFERENCES USERS (userId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='User settings';

ALTER TABLE USER_SETTINGS
    ADD COLUMN IF NOT EXISTS helpRequestMessage TEXT NULL COMMENT 'Help request card message';

ALTER TABLE USER_SETTINGS
    ADD COLUMN IF NOT EXISTS regDt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Created datetime';

ALTER TABLE USER_SETTINGS
    ADD COLUMN IF NOT EXISTS updDt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'Updated datetime';

CREATE TABLE IF NOT EXISTS HELP_REQUEST (
    helpRequestId        BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Help request ID',
    userId               BIGINT       NOT NULL                COMMENT 'User ID',
    guardianId           BIGINT       NULL                    COMMENT 'Linked guardian ID',
    helpMessage          TEXT         NULL                    COMMENT 'Help request display message',
    destinationName      VARCHAR(200) NULL                    COMMENT 'Current destination name',
    destinationLatitude  VARCHAR(30)  NULL                    COMMENT 'Destination latitude',
    destinationLongitude VARCHAR(30)  NULL                    COMMENT 'Destination longitude',
    currentLatitude      VARCHAR(30)  NULL                    COMMENT 'Current latitude at request time',
    currentLongitude     VARCHAR(30)  NULL                    COMMENT 'Current longitude at request time',
    accuracy             VARCHAR(30)  NULL                    COMMENT 'GPS accuracy meters',
    status               VARCHAR(30)  NOT NULL DEFAULT 'REQUESTED' COMMENT 'Help request status',
    clientRequestKey     VARCHAR(100) NULL                    COMMENT 'Client duplicate prevention key',
    regDt                DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Created datetime',
    updDt                DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'Updated datetime',
    PRIMARY KEY (helpRequestId),
    UNIQUE KEY UK_HELP_REQUEST_clientRequestKey (clientRequestKey),
    KEY IX_HELP_REQUEST_userId_regDt (userId, regDt),
    KEY IX_HELP_REQUEST_guardianId_regDt (guardianId, regDt),
    CONSTRAINT FK_HELP_REQUEST_user
        FOREIGN KEY (userId) REFERENCES USERS (userId) ON DELETE CASCADE,
    CONSTRAINT FK_HELP_REQUEST_guardian
        FOREIGN KEY (guardianId) REFERENCES USERS (userId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Help request';
