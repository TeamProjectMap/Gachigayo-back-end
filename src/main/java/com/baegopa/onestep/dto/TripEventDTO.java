package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 이동 중 발생한 이벤트 (TRIP_EVENTS)
 * <p>
 * eventType : HELP_REQUEST(도움요청) / DEPARTURE(출발) / CHECKPOINT(체크포인트 통과)
 *             / DEVIATION(경로 이탈) / ARRIVED(도착)
 * <p>
 * 도움요청은 이동 중이 아니어도 보낼 수 있어 tripId가 없을 수 있다.
 */
@Getter
@Setter
@ToString
public class TripEventDTO {

    private Long tripEventId;
    private Long userId;
    private Long tripId;
    private Long routeStepId;
    private String eventType;
    private String eventMessage;
    private BigDecimal lat;
    private BigDecimal lng;
    private String autoSentYn;      // Y : 시스템이 자동으로 보냄 / N : 이용자가 직접 누름
    private LocalDateTime eventDt;
}
