package com.baegopa.onestep.service;

import java.util.Map;

public interface IGuardianService {

    /**
     * 보호자 홈 화면에 필요한 정보를 한 번에 조회
     * 연결된 이용자 / 현재 이동 상태 / 마지막 위치 / 다음 체크포인트 / 최근 알림
     * 아직 이동 기능(9단계)이 없어 이동 정보가 없으면 moving = false 로 내려감
     * 화면은 그 경우 이동 정보 없음으로 표시
     */
    Map<String, Object> getHomeInfo(Long guardianId);

    /**
     * 안 읽은 알림을 모두 읽음 처리
     * @return 읽음으로 바뀐 알림 개수
     */
    int markNotificationsRead(Long guardianId);

    /** 알림 목록 화면에 필요한 정보 (알림 목록 + 이용자 이름) */
    Map<String, Object> getNotificationList(Long guardianId);

    /**
     * 알림 상세
     */
    Map<String, Object> getNotificationDetail(Long guardianId, Long notificationId);

    /** 알림 한 건 읽음 처리 */
    int markNotificationRead(Long guardianId, Long notificationId);
}
