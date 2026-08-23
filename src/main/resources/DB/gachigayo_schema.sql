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
    userId      BIGINT NOT NULL COMMENT '이용자 ID (USERS.userId)',
    guardianId  BIGINT NOT NULL COMMENT '보호자 ID (USERS.userId)',
    PRIMARY KEY (userId),
    UNIQUE KEY UK_GUARDIAN_LINKS_guardianId (guardianId),
    CONSTRAINT FK_GUARDIAN_LINKS_user
        FOREIGN KEY (userId) REFERENCES USERS (userId) ON DELETE CASCADE,
    CONSTRAINT FK_GUARDIAN_LINKS_guardian
        FOREIGN KEY (guardianId) REFERENCES USERS (userId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='보호자 연결';
