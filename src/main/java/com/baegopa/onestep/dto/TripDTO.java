package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.time.LocalDateTime;

/**
 * 이동 기록 한 건 (TRIPS)
 * <p>
 * TRIPS에는 이용자 컬럼이 없어서, 이용자는 ROUTES를 거쳐 찾는다.
 * userId는 조회할 때 조인해서 채워 넣는 값이다.
 */
@Getter
@Setter
@ToString
public class TripDTO {

    private Long tripId;
    private Long routeId;
    private LocalDateTime startDt;
    private LocalDateTime endDt;
    private Long currentStepId;
    private String tripStatus;      // READY / MOVING / ARRIVED / CANCELLED

    private Long userId;            // 조회 시 ROUTES에서 가져온다
}
