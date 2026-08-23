package com.baegopa.onestep.service;

import java.util.Map;

public interface IHelpCardService {

    /**
     * 도움카드에 보여줄 내용
     * <p>
     * 이용자가 길에서 곤란할 때 옆 사람에게 폰 화면을 보여주는 카드다.
     * 전용 테이블 없이 이름 / 보호자 연락처 / 가는 곳을 모아서 만든다.
     */
    Map<String, Object> getHelpCard(Long userId);
}
