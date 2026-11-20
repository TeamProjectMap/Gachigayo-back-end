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
    private LocalDateTime regDt;
    private LocalDateTime updDt;

    private List<RouteStepDTO> steps = new ArrayList<>();
}
