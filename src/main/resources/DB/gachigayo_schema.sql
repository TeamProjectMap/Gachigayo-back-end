CREATE TABLE USERS (
    userId      BIGINT       NOT NULL AUTO_INCREMENT COMMENT '사용자 고유 번호',
    userName    VARCHAR(50)  NOT NULL                COMMENT '사용자 이름',
    userRole    VARCHAR(20)  NOT NULL                COMMENT '사용자 역할 (USER, GUARDIAN)',
    loginId     VARCHAR(50)  NOT NULL                COMMENT '로그인 아이디',
    password    VARCHAR(255) NOT NULL                COMMENT 'BCrypt 암호화 비밀번호',
    phone       VARCHAR(20)  NULL                    COMMENT '연락처',
    email       VARCHAR(100) NOT NULL                COMMENT '이메일',
    linkCode    VARCHAR(20)  NULL                    COMMENT '보호자 연결 코드',
    pushToken   VARCHAR(255) NULL                    COMMENT '푸시 알림 토큰',
    regDt       DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '등록일시',
    updDt       DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '수정일시',
    PRIMARY KEY (userId),
    UNIQUE KEY UK_USERS_loginId (loginId),
    UNIQUE KEY UK_USERS_email (email),
    UNIQUE KEY UK_USERS_linkCode (linkCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='사용자 계정';

CREATE TABLE GUARDIAN_LINKS (
    userId      BIGINT      NOT NULL COMMENT '이용자 ID (USERS.userId)',
    guardianId  BIGINT      NOT NULL COMMENT '보호자 ID (USERS.userId)',
    relation    VARCHAR(20) NULL     COMMENT '사용자와의 관계 (예: 엄마) — 설정 화면에서 선택',
    PRIMARY KEY (userId),
    UNIQUE KEY UK_GUARDIAN_LINKS_guardianId (guardianId),
    CONSTRAINT FK_GUARDIAN_LINKS_user
        FOREIGN KEY (userId) REFERENCES USERS (userId) ON DELETE CASCADE,
    CONSTRAINT FK_GUARDIAN_LINKS_guardian
        FOREIGN KEY (guardianId) REFERENCES USERS (userId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='보호자 연결';

CREATE TABLE USER_SETTINGS (
    userId            BIGINT  NOT NULL COMMENT '설정 대상 사용자',
    shareLocationYn   CHAR(1) NOT NULL DEFAULT 'Y' COMMENT '위치 공유 여부',
    deviationAlarmYn  CHAR(1) NOT NULL DEFAULT 'Y' COMMENT '경로 이탈 알림 여부',
    arrivalAlarmYn    CHAR(1) NOT NULL DEFAULT 'Y' COMMENT '도착 알림 여부',
    voiceGuideYn      CHAR(1) NOT NULL DEFAULT 'Y' COMMENT '음성 안내 사용 여부',
    checkpointAlarmYn CHAR(1) NOT NULL DEFAULT 'Y' COMMENT '체크포인트 알림 여부',
    helpRequestMessage TEXT    NULL     COMMENT 'Help request card message',
    regDt              DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Created datetime',
    updDt              DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'Updated datetime',
    PRIMARY KEY (userId),
    CONSTRAINT FK_USER_SETTINGS_user
        FOREIGN KEY (userId) REFERENCES USERS (userId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='사용자 설정';

CREATE TABLE HELP_REQUEST (
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

CREATE TABLE ROUTES (
    routeId       BIGINT       NOT NULL AUTO_INCREMENT COMMENT '경로 고유 번호',
    userId        BIGINT       NOT NULL COMMENT '경로를 사용하는 이용자',
    routeName     VARCHAR(100) NOT NULL COMMENT '경로 이름',
    routeType     VARCHAR(20)  NOT NULL COMMENT '경로 유형 (RECOMMENDED, LEARNING, GUARDIAN)',
    startName     VARCHAR(100) NOT NULL COMMENT '출발지 이름',
    endName       VARCHAR(100) NOT NULL COMMENT '목적지 이름',
    totalDistance INT          NOT NULL COMMENT '총 이동 거리(m)',
    totalDuration INT          NOT NULL COMMENT '총 예상 시간(초)',
    riskLevel     VARCHAR(20)  NOT NULL COMMENT '위험 등급 (LOW, MEDIUM, HIGH)',
    regDt         DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '등록일시',
    updDt         DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '수정일시',
    PRIMARY KEY (routeId),
    KEY IDX_ROUTES_userId (userId),
    CONSTRAINT FK_ROUTES_user
        FOREIGN KEY (userId) REFERENCES USERS (userId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='저장 경로';

CREATE TABLE ROUTE_STEPS (
    routeStepId    BIGINT        NOT NULL AUTO_INCREMENT COMMENT '경로 단계 고유 번호',
    routeId        BIGINT        NOT NULL COMMENT '소속 경로',
    stepOrder      INT           NOT NULL COMMENT '단계 순서',
    stepType       VARCHAR(20)   NOT NULL COMMENT '단계 유형 (WALK, BUS, SUBWAY)',
    mainText       VARCHAR(160)  NOT NULL COMMENT '화면에 보여줄 핵심 안내 문구',
    landmark       VARCHAR(100)  NULL     COMMENT '길 안내 보조용 랜드마크 문구',
    lineName       VARCHAR(50)   NULL     COMMENT '버스 번호 또는 지하철 노선명',
    lat            DECIMAL(10,7) NULL     COMMENT '단계 기준 위치의 위도 (걸으며 기록하기 전에는 없음)',
    lng            DECIMAL(10,7) NULL     COMMENT '단계 기준 위치의 경도 (걸으며 기록하기 전에는 없음)',
    distance       INT           NOT NULL COMMENT '해당 구간 거리(m)',
    checkpointName VARCHAR(100)  NULL     COMMENT '확인해야 할 체크포인트 이름',
    recordedYn     CHAR(1)       NOT NULL DEFAULT 'N' COMMENT '보호자가 걸으며 기록했는지 (Y/N)',
    PRIMARY KEY (routeStepId),
    KEY IDX_ROUTE_STEPS_routeId (routeId),
    CONSTRAINT FK_ROUTE_STEPS_route
        FOREIGN KEY (routeId) REFERENCES ROUTES (routeId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='경로 단계';

CREATE TABLE TRIPS (
    tripId        BIGINT      NOT NULL AUTO_INCREMENT COMMENT '이동 기록 번호',
    routeId       BIGINT      NOT NULL COMMENT '이동에 사용한 경로',
    startDt       DATETIME(6) NOT NULL COMMENT '이동 시작 시각',
    endDt         DATETIME(6) NULL     COMMENT '이동 종료 시각',
    currentStepId BIGINT      NULL     COMMENT '현재 진행 중 단계 (ROUTE_STEPS)',
    tripStatus    VARCHAR(20) NOT NULL COMMENT '이동 상태 (READY, MOVING, ARRIVED, CANCELLED)',
    PRIMARY KEY (tripId),
    KEY IDX_TRIPS_routeId (routeId),
    CONSTRAINT FK_TRIPS_route
        FOREIGN KEY (routeId) REFERENCES ROUTES (routeId) ON DELETE CASCADE,
    CONSTRAINT FK_TRIPS_currentStep
        FOREIGN KEY (currentStepId) REFERENCES ROUTE_STEPS (routeStepId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='이동 기록';

CREATE TABLE TRIP_LOCATIONS (
    tripLocationId BIGINT        NOT NULL AUTO_INCREMENT COMMENT '위치 기록 번호',
    tripId         BIGINT        NOT NULL COMMENT '소속 이동',
    lat            DECIMAL(10,7) NOT NULL COMMENT '기록 시점 위도',
    lng            DECIMAL(10,7) NOT NULL COMMENT '기록 시점 경도',
    regDt          DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '기록 시각',
    PRIMARY KEY (tripLocationId),
    KEY IDX_TRIP_LOCATIONS_tripId (tripId),
    KEY IDX_TRIP_LOCATIONS_trip_regDt (tripId, regDt),
    CONSTRAINT FK_TRIP_LOCATIONS_trip
        FOREIGN KEY (tripId) REFERENCES TRIPS (tripId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='이동 위치 로그';

CREATE TABLE TRIP_EVENTS (
    tripEventId  BIGINT        NOT NULL AUTO_INCREMENT COMMENT '이벤트 번호',
    userId       BIGINT        NOT NULL COMMENT '이벤트를 발생시킨 이용자',
    tripId       BIGINT        NULL     COMMENT '관련 이동 (없을 수 있음)',
    routeStepId  BIGINT        NULL     COMMENT '관련 단계 (없을 수 있음)',
    eventType    VARCHAR(30)   NOT NULL COMMENT '이벤트 종류 (HELP_REQUEST, DEVIATION, SOS 등)',
    eventMessage VARCHAR(255)  NULL     COMMENT '이벤트 상세 내용',
    lat          DECIMAL(10,7) NOT NULL COMMENT '이벤트 발생 위치 위도',
    lng          DECIMAL(10,7) NOT NULL COMMENT '이벤트 발생 위치 경도',
    autoSentYn   CHAR(1)       NOT NULL DEFAULT 'N' COMMENT '자동 전송 여부',
    eventDt      DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '이벤트 발생 시각',
    PRIMARY KEY (tripEventId),
    KEY IDX_TRIP_EVENTS_userId (userId),
    KEY IDX_TRIP_EVENTS_tripId (tripId),
    CONSTRAINT FK_TRIP_EVENTS_user
        FOREIGN KEY (userId) REFERENCES USERS (userId) ON DELETE CASCADE,
    CONSTRAINT FK_TRIP_EVENTS_trip
        FOREIGN KEY (tripId) REFERENCES TRIPS (tripId) ON DELETE SET NULL,
    CONSTRAINT FK_TRIP_EVENTS_routeStep
        FOREIGN KEY (routeStepId) REFERENCES ROUTE_STEPS (routeStepId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='이동 이벤트';

CREATE TABLE NOTIFICATIONS (
    notificationId BIGINT       NOT NULL AUTO_INCREMENT COMMENT '알림 고유 번호',
    receiverId     BIGINT       NOT NULL COMMENT '알림을 받는 사용자',
    tripEventId    BIGINT       NULL     COMMENT '관련 이벤트 (없을 수 있음)',
    notifyType     VARCHAR(30)  NOT NULL COMMENT '알림 종류',
    content        VARCHAR(255) NOT NULL COMMENT '알림 본문',
    readYn         CHAR(1)      NOT NULL DEFAULT 'N' COMMENT '읽음 여부 (Y/N)',
    regDt          DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '알림 생성 시각',
    PRIMARY KEY (notificationId),
    KEY IDX_NOTIFICATIONS_receiverId (receiverId),
    KEY IDX_NOTIFICATIONS_receiver_regDt (receiverId, regDt),
    CONSTRAINT FK_NOTIFICATIONS_receiver
        FOREIGN KEY (receiverId) REFERENCES USERS (userId) ON DELETE CASCADE,
    CONSTRAINT FK_NOTIFICATIONS_tripEvent
        FOREIGN KEY (tripEventId) REFERENCES TRIP_EVENTS (tripEventId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='알림';
