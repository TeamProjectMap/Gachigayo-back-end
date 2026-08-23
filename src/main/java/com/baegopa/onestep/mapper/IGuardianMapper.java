package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.GuardianTripDTO;
import com.baegopa.onestep.dto.NotificationDTO;
import com.baegopa.onestep.dto.NotificationDetailDTO;
import com.baegopa.onestep.dto.TripLocationDTO;
import com.baegopa.onestep.dto.UserDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface IGuardianMapper {

    /** 보호자와 연결된 이용자 (GUARDIAN_LINKS) */
    UserDTO getLinkedUser(@Param("guardianId") Long guardianId);

    /** 이용자가 지금 이동 중이면 그 이동 정보, 아니면 null */
    GuardianTripDTO getOngoingTrip(@Param("userId") Long userId);

    /** 해당 이동에서 마지막으로 기록된 위치 */
    TripLocationDTO getLatestTripLocation(@Param("tripId") Long tripId);

    /** 최근 알림 목록 */
    List<NotificationDTO> getRecentNotifications(@Param("receiverId") Long receiverId,
                                                 @Param("listSize") int listSize);

    /** 안 읽은 알림 개수 */
    int getUnreadNotificationCount(@Param("receiverId") Long receiverId);

    /** 안 읽은 알림을 모두 읽음 처리 */
    int updateNotificationsRead(@Param("receiverId") Long receiverId);

    /**
     * 알림 상세
     * 남의 알림을 볼 수 없도록 receiverId도 함께 조건에 넣음
     */
    NotificationDetailDTO getNotificationDetail(@Param("notificationId") Long notificationId,
                                                @Param("receiverId") Long receiverId);

    /** 알림 한 건 읽음 처리 */
    int updateNotificationRead(@Param("notificationId") Long notificationId,
                               @Param("receiverId") Long receiverId);
}
