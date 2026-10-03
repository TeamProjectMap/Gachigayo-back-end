package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

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

    private String nextCheckpointName;  // 다음 체크포인트 이름
    private Integer nextCheckpointDistance; // 다음 체크포인트까지 거리(m)
}
