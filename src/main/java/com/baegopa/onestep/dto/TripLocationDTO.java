package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 이동 중 기록된 위치 한 건 (TRIP_LOCATIONS)
 * 보호자 홈에서는 가장 마지막에 기록된 한 건만 사용
 */
@Getter
@Setter
@ToString
public class TripLocationDTO {

    private Long tripLocationId;
    private Long tripId;
    private BigDecimal lat;
    private BigDecimal lng;
    private LocalDateTime regDt;    // 기록 시각

}
