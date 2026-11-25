package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 보호자가 이용자를 위해 등록한 경로 (ROUTES)
 */
@Getter
@Setter
@ToString
public class RouteDTO {

    private Long routeId;
    private Long userId;            // 이 경로를 사용할 이용자
    private String routeName;       // 예: 학교 가는 길
    private String routeType;       // GUARDIAN : 보호자가 등록한 경로
    private String startName;
    private String endName;
    private BigDecimal endLat;      // 목적지 좌표: 이용자 길안내와 같은 목적지인지 볼 때 쓴다
    private BigDecimal endLng;
    private Integer totalDistance;  // m
    private Integer totalDuration;  // 초
    private String riskLevel;
    // 길안내 시작 시 선택한 경로 식별 정보. 보호자 경로 자체를 수정하지 않는다.
    private String historyKey;
    private boolean rerouted;       // 현재 위치에서 다시 찾은 경로는 보호자 저장 경로와 별도로 기록
    private BigDecimal startLat;
    private BigDecimal startLng;
    private String routeJson;       // 보호자가 고른 경로 전체 (이용자가 그대로 길안내 받는다)
    private Boolean guideReady;     // 목록용: routeJson이 있는지
    private LocalDateTime regDt;
    private LocalDateTime updDt;

    private List<RouteStepDTO> steps = new ArrayList<>();
}
