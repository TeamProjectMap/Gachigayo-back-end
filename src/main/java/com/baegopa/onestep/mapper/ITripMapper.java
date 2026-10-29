package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.TripDTO;
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
}
