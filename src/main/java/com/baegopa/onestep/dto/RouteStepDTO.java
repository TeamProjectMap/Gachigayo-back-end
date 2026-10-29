package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.math.BigDecimal;

/**
 * 경로의 한 구간 (ROUTE_STEPS)
 * <p>
 * 경로를 등록하면 구간 뼈대만 먼저 생긴다.
 * 도보 구간은 보호자가 이용자와 함께 걸으면서 좌표와 사진을 채운다.
 * 그래서 lat/lng는 기록 전까지 비어 있고, recordedYn으로 기록 여부를 구분한다.
 */
@Getter
@Setter
@ToString
public class RouteStepDTO {

    private Long routeStepId;
    private Long routeId;
    private Integer stepOrder;
    private String stepType;        // WALK / BUS / SUBWAY
    private String mainText;        // 화면에 보여줄 안내 문구
    private String landmark;
    private String lineName;        // 버스 번호 / 지하철 노선
    private BigDecimal lat;
    private BigDecimal lng;
    private Integer distance;       // m
    private String checkpointName;
    private String recordedYn;      // Y : 걸으며 기록 완료
}
