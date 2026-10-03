package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.TripEventDTO;

import java.util.Map;

public interface IEventService {

    /**
     * 도움 요청
     * <p>
     * 이동 중이 아니어도 보낼 수 있다. 이동 중이면 그 이동에 묶어서 기록한다.
     *
     * @return notified(보호자에게 전달됐는지), guardianName
     */
    Map<String, Object> createHelpRequest(Long userId, String latitude, String longitude, String message);

    /**
     * 이벤트를 기록하고 연결된 보호자에게 알림을 만든다.
     * <p>
     * 출발 / 체크포인트 통과 / 경로 이탈 / 도착도 이 메서드를 쓰면 알림까지 함께 처리된다.
     * (9단계 길안내에서 호출할 자리)
     *
     * @return 보호자에게 알림이 만들어졌으면 true
     */
    boolean createEvent(TripEventDTO tripEventDTO);
}
