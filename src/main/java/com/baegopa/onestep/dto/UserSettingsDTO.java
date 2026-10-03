package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.time.LocalDateTime;

/**
 * 사용자 설정 (USER_SETTINGS)
 * 보호자 설정 화면에서는 도착·체크포인트 알림만 켜고 끔
 */
@Getter
@Setter
@ToString
public class UserSettingsDTO {

    private Long userId;
    private String shareLocationYn;
    private String deviationAlarmYn;
    private String arrivalAlarmYn;
    private String voiceGuideYn;
    private String checkpointAlarmYn;
    private String helpRequestMessage;
    private LocalDateTime regDt;
    private LocalDateTime updDt;
}
