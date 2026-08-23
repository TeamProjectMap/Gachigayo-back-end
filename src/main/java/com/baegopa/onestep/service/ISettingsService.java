package com.baegopa.onestep.service;

import java.util.Map;

public interface ISettingsService {

    /**
     * 설정 화면에 필요한 정보를 한 번에 조회한다.
     * <p>
     * 내 프로필(이름·연락처·관계) + 알림 설정 + 연결 상태
     */
    Map<String, Object> getSettings(Long userId, String userRole);

    /**
     * 사용자와의 관계 저장 (보호자 전용)
     * <p>
     * 연결이 있어야 저장할 수 있다. 관계는 연결에 붙는 정보이기 때문이다.
     */
    void updateRelation(Long guardianId, String relation);

    /**
     * 도착·체크포인트 알림 켜고 끄기
     * <p>
     * 도움요청 알림은 안전과 직결돼서 끌 수 없다.
     */
    void updateArrivalAlarm(Long userId, boolean alarmOn);
}
