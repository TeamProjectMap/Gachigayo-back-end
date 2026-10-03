package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.time.LocalDateTime;

/**
 * 알림 한 건 (NOTIFICATIONS)
 * notifyType 종류 : DEPARTURE(출발) / CHECKPOINT(체크포인트 통과) /
 * DEVIATION(경로 이탈) / HELP_REQUEST(도움요청) / ARRIVED(도착)
 */
@Getter
@Setter
@ToString
public class NotificationDTO {

    private Long notificationId;
    private Long receiverId;
    private Long tripEventId;
    private String notifyType;
    private String content;
    private String readYn;          // Y : 읽음 / N : 안 읽음
    private LocalDateTime regDt;
}
