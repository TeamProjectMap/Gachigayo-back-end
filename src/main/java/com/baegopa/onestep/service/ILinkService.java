package com.baegopa.onestep.service;

import java.util.Map;

public interface ILinkService {

    /**
     * 내 연결 상태
     */
    Map<String, Object> getLinkStatus(Long userId, String userRole);

    /**
     * 보호자가 연결코드를 입력해 이용자와 연결
     * <p>
     * 가입할 때 연결하지 못했거나, 연결을 해제한 뒤 다시 연결할 때 사용
     *
     * @return 연결된 이용자 이름
     */
    String connectByLinkCode(Long guardianId, String linkCode);

    /**
     * 연결 해제 (이용자, 보호자 모두 가능)
     *
     * @return 실제로 해제된 연결이 있으면 true
     */
    boolean disconnect(Long userId, String userRole);
}
