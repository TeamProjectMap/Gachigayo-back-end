package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.RouteDTO;

public interface ITripService {

    /**
     * 이동 시작
     * <p>
     * 길안내는 카카오에서 그때그때 받은 경로로 움직이므로 저장된 경로가 없다.
     * TRIPS는 경로가 있어야 만들 수 있어서, 이번 이동용 경로를 ROUTES에 함께 남긴다.
     *
     * @return 만들어진 이동 번호. 이후 위치 기록과 도착 처리에 쓴다.
     */
    Long startTrip(Long userId, RouteDTO routeDTO);

    /**
     * 이동 중 위치 기록
     * <p>
     * 보호자 홈의 "현재 위치"가 이 기록의 마지막 한 건을 보여준다.
     */
    void recordLocation(Long userId, Long tripId, String latitude, String longitude);

    /**
     * 도착 처리. 이동을 끝내고 보호자에게 도착 알림을 만든다.
     *
     * @return 보호자에게 알림을 만들었으면 true
     */
    boolean arrive(Long userId, Long tripId, String destinationName);
}
