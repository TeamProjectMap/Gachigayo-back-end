package com.baegopa.onestep.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 보호자에게 보내는 알림 생성
 * <p>
 * 알림을 읽는 쪽은 GuardianMapper가 맡고, 여기서는 만들기만 한다.
 */
@Mapper
public interface INotificationMapper {

    int insertNotification(@Param("receiverId") Long receiverId,
                           @Param("notifyType") String notifyType,
                           @Param("content") String content);

    /**
     * 같은 알림이 짧은 시간 안에 또 들어왔는지 확인한다.
     * <p>
     * 길안내 화면이 도착 처리를 여러 번 부를 수 있어 중복을 막는다.
     */
    int getRecentNotificationCount(@Param("receiverId") Long receiverId,
                                   @Param("notifyType") String notifyType,
                                   @Param("content") String content,
                                   @Param("withinMinutes") int withinMinutes);
}
