package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.KakaoPlaceDTO;
import com.baegopa.onestep.dto.RouteDTO;

import java.util.List;
import java.util.Map;

public interface IRouteService {

    /** 보호자와 연결된 이용자의 경로 목록 */
    Map<String, Object> getRoutes(Long guardianId);

    /**
     * 새 경로 등록
     * <p>
     * 출발지·도착지로 카카오에 경로를 물어 구간(도보 / 버스 / 지하철)을 나눈다.
     * 이때는 구간 뼈대만 만들고, 도보 구간의 좌표와 사진은 나중에
     * 보호자가 이용자와 함께 걸으면서 채운다.
     *
     * @return 저장된 경로
     */
    RouteDTO createRoute(Long guardianId, RouteDTO routeDTO,
                         String startLongitude, String startLatitude,
                         String endLongitude, String endLatitude);

    /**
     * 경로 한 건 + 구간 목록 (경로 기록 화면)
     * <p>
     * 도보 구간은 보호자가 걸으며 기록해야 하고, 버스·지하철 구간은 기록 대상이 아니다.
     */
    Map<String, Object> getRouteDetail(Long guardianId, Long routeId);

    /**
     * 도보 구간을 걸으며 기록한 결과를 저장한다.
     * <p>
     * 지금은 구간의 대표 위치 한 곳을 남긴다. 지점별 사진은 다음 단계에서 붙인다.
     */
    void recordStep(Long guardianId, Long routeStepId, String latitude, String longitude);

    /** 경로 삭제 (연결된 이용자의 경로만 지울 수 있다) */
    boolean deleteRoute(Long guardianId, Long routeId);

    /** 출발지·도착지를 고르기 위한 장소 검색 */
    List<KakaoPlaceDTO> searchPlaces(String query);
}
