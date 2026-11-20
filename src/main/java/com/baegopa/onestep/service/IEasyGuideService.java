package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.KakaoRouteSearchResultDTO;

public interface IEasyGuideService {

    /**
     * 경로 결과의 각 단계 안내 문구(guidance)를 발달장애인이 이해하기 쉬운 말로 바꿔
     * easyGuidance에 채운다. 원래 guidance는 그대로 둔다 (실시간 도착정보 등이 원문을 쓴다).
     * <p>
     * AI 키가 없거나, 느리거나, 실패하거나, 결과가 검사를 통과하지 못하면
     * 그 단계는 easyGuidance를 비워 둔다 → 화면은 원래 문구로 안내한다. 예외를 던지지 않는다.
     */
    void applyEasyGuidance(KakaoRouteSearchResultDTO routes);
}
