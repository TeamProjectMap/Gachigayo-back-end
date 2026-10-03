package com.baegopa.onestep.service;

public interface INotificationService {

    /**
     * 목적지 도착 알림을 연결된 보호자에게 만든다.
     * <p>
     * 보호자가 설정에서 도착 알림을 꺼두었으면 만들지 않는다.
     *
     * @param destinationName 도착한 곳 이름. 알림 목록에 "○○에 도착했어요" 로 보인다.
     * @return 알림을 만들었으면 true (보호자가 없거나 꺼둔 경우 false)
     */
    boolean createArrivedNotification(Long userId, String destinationName);

    /**
     * 도움요청 알림을 연결된 보호자에게 만든다.
     * <p>
     * 도움요청은 안전과 직결돼서 보호자의 알림 설정과 상관없이 항상 만든다.
     *
     * @param helpMessage 이용자가 고른 상황 설명. 알림 목록에서 제목 밑에 보인다.
     * @return 알림을 만들었으면 true (연결된 보호자가 없으면 false)
     */
    boolean createHelpRequestNotification(Long userId, String helpMessage);
}
