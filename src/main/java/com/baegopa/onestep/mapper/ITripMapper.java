package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.TripDTO;
import com.baegopa.onestep.dto.TripEventDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;

/**
 * 이동 기록 (TRIPS, TRIP_LOCATIONS)
 * <p>
 * 길안내가 보내주는 "출발했다 / 지금 여기다 / 도착했다"를 저장한다.
 * 보호자 홈은 이 기록을 읽어서 이동현황을 보여준다.
 */
@Mapper
public interface ITripMapper {

    /** 이동 시작. 저장 후 tripId가 DTO에 채워진다. */
    int insertTrip(TripDTO tripDTO);

    /** 이동 중 위치 기록 */
    int insertTripLocation(@Param("tripId") Long tripId,
                           @Param("lat") BigDecimal lat,
                           @Param("lng") BigDecimal lng);

    /** 이동 한 건 (주인 확인용으로 이용자와 상태를 함께 본다) */
    TripDTO getTrip(@Param("tripId") Long tripId);

    /** 이용자가 지금 진행 중인 이동 (출발을 두 번 눌러도 하나만 쓰도록) */
    TripDTO getOngoingTrip(@Param("userId") Long userId);

    /** 도착 처리 */
    int updateTripArrived(@Param("tripId") Long tripId);

    /** 끝나지 않은 다른 이동을 정리한다 (새로 출발할 때) */
    int updateOngoingTripsCancelled(@Param("userId") Long userId);

    /** 이번 이동에서 이 체크포인트를 이미 지났는지 (알림을 한 번만 보내려고) */
    int getCheckpointEventCount(@Param("tripId") Long tripId,
                                @Param("routeStepId") Long routeStepId);

    /** 이동 중 생긴 일 저장. 저장 후 tripEventId가 DTO에 채워진다. */
    int insertTripEvent(TripEventDTO tripEventDTO);

    /** 지금 진행 중인 구간을 바꾼다 (보호자 화면의 "다음 체크포인트"가 이걸 기준으로 한다) */
    int updateTripCurrentStep(@Param("tripId") Long tripId,
                              @Param("routeStepId") Long routeStepId);
}
