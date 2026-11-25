package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.KakaoPlaceDTO;
import com.baegopa.onestep.dto.KakaoRouteSearchResultDTO;

import java.util.List;

public interface IKakaoMapService {

    List<KakaoPlaceDTO> searchPlaces(String query);

    KakaoPlaceDTO searchNearbySafetyCenter(String longitude, String latitude);

    KakaoRouteSearchResultDTO searchRoutes(String startLongitude,
                                           String startLatitude,
                                           String endLongitude,
                                           String endLatitude,
                                           String destinationName);

    /** 도보 재탐색: 큰길 우선과 최단 경로 중 예상 소요시간이 짧은 경로. */
    com.baegopa.onestep.dto.WalkingRouteResultDTO searchFastestWalkingRoute(String startLongitude,
            String startLatitude, String endLongitude, String endLatitude, String destinationName);

    /**
     * 좌표를 사람이 읽을 수 있는 주소로 바꿈. 보호자 화면의 "현재 위치" 표시용
     */
    String searchAddressByCoordinate(String longitude, String latitude);
}
