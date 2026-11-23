package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 보호자 홈에서 보여줄 "이용자의 현재 이동" 정보
 * TRIPS + ROUTES + 다음 체크포인트(ROUTE_STEPS)를 한 번에 담음
 */
@Getter
@Setter
@ToString
public class GuardianTripDTO {

    private Long tripId;
    private String tripStatus;          // READY / MOVING / ARRIVED / CANCELLED
    private LocalDateTime startDt;      // 이동 시작 시각

    private String startName;           // 출발지 이름
    private String endName;             // 목적지 이름
    private Integer totalDuration;      // 경로 전체 예상 시간(초)
    private Integer totalDistance;      // 경로 전체 거리(m)
    private BigDecimal endLat;          // 목적지 위도 (없을 수 있음)
    private BigDecimal endLng;          // 목적지 경도

    private String nextCheckpointName;  // 다음 체크포인트 이름
    private BigDecimal nextCheckpointLat;   // 다음 체크포인트 위치
    private BigDecimal nextCheckpointLng;
}
