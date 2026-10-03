package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.TripEventDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface IEventMapper {

    /** 이벤트 기록. 저장 후 tripEventId가 DTO에 채워진다. */
    int insertTripEvent(TripEventDTO tripEventDTO);

    /** 이벤트를 보고 만든 알림 저장 */
    int insertNotification(@Param("receiverId") Long receiverId,
                           @Param("tripEventId") Long tripEventId,
                           @Param("notifyType") String notifyType,
                           @Param("content") String content);

    /** 이용자가 지금 이동 중이면 그 이동 번호 (없으면 null) */
    Long getOngoingTripId(@Param("userId") Long userId);
}
