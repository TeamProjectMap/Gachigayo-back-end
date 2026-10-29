package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 경로 구간 사진 한 장 (ROUTE_PHOTOS)
 * <p>
 * 파일 자체는 저장소에 두고 여기에는 주소만 남긴다.
 * 그래서 저장소를 바꿔도 이 표는 그대로 쓸 수 있다.
 */
@Getter
@Setter
@ToString
public class RoutePhotoDTO {

    private Long routePhotoId;
    private Long routeStepId;
    private String photoUrl;        // 화면에서 그대로 쓰는 이미지 주소
    private String storageKey;      // 저장소에서 지울 때 쓰는 키

    private String title;           // 예: 정류장 표지판
    private String description;     // 예: 가게 앞 정류장에서 6642번을 기다려요

    // 촬영한 자리. 지도에 번호 마커를 찍는 데 쓴다.
    private BigDecimal lat;
    private BigDecimal lng;

    private Integer photoOrder;
    private LocalDateTime regDt;
    private LocalDateTime updDt;
}
