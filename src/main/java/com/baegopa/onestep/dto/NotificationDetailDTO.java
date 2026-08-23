package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 알림 상세 (알림 + 그 알림을 만든 이벤트 + 이동 목적지)
 * 도움요청 상세 화면에서 어디서 눌렀는지, 어디로 가는 중이었는지 보여줌
 */
@Getter
@Setter
@ToString
public class NotificationDetailDTO {

    private Long notificationId;
    private String notifyType;
    private String content;
    private String readYn;
    private LocalDateTime regDt;

    // 알림을 만든 이벤트 (없을 수도 있다)
    private BigDecimal lat;
    private BigDecimal lng;
    private LocalDateTime eventDt;

    // 이벤트 당시 이동의 목적지 (이동 중이 아니었으면 없다)
    private String destination;
}
