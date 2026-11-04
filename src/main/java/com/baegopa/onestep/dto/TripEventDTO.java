package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.math.BigDecimal;

/**
 * 이동 중에 생긴 일 한 건 (TRIP_EVENTS)
 * <p>
 * 체크포인트 통과처럼 보호자에게 알릴 일이 생기면 남긴다.
 * 알림은 이 번호(tripEventId)를 들고 있어서, 알림 상세에서 그때 위치와 목적지를 찾아간다.
 */
@Getter
@Setter
@ToString
public class TripEventDTO {

    private Long tripEventId;
    private Long userId;
    private Long tripId;
    private Long routeStepId;
    private String eventType;       // CHECKPOINT 등
    private String eventMessage;    // 체크포인트 이름 등
    private BigDecimal lat;
    private BigDecimal lng;
}
